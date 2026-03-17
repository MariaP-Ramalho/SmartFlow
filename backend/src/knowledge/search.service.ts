import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  KnowledgeDocument,
  KnowledgeDocumentDoc,
} from './schemas/document.schema';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(KnowledgeDocument.name)
    private docModel: Model<KnowledgeDocumentDoc>,
  ) {}

  async semanticSearch(
    queryEmbedding: number[],
    topK = 5,
  ): Promise<KnowledgeDocument[]> {
    if (!queryEmbedding.length) return [];

    const docs = await this.docModel
      .find({ embedding: { $exists: true, $ne: [] } })
      .exec();

    const scored = docs
      .map((doc) => ({
        doc,
        score: this.cosineSimilarity(queryEmbedding, doc.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map((s) => s.doc);
  }

  async textSearch(query: string, topK = 5): Promise<KnowledgeDocument[]> {
    const regex = new RegExp(query, 'i');
    return this.docModel
      .find({
        $or: [
          { title: { $regex: regex } },
          { content: { $regex: regex } },
          { tags: { $regex: regex } },
        ],
      })
      .limit(topK)
      .exec();
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }
}
