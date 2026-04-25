import { Injectable } from '@nestjs/common';
import { BalanceProjectionRepository } from '@/modules/balances/domain/balance-projection.repository';

type GetBalanceLedgerCommand = {
  employeeId: string;
  locationId: string;
  limit?: number;
};

@Injectable()
export class GetBalanceLedgerUseCase {
  constructor(
    private readonly balanceProjectionRepository: BalanceProjectionRepository,
  ) {}

  async execute(command: GetBalanceLedgerCommand) {
    return this.balanceProjectionRepository.listLedgerEntries({
      employeeId: command.employeeId,
      locationId: command.locationId,
      limit: command.limit,
    });
  }
}
