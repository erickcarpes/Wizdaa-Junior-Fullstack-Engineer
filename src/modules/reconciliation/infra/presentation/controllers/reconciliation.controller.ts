import { Controller, Param, Post, Query } from '@nestjs/common';
import { ReconciliationService } from '@/modules/reconciliation/reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post(':employeeId')
  reconcileEmployeeBalance(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.reconciliationService.reconcileEmployeeBalance(
      employeeId,
      locationId,
    );
  }
}
