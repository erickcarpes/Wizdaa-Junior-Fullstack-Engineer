import { BalanceSyncStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import {
  BalanceProjectionLookup,
  BalanceProjectionRepository,
  UpsertBalanceProjectionFromHcmCommand,
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

  async upsertFromHcmSnapshot(command: UpsertBalanceProjectionFromHcmCommand) {
    const snapshotAt = command.lastHcmSnapshotAt ?? new Date();

    const model = await this.prismaService.balanceProjection.upsert({
      where: {
        employeeId_locationId: {
          employeeId: command.employeeId,
          locationId: command.locationId,
        },
      },
      create: {
        employeeId: command.employeeId,
        locationId: command.locationId,
        availableDays: command.availableDays,
        reservedDays: 0,
        syncStatus: BalanceSyncStatus.IN_SYNC,
        lastHcmVersion: command.lastHcmVersion ?? null,
        lastHcmSnapshotAt: snapshotAt,
      },
      update: {
        availableDays: command.availableDays,
        syncStatus: BalanceSyncStatus.IN_SYNC,
        lastHcmVersion: command.lastHcmVersion ?? null,
        lastHcmSnapshotAt: snapshotAt,
        version: {
          increment: 1,
        },
      },
    });

    return BalanceProjectionMapper.toDomain(model);
  }

  async listLedgerEntries(
    lookup: BalanceProjectionLookup & { limit?: number },
  ) {
    return this.prismaService.balanceLedgerEntry.findMany({
      where: {
        employeeId: lookup.employeeId,
        locationId: lookup.locationId,
      },
      orderBy: {
        occurredAt: 'desc',
      },
      take: lookup.limit ?? 50,
    });
  }
}
