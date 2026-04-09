import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpClient, McpQueryResult } from './mcp-client';
import {
  ZapFlowAtendimento,
  ZapFlowInteracao,
  ZapFlowEntidade,
  ZapFlowSistema,
  ZapFlowAgenteIA,
  ZapFlowTecnico,
} from './zapflow.interfaces';

@Injectable()
export class ZapFlowPgService implements OnModuleInit {
  private readonly logger = new Logger(ZapFlowPgService.name);
  private mcp: McpClient | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('ZAPFLOW_MCP_URL');
    const token = this.config.get<string>('ZAPFLOW_MCP_TOKEN');

    if (!url || !token) {
      this.logger.warn('ZAPFLOW_MCP_URL or ZAPFLOW_MCP_TOKEN not configured — ZapFlow MCP integration disabled');
      return;
    }

    this.mcp = new McpClient(url, token);

    try {
      await this.mcp.initialize();
      this.logger.log('ZapFlow MCP client connected and initialized');
    } catch (err) {
      this.logger.error(`Failed to initialize MCP client: ${err instanceof Error ? err.message : err}`);
      this.mcp = null;
    }
  }

  get isConnected(): boolean {
    return this.mcp !== null && this.mcp.hasSession;
  }

  private esc(val: any): string {
    return McpClient.escapeValue(val);
  }

  // ─── LEITURA ────────────────────────────────────────────────

  async getAtendimento(ateId: number): Promise<ZapFlowAtendimento | null> {
    if (!this.mcp) return null;
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT * FROM z90_atendimentos WHERE z90_ate_id = ${this.esc(ateId)}`,
    );
    return (rows[0] as ZapFlowAtendimento) || null;
  }

  async getInteracoes(ateId: number, limit = 50): Promise<ZapFlowInteracao[]> {
    if (!this.mcp) return [];
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT * FROM z90_interacoes_atendimento
       WHERE z90_ate_id = ${this.esc(ateId)}
       ORDER BY z90_int_data_hora_envio ASC
       LIMIT ${this.esc(limit)}`,
    );
    return rows as ZapFlowInteracao[];
  }

  async getEntidade(entId: number): Promise<ZapFlowEntidade | null> {
    if (!this.mcp) return null;
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT * FROM z90_entidades WHERE z90_ent_id = ${this.esc(entId)}`,
    );
    return (rows[0] as ZapFlowEntidade) || null;
  }

  async getSistema(sisId: number): Promise<ZapFlowSistema | null> {
    if (!this.mcp) return null;
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT * FROM z90_sistemas_suporte WHERE z90_sis_id = ${this.esc(sisId)}`,
    );
    return (rows[0] as ZapFlowSistema) || null;
  }

  async getAgenteIA(ageId: number): Promise<ZapFlowAgenteIA | null> {
    if (!this.mcp) return null;
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT * FROM z90_agentes_ia WHERE z90_age_id = ${this.esc(ageId)}`,
    );
    return (rows[0] as ZapFlowAgenteIA) || null;
  }

  async getTecnicosDisponiveis(): Promise<ZapFlowTecnico[]> {
    if (!this.mcp) return [];
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT z90_tec_id, z90_tec_nome, z90_tec_email, z90_tec_telefone,
              z90_tec_ativo, z90_tec_disponivel_pa_91d0d83c AS z90_tec_disponivel,
              z90_tec_desligado
       FROM z90_tecnicos_suporte
       WHERE z90_tec_ativo = 'S'
         AND (z90_tec_desligado IS NULL OR z90_tec_desligado != 'S')
       ORDER BY z90_tec_id`,
    );
    return rows as ZapFlowTecnico[];
  }

  async getAtendimentosResolvidosDesde(desde: Date): Promise<ZapFlowAtendimento[]> {
    if (!this.mcp) return [];
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT * FROM z90_atendimentos
       WHERE z90_ate_data_fechamento >= ${this.esc(desde)}
       ORDER BY z90_ate_data_fechamento DESC
       LIMIT 200`,
    );
    return rows as ZapFlowAtendimento[];
  }

  async countAtendimentosPorTecnico(tecId: number): Promise<number> {
    if (!this.mcp) return 0;
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT COUNT(*) as count FROM z90_atendimentos
       WHERE z90_ate_id_tecnico_responsavel = ${this.esc(tecId)}
         AND z90_ate_data_fechamento IS NULL`,
    );
    return parseInt(rows[0]?.count || '0', 10);
  }

  // ─── DASHBOARD / STATS ──────────────────────────────────────

  private async safeQuery(sql: string, label: string): Promise<McpQueryResult> {
    try {
      return await this.mcp!.executeSelectQuery(sql);
    } catch (err) {
      this.logger.error(`Query "${label}" failed: ${err instanceof Error ? err.message : err}`);
      return { rows: [], rowCount: 0 };
    }
  }

  async getDashboardStats(): Promise<Record<string, any>> {
    if (!this.mcp) return { connected: false };

    const [
      totalAbertos,
      totalFechados,
      totalHoje,
      porStatus,
      porSistema,
      atendimentosRecentes,
      tecnicosAtivos,
    ] = await Promise.all([
      this.safeQuery(
        `SELECT COUNT(*) as count FROM z90_atendimentos WHERE z90_ate_data_fechamento IS NULL`,
        'totalAbertos',
      ),
      this.safeQuery(
        `SELECT COUNT(*) as count FROM z90_atendimentos WHERE z90_ate_data_fechamento IS NOT NULL`,
        'totalFechados',
      ),
      this.safeQuery(
        `SELECT COUNT(*) as count FROM z90_atendimentos WHERE z90_ate_data_abertura::date = CURRENT_DATE`,
        'totalHoje',
      ),
      this.safeQuery(
        `SELECT z90_ate_id_status_atendimento as status_id, COUNT(*) as count
         FROM z90_atendimentos GROUP BY z90_ate_id_status_atendimento ORDER BY count DESC`,
        'porStatus',
      ),
      this.safeQuery(
        `SELECT s.z90_sis_nome_sistema as sistema, COUNT(*) as count
         FROM z90_atendimentos a
         LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
         WHERE a.z90_ate_data_fechamento IS NULL
         GROUP BY s.z90_sis_nome_sistema ORDER BY count DESC LIMIT 10`,
        'porSistema',
      ),
      this.safeQuery(
        `SELECT a.z90_ate_id, a.z90_ate_resumo_do_problema, a.z90_ate_data_abertura,
                a.z90_ate_id_status_atendimento,
                e.z90_ent_razao_social as cliente,
                s.z90_sis_nome_sistema as sistema
         FROM z90_atendimentos a
         LEFT JOIN z90_entidades e ON a.z90_ent_id = e.z90_ent_id
         LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
         ORDER BY a.z90_ate_data_abertura DESC LIMIT 10`,
        'atendimentosRecentes',
      ),
      this.safeQuery(
        `SELECT t.z90_tec_id, t.z90_tec_nome, COUNT(a.z90_ate_id) as atendimentos_abertos
         FROM z90_tecnicos_suporte t
         LEFT JOIN z90_atendimentos a ON a.z90_ate_id_tecnico_responsavel = t.z90_tec_id
           AND a.z90_ate_data_fechamento IS NULL
         WHERE t.z90_tec_ativo = 'S'
           AND (t.z90_tec_desligado IS NULL OR t.z90_tec_desligado != 'S')
         GROUP BY t.z90_tec_id, t.z90_tec_nome
         ORDER BY atendimentos_abertos DESC`,
        'tecnicosAtivos',
      ),
    ]);

    return {
      connected: true,
      totalAbertos: parseInt(totalAbertos.rows[0]?.count || '0', 10),
      totalFechados: parseInt(totalFechados.rows[0]?.count || '0', 10),
      totalHoje: parseInt(totalHoje.rows[0]?.count || '0', 10),
      porStatus: porStatus.rows,
      porSistema: porSistema.rows,
      atendimentosRecentes: atendimentosRecentes.rows,
      tecnicosAtivos: tecnicosAtivos.rows,
    };
  }

  async getSistemasSuporte(): Promise<{ z90_sis_id: number; z90_sis_nome_sistema: string }[]> {
    if (!this.mcp) return [];
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT z90_sis_id, z90_sis_nome_sistema
       FROM z90_sistemas_suporte
       WHERE z90_sis_nome_sistema IS NOT NULL AND TRIM(z90_sis_nome_sistema) != ''
       ORDER BY z90_sis_nome_sistema`,
    );
    return rows as { z90_sis_id: number; z90_sis_nome_sistema: string }[];
  }

  async getAtendimentosList(
    limit = 50,
    apenasAbertos = false,
    filters?: {
      sistemaId?: number;
      tecnicoId?: number;
      statusId?: number;
      search?: string;
      page?: number;
    },
  ): Promise<{ data: any[]; total: number }> {
    if (!this.mcp) return { data: [], total: 0 };

    const page = Math.max(1, filters?.page ?? 1);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    if (apenasAbertos) {
      conditions.push('a.z90_ate_data_fechamento IS NULL');
    }
    if (filters?.sistemaId != null && !Number.isNaN(Number(filters.sistemaId))) {
      conditions.push(`a.z90_ate_id_sistema_suporte = ${this.esc(Number(filters.sistemaId))}`);
    }
    if (filters?.tecnicoId != null && !Number.isNaN(Number(filters.tecnicoId))) {
      conditions.push(`a.z90_ate_id_tecnico_responsavel = ${this.esc(Number(filters.tecnicoId))}`);
    }
    if (filters?.statusId != null && !Number.isNaN(Number(filters.statusId))) {
      conditions.push(`a.z90_ate_id_status_atendimento = ${this.esc(Number(filters.statusId))}`);
    }
    if (filters?.search?.trim()) {
      const raw = filters.search.trim().replace(/'/g, "''");
      const like = `%${raw.toLowerCase()}%`;
      conditions.push(`(
        LOWER(COALESCE(a.z90_ate_resumo_do_problema, '')) LIKE ${this.esc(like)}
        OR LOWER(COALESCE(e.z90_ent_razao_social, '')) LIKE ${this.esc(like)}
        OR LOWER(COALESCE(s.z90_sis_nome_sistema, '')) LIKE ${this.esc(like)}
        OR LOWER(COALESCE(t.z90_tec_nome, '')) LIKE ${this.esc(like)}
        OR CAST(a.z90_ate_id AS TEXT) LIKE ${this.esc(`%${raw}%`)}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(*)::bigint AS cnt
      FROM z90_atendimentos a
      LEFT JOIN z90_entidades e ON a.z90_ent_id = e.z90_ent_id
      LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
      LEFT JOIN z90_tecnicos_suporte t ON a.z90_ate_id_tecnico_responsavel = t.z90_tec_id
      ${whereClause}`;

    const dataSql = `
      SELECT a.z90_ate_id, a.z90_ate_resumo_do_problema, a.z90_ate_data_abertura,
             a.z90_ate_data_fechamento, a.z90_ate_id_status_atendimento,
             a.z90_ate_resumo_da_solucao, a.z90_ate_avaliacao_cliente,
             e.z90_ent_razao_social as cliente,
             s.z90_sis_nome_sistema as sistema,
             t.z90_tec_nome as tecnico
      FROM z90_atendimentos a
      LEFT JOIN z90_entidades e ON a.z90_ent_id = e.z90_ent_id
      LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
      LEFT JOIN z90_tecnicos_suporte t ON a.z90_ate_id_tecnico_responsavel = t.z90_tec_id
      ${whereClause}
      ORDER BY a.z90_ate_data_abertura DESC
      LIMIT ${this.esc(limit)} OFFSET ${this.esc(offset)}`;

    const [countRes, dataRes] = await Promise.all([
      this.safeQuery(countSql, 'atendimentosCount'),
      this.safeQuery(dataSql, 'atendimentosList'),
    ]);

    const total = parseInt(String(countRes.rows[0]?.cnt ?? '0'), 10);
    return { data: dataRes.rows, total };
  }

  async searchSimilarCases(keywords: string, systemName?: string, limit = 10): Promise<any[]> {
    if (!this.mcp) return [];

    const stopWords = new Set([
      'para', 'como', 'esta', 'está', 'este', 'esse', 'essa', 'isso',
      'com', 'por', 'que', 'não', 'nao', 'uma', 'das', 'dos', 'nos',
      'mais', 'muito', 'pode', 'deve', 'após', 'apos', 'sobre', 'desde',
      'ainda', 'mesmo', 'quando', 'onde', 'qual', 'quais', 'ela', 'ele',
      'elas', 'eles', 'seu', 'sua', 'seus', 'suas', 'meu', 'minha',
      'também', 'tambem', 'porém', 'porem', 'sendo', 'sido', 'tendo',
      'fazer', 'feito', 'estava', 'estou', 'segundo', 'cliente', 'sistema',
      'problema', 'relatou', 'informou', 'mencionou', 'conseguia',
      'conta', 'mês', 'mes', 'ano', 'dia', 'data',
    ]);

    const accentMap: Record<string, string> = {
      'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a',
      'é': 'e', 'ê': 'e', 'í': 'i', 'ó': 'o',
      'ô': 'o', 'õ': 'o', 'ú': 'u', 'ç': 'c',
    };
    const removeAccents = (s: string) =>
      s.replace(/[áàãâéêíóôõúç]/g, (c) => accentMap[c] || c);

    const rawWords = keywords
      .toLowerCase()
      .replace(/[.,;:!?()\/\\]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w) && !stopWords.has(removeAccents(w)))
      .slice(0, 8);

    if (rawWords.length === 0) return [];

    const allVariants = new Set<string>();
    for (const w of rawWords) {
      allVariants.add(w);
      const noAccent = removeAccents(w);
      if (noAccent !== w) allVariants.add(noAccent);
    }

    const words = [...allVariants];
    const esc = (w: string) => w.replace(/'/g, "''");

    const summaryConditions = words
      .map(
        (w) =>
          `(LOWER(a.z90_ate_resumo_do_problema) LIKE '%${esc(w)}%' OR LOWER(COALESCE(a.z90_ate_resumo_da_solucao, '')) LIKE '%${esc(w)}%')`,
      )
      .join(' OR ');

    let systemFilter = '';
    if (systemName) {
      systemFilter = `AND LOWER(s.z90_sis_nome_sistema) LIKE '%${esc(systemName.toLowerCase())}%'`;
    }

    const summaryQuery = `
      SELECT DISTINCT a.z90_ate_id, a.z90_ate_resumo_do_problema,
             a.z90_ate_resumo_da_solucao, a.z90_ate_data_fechamento,
             a.z90_ate_transbordo_dev, a.z90_ate_bug_solucionado,
             s.z90_sis_nome_sistema as sistema, e.z90_ent_razao_social as entidade
      FROM z90_atendimentos a
      LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
      LEFT JOIN z90_entidades e ON a.z90_ent_id = e.z90_ent_id
      WHERE a.z90_ate_data_fechamento IS NOT NULL
        AND (${summaryConditions})
        ${systemFilter}
      ORDER BY a.z90_ate_data_fechamento DESC
      LIMIT ${this.esc(limit)}`;

    const interactionConditions = words
      .map((w) => `LOWER(i.z90_int_conteudo_mensagem) LIKE '%${esc(w)}%'`)
      .join(' OR ');

    const interactionQuery = `
      SELECT DISTINCT ON (a.z90_ate_id) a.z90_ate_id, a.z90_ate_resumo_do_problema,
             a.z90_ate_resumo_da_solucao, a.z90_ate_data_fechamento,
             a.z90_ate_transbordo_dev, a.z90_ate_bug_solucionado,
             s.z90_sis_nome_sistema as sistema, e.z90_ent_razao_social as entidade
      FROM z90_interacoes_atendimento i
      JOIN z90_atendimentos a ON i.z90_ate_id = a.z90_ate_id
      LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
      LEFT JOIN z90_entidades e ON a.z90_ent_id = e.z90_ent_id
      WHERE a.z90_ate_data_fechamento IS NOT NULL
        AND (${interactionConditions})
        ${systemFilter}
      ORDER BY a.z90_ate_id, a.z90_ate_data_fechamento DESC
      LIMIT ${this.esc(limit)}`;

    const [summaryResults, interactionResults] = await Promise.all([
      this.safeQuery(summaryQuery, 'searchSummaryCases'),
      this.safeQuery(interactionQuery, 'searchInteractionCases'),
    ]);

    const seen = new Set<number>();
    const combined: any[] = [];

    for (const row of [...summaryResults.rows, ...interactionResults.rows]) {
      const id = row.z90_ate_id;
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(row);
      }
    }

    combined.sort((a, b) => {
      const da = a.z90_ate_data_fechamento ? new Date(a.z90_ate_data_fechamento).getTime() : 0;
      const db = b.z90_ate_data_fechamento ? new Date(b.z90_ate_data_fechamento).getTime() : 0;
      return db - da;
    });

    return combined.slice(0, limit);
  }

  async getCaseInteractions(ateId: number, limit = 30): Promise<any[]> {
    if (!this.mcp) return [];
    const { rows } = await this.mcp.executeSelectQuery(
      `SELECT i.z90_int_conteudo_mensagem, i.z90_int_id_tipo_remetente,
              i.z90_int_data_hora_envio
       FROM z90_interacoes_atendimento i
       WHERE i.z90_ate_id = ${this.esc(ateId)}
         AND i.z90_int_conteudo_mensagem IS NOT NULL
         AND i.z90_int_conteudo_mensagem != ''
       ORDER BY i.z90_int_data_hora_envio ASC
       LIMIT ${this.esc(limit)}`,
    );
    return rows;
  }

  // ─── RELATÓRIO DO AGENTE ────────────────────────────────────

  async getAgentAtendimentos(
    tecnicoId: number,
    filters?: {
      dataInicio?: string;
      dataFim?: string;
      sistemaId?: number;
      statusId?: number;
      apenasTransferidos?: boolean;
      search?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: any[]; total: number }> {
    if (!this.mcp) return { data: [], total: 0 };

    const limit = Math.min(200, filters?.limit || 50);
    const page = Math.max(1, filters?.page || 1);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];

    if (filters?.dataInicio) {
      conditions.push(`a.z90_ate_data_abertura >= ${this.esc(filters.dataInicio)}`);
    }
    if (filters?.dataFim) {
      conditions.push(`a.z90_ate_data_abertura <= ${this.esc(filters.dataFim + ' 23:59:59')}`);
    }
    if (filters?.sistemaId != null && Number.isFinite(filters.sistemaId)) {
      conditions.push(`a.z90_ate_id_sistema_suporte = ${this.esc(filters.sistemaId)}`);
    }
    if (filters?.statusId != null && Number.isFinite(filters.statusId)) {
      conditions.push(`a.z90_ate_id_status_atendimento = ${this.esc(filters.statusId)}`);
    }
    if (filters?.apenasTransferidos) {
      conditions.push(`a.z90_ate_id_tecnico_responsavel != ${this.esc(tecnicoId)}`);
    }
    if (filters?.search?.trim()) {
      const like = `%${filters.search.trim().toLowerCase().replace(/'/g, "''")}%`;
      conditions.push(`(
        LOWER(COALESCE(a.z90_ate_resumo_do_problema, '')) LIKE ${this.esc(like)}
        OR LOWER(COALESCE(e.z90_ent_razao_social, '')) LIKE ${this.esc(like)}
        OR LOWER(COALESCE(s.z90_sis_nome_sistema, '')) LIKE ${this.esc(like)}
        OR CAST(a.z90_ate_id AS TEXT) LIKE ${this.esc(`%${filters.search.trim()}%`)}
      )`);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    const baseJoin = `
      FROM z90_atendimentos a
      LEFT JOIN z90_entidades e ON a.z90_ent_id = e.z90_ent_id
      LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
      LEFT JOIN z90_tecnicos_suporte t ON a.z90_ate_id_tecnico_responsavel = t.z90_tec_id
      WHERE a.z90_ate_id IN (
        SELECT DISTINCT i.z90_ate_id
        FROM z90_interacoes_atendimento i
        WHERE i.z90_int_id_remetente_usuario IN (
          SELECT z90_tec_id FROM z90_tecnicos_suporte WHERE z90_tec_id = ${this.esc(tecnicoId)}
        )
        OR i.z90_int_id_remetente_agente_ia IS NOT NULL
        UNION
        SELECT z90_ate_id FROM z90_atendimentos
        WHERE z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)}
           OR z90_ate_id_agente_ia_inicial IS NOT NULL
      )
      ${whereClause}`;

    const countSql = `SELECT COUNT(*)::bigint AS cnt ${baseJoin}`;
    const dataSql = `
      SELECT a.z90_ate_id, a.z90_ate_resumo_do_problema, a.z90_ate_data_abertura,
             a.z90_ate_data_fechamento, a.z90_ate_id_status_atendimento,
             a.z90_ate_resumo_da_solucao,
             a.z90_ate_id_tecnico_responsavel,
             a.z90_ate_transbordo_dev,
             e.z90_ent_razao_social AS cliente,
             s.z90_sis_nome_sistema AS sistema,
             t.z90_tec_nome AS tecnico_atual,
             CASE WHEN a.z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)} THEN false ELSE true END AS transferido
      ${baseJoin}
      ORDER BY a.z90_ate_data_abertura DESC
      LIMIT ${this.esc(limit)} OFFSET ${this.esc(offset)}`;

    const [countRes, dataRes] = await Promise.all([
      this.safeQuery(countSql, 'agentReportCount'),
      this.safeQuery(dataSql, 'agentReportData'),
    ]);

    const total = parseInt(String(countRes.rows[0]?.cnt ?? '0'), 10);
    return { data: dataRes.rows, total };
  }

  async getAgentDailyStats(tecnicoId: number, date: string): Promise<Record<string, any>> {
    if (!this.mcp) return {};

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    const dateCond = `a.z90_ate_data_abertura >= ${this.esc(date)} AND a.z90_ate_data_abertura < ${this.esc(nextDateStr)}`;

    const baseWhere = `WHERE a.z90_ate_id IN (
      SELECT DISTINCT i.z90_ate_id FROM z90_interacoes_atendimento i
      WHERE i.z90_int_id_remetente_usuario IN (
        SELECT z90_tec_id FROM z90_tecnicos_suporte WHERE z90_tec_id = ${this.esc(tecnicoId)}
      ) OR i.z90_int_id_remetente_agente_ia IS NOT NULL
      UNION
      SELECT z90_ate_id FROM z90_atendimentos
      WHERE z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)}
         OR z90_ate_id_agente_ia_inicial IS NOT NULL
    ) AND ${dateCond}`;

    const [totalRes, resolvidosRes, transferidosRes, bugsRes] = await Promise.all([
      this.safeQuery(
        `SELECT COUNT(*) AS cnt FROM z90_atendimentos a ${baseWhere}`,
        'dailyTotal',
      ),
      this.safeQuery(
        `SELECT COUNT(*) AS cnt FROM z90_atendimentos a ${baseWhere} AND a.z90_ate_data_fechamento IS NOT NULL AND a.z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)}`,
        'dailyResolvidos',
      ),
      this.safeQuery(
        `SELECT COUNT(*) AS cnt FROM z90_atendimentos a ${baseWhere} AND a.z90_ate_id_tecnico_responsavel != ${this.esc(tecnicoId)}`,
        'dailyTransferidos',
      ),
      this.safeQuery(
        `SELECT COUNT(*) AS cnt FROM z90_atendimentos a ${baseWhere} AND a.z90_ate_transbordo_dev IS NOT NULL`,
        'dailyBugs',
      ),
    ]);

    return {
      date,
      totalAtendimentos: parseInt(totalRes.rows[0]?.cnt || '0', 10),
      resolvidosPeloAgente: parseInt(resolvidosRes.rows[0]?.cnt || '0', 10),
      transferidos: parseInt(transferidosRes.rows[0]?.cnt || '0', 10),
      bugs: parseInt(bugsRes.rows[0]?.cnt || '0', 10),
    };
  }

  async getDailyCasesForLearning(tecnicoId: number, date: string): Promise<any[]> {
    if (!this.mcp) return [];

    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];

    const { rows } = await this.mcp.executeSelectQuery(`
      SELECT a.z90_ate_id, a.z90_ate_resumo_do_problema, a.z90_ate_resumo_da_solucao,
             a.z90_ate_data_abertura, a.z90_ate_data_fechamento,
             a.z90_ate_id_tecnico_responsavel, a.z90_ate_transbordo_dev,
             s.z90_sis_nome_sistema AS sistema, e.z90_ent_razao_social AS entidade,
             CASE WHEN a.z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)} THEN false ELSE true END AS transferido
      FROM z90_atendimentos a
      LEFT JOIN z90_sistemas_suporte s ON a.z90_ate_id_sistema_suporte = s.z90_sis_id
      LEFT JOIN z90_entidades e ON a.z90_ent_id = e.z90_ent_id
      WHERE a.z90_ate_id IN (
        SELECT DISTINCT i.z90_ate_id FROM z90_interacoes_atendimento i
        WHERE i.z90_int_id_remetente_usuario IN (
          SELECT z90_tec_id FROM z90_tecnicos_suporte WHERE z90_tec_id = ${this.esc(tecnicoId)}
        ) OR i.z90_int_id_remetente_agente_ia IS NOT NULL
        UNION
        SELECT z90_ate_id FROM z90_atendimentos
        WHERE z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)}
           OR z90_ate_id_agente_ia_inicial IS NOT NULL
      )
      AND a.z90_ate_data_abertura >= ${this.esc(date)}
      AND a.z90_ate_data_abertura < ${this.esc(nextDateStr)}
      ORDER BY
        CASE WHEN a.z90_ate_id_tecnico_responsavel != ${this.esc(tecnicoId)} THEN 0 ELSE 1 END,
        a.z90_ate_data_abertura ASC
      LIMIT 100`);

    return rows;
  }

  // ─── SELEÇÃO DE ANALISTA PARA HANDOFF ───────────────────────

  async selectAnalystForHandoff(): Promise<ZapFlowTecnico | null> {
    const tecnicos = await this.getTecnicosDisponiveis();
    if (tecnicos.length === 0) return null;

    const tecnicosComCarga = await Promise.all(
      tecnicos.map(async (t) => ({
        tecnico: t,
        carga: await this.countAtendimentosPorTecnico(t.z90_tec_id),
      })),
    );

    const MAX_POR_ANALISTA = 10;
    const disponiveis = tecnicosComCarga.filter((t) => t.carga < MAX_POR_ANALISTA);
    if (disponiveis.length === 0) return null;

    disponiveis.sort((a, b) => a.carga - b.carga);
    const menorCarga = disponiveis[0].carga;
    const empatados = disponiveis.filter((t) => t.carga === menorCarga);

    const escolhido = empatados[Math.floor(Math.random() * empatados.length)];
    return escolhido.tecnico;
  }

  // ─── TRANSFERÊNCIA AUTOMATIZADA ──────────────────────────────

  isHoliday(date?: Date): boolean {
    const now = date || this.nowInBRT();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const holidays = this.getBrazilianHolidays(now.getFullYear());
    return holidays.includes(dateStr);
  }

  isWithinBusinessHours(date?: Date): boolean {
    const now = date || this.nowInBRT();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const hour = now.getHours();
    return hour >= 8 && hour < 18;
  }

  async getTecnicosBySystem(atendimentoId: number): Promise<ZapFlowTecnico[]> {
    if (!this.mcp) return [];

    const atd = await this.getAtendimento(atendimentoId);
    if (!atd?.z90_ate_id_sistema_suporte) {
      this.logger.warn(`Atendimento ${atendimentoId} has no system assigned`);
      return [];
    }
    const systemId = atd.z90_ate_id_sistema_suporte;

    // Try linking table first (z90_tecnicos_sistemas)
    try {
      const { rows } = await this.mcp.executeSelectQuery(
        `SELECT t.z90_tec_id, t.z90_tec_nome, t.z90_tec_email, t.z90_tec_telefone,
                t.z90_tec_ativo, t.z90_tec_disponivel_pa_91d0d83c AS z90_tec_disponivel,
                t.z90_tec_desligado
         FROM z90_tecnicos_sistemas ts
         JOIN z90_tecnicos_suporte t ON ts.z90_tec_id = t.z90_tec_id
         WHERE ts.z90_sis_id = ${this.esc(systemId)}
           AND t.z90_tec_ativo = 'S'
           AND (t.z90_tec_desligado IS NULL OR t.z90_tec_desligado != 'S')`,
      );
      if (rows.length > 0) {
        this.logger.log(`Found ${rows.length} technicians for system ${systemId} via linking table`);
        return rows as ZapFlowTecnico[];
      }
    } catch {
      this.logger.debug('z90_tecnicos_sistemas table not found or query failed, using historical fallback');
    }

    // Fallback: technicians who handled atendimentos for this system recently
    const { rows } = await this.safeQuery(
      `SELECT DISTINCT ON (t.z90_tec_id)
              t.z90_tec_id, t.z90_tec_nome, t.z90_tec_email, t.z90_tec_telefone,
              t.z90_tec_ativo, t.z90_tec_disponivel_pa_91d0d83c AS z90_tec_disponivel,
              t.z90_tec_desligado
       FROM z90_tecnicos_suporte t
       JOIN z90_atendimentos a ON a.z90_ate_id_tecnico_responsavel = t.z90_tec_id
       WHERE a.z90_ate_id_sistema_suporte = ${this.esc(systemId)}
         AND t.z90_tec_ativo = 'S'
         AND (t.z90_tec_desligado IS NULL OR t.z90_tec_desligado != 'S')
         AND a.z90_ate_data_abertura >= CURRENT_DATE - INTERVAL '90 days'
       ORDER BY t.z90_tec_id`,
      'getTecnicosBySystemFallback',
    );
    this.logger.log(`Found ${rows.length} technicians for system ${systemId} via historical fallback`);
    return rows as ZapFlowTecnico[];
  }

  async getSystemCoordinator(atendimentoId: number): Promise<ZapFlowTecnico | null> {
    if (!this.mcp) return null;

    const atd = await this.getAtendimento(atendimentoId);
    if (!atd?.z90_ate_id_sistema_suporte) return null;
    const systemId = atd.z90_ate_id_sistema_suporte;

    // Try coordinator field on system table
    try {
      const { rows } = await this.mcp.executeSelectQuery(
        `SELECT t.z90_tec_id, t.z90_tec_nome, t.z90_tec_email, t.z90_tec_telefone,
                t.z90_tec_ativo, t.z90_tec_disponivel_pa_91d0d83c AS z90_tec_disponivel,
                t.z90_tec_desligado
         FROM z90_sistemas_suporte s
         JOIN z90_tecnicos_suporte t ON s.z90_sis_id_coordenador = t.z90_tec_id
         WHERE s.z90_sis_id = ${this.esc(systemId)}
           AND t.z90_tec_ativo = 'S'`,
      );
      if (rows.length > 0) return rows[0] as ZapFlowTecnico;
    } catch {
      this.logger.debug('No coordinator field found on z90_sistemas_suporte');
    }

    // Fallback: first active technician (usually senior/coordinator) as default
    const { rows } = await this.safeQuery(
      `SELECT z90_tec_id, z90_tec_nome, z90_tec_email, z90_tec_telefone,
              z90_tec_ativo, z90_tec_disponivel_pa_91d0d83c AS z90_tec_disponivel,
              z90_tec_desligado
       FROM z90_tecnicos_suporte
       WHERE z90_tec_ativo = 'S'
         AND (z90_tec_desligado IS NULL OR z90_tec_desligado != 'S')
       ORDER BY z90_tec_id ASC
       LIMIT 1`,
      'getDefaultCoordinator',
    );
    return (rows[0] as ZapFlowTecnico) || null;
  }

  /**
   * Full validation + technician selection for automated transfer.
   * Implements all 7 steps from the transfer protocol document.
   */
  async validateAndSelectForTransfer(atendimentoId: number, excludeTecnicoId?: number): Promise<{
    canTransfer: boolean;
    reason?: string;
    selectedTecnicoId?: number;
    selectedTecnicoName?: string;
    isCoordinator?: boolean;
  }> {
    // Step 1: Holiday check
    if (this.isHoliday()) {
      this.logger.log(`Transfer blocked: today is a holiday`);
      return { canTransfer: false, reason: 'Hoje é feriado. Não é possível transferir o atendimento neste momento.' };
    }

    // Step 2: Business hours check
    if (!this.isWithinBusinessHours()) {
      this.logger.log(`Transfer blocked: outside business hours`);
      return { canTransfer: false, reason: 'Fora do horário de expediente (08:00-18:00, seg-sex). Não é possível transferir.' };
    }

    // Step 3: Get technicians for the system
    let tecnicos = await this.getTecnicosBySystem(atendimentoId);

    // Exclude the current agent (Renato) from the list
    if (excludeTecnicoId) {
      tecnicos = tecnicos.filter((t) => t.z90_tec_id !== excludeTecnicoId);
    }

    if (tecnicos.length === 0) {
      this.logger.warn(`No technicians found for atendimento ${atendimentoId}'s system`);
      // Try all available technicians as broader fallback
      tecnicos = await this.getTecnicosDisponiveis();
      if (excludeTecnicoId) {
        tecnicos = tecnicos.filter((t) => t.z90_tec_id !== excludeTecnicoId);
      }
    }

    // Step 4: Filter by availability (active + online)
    const isAvailable = (t: ZapFlowTecnico) => {
      const val = String(t.z90_tec_disponivel || '').trim().toLowerCase();
      return val === 's' || val === 'true' || val === '1' || val === 'sim';
    };
    const disponiveis = tecnicos.filter(isAvailable);

    if (disponiveis.length === 0) {
      this.logger.log(`No available technicians. Falling back to coordinator.`);
      const coord = await this.getSystemCoordinator(atendimentoId);
      if (coord && coord.z90_tec_id !== excludeTecnicoId) {
        return {
          canTransfer: true,
          selectedTecnicoId: coord.z90_tec_id,
          selectedTecnicoName: coord.z90_tec_nome,
          isCoordinator: true,
        };
      }
      return { canTransfer: false, reason: 'Nenhum técnico disponível no momento e coordenador não encontrado.' };
    }

    // Step 5: Select by workload (fewest active atendimentos)
    const comCarga = await Promise.all(
      disponiveis.map(async (t) => ({
        tecnico: t,
        carga: await this.countAtendimentosPorTecnico(t.z90_tec_id),
      })),
    );
    comCarga.sort((a, b) => a.carga - b.carga);
    const menorCarga = comCarga[0].carga;

    // Step 6: Tiebreaker - random among equals
    const empatados = comCarga.filter((t) => t.carga === menorCarga);
    const escolhido = empatados[Math.floor(Math.random() * empatados.length)];

    this.logger.log(
      `Transfer target selected: ${escolhido.tecnico.z90_tec_nome} (id=${escolhido.tecnico.z90_tec_id}, carga=${escolhido.carga})`,
    );

    return {
      canTransfer: true,
      selectedTecnicoId: escolhido.tecnico.z90_tec_id,
      selectedTecnicoName: escolhido.tecnico.z90_tec_nome,
      isCoordinator: false,
    };
  }

  // ─── UTILS INTERNOS ──────────────────────────────────────────

  private nowInBRT(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  }

  private calculateEaster(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  private getBrazilianHolidays(year: number): string[] {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const addDays = (d: Date, n: number) => {
      const r = new Date(d);
      r.setDate(r.getDate() + n);
      return r;
    };
    const easter = this.calculateEaster(year);

    return [
      fmt(new Date(year, 0, 1)),    // Confraternização Universal
      fmt(addDays(easter, -48)),     // Carnaval segunda
      fmt(addDays(easter, -47)),     // Carnaval terça
      fmt(addDays(easter, -2)),      // Sexta-feira Santa
      fmt(new Date(year, 3, 21)),    // Tiradentes
      fmt(new Date(year, 4, 1)),     // Dia do Trabalho
      fmt(addDays(easter, 60)),      // Corpus Christi
      fmt(new Date(year, 8, 7)),     // Independência
      fmt(new Date(year, 9, 12)),    // Nossa Sra Aparecida
      fmt(new Date(year, 10, 2)),    // Finados
      fmt(new Date(year, 10, 15)),   // Proclamação da República
      fmt(new Date(year, 11, 25)),   // Natal
    ];
  }

  async getAgentWeeklyStats(tecnicoId: number, days = 7): Promise<any[]> {
    if (!this.mcp) return [];
    const results: any[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const stats = await this.getAgentDailyStats(tecnicoId, dateStr);
      results.push(stats);
    }
    return results;
  }

  async getAgentPerformanceSummary(tecnicoId: number): Promise<Record<string, any>> {
    if (!this.mcp) return {};

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthAgoStr = monthAgo.toISOString().split('T')[0];

    const baseSub = `(
      SELECT DISTINCT z90_ate_id FROM z90_interacoes_atendimento
      WHERE z90_int_id_remetente_usuario IN (
        SELECT z90_tec_id FROM z90_tecnicos_suporte WHERE z90_tec_id = ${this.esc(tecnicoId)}
      ) OR z90_int_id_remetente_agente_ia IS NOT NULL
      UNION
      SELECT z90_ate_id FROM z90_atendimentos
      WHERE z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)}
         OR z90_ate_id_agente_ia_inicial IS NOT NULL
    )`;

    const [weekTotal, weekResolved, weekTransferred, monthTotal, monthResolved, openNow, avgTimeRes] = await Promise.all([
      this.safeQuery(`SELECT COUNT(*) AS cnt FROM z90_atendimentos a WHERE a.z90_ate_id IN ${baseSub} AND a.z90_ate_data_abertura >= ${this.esc(weekAgoStr)}`, 'perfWeekTotal'),
      this.safeQuery(`SELECT COUNT(*) AS cnt FROM z90_atendimentos a WHERE a.z90_ate_id IN ${baseSub} AND a.z90_ate_data_abertura >= ${this.esc(weekAgoStr)} AND a.z90_ate_data_fechamento IS NOT NULL AND a.z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)}`, 'perfWeekResolved'),
      this.safeQuery(`SELECT COUNT(*) AS cnt FROM z90_atendimentos a WHERE a.z90_ate_id IN ${baseSub} AND a.z90_ate_data_abertura >= ${this.esc(weekAgoStr)} AND a.z90_ate_id_tecnico_responsavel != ${this.esc(tecnicoId)}`, 'perfWeekTransferred'),
      this.safeQuery(`SELECT COUNT(*) AS cnt FROM z90_atendimentos a WHERE a.z90_ate_id IN ${baseSub} AND a.z90_ate_data_abertura >= ${this.esc(monthAgoStr)}`, 'perfMonthTotal'),
      this.safeQuery(`SELECT COUNT(*) AS cnt FROM z90_atendimentos a WHERE a.z90_ate_id IN ${baseSub} AND a.z90_ate_data_abertura >= ${this.esc(monthAgoStr)} AND a.z90_ate_data_fechamento IS NOT NULL AND a.z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)}`, 'perfMonthResolved'),
      this.safeQuery(`SELECT COUNT(*) AS cnt FROM z90_atendimentos a WHERE a.z90_ate_id IN ${baseSub} AND a.z90_ate_id_status_atendimento IN (1, 2)`, 'perfOpen'),
      this.safeQuery(`SELECT AVG(EXTRACT(EPOCH FROM (a.z90_ate_data_fechamento - a.z90_ate_data_abertura))/60) AS avg_min FROM z90_atendimentos a WHERE a.z90_ate_id IN ${baseSub} AND a.z90_ate_data_fechamento IS NOT NULL AND a.z90_ate_id_tecnico_responsavel = ${this.esc(tecnicoId)} AND a.z90_ate_data_abertura >= ${this.esc(weekAgoStr)}`, 'perfAvgTime'),
    ]);

    const wt = parseInt(weekTotal.rows[0]?.cnt || '0', 10);
    const wr = parseInt(weekResolved.rows[0]?.cnt || '0', 10);
    const wtr = parseInt(weekTransferred.rows[0]?.cnt || '0', 10);
    const mt = parseInt(monthTotal.rows[0]?.cnt || '0', 10);
    const mr = parseInt(monthResolved.rows[0]?.cnt || '0', 10);

    return {
      week: {
        total: wt,
        resolved: wr,
        transferred: wtr,
        resolutionRate: wt > 0 ? Math.round((wr / wt) * 100) : 0,
      },
      month: {
        total: mt,
        resolved: mr,
        resolutionRate: mt > 0 ? Math.round((mr / mt) * 100) : 0,
      },
      openNow: parseInt(openNow.rows[0]?.cnt || '0', 10),
      avgResolutionMinutes: Math.round(parseFloat(avgTimeRes.rows[0]?.avg_min || '0')),
    };
  }
}
