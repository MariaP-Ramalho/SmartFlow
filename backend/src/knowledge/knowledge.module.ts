import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  KnowledgeDocument,
  KnowledgeDocumentSchema,
} from './schemas/document.schema';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { EmbeddingsService } from './embeddings.service';
import { SearchService } from './search.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
    ]),
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, EmbeddingsService, SearchService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
