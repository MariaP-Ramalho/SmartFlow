import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { ClickUpClient } from './clickup.client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto, TicketStatus } from './dto/update-ticket.dto';

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly clickUpClient: ClickUpClient,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new ticket' })
  create(@Body() dto: CreateTicketDto) {
    return this.ticketsService.create(dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get ticket statistics' })
  getStats() {
    return this.ticketsService.getStats();
  }

  @Get()
  @ApiOperation({ summary: 'List tickets with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
  ) {
    return this.ticketsService.findAll({ page, limit, status, priority, category, search });
  }

  @Post('sync-clickup')
  @ApiOperation({ summary: 'Sync all tasks from ClickUp into local tickets' })
  async syncFromClickUp() {
    const tasks = await this.clickUpClient.getTasks();
    const results = { synced: 0, skipped: 0, errors: 0, tickets: [] as any[] };

    for (const task of tasks.tasks) {
      try {
        const existing = await this.ticketsService.findByClickUpId(task.id);
        if (existing) {
          results.skipped++;
          continue;
        }

        const statusMap: Record<string, string> = {
          'pendente': 'open', 'to do': 'open', 'open': 'open',
          'em progresso': 'in_progress', 'in progress': 'in_progress',
          'revisão': 'waiting_approval', 'review': 'waiting_approval',
          'concluído': 'resolved', 'complete': 'resolved', 'closed': 'closed',
        };
        const priorityMap: Record<string, string> = {
          '1': 'urgent', '2': 'high', '3': 'medium', '4': 'low',
        };

        const ticket = await this.ticketsService.create({
          title: task.name,
          description: task.description || task.text_content || '',
          priority: (priorityMap[String(task.priority?.id || '3')] || 'medium') as any,
          category: task.name.match(/\[([^\]]+)\]/)?.[1] || 'geral',
          tags: task.tags?.map((t: any) => t.name) || [],
        });

        await this.ticketsService.setClickUpId(
          (ticket as any)._id.toString(),
          task.id,
          statusMap[task.status?.status?.toLowerCase()] || 'open',
        );

        results.synced++;
        results.tickets.push({ id: (ticket as any)._id, clickupId: task.id, title: task.name });
      } catch (err) {
        results.errors++;
      }
    }

    return results;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a ticket by ID' })
  @ApiParam({ name: 'id', description: 'Ticket MongoDB ID' })
  findById(@Param('id') id: string) {
    return this.ticketsService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a ticket' })
  @ApiParam({ name: 'id', description: 'Ticket MongoDB ID' })
  update(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.ticketsService.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update ticket status with transition validation' })
  @ApiParam({ name: 'id', description: 'Ticket MongoDB ID' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: TicketStatus,
  ) {
    return this.ticketsService.updateStatus(id, status);
  }

  @Post(':id/actions')
  @ApiOperation({ summary: 'Add an agent action to the ticket' })
  @ApiParam({ name: 'id', description: 'Ticket MongoDB ID' })
  addAgentAction(
    @Param('id') id: string,
    @Body() action: { action: string; tool: string; input?: Record<string, any>; output?: Record<string, any>; durationMs?: number; status?: string },
  ) {
    return this.ticketsService.addAgentAction(id, action);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Resolve a ticket' })
  @ApiParam({ name: 'id', description: 'Ticket MongoDB ID' })
  resolve(
    @Param('id') id: string,
    @Body() resolution: { type: string; description: string; approvedBy?: string },
  ) {
    return this.ticketsService.resolve(id, resolution);
  }
}
