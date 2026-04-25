import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';

@Injectable()
export class TestSupportService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mockHcmService: MockHcmService,
  ) {}

  async reset() {
    this.mockHcmService.clear();
    await this.prismaService.hcmSyncEvent.deleteMany();
    await this.prismaService.balanceLedgerEntry.deleteMany();
    await this.prismaService.timeOffRequest.deleteMany();
    await this.prismaService.balanceProjection.deleteMany();

    return {
      status: 'RESET_OK',
      resetAt: new Date().toISOString(),
    };
  }
}
