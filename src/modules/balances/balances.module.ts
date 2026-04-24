import { Module } from '@nestjs/common';
import { GetBalanceUseCase } from '@/modules/balances/application/use-cases/get-balance.use-case';
import { BalanceProjectionRepository } from '@/modules/balances/domain/balance-projection.repository';
import { PrismaBalanceProjectionRepository } from '@/modules/balances/infra/persistence/prisma-balance-projection.repository';
import { BalancesController } from '@/modules/balances/infra/presentation/controllers/balances.controller';

@Module({
  controllers: [BalancesController],
  providers: [
    GetBalanceUseCase,
    {
      provide: BalanceProjectionRepository,
      useClass: PrismaBalanceProjectionRepository,
    },
  ],
  exports: [BalanceProjectionRepository],
})
export class BalancesModule {}
