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

  @Get('atendimentos')
  @ApiOperation({ summary: 'List atendimentos from ZapFlow' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'abertos', required: false, type: Boolean })
  async listAtendimentos(
    @Query('limit') limit?: number,
    @Query('abertos') abertos?: string,
  ) {
    const rows = await this.zapflow.getAtendimentosList(
      limit ? Number(limit) : 50,
      abertos === 'true',
    );
    return { data: rows, total: rows.length };
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
