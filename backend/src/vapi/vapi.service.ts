import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ToolRegistry } from '../agent/tools/tool-registry';
import { AgentConfigService } from '../agent/agent-config.service';
import { AuditService } from '../audit/audit.service';
import { UazapiService } from '../whatsapp/uazapi.service';
import { WhatsAppConfigService } from '../whatsapp/whatsapp-config.service';
import { ZapFlowPgService } from '../zapflow/zapflow-pg.service';
import { buildVoiceSystemPrompt } from '../agent/system-prompt';
import { AgentContext } from '../agent/tools/tool.interface';

interface VapiCall {
  id: string;
  phoneNumber?: { number?: string };
  customer?: { number?: string };
}

interface VapiToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: Record<string, any> | string };
}

@Injectable()
export class VapiService {
  private readonly logger = new Logger(VapiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly toolRegistry: ToolRegistry,
    private readonly agentConfig: AgentConfigService,
    private readonly auditService: AuditService,
    private readonly uazapi: UazapiService,
    private readonly waConfig: WhatsAppConfigService,
    private readonly zapflow: ZapFlowPgService,
  ) {}

  async buildAssistantConfig(call: VapiCall): Promise<Record<string, any>> {
    const customerPhone = call.customer?.number || '';
    const agentCfg = await this.agentConfig.getConfig();
    const model = agentCfg?.chatModel || this.config.get<string>('llm.chatModel') || 'gpt-4o';

    const voicePrompt = buildVoiceSystemPrompt({
      systemName: 'Folha de Pagamento',
      customerName: this.extractCustomerName(customerPhone),
      customerPhone,
      entityName: '',
      previousMessagesCount: 0,
      attemptCount: 0,
    });

    const tools = this.convertToolsToVapiFunctions();
    const voiceProvider = this.config.get<string>('vapi.voiceProvider') || this.config.get<string>('VAPI_VOICE_PROVIDER') || 'playht';
    const voiceId = this.config.get<string>('vapi.voiceId') || this.config.get<string>('VAPI_VOICE_ID') || '';

    const firstMessage = this.buildFirstMessage();

    const assistant: Record<string, any> = {
      model: {
        provider: 'openai',
        model,
        messages: [{ role: 'system', content: voicePrompt }],
        tools,
      },
      firstMessage,
      serverUrl: this.config.get<string>('vapi.serverUrl') || this.config.get<string>('VAPI_SERVER_URL') || '',
      serverUrlSecret: this.config.get<string>('vapi.webhookSecret') || this.config.get<string>('VAPI_WEBHOOK_SECRET') || '',
    };

    if (voiceId) {
      assistant.voice = { provider: voiceProvider, voiceId };
    }

    this.logger.log(`Assistant config built for call ${call.id}, customer: ${customerPhone}`);
    return { assistant };
  }

  convertToolsToVapiFunctions(): any[] {
    const definitions = this.toolRegistry.getDefinitions();
    return definitions.map((def) => ({
      type: 'function',
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    }));
  }

  async executeToolCalls(
    toolCalls: VapiToolCall[],
    call: VapiCall,
  ): Promise<{ results: Array<{ toolCallId: string; result: string }> }> {
    const context: AgentContext = {
      caseId: `vapi-call-${call.id}`,
      conversationHistory: [],
      metadata: {
        channel: 'voice',
        callId: call.id,
        customerPhone: call.customer?.number || '',
      },
    };

    const results: Array<{ toolCallId: string; result: string }> = [];

    for (const tc of toolCalls) {
      const tool = this.toolRegistry.get(tc.function.name);
      if (!tool) {
        this.logger.warn(`Tool not found: ${tc.function.name}`);
        results.push({
          toolCallId: tc.id,
          result: JSON.stringify({ success: false, error: `Tool "${tc.function.name}" not found` }),
        });
        continue;
      }

      try {
        const args = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;

        this.logger.log(`Executing tool ${tc.function.name} for call ${call.id}`);
        const toolResult = await tool.execute(args, context);

        if (context.metadata?.managerNotifications?.length) {
          await this.sendManagerNotifications(context, call);
        }

        if (context.metadata?.transferCommands?.length) {
          await this.processTransferCommands(context, call);
        }

        results.push({
          toolCallId: tc.id,
          result: JSON.stringify(toolResult),
        });
      } catch (err: any) {
        this.logger.error(`Tool ${tc.function.name} failed: ${err?.message}`);
        results.push({
          toolCallId: tc.id,
          result: JSON.stringify({ success: false, error: err?.message || 'Tool execution failed' }),
        });
      }
    }

    return { results };
  }

  async handleEndOfCallReport(report: Record<string, any>): Promise<void> {
    const call = report.call || {};
    const callId = call.id || 'unknown';
    const transcript = report.transcript || '';
    const summary = report.summary || '';
    const endedReason = report.endedReason || '';
    const durationSeconds = report.durationSeconds || call.duration || 0;
    const cost = report.cost || call.cost || 0;

    this.logger.log(`Call ended: ${callId}, reason: ${endedReason}, duration: ${durationSeconds}s`);

    await this.auditService.log({
      caseId: `vapi-call-${callId}`,
      action: 'vapi_call_ended',
      actor: 'vapi',
      details: {
        callId,
        endedReason,
        durationSeconds,
        cost,
        customerNumber: call.customer?.number || '',
      },
      input: { summary },
      output: { transcript: transcript.substring(0, 5000) },
      durationMs: durationSeconds * 1000,
    });

    await this.mirrorCallToManagers(callId, summary, transcript, durationSeconds, call.customer?.number);
  }

  async handleTransferRequest(call: VapiCall): Promise<Record<string, any>> {
    try {
      const result = await this.zapflow.validateAndSelectForTransfer(0, undefined);
      if (result.canTransfer && result.selectedTecnicoId) {
        this.logger.log(`Transfer destination for call ${call.id}: tecnico ${result.selectedTecnicoId}`);
        return {
          destination: {
            type: 'number',
            number: `+55${result.selectedTecnicoId}`,
            message: 'Transferindo para um analista especializado.',
          },
        };
      }
    } catch (err: any) {
      this.logger.error(`Transfer request failed for call ${call.id}: ${err?.message}`);
    }

    const managerPhone = this.waConfig.getManagerPhone();
    return {
      destination: {
        type: 'number',
        number: managerPhone ? `+${managerPhone}` : '',
        message: 'Transferindo para o gerente da equipe.',
      },
    };
  }

  private async mirrorCallToManagers(
    callId: string,
    summary: string,
    transcript: string,
    durationSeconds: number,
    customerNumber?: string,
  ): Promise<void> {
    const recipients = this.waConfig.getMirrorRecipientPhones();
    if (!recipients.length) return;

    const durationMin = Math.round(durationSeconds / 60);
    const shortTranscript = transcript.length > 1500
      ? transcript.substring(0, 1500) + '...'
      : transcript;

    const message =
      `[Chamada Telefonica Finalizada]\n` +
      `ID: ${callId}\n` +
      `Cliente: ${customerNumber || 'desconhecido'}\n` +
      `Duracao: ${durationMin} min\n\n` +
      `Resumo: ${summary || 'Nenhum resumo disponivel'}\n\n` +
      `Transcricao:\n${shortTranscript || 'Nenhuma transcricao disponivel'}`;

    for (const phone of recipients) {
      try {
        await this.uazapi.sendText(phone, message);
      } catch (err: any) {
        this.logger.error(`Failed to mirror call ${callId} to ${phone}: ${err?.message}`);
      }
    }
  }

  private async sendManagerNotifications(context: AgentContext, call: VapiCall): Promise<void> {
    const notifications = context.metadata?.managerNotifications || [];
    if (!notifications.length) return;

    const managerPhone = this.waConfig.getManagerPhone();
    if (!managerPhone) return;

    for (const notif of notifications) {
      const msg =
        `[Alerta Chamada Telefonica - Renato]\n` +
        `Call ID: ${call.id}\n` +
        `Cliente: ${call.customer?.number || 'desconhecido'}\n` +
        `Motivo: ${notif.reason}\n` +
        `${notif.message}`;

      try {
        await this.uazapi.sendText(managerPhone, msg);
      } catch (err: any) {
        this.logger.error(`Failed to notify manager for call ${call.id}: ${err?.message}`);
      }
    }

    context.metadata!.managerNotifications = [];
  }

  private async processTransferCommands(context: AgentContext, call: VapiCall): Promise<void> {
    const commands = context.metadata?.transferCommands || [];
    if (!commands.length) return;

    const managerPhone = this.waConfig.getManagerPhone();
    if (!managerPhone) return;

    for (const cmd of commands) {
      const msg =
        `[Transferencia Solicitada - Chamada Telefonica]\n` +
        `Call ID: ${call.id}\n` +
        `Cliente: ${call.customer?.number || 'desconhecido'}\n` +
        `Transferido para: ${cmd.targetTecnicoName} (ID ${cmd.targetTecnicoId})\n` +
        `Motivo: ${cmd.reason}`;

      try {
        await this.uazapi.sendText(managerPhone, msg);
      } catch (err: any) {
        this.logger.error(`Failed to notify transfer for call ${call.id}: ${err?.message}`);
      }
    }

    context.metadata!.transferCommands = [];
  }

  private buildFirstMessage(): string {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const timeStr = formatter.format(new Date());
    const hour = parseInt(timeStr.split(':')[0], 10);
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return `${greeting}! Aqui é o Renato da Freire Tecnologia, como posso te ajudar?`;
  }

  private extractCustomerName(phone: string): string {
    return phone ? `Cliente ${phone.slice(-4)}` : 'Cliente';
  }
}
