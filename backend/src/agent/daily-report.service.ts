import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ZapFlowPgService } from '../zapflow/zapflow-pg.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly zapflow: ZapFlowPgService,
    private readonly knowledgeService: KnowledgeService,
    private readonly ticketsService: TicketsService,
    private readonly auditService: AuditService,
  ) {}

  @Cron('0 23 * * *')
  async generateDailyReport(): Promise<void> {
    this.logger.log('Starting daily report generation...');

    try {
      await this.ingestResolvedCasesFromMongoDB();

      if (this.zapflow.isConnected) {
        await this.ingestResolvedCasesFromZapFlow();
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
