import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';

@Injectable()
export class KnowledgeTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'search_knowledge',
    description:
      'Busca na base de conhecimento interna com manuais do sistema de Folha de Pagamento da Freire Tecnologia. Contém: procedimentos detalhados (criar folha, incluir servidor, eventos, cálculos de INSS/IRRF/13º/férias/rescisão, importações, exportações, integração SIAFIC/eSocial), guia completo de telas (campos, navegação, botões, funcionalidades de cada tela do sistema). Use para orientar o cliente sobre como realizar procedimentos no sistema.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query in Portuguese',
        },
        category: {
          type: 'string',
          enum: ['Folha de Pagamento - Manual', 'Folha de Pagamento - Telas', 'Folha de Pagamento - SIOPE'],
          description: 'Optional filter by document category. Omit to search all categories.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default 5)',
          default: 5,
        },
      },
      required: ['query'],
    },
  };

  constructor(private readonly knowledgeService: KnowledgeService) {}

  async execute(args: Record<string, any>, _context: AgentContext): Promise<ToolResult> {
    try {
      const { query, category, limit = 5 } = args;
      if (!query) return { success: false, error: 'query is required' };

      const allResults = await this.knowledgeService.search(query, limit * 2);

      const filtered = category
        ? allResults.filter((doc: any) => doc.category === category)
        : allResults;

      const results = filtered.slice(0, limit);

      return {
        success: true,
        data: {
          count: results.length,
          categoryFilter: category || 'all',
          results: results.map((doc: any) => ({
            id: doc._id?.toString() || doc.id,
            title: doc.title,
            content: doc.content,
            category: doc.category,
            source: doc.source,
            tags: doc.tags || [],
            relevanceScore: doc.score ?? null,
          })),
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
