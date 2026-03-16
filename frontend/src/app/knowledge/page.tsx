"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BookOpen,
  HelpCircle,
  FileText,
  Archive,
  Search,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type DocumentSource = "faq" | "manual" | "past_ticket" | "internal_doc" | "pdf_upload";

interface Document {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  source: DocumentSource;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const SOURCE_BADGE_VARIANT: Record<DocumentSource, "info" | "success" | "warning" | "default"> = {
  faq: "info",
  manual: "success",
  past_ticket: "warning",
  internal_doc: "default",
  pdf_upload: "info",
};

const SOURCE_LABELS: Record<DocumentSource, string> = {
  faq: "FAQ",
  manual: "Manual",
  past_ticket: "Ticket Anterior",
  internal_doc: "Doc. Interno",
  pdf_upload: "PDF Upload",
};

const CATEGORIES = ["Geral", "Software", "Hardware", "Conta", "Cobranca"] as const;
const SOURCES: DocumentSource[] = ["faq", "manual", "past_ticket", "internal_doc", "pdf_upload"];


const emptyForm = {
  title: "",
  content: "",
  category: "Geral",
  source: "faq" as DocumentSource,
  tags: "",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterTags, setFilterTags] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { data: res } = await api.get("/knowledge");
      setDocuments(res.data || res);
    } catch {
      setError("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const filtered = useMemo(() => {
    let list = documents;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (filterCategory) {
      list = list.filter((d) => d.category === filterCategory);
    }

    if (filterSource) {
      list = list.filter((d) => d.source === filterSource);
    }

    if (filterTags) {
      const tags = filterTags
        .toLowerCase()
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length > 0) {
        list = list.filter((d) =>
          tags.some((tag) => d.tags.some((dt) => dt.toLowerCase().includes(tag)))
        );
      }
    }

    return list;
  }, [documents, search, filterCategory, filterSource, filterTags]);

  const stats = useMemo(() => {
    const total = documents.length;
    const faqs = documents.filter((d) => d.source === "faq").length;
    const manuals = documents.filter((d) => d.source === "manual").length;
    const internal = documents.filter(
      (d) => d.source === "internal_doc" || d.source === "past_ticket"
    ).length;
    return { total, faqs, manuals, internal };
  }, [documents]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(doc: Document) {
    setEditingId(doc.id);
    setForm({
      title: doc.title,
      content: doc.content,
      category: doc.category,
      source: doc.source,
      tags: doc.tags.join(", "),
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) return;

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingId) {
        await api.patch(`/knowledge/${editingId}`, {
          title: form.title,
          content: form.content,
          category: form.category,
          source: form.source,
          tags,
        });
      } else {
        await api.post("/knowledge", {
          title: form.title,
          content: form.content,
          category: form.category,
          source: form.source,
          tags,
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchDocuments();
    } catch {
      setError("Erro ao salvar documento");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/knowledge/${id}`);
      await fetchDocuments();
    } catch {
      setError("Erro ao excluir documento");
    }
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Base de Conhecimento</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar documentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Adicionar Documento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <BookOpen className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total de Documentos</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <HelpCircle className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">FAQs</p>
              <p className="text-2xl font-bold text-slate-900">{stats.faqs}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Manuais</p>
              <p className="text-2xl font-bold text-slate-900">{stats.manuals}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Archive className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Artigos Internos</p>
              <p className="text-2xl font-bold text-slate-900">{stats.internal}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Todas as Categorias</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Todas as Fontes</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
        <div className="relative">
          <input
            type="text"
            placeholder="Filtrar por tags (separadas por vírgula)"
            value={filterTags}
            onChange={(e) => setFilterTags(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:w-72"
          />
        </div>
        {(filterCategory || filterSource || filterTags) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterCategory("");
              setFilterSource("");
              setFilterTags("");
            }}
          >
            <X className="h-3.5 w-3.5" />
            Limpar Filtros
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Editar Documento" : "Novo Documento"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Título</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Título do documento"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Conteúdo</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Conteúdo do documento"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Categoria</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Fonte</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value as DocumentSource })}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {SOURCES.filter((s) => s !== "pdf_upload").map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="ex: senha, login, acesso"
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={handleSave}>Salvar</Button>
                <Button variant="outline" onClick={handleCancel}>
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-slate-500">Carregando...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16">
          <BookOpen className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Nenhum documento encontrado</p>
          <p className="text-xs text-slate-400">Tente ajustar os filtros ou adicione um novo documento</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <Card key={doc.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="line-clamp-1">{doc.title}</CardTitle>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(doc)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="line-clamp-3 text-sm text-slate-600">
                  {doc.content.length > 150 ? doc.content.slice(0, 150) + "…" : doc.content}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge>{doc.category}</Badge>
                  <Badge variant={SOURCE_BADGE_VARIANT[doc.source]}>
                    {SOURCE_LABELS[doc.source]}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {doc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-auto border-t border-slate-100 pt-2 text-xs text-slate-400">
                  <span>Criado: {formatDate(doc.createdAt)}</span>
                  <span className="mx-2">·</span>
                  <span>Atualizado: {formatDate(doc.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
