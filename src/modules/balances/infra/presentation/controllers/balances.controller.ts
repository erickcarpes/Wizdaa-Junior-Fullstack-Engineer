import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { GetBalanceUseCase } from '@/modules/balances/application/use-cases/get-balance.use-case';
import { BalanceProjectionNotFoundError } from '@/modules/balances/application/errors/balance-projection-not-found.error';
import { RefreshBalanceUseCase } from '@/modules/balances/application/use-cases/refresh-balance.use-case';

@Controller('balances')
export class BalancesController {
  constructor(
    private readonly getBalanceUseCase: GetBalanceUseCase,
    private readonly refreshBalanceUseCase: RefreshBalanceUseCase,
  ) {}

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

  @Post(':employeeId/refresh')
  async refreshBalance(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.refreshBalanceUseCase.execute({
      employeeId,
      locationId,
    });
  }
}
