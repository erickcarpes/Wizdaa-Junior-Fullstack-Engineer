import { Module } from '@nestjs/common';
import { ReconciliationService } from '@/modules/reconciliation/reconciliation.service';

@Module({
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
