"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Database, BookOpen, FileText, Search, Loader2,
  CheckCircle2, AlertCircle, RefreshCw, ExternalLink,
} from "lucide-react";
import api from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface KnowledgeSource {
  id: string;
  name: string;
  type: "database" | "manual" | "document";
  description: string;
  status: "active" | "inactive" | "loading";
  details: Record<string, any>;
}

const TYPE_CONFIG: Record<string, { icon: typeof Database; color: string; bg: string; border: string }> = {
  database: {
    icon: Database,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  manual: {
    icon: BookOpen,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  document: {
    icon: FileText,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
  },
};

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/zapflow/dashboard");

      const zapflowSource: KnowledgeSource = {
        id: "zapflow-mcp",
        name: "ZapFlow - Banco de Atendimentos",
        type: "database",
        description: "Base de dados de produção do ZapFlow com histórico completo de atendimentos, interações, transcrições e resoluções.",
        status: data.connected ? "active" : "inactive",
        details: {
          "Atendimentos Abertos": data.totalAbertos || 0,
          "Total Fechados": data.totalFechados || 0,
          "Analistas Ativos": data.tecnicosAtivos?.length || 0,
          "Conexão": "MCP (Model Context Protocol)",
          "Acesso": "Somente leitura",
        },
      };

      const procedimentoSource: KnowledgeSource = {
        id: "procedimento-atendimento",
        name: "Procedimento de Atendimento ZapFlow 2026",
        type: "document",
        description: "Manual de procedimentos e fluxos de atendimento ao cliente. Define como o agente deve conduzir cada tipo de interação.",
        status: "active",
        details: {
          "Tipo": "PDF ingerido no prompt do sistema",
          "Atualizado": "Março 2026",
          "Uso": "Orientação comportamental do agente",
        },
      };

      const manuaisSource: KnowledgeSource = {
        id: "manuais-sistemas",
        name: "Manuais dos Sistemas",
        type: "manual",
        description: "Manuais técnicos e guias de usuário dos sistemas atendidos (Contabilidade Pública, Arrecadação Municipal, etc.). Em preparação para inclusão.",
        status: "inactive",
        details: {
          "Status": "Pendente de inclusão",
          "Previsão": "Em breve",
          "Formato": "PDFs e documentos técnicos",
        },
      };

      setSources([zapflowSource, procedimentoSource, manuaisSource]);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const { data } = await api.get(`/zapflow/atendimentos?search=${encodeURIComponent(searchQuery)}&limit=10`);
      setSearchResults(data.data || data || []);
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

      {/* Stats */}
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
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Pendentes</p>
              <p className="text-2xl font-bold text-slate-900">{inactiveSources.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <BookOpen className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total de Fontes</p>
              <p className="text-2xl font-bold text-slate-900">{sources.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sources */}
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

      {/* Search test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-blue-500" />
            Testar Busca na Base
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-slate-500">
            Pesquise por termos para verificar o que o agente encontra na base de atendimentos do ZapFlow.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Ex: erro ao emitir nota fiscal, listagem de patrimônio..."
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
