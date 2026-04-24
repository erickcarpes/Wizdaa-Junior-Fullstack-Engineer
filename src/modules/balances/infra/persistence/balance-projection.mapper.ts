import { BalanceProjection } from '@prisma/client';
import {
  BalanceProjectionEntity,
  BalanceProjectionProps,
} from '@/modules/balances/domain/balance-projection.entity';

export class BalanceProjectionMapper {
  static toDomain(model: BalanceProjection): BalanceProjectionEntity {
    const props: BalanceProjectionProps = {
      id: model.id,
      employeeId: model.employeeId,
      locationId: model.locationId,
      availableDays: model.availableDays,
      reservedDays: model.reservedDays,
      syncStatus: model.syncStatus,
      lastHcmVersion: model.lastHcmVersion,
      lastHcmSnapshotAt: model.lastHcmSnapshotAt,
      version: model.version,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };

    return new BalanceProjectionEntity(props);
  }
}
