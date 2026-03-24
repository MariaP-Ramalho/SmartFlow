"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Database, BookOpen, FileText, Search, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, Plus, Pencil, Trash2, Upload,
} from "lucide-react";
import api from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

interface KnowledgeSource {
  id: string;
  name: string;
  type: "database" | "manual" | "document";
  description: string;
  status: "active" | "inactive" | "loading";
  details: Record<string, any>;
}

interface KBStats {
  total: number;
  byCategory: Record<string, number>;
}

const TYPE_CONFIG: Record<string, { icon: typeof Database; color: string; bg: string }> = {
  database: { icon: Database, color: "text-blue-600", bg: "bg-blue-50" },
  manual: { icon: BookOpen, color: "text-emerald-600", bg: "bg-emerald-50" },
  document: { icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
};

const SOURCE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "internal_doc", label: "Documento interno" },
  { value: "faq", label: "FAQ" },
  { value: "pdf_upload", label: "PDF / arquivo" },
];

interface KbDoc {
  _id: string;
  title: string;
  content: string;
  category?: string;
  source?: string;
  tags?: string[];
  createdAt?: string;
}

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [kbStats, setKbStats] = useState<KBStats>({ total: 0, byCategory: {} });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchSource, setSearchSource] = useState<"kb" | "zapflow">("kb");

  const [adminList, setAdminList] = useState<KbDoc[]>([]);
  const [adminPage, setAdminPage] = useState(1);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminSearchInput, setAdminSearchInput] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const adminSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formSource, setFormSource] = useState("manual");
  const [saving, setSaving] = useState(false);

  const ADMIN_PAGE_SIZE = 15;

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const [dashResp, kbResp] = await Promise.all([
        api.get("/zapflow/dashboard").catch(() => ({ data: { connected: false } })),
        api.get("/knowledge?limit=1").catch(() => ({ data: { total: 0 } })),
      ]);

      const dash = dashResp.data;
      const kbTotal = kbResp.data?.total || 0;

      const zapflowSource: KnowledgeSource = {
        id: "zapflow-mcp",
        name: "ZapFlow - Banco de Atendimentos",
        type: "database",
        description: "Base de dados de produção do ZapFlow com histórico completo de atendimentos, interações, transcrições e resoluções. Acessado via search_past_cases.",
        status: dash.connected ? "active" : "inactive",
        details: {
          "Atendimentos Abertos": dash.totalAbertos || 0,
          "Total Fechados": dash.totalFechados || 0,
          "Analistas Ativos": dash.tecnicosAtivos?.length || 0,
          "Conexão": "MCP (Model Context Protocol)",
          "Acesso": "Somente leitura",
        },
      };

      const folhaManual: KnowledgeSource = {
        id: "folha-manual",
        name: "Manual de Folha de Pagamento V5.0",
        type: "manual",
        description: "Manual completo do sistema de Folha de Pagamento da Freire Tecnologia. Contém procedimentos de criação de folha, eventos, cálculos (INSS, IRRF, 13°, férias, rescisão), importações, exportações, integração SIAFIC/eSocial e mais.",
        status: "active",
        details: {
          "Seções": "38 capítulos",
          "Tipo": "Manual de procedimentos",
          "Formato": "Chunks vetorizados com embeddings",
          "Versão": "V5.0",
        },
      };

      const folhaTelas: KnowledgeSource = {
        id: "folha-telas",
        name: "Guia de Telas - Folha de Pagamento V5.0",
        type: "manual",
        description: "Guia detalhado de cada tela do sistema de Folha de Pagamento. Contém navegação exata (menus, abas, campos, botões), funcionalidades e ações disponíveis em cada tela.",
        status: "active",
        details: {
          "Cobertura": "Todas as telas do sistema",
          "Tipo": "Guia de interface/navegação",
          "Formato": "Chunks vetorizados com embeddings",
          "Versão": "V5.0",
        },
      };

      const siopeSource: KnowledgeSource = {
        id: "folha-siope",
        name: "Exportação SIOPE - Folha de Pagamento V5.0",
        type: "document",
        description: "Guia de configuração e exportação de dados para o SIOPE (Sistema de Informações sobre Orçamentos Públicos em Educação). Inclui configuração de lotações, servidores e geração de arquivos.",
        status: "active",
        details: {
          "Tipo": "Guia de integração SIOPE",
          "Formato": "Chunks vetorizados com embeddings",
          "Versão": "V5.0",
        },
      };

      const procedimentoSource: KnowledgeSource = {
        id: "procedimento-atendimento",
        name: "Procedimento de Atendimento ZapFlow 2026",
        type: "document",
        description: "Manual de procedimentos e fluxos de atendimento ao cliente. Define como o agente deve conduzir cada tipo de interação.",
        status: "active",
        details: {
          "Tipo": "Orientação comportamental",
          "Atualizado": "Março 2026",
          "Uso": "Embutido no prompt do sistema",
        },
      };

      setSources([zapflowSource, folhaManual, folhaTelas, siopeSource, procedimentoSource]);
      setKbStats({ total: kbTotal, byCategory: {} });
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  useEffect(() => {
    if (adminSearchTimer.current) clearTimeout(adminSearchTimer.current);
    adminSearchTimer.current = setTimeout(() => {
      setAdminSearch(adminSearchInput.trim());
      setAdminPage(1);
    }, 400);
    return () => {
      if (adminSearchTimer.current) clearTimeout(adminSearchTimer.current);
    };
  }, [adminSearchInput]);

  const fetchAdminList = useCallback(async () => {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const { data } = await api.get("/knowledge", {
        params: {
          page: adminPage,
          limit: ADMIN_PAGE_SIZE,
          search: adminSearch.trim() || undefined,
        },
      });
      setAdminList(data.data || []);
      setAdminTotal(data.total || 0);
    } catch {
      setAdminList([]);
      setAdminTotal(0);
    } finally {
      setAdminLoading(false);
    }
  }, [isAdmin, adminPage, adminSearch]);

  useEffect(() => {
    fetchAdminList();
  }, [fetchAdminList]);

  const openNew = () => {
    setEditingId(null);
    setFormTitle("");
    setFormContent("");
    setFormCategory("");
    setFormTags("");
    setFormSource("manual");
    setEditorOpen(true);
  };

  const openEdit = (doc: KbDoc) => {
    setEditingId(doc._id);
    setFormTitle(doc.title);
    setFormContent(doc.content || "");
    setFormCategory(doc.category || "");
    setFormTags((doc.tags || []).join(", "));
    setFormSource(doc.source || "manual");
    setEditorOpen(true);
  };

  const saveDoc = async () => {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      const tags = formTags
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const payload = {
        title: formTitle.trim(),
        content: formContent.trim(),
        category: formCategory.trim() || undefined,
        source: formSource,
        tags: tags.length ? tags : undefined,
      };
      if (editingId) {
        await api.patch(`/knowledge/${editingId}`, payload);
      } else {
        await api.post("/knowledge", payload);
      }
      setEditorOpen(false);
      fetchAdminList();
      fetchSources();
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (id: string, title: string) => {
    if (!confirm(`Remover o documento "${title.slice(0, 80)}..."?`)) return;
    try {
      await api.delete(`/knowledge/${id}`);
      fetchAdminList();
      fetchSources();
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || "Erro ao remover");
    }
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".txt") && !lower.endsWith(".md") && !lower.endsWith(".csv")) {
      alert("Use arquivo de texto (.txt, .md ou .csv).");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setFormContent((prev) => (prev ? `${prev}\n\n---\n\n${text}` : text));
      if (!formTitle.trim()) {
        setFormTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      if (searchSource === "kb") {
        const { data } = await api.get(`/knowledge/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
        setSearchResults(Array.isArray(data) ? data : []);
      } else {
        const { data } = await api.get(`/zapflow/atendimentos?search=${encodeURIComponent(searchQuery)}&limit=10`);
        setSearchResults(data.data || data || []);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const activeSources = sources.filter((s) => s.status === "active");
  const inactiveSources = sources.filter((s) => s.status !== "active");
  const adminTotalPages = Math.max(1, Math.ceil(adminTotal / ADMIN_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Base de Conhecimento</h1>
          <p className="mt-1 text-sm text-slate-500">
            Fontes de dados que o agente consulta para resolver atendimentos
          </p>
        </div>
        <Button variant="outline" size="md" onClick={fetchSources}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Database className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Fontes Ativas</p>
              <p className="text-2xl font-bold text-slate-900">{activeSources.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <BookOpen className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Documentos na KB</p>
              <p className="text-2xl font-bold text-slate-900">{kbStats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Pendentes</p>
              <p className="text-2xl font-bold text-slate-900">{inactiveSources.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Fontes Configuradas</h2>
        {sources.map((source) => {
          const config = TYPE_CONFIG[source.type] || TYPE_CONFIG.database;
          const Icon = config.icon;
          return (
            <Card key={source.id} className={source.status !== "active" ? "opacity-60" : ""}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${config.bg}`}>
                    <Icon className={`h-6 w-6 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-base font-semibold text-slate-900">{source.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          source.status === "active"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {source.status === "active" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {source.status === "active" ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">{source.description}</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
                      {Object.entries(source.details).map(([key, val]) => (
                        <div key={key}>
                          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                            {key}
                          </span>
                          <p className="text-sm font-medium text-slate-700">{String(val)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-blue-500" />
            Testar Busca na Base
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-slate-500">
            Pesquise para verificar o que o agente encontra nas bases de conhecimento.
          </p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setSearchSource("kb")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                searchSource === "kb"
                  ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                  : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
              }`}
            >
              Manuais (KB)
            </button>
            <button
              type="button"
              onClick={() => setSearchSource("zapflow")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                searchSource === "zapflow"
                  ? "bg-blue-100 text-blue-700 border border-blue-300"
                  : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
              }`}
            >
              Atendimentos (ZapFlow)
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={
                searchSource === "kb"
                  ? "Ex: como criar folha de pagamento, configurar evento, exportar SIOPE..."
                  : "Ex: erro ao emitir nota fiscal, listagem de patrimônio..."
              }
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </Button>
          </div>

          {searchResults !== null && (
            <div className="mt-4">
              {searchResults.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Nenhum resultado encontrado</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 mb-2">
                    {searchResults.length} resultado(s) encontrado(s)
                  </p>
                  {searchResults.map((r: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                    >
                      {searchSource === "kb" ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                              {r.category || r.source || "manual"}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-800 mb-1">
                            {r.title || "Sem título"}
                          </p>
                          <p className="text-xs text-slate-500 line-clamp-3">
                            {r.content?.slice(0, 300) || "Sem conteúdo"}
                          </p>
                          {r.tags?.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {r.tags.map((t: string) => (
                                <span key={t} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-slate-400">
                              #{r.z90_ate_id || r.id}
                            </span>
                            <span className="text-xs text-blue-600 font-medium">
                              {r.sistema || "—"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">
                            {r.z90_ate_resumo_do_problema || r.resumo || "Sem descrição"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {r.cliente || "—"}
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-3">
              <span>Gerenciar documentos (administrador)</span>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Novo documento
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Filtrar lista por título ou conteúdo..."
                value={adminSearchInput}
                onChange={(e) => setAdminSearchInput(e.target.value)}
                className="min-w-[200px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <Button variant="outline" size="sm" onClick={() => fetchAdminList()} disabled={adminLoading}>
                {adminLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar lista
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              {adminTotal} documento(s) · Página {adminPage} de {adminTotalPages}
            </p>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Título</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Origem</th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {adminList.map((doc) => (
                    <tr key={doc._id} className="border-b border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2 max-w-[280px]">
                        <span className="line-clamp-2 font-medium text-slate-800">{doc.title}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{doc.category || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{doc.source || "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(doc)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDoc(doc._id, doc.title)}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 ml-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                  {adminList.length === 0 && !adminLoading && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                        Nenhum documento encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {adminTotalPages > 1 && (
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={adminPage <= 1}
                  onClick={() => setAdminPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={adminPage >= adminTotalPages}
                  onClick={() => setAdminPage((p) => Math.min(adminTotalPages, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            )}

            {editorOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
                <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl my-8">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">
                    {editingId ? "Editar documento" : "Novo documento"}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-slate-500">Título</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-500">Categoria (opcional)</label>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          value={formCategory}
                          onChange={(e) => setFormCategory(e.target.value)}
                          placeholder="Ex: Folha de Pagamento - Manual"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500">Origem</label>
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          value={formSource}
                          onChange={(e) => setFormSource(e.target.value)}
                        >
                          {SOURCE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500">Tags (separadas por vírgula)</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        value={formTags}
                        onChange={(e) => setFormTags(e.target.value)}
                        placeholder="folha, procedimento, ..."
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-slate-500">Conteúdo</label>
                        <label className="inline-flex items-center gap-1 text-xs text-blue-600 cursor-pointer hover:underline">
                          <Upload className="h-3.5 w-3.5" />
                          Importar .txt / .md
                          <input type="file" accept=".txt,.md,.csv,text/plain" className="hidden" onChange={onFilePick} />
                        </label>
                      </div>
                      <textarea
                        className="mt-1 w-full min-h-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                        value={formContent}
                        onChange={(e) => setFormContent(e.target.value)}
                        placeholder="Texto que o agente poderá consultar na busca semântica..."
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
                      Cancelar
                    </Button>
                    <Button onClick={saveDoc} disabled={saving || !formTitle.trim() || !formContent.trim()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Salvar
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
