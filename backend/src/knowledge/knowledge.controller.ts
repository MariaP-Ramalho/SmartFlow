import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  ingest(@Request() req: any, @Body() dto: CreateDocumentDto) {
    this.requireAdmin(req);
    return this.knowledgeService.ingest(dto);
  }

  @Post('bulk')
  bulkIngest(@Request() req: any, @Body() documents: CreateDocumentDto[]) {
    this.requireAdmin(req);
    return this.knowledgeService.bulkIngest(documents);
  }

  @Get()
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @Query('category') category?: string,
    @Query('source') source?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.knowledgeService.findAll({
      category,
      source,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('search')
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.knowledgeService.search(q, limit ? parseInt(limit, 10) : 5);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.knowledgeService.findById(id);
  }

  @Patch(':id')
  update(@Request() req: any, @Param('id') id: string, @Body() dto: Partial<CreateDocumentDto>) {
    this.requireAdmin(req);
    return this.knowledgeService.update(id, dto);
  }

  @Delete('all')
  async removeAll(@Request() req: any) {
    this.requireAdmin(req);
    return this.knowledgeService.deleteAll();
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    this.requireAdmin(req);
    return this.knowledgeService.delete(id);
  }

  private requireAdmin(req: any): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Acesso restrito a administradores');
    }
  }
}
