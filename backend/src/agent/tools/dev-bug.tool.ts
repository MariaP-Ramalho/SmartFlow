import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';
import { ClickUpClient } from '../../tickets/clickup.client';

@Injectable()
export class DevBugTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'create_dev_bug',
    description:
      'Create a bug report in the ClickUp dev space when a software defect is identified. Requires structured payload with system, module, symptoms, reproduction steps, evidence, environment/version, attempted workaround, and impact level.',
    parameters: {
      type: 'object',
      properties: {
        sistema: {
          type: 'string',
          description: 'Name of the affected system (e.g. FinanceiroApp, Patrimonio)',
        },
        modulo: {
          type: 'string',
          description: 'Specific module where the bug occurs',
        },
        sintomas: {
          type: 'string',
          description: 'Description of the symptoms observed',
        },
        passos_reproducao: {
          type: 'string',
          description: 'Steps to reproduce the issue (numbered list)',
        },
        evidencias: {
          type: 'string',
          description: 'Description of evidence collected (screenshots, logs, etc.)',
        },
        ambiente_versao: {
          type: 'string',
          description: 'Environment and version info (e.g. v3.2.1, Chrome, Windows)',
        },
        workaround_tentado: {
          type: 'string',
          description: 'What was already tried and did not work',
        },
        impacto: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Impact level of the bug',
        },
      },
      required: ['sistema', 'modulo', 'sintomas', 'passos_reproducao', 'impacto'],
    },
  };

  private readonly devListId: string;

  constructor(
    private readonly clickUp: ClickUpClient,
    private readonly config: ConfigService,
  ) {
    this.devListId = this.config.get<string>('CLICKUP_DEV_LIST_ID', '');
  }

  async execute(args: Record<string, any>, context: AgentContext): Promise<ToolResult> {
    try {
      const {
        sistema,
        modulo,
        sintomas,
        passos_reproducao,
        evidencias = 'Não informado',
        ambiente_versao = 'Não informado',
        workaround_tentado = 'Nenhum',
        impacto = 'medium',
      } = args;

      if (!sistema || !modulo || !sintomas || !passos_reproducao) {
        return {
          success: false,
          error: 'Campos obrigatórios: sistema, modulo, sintomas, passos_reproducao',
        };
      }

      const impactToPriority: Record<string, number> = {
        critical: 1,
        high: 2,
        medium: 3,
        low: 4,
      };

      const description = [
        `## Sintomas`,
        sintomas,
        '',
        `## Passos de Reprodução`,
        passos_reproducao,
        '',
        `## Evidências`,
        evidencias,
        '',
        `## Ambiente / Versão`,
        ambiente_versao,
        '',
        `## Workaround Tentado`,
        workaround_tentado,
        '',
        `## Informações do Ticket`,
        `- **Ticket de origem**: ${context.ticketId || 'N/A'}`,
        `- **Case ID**: ${context.caseId}`,
        `- **Impacto**: ${impacto}`,
      ].join('\n');

      const taskName = `[BUG] ${sistema} - ${modulo}: ${sintomas.slice(0, 80)}`;

      const listId = this.devListId || undefined;
      const task = await this.clickUp.createTask(listId, {
        name: taskName,
        description,
        priority: impactToPriority[impacto] || 3,
        tags: ['bug', 'auto-reported', sistema.toLowerCase()],
      });

      return {
        success: true,
        data: {
          clickupTaskId: task.id,
          clickupUrl: task.url,
          taskName,
          sistema,
          modulo,
          impacto,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
