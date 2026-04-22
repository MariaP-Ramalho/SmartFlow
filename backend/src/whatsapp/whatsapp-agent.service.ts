import { Injectable, Logger, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WhatsAppAgent, WhatsAppAgentDocument } from './schemas/whatsapp-agent.schema';

@Injectable()
export class WhatsAppAgentService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppAgentService.name);
  private readonly cache = new Map<string, WhatsAppAgentDocument>();

  constructor(
    @InjectModel(WhatsAppAgent.name) private readonly model: Model<WhatsAppAgentDocument>,
  ) {}

  async onModuleInit() {
    await this.refreshCache();
  }

  private async refreshCache() {
    const agents = await this.model.find().lean();
    this.cache.clear();
    for (const agent of agents) {
      this.cache.set(agent.slug, agent as any);
    }
    this.logger.log(`Agent cache loaded: ${this.cache.size} agent(s)`);
  }

  async create(dto: Partial<WhatsAppAgent>): Promise<WhatsAppAgentDocument> {
    const existing = await this.model.findOne({ slug: dto.slug });
    if (existing) {
      throw new ConflictException(`Agent with slug "${dto.slug}" already exists`);
    }

    const agent = await this.model.create(dto);
    this.cache.set(agent.slug, agent);
    this.logger.log(`Agent created: ${agent.slug} (${agent.name})`);
    return agent;
  }

  async findAll(): Promise<WhatsAppAgentDocument[]> {
    return this.model.find().sort({ createdAt: -1 }).lean() as any;
  }

  async findBySlug(slug: string): Promise<WhatsAppAgentDocument | null> {
    const cached = this.cache.get(slug);
    if (cached) return cached;

    const agent = await this.model.findOne({ slug }).lean();
    if (agent) {
      this.cache.set(slug, agent as any);
    }
    return (agent as any) || null;
  }

  getBySlugCached(slug: string): WhatsAppAgentDocument | undefined {
    return this.cache.get(slug);
  }

  getAllCached(): WhatsAppAgentDocument[] {
    return [...this.cache.values()];
  }

  async update(slug: string, dto: Partial<WhatsAppAgent>): Promise<WhatsAppAgentDocument> {
    const { slug: _ignoreSlug, ...updates } = dto as any;

    const agent = await this.model.findOneAndUpdate(
      { slug },
      { $set: updates },
      { new: true },
    );

    if (!agent) {
      throw new NotFoundException(`Agent "${slug}" not found`);
    }

    this.cache.set(slug, agent);
    this.logger.log(`Agent updated: ${slug}`);
    return agent;
  }

  async remove(slug: string): Promise<void> {
    const result = await this.model.findOneAndDelete({ slug });
    if (!result) {
      throw new NotFoundException(`Agent "${slug}" not found`);
    }
    this.cache.delete(slug);
    this.logger.log(`Agent deleted: ${slug}`);
  }
}
