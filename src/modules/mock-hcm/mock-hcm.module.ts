import { Module } from '@nestjs/common';
import { MockHcmController } from '@/modules/mock-hcm/infra/presentation/controllers/mock-hcm.controller';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';

@Module({
  controllers: [MockHcmController],
  providers: [MockHcmService],
  exports: [MockHcmService],
})
export class MockHcmModule {}
