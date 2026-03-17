"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Ticket, Users, Clock, AlertTriangle, RefreshCw, Monitor, Loader2 } from "lucide-react";
import api from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const STATUS_COLORS: Record<string, string> = {
  "1": "#3b82f6",
  "2": "#f59e0b",
  "3": "#10b981",
  "4": "#ef4444",
  "5": "#8b5cf6",
  "6": "#6b7280",
};

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#6b7280"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setRefreshing(true);
      const { data: res } = await api.get("/zapflow/dashboard");
      setData(res);
      setError("");
    } catch {
      setError("Erro ao carregar dados do ZapFlow");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const interval = setInterval(() => fetchDashboard(), 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-500">{error || "Sem dados"}</p>
      </div>
    );
  }

  if (!data.connected) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400 mb-3" />
          <p className="text-slate-600">ZapFlow MCP não conectado.</p>
          <p className="text-sm text-slate-400 mt-1">Configure ZAPFLOW_MCP_URL e ZAPFLOW_MCP_TOKEN no .env</p>
        </div>
      </div>
    );
  }

  const porSistema = (data.porSistema || []).map((s: any) => ({
    name: s.sistema || "Sem sistema",
    value: parseInt(s.count, 10),
  }));

  const tecnicosData = (data.tecnicosAtivos || []).map((t: any) => ({
    name: t.z90_tec_nome,
    atendimentos: parseInt(t.atendimentos_abertos, 10),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Dados em tempo real do ZapFlow
          </p>
        </div>
        <Button variant="outline" size="md" onClick={() => fetchDashboard(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Ticket}
          label="Atendimentos Abertos"
          value={data.totalAbertos}
        />
        <StatCard
          icon={Clock}
          label="Abertos Hoje"
          value={data.totalHoje}
        />
        <StatCard
          icon={AlertTriangle}
          label="Total Fechados"
          value={data.totalFechados}
        />
        <StatCard
          icon={Users}
          label="Analistas Ativos"
          value={data.tecnicosAtivos?.length || 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-blue-500" />
              Atendimentos Abertos por Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            {porSistema.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Nenhum atendimento aberto</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={porSistema}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name} (${value})`}
                    >
                      {porSistema.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              Carga por Analista
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tecnicosData.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8">Nenhum analista ativo</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tecnicosData} layout="vertical" margin={{ top: 4, right: 20, bottom: 0, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px" }} />
                    <Bar dataKey="atendimentos" name="Atendimentos Abertos" fill="#10b981" radius={[0, 6, 6, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atendimentos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">ID</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Cliente</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Sistema</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Problema</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Data</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data.atendimentosRecentes || []).map((a: any) => (
                  <tr
                    key={a.z90_ate_id}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/tickets/zf-${a.z90_ate_id}`)}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">#{a.z90_ate_id}</td>
                    <td className="px-3 py-2.5 text-slate-700">{a.cliente || "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="info">{a.sistema || "—"}</Badge>
                    </td>
                    <td className="px-3 py-2.5 max-w-xs truncate text-slate-600">
                      {a.z90_ate_resumo_do_problema || "Sem descrição"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-400">
                      {a.z90_ate_data_abertura ? formatDate(a.z90_ate_data_abertura) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        a.z90_ate_id_status_atendimento === 1 ? "bg-blue-100 text-blue-700" :
                        a.z90_ate_id_status_atendimento === 3 ? "bg-emerald-100 text-emerald-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {a.z90_ate_id_status_atendimento === 1 ? "Aberto" :
                         a.z90_ate_id_status_atendimento === 3 ? "Fechado" :
                         `Status ${a.z90_ate_id_status_atendimento}`}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!data.atendimentosRecentes || data.atendimentosRecentes.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      Nenhum atendimento encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
