import { Injectable } from '@nestjs/common';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';

@Injectable()
export class DiagnosticTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'run_diagnostic',
    description:
      'Execute diagnostic steps for troubleshooting. Collects structured data from the customer or runs automated checks.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'ask_question',
            'collect_data',
            'check_warranty',
            'check_product_info',
            'suggest_resolution',
          ],
          description: 'The diagnostic action to perform',
        },
        question: {
          type: 'string',
          description: 'Question to ask the customer (for ask_question action)',
        },
        dataType: {
          type: 'string',
          description: 'Type of data to collect (for collect_data action)',
        },
        ticketId: {
          type: 'string',
          description: 'Ticket ID for context',
        },
      },
      required: ['action'],
    },
  };

  async execute(args: Record<string, any>, context: AgentContext): Promise<ToolResult> {
    try {
      const { action, question, dataType } = args;

      switch (action) {
        case 'ask_question':
          return {
            success: true,
            data: {
              type: 'question',
              question: question || 'Could you provide more details about the issue?',
              requiresResponse: true,
            },
          };

        case 'collect_data':
          return {
            success: true,
            data: {
              type: 'data_collection',
              dataType: dataType || 'general',
              prompt: this.getDataCollectionPrompt(dataType),
              requiresResponse: true,
            },
          };

        case 'check_warranty': {
          const warrantyData = context.metadata?.warranty || context.metadata?.product;
          if (!warrantyData) {
            return {
              success: true,
              data: {
                type: 'warranty_check',
                status: 'unknown',
                message: 'No warranty information available. Please collect product and purchase details.',
              },
            };
          }
          return {
            success: true,
            data: {
              type: 'warranty_check',
              status: 'checked',
              warranty: warrantyData,
            },
          };
        }

        case 'check_product_info': {
          const productData = context.metadata?.product;
          if (!productData) {
            return {
              success: true,
              data: {
                type: 'product_info',
                status: 'unknown',
                message: 'No product information available. Please collect product details.',
              },
            };
          }
          return {
            success: true,
            data: {
              type: 'product_info',
              status: 'found',
              product: productData,
            },
          };
        }

        case 'suggest_resolution':
          return {
            success: true,
            data: {
              type: 'resolution_suggestion',
              message: 'Based on the diagnostics, generate a resolution recommendation.',
              context: {
                caseId: context.caseId,
                ticketId: context.ticketId,
                historyLength: context.conversationHistory.length,
              },
            },
          };

        default:
          return { success: false, error: `Unknown diagnostic action: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private getDataCollectionPrompt(dataType?: string): string {
    const prompts: Record<string, string> = {
      error_logs: 'Please provide any error messages or logs you are seeing.',
      environment: 'Please describe your environment (OS, browser, version, etc.).',
      steps_to_reproduce: 'Please describe the exact steps to reproduce the issue.',
      purchase_info: 'Please provide your order number or purchase date.',
      general: 'Please provide any additional information that might help us resolve your issue.',
    };
    return prompts[dataType || 'general'] || prompts.general;
  }
}
