import {
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { GetBalanceLedgerUseCase } from '@/modules/balances/application/use-cases/get-balance-ledger.use-case';
import { GetBalanceUseCase } from '@/modules/balances/application/use-cases/get-balance.use-case';
import { RefreshBalanceUseCase } from '@/modules/balances/application/use-cases/refresh-balance.use-case';

@Controller('balances')
export class BalancesController {
  constructor(
    private readonly getBalanceLedgerUseCase: GetBalanceLedgerUseCase,
    private readonly getBalanceUseCase: GetBalanceUseCase,
    private readonly refreshBalanceUseCase: RefreshBalanceUseCase,
  ) {}

  @Get(':employeeId')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
  ) {
    const balanceProjection = await this.getBalanceUseCase.execute({
      employeeId,
      locationId,
    });

    return balanceProjection.toJSON();
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

  @Get(':employeeId/ledger')
  async getLedger(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.getBalanceLedgerUseCase.execute({
      employeeId,
      locationId,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
