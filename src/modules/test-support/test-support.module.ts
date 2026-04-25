import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { MockHcmModule } from '@/modules/mock-hcm/mock-hcm.module';
import { TestSupportController } from '@/modules/test-support/infra/presentation/controllers/test-support.controller';
import { TestSupportService } from '@/modules/test-support/test-support.service';

@Module({
  imports: [PrismaModule, MockHcmModule],
  controllers: [TestSupportController],
  providers: [TestSupportService],
})
export class TestSupportModule {}
