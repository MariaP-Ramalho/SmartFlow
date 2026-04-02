import { Injectable, Logger } from '@nestjs/common';
import { ZapFlowPgService } from '../../zapflow/zapflow-pg.service';
import { ReferenceCaseService } from '../reference-case.service';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';

@Injectable()
export class PastCasesTool implements AgentTool {
  private readonly logger = new Logger(PastCasesTool.name);

  readonly definition: ToolDefinition = {
    name: 'search_past_cases',
    description:
      'Search for past atendimentos with similar problems. First checks high-quality reference cases (reviewed by senior analyst), ' +
      'then searches ZapFlow database (15000+ closed cases) with multi-layer search. ' +
      'Cases marked fonte_confiavel=true are top priority. USE THIS TOOL FIRST before answering any technical question.',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'string',
          description:
            'Technical keywords describing the TYPE of problem (not the specific case). ' +
            'Use generic domain terms. Example: for a bank balance difference, use "diferença saldo razão extrato conciliação". ' +
            'For access error, use "erro permissão acesso login". 2-5 keywords about the problem concept.',
        },
        system_name: {
          type: 'string',
          description:
            'Optional: filter by system name (e.g. "Licitação", "Folha", "Contabilidade", "Hospital")',
        },
        include_interactions: {
          type: 'boolean',
          description:
            'If true, also fetches the conversation history of the top 2 results to see how the analyst solved it step by step. Default false.',
        },
      },
      required: ['keywords'],
    },
  };

  constructor(
    private readonly zapflow: ZapFlowPgService,
    private readonly referenceCaseService: ReferenceCaseService,
  ) {}

  async execute(args: Record<string, any>, _context: AgentContext): Promise<ToolResult> {
    try {
      const { keywords, system_name, include_interactions = false } = args;
      if (!keywords) return { success: false, error: 'keywords is required' };

      const results: any[] = [];

      // Priority layer: search reference cases (analyst-collaborated, high quality)
      try {
        const refCases = await this.referenceCaseService.searchReferenceCases(keywords, 3);
        if (refCases.length > 0) {
          this.logger.log(`Found ${refCases.length} reference case(s) for "${keywords}"`);
          for (const rc of refCases) {
            const entry: any = {
              fonte_confiavel: true,
              fonte: 'caso_referencia_gestor',
              sistema: (rc as any).systemName || '',
              entidade: (rc as any).entityName || '',
              cliente: (rc as any).customerName || '',
              problema: (rc as any).problemSummary || '',
              solucao: (rc as any).solutionSummary || '',
              analista_orientador: (rc as any).analystName || '',
              data: (rc as any).createdAt,
            };

            if (include_interactions && (rc as any).conversation?.length > 0) {
              entry.interacoes = (rc as any).conversation
                .filter((m: any) => m.role !== 'analyst_guidance' || include_interactions)
                .slice(0, 20)
                .map((m: any) => ({
                  de: m.role === 'customer' ? 'Cliente' : m.role === 'analyst_guidance' ? 'Gestor' : 'Analista',
                  mensagem: m.content,
                }));
            }

            results.push(entry);
          }
        }
      } catch (refErr: any) {
        this.logger.warn(`Reference case search failed: ${refErr?.message}`);
      }

      // Standard ZapFlow search
      const allCases = await this.multiLayerSearch(keywords, system_name);

      if (allCases.length === 0 && results.length === 0) {
        return {
          success: true,
          data: {
            count: 0,
            search_layers_tried: 'all (reference cases, with system, without system, broader terms, keyword pairs)',
            message: 'Nenhum caso encontrado em nenhuma camada de busca.',
            cases: [],
          },
        };
      }

      for (let i = 0; i < allCases.length; i++) {
        const c = allCases[i];
        const foiEncaminhadoParaDev = !!c.z90_ate_transbordo_dev;
        const bugSolucionado = !!c.z90_ate_bug_solucionado;
        const entry: any = {
          fonte_confiavel: false,
          atendimento_id: c.z90_ate_id,
          sistema: c.sistema,
          entidade: c.entidade,
          problema: c.z90_ate_resumo_do_problema,
          solucao: c.z90_ate_resumo_da_solucao,
          data_fechamento: c.z90_ate_data_fechamento,
          encaminhado_para_dev: foiEncaminhadoParaDev,
          bug_solucionado: bugSolucionado,
        };

        if (include_interactions && i < 2) {
          const interactions = await this.zapflow.getCaseInteractions(c.z90_ate_id, 20);
          entry.interacoes = interactions.map((int: any) => {
            const tipo = int.z90_int_id_tipo_remetente;
            const label =
              tipo === 1 ? 'IA' : tipo === 2 ? 'Analista' : tipo === 3 ? 'Cliente' : 'Sistema';
            return {
              de: label,
              mensagem: int.z90_int_conteudo_mensagem,
              hora: int.z90_int_data_hora_envio,
            };
          });
        }

        results.push(entry);
      }

      return {
        success: true,
        data: {
          count: results.length,
          cases: results,
          nota: results.some((r) => r.fonte_confiavel)
            ? 'Casos marcados com fonte_confiavel=true são de atendimentos revisados pelo gestor Cássio e devem ser priorizados como referência.'
            : undefined,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async multiLayerSearch(keywords: string, systemName?: string): Promise<any[]> {
    const seen = new Set<number>();
    const combined: any[] = [];
    const TARGET = 8;

    const addResults = (rows: any[]) => {
      for (const row of rows) {
        if (!seen.has(row.z90_ate_id) && combined.length < TARGET) {
          seen.add(row.z90_ate_id);
          combined.push(row);
        }
      }
    };

    // Layer 1: exact keywords + system filter
    if (systemName) {
      this.logger.log(`Layer 1: "${keywords}" + system="${systemName}"`);
      const r1 = await this.zapflow.searchSimilarCases(keywords, systemName, TARGET);
      addResults(r1);
      this.logger.log(`Layer 1 results: ${r1.length}, total: ${combined.length}`);
    }

    // Layer 2: exact keywords without system filter
    if (combined.length < TARGET) {
      this.logger.log(`Layer 2: "${keywords}" (no system filter)`);
      const r2 = await this.zapflow.searchSimilarCases(keywords, undefined, TARGET);
      addResults(r2);
      this.logger.log(`Layer 2 results: ${r2.length}, total: ${combined.length}`);
    }

    // Layer 3: keyword pairs — for broader matching
    if (combined.length < 3) {
      const words = this.extractWords(keywords);
      if (words.length >= 2) {
        const pairs = this.generatePairs(words);
        for (const pair of pairs) {
          if (combined.length >= TARGET) break;
          const pairStr = pair.join(' ');
          this.logger.log(`Layer 3 (pair): "${pairStr}"`);
          const r3 = await this.zapflow.searchSimilarCases(pairStr, undefined, 5);
          addResults(r3);
        }
        this.logger.log(`After layer 3, total: ${combined.length}`);
      }
    }

    // Layer 4: individual keywords (broadest)
    if (combined.length < 3) {
      const words = this.extractWords(keywords);
      for (const word of words) {
        if (combined.length >= TARGET) break;
        if (word.length < 4) continue;
        this.logger.log(`Layer 4 (single): "${word}"`);
        const r4 = await this.zapflow.searchSimilarCases(word, systemName || undefined, 5);
        addResults(r4);
      }
      this.logger.log(`After layer 4, total: ${combined.length}`);
    }

    return combined;
  }

  private extractWords(keywords: string): string[] {
    const stopWords = new Set([
      'para', 'como', 'esta', 'está', 'este', 'esse', 'essa', 'isso',
      'com', 'por', 'que', 'não', 'nao', 'uma', 'das', 'dos', 'nos',
      'mais', 'muito', 'pode', 'deve', 'sobre', 'quando', 'onde', 'qual',
    ]);
    return keywords
      .toLowerCase()
      .replace(/[.,;:!?()]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  private generatePairs(words: string[]): string[][] {
    const pairs: string[][] = [];
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        pairs.push([words[i], words[j]]);
      }
    }
    return pairs.slice(0, 6);
  }
}
