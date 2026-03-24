import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
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
