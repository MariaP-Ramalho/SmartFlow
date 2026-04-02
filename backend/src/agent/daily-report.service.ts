import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ZapFlowPgService } from '../zapflow/zapflow-pg.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';
import { ReferenceCaseService } from './reference-case.service';

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly zapflow: ZapFlowPgService,
    private readonly knowledgeService: KnowledgeService,
    private readonly ticketsService: TicketsService,
    private readonly auditService: AuditService,
    private readonly referenceCaseService: ReferenceCaseService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 23 * * *')
  async generateDailyReport(): Promise<void> {
    this.logger.log('Starting daily report generation...');

    try {
      await this.ingestResolvedCasesFromMongoDB();

      if (this.zapflow.isConnected) {
        await this.ingestResolvedCasesFromZapFlow();
        await this.dailyAgentLearning();
      }

      this.logger.log('Daily report generation completed');
    } catch (error) {
      this.logger.error(`Daily report failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async ingestResolvedCasesFromMongoDB(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.ticketsService.findAll({
      status: 'resolved',
      page: 1,
      limit: 100,
    });

    const tickets = result.data.filter(
      (t: any) => t.resolvedAt && new Date(t.resolvedAt) >= today && t.resolvedByAgent,
    );

    let ingested = 0;

    for (const ticket of tickets) {
      const t = ticket as any;
      const conversation = t.conversation || [];
      const attempts = t.attempts || [];
      const knowledgeHits = t.knowledgeHits || [];

      const successfulAttempt = attempts.find((a: any) => a.outcome === 'success');

      const summary = [
        `Caso #${t._id} — Sistema: ${t.systemName || 'N/A'}`,
        `Cliente: ${t.customer?.name || 'N/A'} — Empresa: ${t.customer?.company || 'N/A'}`,
        `Problema: ${t.title}`,
        t.description ? `Descrição: ${t.description.slice(0, 300)}` : '',
        '',
        `Solução (tentativa ${successfulAttempt?.attemptNumber || '?'}): ${successfulAttempt?.solution || 'N/A'}`,
        `Fontes usadas: ${knowledgeHits.map((h: any) => `${h.source}:${h.title}`).join(', ') || 'nenhuma'}`,
        `Mensagens trocadas: ${conversation.length}`,
        `Tentativas: ${t.attemptCount || 0}`,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        await this.knowledgeService.ingest({
          title: `Caso resolvido: ${t.title}`,
          content: summary,
          category: t.systemName || 'geral',
          source: 'resolved_case' as any,
          tags: [
            t.systemName?.toLowerCase(),
            t.category,
            'resolved',
          ].filter(Boolean),
        });
        ingested++;
      } catch (err) {
        this.logger.warn(`Failed to ingest resolved case ${t._id}: ${err}`);
      }
    }

    this.logger.log(`Ingested ${ingested} resolved cases from MongoDB into knowledge base`);

    await this.auditService.log({
      caseId: 'daily-report',
      action: 'daily_report_mongodb',
      actor: 'system',
      details: { ingestedCount: ingested, date: new Date().toISOString() },
    });

    return ingested;
  }

  private async resolveAgentTecnicoId(): Promise<number | null> {
    const explicitId = parseInt(this.configService.get<string>('AGENT_TECNICO_ID') || '0', 10);
    if (explicitId > 0) return explicitId;

    const agentName = this.configService.get<string>('AGENT_DISPLAY_NAME') || '';
    if (!agentName) return null;

    try {
      const tecnicos = await this.zapflow.getTecnicosDisponiveis();
      const match = tecnicos.find(
        (t) => t.z90_tec_nome.toLowerCase().trim() === agentName.toLowerCase().trim(),
      );
      if (match) {
        this.logger.log(`Resolved agent tecnico ID: ${match.z90_tec_id} (${match.z90_tec_nome})`);
        return match.z90_tec_id;
      }
      const partial = tecnicos.find(
        (t) => t.z90_tec_nome.toLowerCase().includes(agentName.split(' ')[0].toLowerCase()),
      );
      if (partial) {
        this.logger.log(`Resolved agent tecnico ID (partial match): ${partial.z90_tec_id} (${partial.z90_tec_nome})`);
        return partial.z90_tec_id;
      }
    } catch (err: any) {
      this.logger.warn(`Failed to resolve agent tecnico ID: ${err?.message}`);
    }
    return null;
  }

  private async dailyAgentLearning(): Promise<void> {
    const agentTecnicoId = await this.resolveAgentTecnicoId();
    if (!agentTecnicoId) {
      this.logger.warn('Could not resolve agent tecnico ID — skipping daily agent learning');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    this.logger.log(`Starting daily agent learning for tecnico ${agentTecnicoId}, date: ${today}`);

    try {
      const cases = await this.zapflow.getDailyCasesForLearning(agentTecnicoId, today);
      if (cases.length === 0) {
        this.logger.log('No cases found for today — nothing to learn');
        return;
      }

      let transferredLearned = 0;
      let resolvedLearned = 0;

      for (const c of cases) {
        const isTransferred = c.transferido === true || c.transferido === 't';
        const isClosed = !!c.z90_ate_data_fechamento;

        if (isTransferred && isClosed) {
          const interacoes = await this.zapflow.getCaseInteractions(c.z90_ate_id, 40);

          if (interacoes.length === 0) continue;

          const conversation = interacoes.map((int: any) => {
            const tipo = int.z90_int_id_tipo_remetente;
            const role = tipo === 3 ? 'customer' : tipo === 2 ? 'assistant' : tipo === 1 ? 'assistant' : 'system';
            return { role, content: int.z90_int_conteudo_mensagem || '' };
          });

          const problemSummary = c.z90_ate_resumo_do_problema || '';
          const solutionSummary = c.z90_ate_resumo_da_solucao || '';

          if (solutionSummary) {
            await this.referenceCaseService.saveReferenceCase({
              phone: `zapflow-${c.z90_ate_id}`,
              customerName: c.entidade || 'Cliente',
              systemName: c.sistema || '',
              analystName: 'Analista Humano (aprendizado)',
              conversation,
              problemSummary,
              solutionSummary,
            });
            transferredLearned++;
          }
        }

        if (!isTransferred && isClosed && c.z90_ate_resumo_da_solucao) {
          try {
            await this.knowledgeService.ingest({
              title: `Caso resolvido pelo agente #${c.z90_ate_id}: ${(c.z90_ate_resumo_do_problema || '').slice(0, 100)}`,
              content: [
                `Caso ZapFlow #${c.z90_ate_id}`,
                `Sistema: ${c.sistema || 'N/A'}`,
                `Entidade: ${c.entidade || 'N/A'}`,
                `Problema: ${c.z90_ate_resumo_do_problema || 'N/A'}`,
                `Solução: ${c.z90_ate_resumo_da_solucao || 'N/A'}`,
              ].join('\n'),
              category: c.sistema?.toLowerCase() || 'geral',
              source: 'resolved_case' as any,
              tags: ['agente', 'resolvido', c.sistema?.toLowerCase()].filter(Boolean),
            });
            resolvedLearned++;
          } catch (err: any) {
            this.logger.warn(`Failed to ingest resolved agent case ${c.z90_ate_id}: ${err?.message}`);
          }
        }
      }

      this.logger.log(
        `Daily agent learning complete: ${cases.length} cases studied, ` +
        `${transferredLearned} transferred cases learned, ${resolvedLearned} resolved cases reinforced`,
      );

      await this.auditService.log({
        caseId: 'daily-learning',
        action: 'daily_agent_learning',
        actor: 'system',
        details: {
          date: today,
          totalCases: cases.length,
          transferredLearned,
          resolvedLearned,
        },
      });
    } catch (err: any) {
      this.logger.error(`Daily agent learning failed: ${err?.message}`);
    }
  }

  private async ingestResolvedCasesFromZapFlow(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const atendimentos = await this.zapflow.getAtendimentosResolvidosDesde(today);
    let ingested = 0;

    for (const ate of atendimentos) {
      const existingMongo = await this.ticketsService.findByZapflowAteId(ate.z90_ate_id);
      if (existingMongo) continue;

      const interacoes = await this.zapflow.getInteracoes(ate.z90_ate_id, 30);

      const conversationText = interacoes
        .map((i) => `[tipo${i.z90_int_id_tipo_remetente}] ${(i.z90_int_conteudo_mensagem || '').slice(0, 200)}`)
        .join('\n');

      const summary = [
        `Caso ZapFlow #${ate.z90_ate_id}`,
        `Problema: ${ate.z90_ate_resumo_do_problema || 'N/A'}`,
        `Solução: ${ate.z90_ate_resumo_da_solucao || 'N/A'}`,
        `Resumo IA: ${ate.z90_ate_resumo_sol_ate || 'N/A'}`,
        '',
        'Conversa (resumo):',
        conversationText.slice(0, 1500),
      ].join('\n');

      try {
        await this.knowledgeService.ingest({
          title: `Caso ZapFlow #${ate.z90_ate_id}: ${(ate.z90_ate_resumo_do_problema || '').slice(0, 100)}`,
          content: summary,
          category: 'zapflow',
          source: 'resolved_case' as any,
          tags: ['zapflow', 'resolved'],
        });
        ingested++;
      } catch (err) {
        this.logger.warn(`Failed to ingest ZapFlow case ${ate.z90_ate_id}: ${err}`);
      }
    }

    this.logger.log(`Ingested ${ingested} resolved cases from ZapFlow PG into knowledge base`);

    await this.auditService.log({
      caseId: 'daily-report',
      action: 'daily_report_zapflow',
      actor: 'system',
      details: { ingestedCount: ingested, date: new Date().toISOString() },
    });

    return ingested;
  }
}
