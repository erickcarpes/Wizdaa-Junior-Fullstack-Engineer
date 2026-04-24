import { Injectable } from '@nestjs/common';

@Injectable()
export class ReconciliationService {
  async reconcileEmployeeBalance(employeeId: string, locationId: string) {
    return {
      employeeId,
      locationId,
      status: 'NOT_IMPLEMENTED',
    };
  }
}
