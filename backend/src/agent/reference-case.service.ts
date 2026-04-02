import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReferenceCase, ReferenceCaseDocument } from './schemas/reference-case.schema';

@Injectable()
export class ReferenceCaseService {
  private readonly logger = new Logger(ReferenceCaseService.name);

  constructor(
    @InjectModel(ReferenceCase.name) private readonly refCaseModel: Model<ReferenceCaseDocument>,
  ) {}

  async saveReferenceCase(data: {
    phone: string;
    customerName: string;
    systemName?: string;
    entityName?: string;
    analystName: string;
    conversation: { role: string; content: string }[];
    problemSummary?: string;
    solutionSummary?: string;
  }): Promise<void> {
    try {
      const keywords = this.extractKeywords(data.conversation);

      const refCase = new this.refCaseModel({
        phone: data.phone,
        customerName: data.customerName,
        systemName: data.systemName || '',
        entityName: data.entityName || '',
        analystName: data.analystName,
        conversation: data.conversation.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(),
        })),
        problemSummary: data.problemSummary || '',
        solutionSummary: data.solutionSummary || '',
        keywords,
        outcome: 'resolved',
      });

      await refCase.save();
      this.logger.log(
        `Reference case saved: ${data.customerName} (${data.phone}), analyst: ${data.analystName}, keywords: ${keywords.slice(0, 5).join(', ')}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to save reference case: ${err?.message}`);
    }
  }

  async searchReferenceCases(query: string, limit = 5): Promise<any[]> {
    try {
      const results = await this.refCaseModel
        .find(
          { $text: { $search: query } },
          { score: { $meta: 'textScore' } },
        )
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .lean()
        .exec();

      return results;
    } catch (err: any) {
      this.logger.warn(`Text search failed, falling back to regex: ${err?.message}`);
      const words = query.split(/\s+/).filter((w) => w.length > 2);
      if (words.length === 0) return [];

      const regexPattern = words.map((w) => `(?=.*${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`).join('');
      return this.refCaseModel
        .find({
          $or: [
            { problemSummary: { $regex: regexPattern, $options: 'i' } },
            { solutionSummary: { $regex: regexPattern, $options: 'i' } },
            { keywords: { $in: words } },
          ],
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec();
    }
  }

  private extractKeywords(conversation: { role: string; content: string }[]): string[] {
    const allText = conversation
      .filter((m) => m.role === 'customer' || m.role === 'analyst_guidance')
      .map((m) => m.content)
      .join(' ')
      .toLowerCase();

    const stopWords = new Set([
      'que', 'de', 'para', 'com', 'não', 'uma', 'um', 'por', 'mais', 'como', 'mas',
      'foi', 'quando', 'muito', 'tem', 'meu', 'minha', 'isso', 'esse', 'essa', 'está',
      'ser', 'ter', 'fazer', 'pode', 'bom', 'boa', 'dia', 'tarde', 'noite', 'tudo',
      'bem', 'aqui', 'lá', 'sim', 'não', 'obrigado', 'obrigada', 'olá', 'oi',
      'diz', 'dele', 'dela', 'nos', 'nós', 'voce', 'você', 'favor', 'por',
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
    ]);

    const words = allText
      .replace(/[^\w\sà-ú]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const freq = new Map<string, number>();
    for (const w of words) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word]) => word);
  }
}
