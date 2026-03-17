import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';

@Injectable()
export class KnowledgeTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'search_knowledge',
    description:
      'Search the knowledge base across 4 real sources: assistant_kb (system manuals/procedures), daily_transcript (daily meeting notes with workarounds), clickup_bug (known bugs from dev team), resolved_case (past resolved support cases). Returns documents with source tags for audit trail.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query in Portuguese',
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['assistant_kb', 'daily_transcript', 'clickup_bug', 'resolved_case'],
          },
          description: 'Optional filter: which knowledge sources to search. Defaults to all 4.',
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
      const { query, sources, limit = 5 } = args;
      if (!query) return { success: false, error: 'query is required' };

      const allResults = await this.knowledgeService.search(query, limit * 2);

      const validSources = sources && Array.isArray(sources) && sources.length > 0
        ? new Set(sources as string[])
        : null;

      const filtered = validSources
        ? allResults.filter((doc: any) => validSources.has(doc.source))
        : allResults;

      const results = filtered.slice(0, limit);

      return {
        success: true,
        data: {
          count: results.length,
          sourcesSearched: validSources ? Array.from(validSources) : ['assistant_kb', 'daily_transcript', 'clickup_bug', 'resolved_case'],
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
