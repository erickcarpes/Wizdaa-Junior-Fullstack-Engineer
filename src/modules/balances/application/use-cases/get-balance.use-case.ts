import { Injectable } from '@nestjs/common';
import { BalanceProjectionRepository } from '@/modules/balances/domain/balance-projection.repository';
import { BalanceProjectionNotFoundError } from '@/modules/balances/application/errors/balance-projection-not-found.error';

type GetBalanceInput = {
  employeeId: string;
  locationId: string;
};

@Injectable()
export class GetBalanceUseCase {
  constructor(
    private readonly balanceProjectionRepository: BalanceProjectionRepository,
  ) {}

  async execute(input: GetBalanceInput) {
    const balanceProjection =
      await this.balanceProjectionRepository.findByEmployeeAndLocation(input);

    if (!balanceProjection) {
      throw new BalanceProjectionNotFoundError(
        input.employeeId,
        input.locationId,
      );
    }

    return balanceProjection;
  }
}
