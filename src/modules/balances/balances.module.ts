import { Module } from '@nestjs/common';
import { GetBalanceUseCase } from '@/modules/balances/application/use-cases/get-balance.use-case';
import { RefreshBalanceUseCase } from '@/modules/balances/application/use-cases/refresh-balance.use-case';
import { BalanceProjectionRepository } from '@/modules/balances/domain/balance-projection.repository';
import { PrismaBalanceProjectionRepository } from '@/modules/balances/infra/persistence/prisma-balance-projection.repository';
import { BalancesController } from '@/modules/balances/infra/presentation/controllers/balances.controller';
import { MockHcmModule } from '@/modules/mock-hcm/mock-hcm.module';

@Module({
  imports: [MockHcmModule],
  controllers: [BalancesController],
  providers: [
    GetBalanceUseCase,
    RefreshBalanceUseCase,
    {
      provide: BalanceProjectionRepository,
      useClass: PrismaBalanceProjectionRepository,
    },
  ],
  exports: [BalanceProjectionRepository],
})
export class BalancesModule {}
