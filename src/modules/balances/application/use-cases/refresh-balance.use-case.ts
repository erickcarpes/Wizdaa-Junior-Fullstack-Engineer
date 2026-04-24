import { Injectable } from '@nestjs/common';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';
import { BalanceProjectionRepository } from '@/modules/balances/domain/balance-projection.repository';

type RefreshBalanceCommand = {
  employeeId: string;
  locationId: string;
};

@Injectable()
export class RefreshBalanceUseCase {
  constructor(
    private readonly balanceProjectionRepository: BalanceProjectionRepository,
    private readonly mockHcmService: MockHcmService,
  ) {}

  async execute(command: RefreshBalanceCommand) {
    const hcmBalance = this.mockHcmService.getBalance(
      command.employeeId,
      command.locationId,
    );

    return this.balanceProjectionRepository.upsertFromHcmSnapshot({
      employeeId: hcmBalance.employeeId,
      locationId: hcmBalance.locationId,
      availableDays: hcmBalance.availableDays,
      lastHcmVersion: `mock-hcm:${Date.now()}`,
      lastHcmSnapshotAt: new Date(),
    });
  }
}
