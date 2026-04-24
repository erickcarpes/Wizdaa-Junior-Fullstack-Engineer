import { Module } from '@nestjs/common';
import { HcmIntegrationController } from '@/modules/hcm-integration/infra/presentation/controllers/hcm-integration.controller';
import { HcmIntegrationService } from '@/modules/hcm-integration/hcm-integration.service';
import { MockHcmModule } from '@/modules/mock-hcm/mock-hcm.module';

@Module({
  imports: [MockHcmModule],
  controllers: [HcmIntegrationController],
  providers: [HcmIntegrationService],
  exports: [HcmIntegrationService],
})
export class HcmIntegrationModule {}
