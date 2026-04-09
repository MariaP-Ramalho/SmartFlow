"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, RefreshCw, Loader2, AlertTriangle, CheckCircle,
  ArrowRightLeft, TrendingUp, Clock, Zap, Target,
  Activity, BarChart3,
} from "lucide-react";
import api from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, AreaChart, Area,
} from "recharts";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [todayStats, setTodayStats] = useState<any>(null);
  const [weeklyStats, setWeeklyStats] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any>(null);
  const [recentTransfers, setRecentTransfers] = useState<any[]>([]);

  const fetchDashboard = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setRefreshing(true);

      const [dashRes, transfersRes] = await Promise.all([
        api.get("/zapflow/dashboard/agente"),
        api.get("/zapflow/relatorio/agente", {
          params: {
            tecnicoId: 0,
            transferidos: "true",
            limit: 5,
            page: 1,
          },
        }).catch(() => ({ data: { data: [] } })),
      ]);

      const dash = dashRes.data;
      if (dash.error) {
        setError(dash.error);
        return;
      }

      setTodayStats(dash.todayStats);
      setWeeklyStats(dash.weeklyStats || []);
      setPerformance(dash.performance);

      if (dash.tecnicoId && transfersRes.data?.data?.length === 0) {
        const realTransfers = await api.get("/zapflow/relatorio/agente", {
          params: { tecnicoId: dash.tecnicoId, transferidos: "true", limit: 5, page: 1 },
        }).catch(() => ({ data: { data: [] } }));
        setRecentTransfers(realTransfers.data?.data || []);
      } else {
        setRecentTransfers(transfersRes.data?.data || []);
      }

      setError("");
    } catch {
      setError("Erro ao carregar dados do agente");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  useEffect(() => {
    const interval = setInterval(() => fetchDashboard(), 60000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400 mb-3" />
          <p className="text-slate-600">{error}</p>
          <Button variant="outline" size="md" className="mt-4" onClick={() => fetchDashboard(true)}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const weekResRate = performance?.week?.resolutionRate || 0;
  const monthResRate = performance?.month?.resolutionRate || 0;

  const chartData = weeklyStats.map((s: any) => ({
    date: formatDateShort(s.date),
    total: s.totalAtendimentos || 0,
    resolvidos: s.resolvidosPeloAgente || 0,
    transferidos: s.transferidos || 0,
    bugs: s.bugs || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bot className="h-7 w-7 text-blue-500" />
            Painel do Agente
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Desempenho e métricas em tempo real do agente de suporte
          </p>
        </div>
        <Button variant="outline" size="md" onClick={() => fetchDashboard(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      {/* Today Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={Zap} label="Atendimentos Hoje" value={todayStats?.totalAtendimentos ?? 0} />
        <StatCard icon={CheckCircle} label="Resolvidos Hoje" value={todayStats?.resolvidosPeloAgente ?? 0} />
        <StatCard icon={ArrowRightLeft} label="Transferidos Hoje" value={todayStats?.transferidos ?? 0} />
        <StatCard icon={AlertTriangle} label="Bugs Hoje" value={todayStats?.bugs ?? 0} />
        <StatCard icon={Activity} label="Em Aberto Agora" value={performance?.openNow ?? 0} />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Taxa de Resolução (7 dias)</p>
              <Target className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{weekResRate}%</p>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full transition-all ${weekResRate >= 70 ? "bg-emerald-500" : weekResRate >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(100, weekResRate)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {performance?.week?.resolved ?? 0} de {performance?.week?.total ?? 0} atendimentos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Taxa de Resolução (30 dias)</p>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{monthResRate}%</p>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full transition-all ${monthResRate >= 70 ? "bg-emerald-500" : monthResRate >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(100, monthResRate)}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              {performance?.month?.resolved ?? 0} de {performance?.month?.total ?? 0} atendimentos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Tempo Médio de Resolução</p>
              <Clock className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">
              {performance?.avgResolutionMinutes ? `${performance.avgResolutionMinutes}` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-400">minutos (média últimos 7 dias)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Transferidos (7 dias)</p>
              <ArrowRightLeft className="h-4 w-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{performance?.week?.transferred ?? 0}</p>
            <p className="mt-1 text-xs text-slate-400">
              casos encaminhados para analistas humanos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            Desempenho dos Últimos 7 Dias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Sem dados disponíveis</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        total: "Total", resolvidos: "Resolvidos", transferidos: "Transferidos", bugs: "Bugs",
                      };
                      return [value, labels[name] || name];
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        total: "Total", resolvidos: "Resolvidos", transferidos: "Transferidos", bugs: "Bugs",
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Bar dataKey="total" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="resolvidos" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="transferidos" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="bugs" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Transfers */}
      {recentTransfers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-amber-500" />
              Últimas Transferências
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500 w-[70px]">ID</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Cliente</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Sistema</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Problema</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500">Técnico Atual</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-500 w-[120px]">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransfers.map((a: any) => (
                    <tr key={a.z90_ate_id} className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer"
                      onClick={() => router.push(`/relatorios`)}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">#{a.z90_ate_id}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[160px] truncate">{a.cliente || "—"}</td>
                      <td className="px-4 py-2.5"><Badge variant="info">{a.sistema || "—"}</Badge></td>
                      <td className="px-4 py-2.5 max-w-[220px] truncate text-slate-600">{a.z90_ate_resumo_do_problema || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-[130px] truncate">{a.tecnico_atual || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">{a.z90_ate_data_abertura ? formatDateFull(a.z90_ate_data_abertura) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
