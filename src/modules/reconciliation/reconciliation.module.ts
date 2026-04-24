import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { MockHcmModule } from '@/modules/mock-hcm/mock-hcm.module';
import { ReconciliationController } from '@/modules/reconciliation/infra/presentation/controllers/reconciliation.controller';
import { ReconciliationService } from '@/modules/reconciliation/reconciliation.service';

@Module({
  imports: [PrismaModule, MockHcmModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
