import { Module } from '@nestjs/common';
import { BalancesModule } from '@/modules/balances/balances.module';
import { ApproveTimeOffRequestUseCase } from '@/modules/time-off-requests/application/use-cases/approve-time-off-request.use-case';
import { CancelTimeOffRequestUseCase } from '@/modules/time-off-requests/application/use-cases/cancel-time-off-request.use-case';
import { CreateTimeOffRequestUseCase } from '@/modules/time-off-requests/application/use-cases/create-time-off-request.use-case';
import { GetTimeOffRequestUseCase } from '@/modules/time-off-requests/application/use-cases/get-time-off-request.use-case';
import { RejectTimeOffRequestUseCase } from '@/modules/time-off-requests/application/use-cases/reject-time-off-request.use-case';
import { TimeOffRequestRepository } from '@/modules/time-off-requests/domain/time-off-request.repository';
import { PrismaTimeOffRequestRepository } from '@/modules/time-off-requests/infra/persistence/prisma-time-off-request.repository';
import { TimeOffRequestsController } from '@/modules/time-off-requests/infra/presentation/controllers/time-off-requests.controller';

@Module({
  controllers: [TimeOffRequestsController],
  imports: [BalancesModule],
  providers: [
    ApproveTimeOffRequestUseCase,
    CancelTimeOffRequestUseCase,
    CreateTimeOffRequestUseCase,
    GetTimeOffRequestUseCase,
    RejectTimeOffRequestUseCase,
    {
      provide: TimeOffRequestRepository,
      useClass: PrismaTimeOffRequestRepository,
    },
  ],
})
export class TimeOffRequestsModule {}
