import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { PoliciesService } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { EvaluateActionDto } from './dto/evaluate-action.dto';

@ApiTags('policies')
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post()
  create(@Body() dto: CreatePolicyDto) {
    return this.policiesService.createPolicy(dto);
  }

  @Get()
  @ApiQuery({ name: 'trigger', required: false })
  @ApiQuery({ name: 'riskLevel', required: false })
  @ApiQuery({ name: 'active', required: false })
  findAll(
    @Query('trigger') trigger?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('active') active?: string,
  ) {
    return this.policiesService.findAllPolicies({
      trigger,
      riskLevel,
      active: active !== undefined ? active === 'true' : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.policiesService.findPolicyById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreatePolicyDto>) {
    return this.policiesService.updatePolicy(id, dto);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string, @Body('active') active: boolean) {
    return this.policiesService.togglePolicy(id, active);
  }

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateActionDto) {
    return this.policiesService.evaluate(dto.action, dto.context);
  }
}

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Post()
  create(
    @Body()
    body: {
      policyId: string;
      caseId: string;
      ticketId: string;
      action: string;
      context?: Record<string, any>;
      requestedBy?: string;
    },
  ) {
    return this.policiesService.requestApproval(body);
  }

  @Get()
  findPending() {
    return this.policiesService.findPendingApprovals();
  }

  @Get('case/:caseId')
  findByCase(@Param('caseId') caseId: string) {
    return this.policiesService.findApprovalsByCase(caseId);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected'; resolvedBy: string; reason?: string },
  ) {
    return this.policiesService.resolveApproval(
      id,
      body.status,
      body.resolvedBy,
      body.reason,
    );
  }
}
