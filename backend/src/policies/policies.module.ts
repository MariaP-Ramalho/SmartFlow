import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Policy, PolicySchema } from './schemas/policy.schema';
import { Approval, ApprovalSchema } from './schemas/approval.schema';
import { PoliciesService } from './policies.service';
import { PoliciesController, ApprovalsController } from './policies.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Policy.name, schema: PolicySchema },
      { name: Approval.name, schema: ApprovalSchema },
    ]),
  ],
  controllers: [PoliciesController, ApprovalsController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
