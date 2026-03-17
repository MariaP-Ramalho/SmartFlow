import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import {
  KnowledgeDocument,
  KnowledgeDocumentDoc,
} from './schemas/document.schema';
import { CreateDocumentDto } from './dto/create-document.dto';
import { EmbeddingsService } from './embeddings.service';
import { SearchService } from './search.service';

export interface DocumentFilters {
  category?: string;
  source?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedDocuments {
  data: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectModel(KnowledgeDocument.name)
    private docModel: Model<KnowledgeDocumentDoc>,
    private readonly embeddingsService: EmbeddingsService,
    private readonly searchService: SearchService,
  ) {}

  async ingest(dto: CreateDocumentDto): Promise<KnowledgeDocument> {
    const embedding = await this.embeddingsService.generateEmbedding(dto.content);
    return new this.docModel({ ...dto, embedding }).save();
  }

  async findAll(filters: DocumentFilters): Promise<PaginatedDocuments> {
    const { category, source, search, page = 1, limit = 20 } = filters;
    const query: FilterQuery<KnowledgeDocumentDoc> = {};

    if (category) query.category = category;
    if (source) query.source = source;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.docModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.docModel.countDocuments(query).exec(),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<KnowledgeDocument> {
    const doc = await this.docModel.findById(id).exec();
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  async update(
    id: string,
    dto: Partial<CreateDocumentDto>,
  ): Promise<KnowledgeDocument> {
    const doc = await this.docModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    return doc;
  }

  async delete(id: string): Promise<void> {
    const result = await this.docModel.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`Document ${id} not found`);
  }

  async deleteAll(): Promise<{ deleted: number }> {
    const result = await this.docModel.deleteMany({}).exec();
    return { deleted: result.deletedCount };
  }

  async search(query: string, topK = 5): Promise<KnowledgeDocument[]> {
    const embedding = await this.embeddingsService.generateEmbedding(query);

    if (embedding.length > 0) {
      return this.searchService.semanticSearch(embedding, topK);
    }

    return this.searchService.textSearch(query, topK);
  }

  async bulkIngest(documents: CreateDocumentDto[]): Promise<any[]> {
    const embeddings = await this.embeddingsService.generateEmbeddings(
      documents.map((d) => d.content),
    );

    const docs = documents.map((dto, i) => ({
      ...dto,
      embedding: embeddings[i],
    }));

    return this.docModel.insertMany(docs);
  }
}
