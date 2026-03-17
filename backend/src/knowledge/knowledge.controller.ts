import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@ApiTags('knowledge')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  ingest(@Body() dto: CreateDocumentDto) {
    return this.knowledgeService.ingest(dto);
  }

  @Post('bulk')
  bulkIngest(@Body() documents: CreateDocumentDto[]) {
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
  update(@Param('id') id: string, @Body() dto: Partial<CreateDocumentDto>) {
    return this.knowledgeService.update(id, dto);
  }

  @Delete('all')
  async removeAll() {
    return this.knowledgeService.deleteAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.knowledgeService.delete(id);
  }
}
