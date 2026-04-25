import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { BalancesModule } from '@/modules/balances/balances.module';
import { HcmIntegrationModule } from '@/modules/hcm-integration/hcm-integration.module';
import { MockHcmModule } from '@/modules/mock-hcm/mock-hcm.module';
import { ReconciliationModule } from '@/modules/reconciliation/reconciliation.module';
import { TestSupportModule } from '@/modules/test-support/test-support.module';
import { TimeOffRequestsModule } from '@/modules/time-off-requests/time-off-requests.module';

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
})
export class AppModule {}
