import { Controller, Get, Param, Query, Res, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { ZapFlowPgService } from './zapflow-pg.service';

@ApiTags('zapflow')
@Controller('zapflow')
export class ZapFlowController {
  constructor(private readonly zapflow: ZapFlowPgService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get real-time dashboard stats from ZapFlow PostgreSQL' })
  async getDashboard() {
    return this.zapflow.getDashboardStats();
  }

  @Get('sistemas')
  @ApiOperation({ summary: 'List systems (for atendimento filters)' })
  async listSistemas() {
    const data = await this.zapflow.getSistemasSuporte();
    return { data };
  }

  @Get('tecnicos')
  @ApiOperation({ summary: 'List technicians (for atendimento filters)' })
  async listTecnicos() {
    const data = await this.zapflow.getTecnicosDisponiveis();
    return { data };
  }

  @Get('atendimentos')
  @ApiOperation({ summary: 'List atendimentos from ZapFlow with optional filters' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'abertos', required: false, type: Boolean })
  @ApiQuery({ name: 'sistemaId', required: false, type: Number })
  @ApiQuery({ name: 'tecnicoId', required: false, type: Number })
  @ApiQuery({ name: 'statusId', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  async listAtendimentos(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('abertos') abertos?: string,
    @Query('sistemaId') sistemaId?: string,
    @Query('tecnicoId') tecnicoId?: string,
    @Query('statusId') statusId?: string,
    @Query('search') search?: string,
  ) {
    const lim = limit ? Math.min(200, Math.max(1, Number(limit))) : 50;
    const pg = page ? Math.max(1, Number(page)) : 1;
    const sid = sistemaId ? parseInt(sistemaId, 10) : undefined;
    const tid = tecnicoId ? parseInt(tecnicoId, 10) : undefined;
    const stid = statusId ? parseInt(statusId, 10) : undefined;

    const result = await this.zapflow.getAtendimentosList(lim, abertos === 'true', {
      sistemaId: Number.isFinite(sid as number) ? sid : undefined,
      tecnicoId: Number.isFinite(tid as number) ? tid : undefined,
      statusId: Number.isFinite(stid as number) ? stid : undefined,
      search: search?.trim() || undefined,
      page: pg,
    });
    return { data: result.data, total: result.total, page: pg, limit: lim };
  }

  @Get('relatorio/agente-id')
  @ApiOperation({ summary: 'Resolve the agent tecnico ID by name' })
  async resolveAgentId(@Query('name') name?: string) {
    const agentName = name || 'Renato Solves';
    const tecnicos = await this.zapflow.getTecnicosDisponiveis();
    const match = tecnicos.find(
      (t) => t.z90_tec_nome.toLowerCase().trim() === agentName.toLowerCase().trim(),
    );
    if (match) return { tecnicoId: match.z90_tec_id, nome: match.z90_tec_nome };
    const partial = tecnicos.find(
      (t) => t.z90_tec_nome.toLowerCase().includes(agentName.split(' ')[0].toLowerCase()),
    );
    if (partial) return { tecnicoId: partial.z90_tec_id, nome: partial.z90_tec_nome };
    return { tecnicoId: null, nome: null, error: 'Técnico não encontrado' };
  }

  @Get('relatorio/agente')
  @ApiOperation({ summary: 'Report: all atendimentos the agent participated in' })
  @ApiQuery({ name: 'tecnicoId', required: true, type: Number })
  @ApiQuery({ name: 'dataInicio', required: false, type: String })
  @ApiQuery({ name: 'dataFim', required: false, type: String })
  @ApiQuery({ name: 'sistemaId', required: false, type: Number })
  @ApiQuery({ name: 'statusId', required: false, type: Number })
  @ApiQuery({ name: 'transferidos', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async agentReport(
    @Query('tecnicoId') tecnicoId: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('sistemaId') sistemaId?: string,
    @Query('statusId') statusId?: string,
    @Query('transferidos') transferidos?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const tid = parseInt(tecnicoId, 10);
    if (!Number.isFinite(tid)) return { error: 'tecnicoId is required' };

    const result = await this.zapflow.getAgentAtendimentos(tid, {
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      sistemaId: sistemaId ? parseInt(sistemaId, 10) : undefined,
      statusId: statusId ? parseInt(statusId, 10) : undefined,
      apenasTransferidos: transferidos === 'true',
      search: search?.trim() || undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });

    return { data: result.data, total: result.total };
  }

  @Get('relatorio/agente/stats')
  @ApiOperation({ summary: 'Daily stats for agent report' })
  async agentDailyStats(
    @Query('tecnicoId') tecnicoId: string,
    @Query('date') date?: string,
  ) {
    const tid = parseInt(tecnicoId, 10);
    if (!Number.isFinite(tid)) return { error: 'tecnicoId is required' };
    const d = date || new Date().toISOString().split('T')[0];
    return this.zapflow.getAgentDailyStats(tid, d);
  }

  @Get('relatorio/agente/export')
  @ApiOperation({ summary: 'Export agent report as CSV' })
  async exportAgentReport(
    @Query('tecnicoId') tecnicoId: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('sistemaId') sistemaId?: string,
    @Query('statusId') statusId?: string,
    @Query('transferidos') transferidos?: string,
    @Query('search') search?: string,
    @Res() res?: Response,
  ) {
    const tid = parseInt(tecnicoId, 10);
    if (!Number.isFinite(tid) || !res) return;

    const result = await this.zapflow.getAgentAtendimentos(tid, {
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      sistemaId: sistemaId ? parseInt(sistemaId, 10) : undefined,
      statusId: statusId ? parseInt(statusId, 10) : undefined,
      apenasTransferidos: transferidos === 'true',
      search: search?.trim() || undefined,
      limit: 5000,
      page: 1,
    });

    const header = 'ID;Cliente;Sistema;Problema;Solução;Técnico Atual;Transferido;Data Abertura;Data Fechamento;Status';
    const rows = result.data.map((r: any) => {
      const fields = [
        r.z90_ate_id,
        this.csvEscape(r.cliente || ''),
        this.csvEscape(r.sistema || ''),
        this.csvEscape(r.z90_ate_resumo_do_problema || ''),
        this.csvEscape(r.z90_ate_resumo_da_solucao || ''),
        this.csvEscape(r.tecnico_atual || ''),
        r.transferido ? 'Sim' : 'Não',
        r.z90_ate_data_abertura || '',
        r.z90_ate_data_fechamento || '',
        this.statusIdToLabel(r.z90_ate_id_status_atendimento),
      ];
      return fields.join(';');
    });

    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const filename = `relatorio-agente-${dataInicio || 'inicio'}-${dataFim || 'fim'}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  private csvEscape(val: string): string {
    if (val.includes(';') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  private statusIdToLabel(id: number): string {
    switch (id) {
      case 1: return 'Aberto';
      case 2: return 'Em Andamento';
      case 3: return 'Fechado';
      default: return `Status ${id}`;
    }
  }

  @Get('dashboard/agente')
  @ApiOperation({ summary: 'Agent-focused dashboard data' })
  async getAgentDashboard(
    @Query('tecnicoId') tecnicoId?: string,
  ) {
    const agentName = 'Renato Solves';
    let tid = tecnicoId ? parseInt(tecnicoId, 10) : 0;
    if (!tid) {
      const tecnicos = await this.zapflow.getTecnicosDisponiveis();
      const match = tecnicos.find(t => t.z90_tec_nome.toLowerCase().includes('renato'));
      tid = match?.z90_tec_id || 0;
    }
    if (!tid) return { error: 'Agente não encontrado' };

    const today = new Date().toISOString().split('T')[0];
    const [todayStats, weeklyStats, performance] = await Promise.all([
      this.zapflow.getAgentDailyStats(tid, today),
      this.zapflow.getAgentWeeklyStats(tid, 7),
      this.zapflow.getAgentPerformanceSummary(tid),
    ]);

    return { tecnicoId: tid, todayStats, weeklyStats, performance };
  }

  @Get('atendimentos/:id')
  @ApiOperation({ summary: 'Get a single atendimento with interacoes' })
  async getAtendimento(@Param('id') id: string) {
    const ateId = parseInt(id, 10);
    const [atendimento, interacoes] = await Promise.all([
      this.zapflow.getAtendimento(ateId),
      this.zapflow.getInteracoes(ateId, 100),
    ]);
    if (!atendimento) return { error: 'Atendimento não encontrado' };

    let entidade = null;
    if (atendimento.z90_ent_id) {
      entidade = await this.zapflow.getEntidade(atendimento.z90_ent_id);
    }

    let sistema = null;
    if (atendimento.z90_ate_id_sistema_suporte) {
      sistema = await this.zapflow.getSistema(atendimento.z90_ate_id_sistema_suporte);
    }

    return { atendimento, interacoes, entidade, sistema };
  }
}
