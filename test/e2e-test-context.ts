import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';

export type E2eTestContext = {
  app: INestApplication;
  prismaService: PrismaService;
  mockHcmService: MockHcmService;
};

export async function createE2eTestContext(): Promise<E2eTestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  const prismaService = moduleRef.get(PrismaService);
  const mockHcmService = moduleRef.get(MockHcmService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  return {
    app,
    prismaService,
    mockHcmService,
  };
}

export async function resetE2eState(context: E2eTestContext) {
  context.mockHcmService.clear();
  await context.prismaService.hcmSyncEvent.deleteMany();
  await context.prismaService.balanceLedgerEntry.deleteMany();
  await context.prismaService.timeOffRequest.deleteMany();
  await context.prismaService.balanceProjection.deleteMany();
}

export async function closeE2eTestContext(context: E2eTestContext) {
  await resetE2eState(context);
  await context.app.close();
}
