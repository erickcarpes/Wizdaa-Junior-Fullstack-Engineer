import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { BalancesModule } from '@/modules/balances/balances.module';
import { HcmIntegrationModule } from '@/modules/hcm-integration/hcm-integration.module';
import { MockHcmModule } from '@/modules/mock-hcm/mock-hcm.module';
import { ReconciliationModule } from '@/modules/reconciliation/reconciliation.module';
import { TestSupportModule } from '@/modules/test-support/test-support.module';
import { TimeOffRequestsModule } from '@/modules/time-off-requests/time-off-requests.module';
import { APP_FILTER } from '@nestjs/core';
import { AppExceptionFilter } from '@/shared/infra/filters/app-exception.filter';

@Module({
  imports: [
    PrismaModule,
    BalancesModule,
    TimeOffRequestsModule,
    HcmIntegrationModule,
    MockHcmModule,
    ReconciliationModule,
    TestSupportModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AppExceptionFilter,
    },
  ],
})
export class AppModule {}
