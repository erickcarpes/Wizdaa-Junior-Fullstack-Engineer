import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { GetBalanceUseCase } from '@/modules/balances/application/use-cases/get-balance.use-case';
import { BalanceProjectionNotFoundError } from '@/modules/balances/application/errors/balance-projection-not-found.error';

@Controller('balances')
export class BalancesController {
  constructor(private readonly getBalanceUseCase: GetBalanceUseCase) {}

  @Get(':employeeId')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
  ) {
    try {
      const balanceProjection = await this.getBalanceUseCase.execute({
        employeeId,
        locationId,
      });

      return balanceProjection.toJSON();
    } catch (error) {
      if (error instanceof BalanceProjectionNotFoundError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }
}
