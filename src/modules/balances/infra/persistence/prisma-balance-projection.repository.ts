import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import {
  BalanceProjectionLookup,
  BalanceProjectionRepository,
} from '@/modules/balances/domain/balance-projection.repository';
import { BalanceProjectionMapper } from '@/modules/balances/infra/persistence/balance-projection.mapper';

@Injectable()
export class PrismaBalanceProjectionRepository
  implements BalanceProjectionRepository
{
  constructor(private readonly prismaService: PrismaService) {}

  async findByEmployeeAndLocation(lookup: BalanceProjectionLookup) {
    const model = await this.prismaService.balanceProjection.findUnique({
      where: {
        employeeId_locationId: {
          employeeId: lookup.employeeId,
          locationId: lookup.locationId,
        },
      },
    });

    return model ? BalanceProjectionMapper.toDomain(model) : null;
  }
}
