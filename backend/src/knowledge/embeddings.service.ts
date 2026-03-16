import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../agent/llm/llm.service';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(private readonly llmService: LlmService) {}

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      return await this.llmService.embed(text);
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      return await this.llmService.embedBatch(texts);
    } catch (error) {
      this.logger.error(
        `Failed to generate batch embeddings: ${error instanceof Error ? error.message : String(error)}`,
      );
      return texts.map(() => []);
    }
  }
}
