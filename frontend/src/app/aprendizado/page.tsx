"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap, RefreshCw, Loader2, BookOpen, TrendingUp,
  ArrowRightLeft, Brain, Calendar, ChevronDown, ChevronUp,
  Lightbulb, CheckCircle, AlertTriangle, BarChart3,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LearningLog {
  date: string;
  totalCases: number;
  transferredLearned: number;
  resolvedLearned: number;
  createdAt: string;
}

interface ReportLog {
  date: string;
  ingestedCount: number;
  createdAt: string;
}

interface ReferenceCaseSummary {
  total: number;
  recentCases: {
    phone: string;
    customerName: string;
    systemName: string;
    analystName: string;
    problemSummary: string;
    solutionSummary: string;
    createdAt: string;
  }[];
}

function formatDateBR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTimeBR(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AprendizadoPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [learningLogs, setLearningLogs] = useState<LearningLog[]>([]);
  const [reportLogs, setReportLogs] = useState<ReportLog[]>([]);
  const [refCases, setRefCases] = useState<ReferenceCaseSummary>({ total: 0, recentCases: [] });
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [kbTotal, setKbTotal] = useState(0);

  const fetchData = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setRefreshing(true);
      const [learningRes, refRes, kbRes] = await Promise.all([
        api.get("/audit/learning?days=30"),
        api.get("/agent/reference-cases?limit=10").catch(() => ({ data: { total: 0, data: [] } })),
        api.get("/knowledge?limit=1").catch(() => ({ data: { total: 0 } })),
      ]);

      setLearningLogs(learningRes.data?.learningLogs || []);
      setReportLogs(learningRes.data?.reportLogs || []);
      setRefCases({
        total: refRes.data?.total || 0,
        recentCases: refRes.data?.data || [],
      });
      setKbTotal(kbRes.data?.total || 0);
    } catch {
      setLearningLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalStudied = learningLogs.reduce((s, l) => s + l.totalCases, 0);
  const totalTransferred = learningLogs.reduce((s, l) => s + l.transferredLearned, 0);
  const totalResolved = learningLogs.reduce((s, l) => s + l.resolvedLearned, 0);
  const totalIngested = reportLogs.reduce((s, l) => s + l.ingestedCount, 0);
  const daysWithLearning = learningLogs.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-indigo-500" />
            Aprendizado do Agente
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Visão diária do que o agente estudou, aprendeu e como melhorar
          </p>
        </div>
        <Button variant="outline" size="md" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2"><Brain className="h-5 w-5 text-indigo-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalStudied}</p>
                <p className="text-xs text-slate-500">Casos Estudados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2"><ArrowRightLeft className="h-5 w-5 text-amber-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalTransferred}</p>
                <p className="text-xs text-slate-500">Aprendeu com Analistas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2"><CheckCircle className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalResolved}</p>
                <p className="text-xs text-slate-500">Reforçou Conhecimento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2"><BookOpen className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{kbTotal}</p>
                <p className="text-xs text-slate-500">Docs na Base</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Sugestões de Melhoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {totalTransferred > 0 && totalTransferred > totalResolved && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    Mais transferências do que resoluções próprias
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    O agente aprendeu com {totalTransferred} casos transferidos vs {totalResolved} resolvidos.
                    Considere revisar quais tipos de problemas estão sendo mais transferidos e adicionar documentação específica na base de conhecimento.
                  </p>
                </div>
              </div>
            )}

            {daysWithLearning === 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-900">Nenhum aprendizado registrado</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    A rotina diária de estudo ainda não gerou registros. Verifique se o cron do backend está rodando corretamente (23h diariamente).
                  </p>
                </div>
              </div>
            )}

            {daysWithLearning > 0 && totalTransferred === 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Sem casos transferidos para aprender</p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    O agente não encontrou casos transferidos concluídos para estudar. Isso pode significar que está resolvendo bem ou que os casos transferidos ainda estão abertos.
                  </p>
                </div>
              </div>
            )}

            {refCases.total > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-900">
                    {refCases.total} caso(s) de referência salvos
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Estes são os casos onde analistas humanos resolveram problemas que o agente não conseguiu. Eles servem como modelo para futuras interações.
                  </p>
                </div>
              </div>
            )}

            {totalIngested > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-purple-200 bg-purple-50 p-3">
                <BookOpen className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-purple-900">
                    {totalIngested} documentos ingeridos do ZapFlow nos últimos 30 dias
                  </p>
                  <p className="text-xs text-purple-700 mt-0.5">
                    Casos resolvidos no ZapFlow são automaticamente adicionados à base de conhecimento para consulta futura.
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Daily Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-slate-500" />
            Histórico Diário (últimos 30 dias)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {learningLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <GraduationCap className="h-12 w-12 text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">Nenhum registro de aprendizado encontrado</p>
              <p className="text-xs text-slate-300 mt-1">
                A rotina diária de estudo é executada às 23h automaticamente
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Data</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-500">Casos Estudados</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-500">Aprendeu c/ Analistas</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-500">Reforçou Próprios</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {learningLogs.map((log) => {
                    const dayKey = log.date || log.createdAt;
                    const hasLearning = log.transferredLearned > 0 || log.resolvedLearned > 0;

                    return (
                      <tr key={dayKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {formatDateBR(dayKey)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm font-semibold text-slate-800">{log.totalCases}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {log.transferredLearned > 0 ? (
                            <Badge variant="warning">{log.transferredLearned}</Badge>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {log.resolvedLearned > 0 ? (
                            <Badge variant="success">{log.resolvedLearned}</Badge>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {hasLearning ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle className="h-3 w-3" /> Aprendeu
                            </span>
                          ) : log.totalCases > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              Sem novidades
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-400">
                              Sem casos
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reference Cases */}
      {refCases.recentCases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-indigo-500" />
              Últimos Casos de Referência (aprendidos de analistas)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {refCases.recentCases.map((rc, i) => (
                <div key={i} className="px-4 py-3 hover:bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-800">{rc.customerName}</span>
                    {rc.systemName && <Badge variant="info">{rc.systemName}</Badge>}
                    <span className="text-[10px] text-slate-400 ml-auto">{formatDateTimeBR(rc.createdAt)}</span>
                  </div>
                  {rc.problemSummary && (
                    <p className="text-xs text-slate-600 mb-0.5">
                      <span className="font-medium text-slate-500">Problema:</span> {rc.problemSummary.slice(0, 200)}
                    </p>
                  )}
                  {rc.solutionSummary && (
                    <p className="text-xs text-emerald-700">
                      <span className="font-medium">Solução:</span> {rc.solutionSummary.slice(0, 200)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
