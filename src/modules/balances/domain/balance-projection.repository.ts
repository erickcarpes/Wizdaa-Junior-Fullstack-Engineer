import { BalanceProjectionEntity } from '@/modules/balances/domain/balance-projection.entity';

export type BalanceProjectionLookup = {
  employeeId: string;
  locationId: string;
};

export type UpsertBalanceProjectionFromHcmCommand = {
  employeeId: string;
  locationId: string;
  availableDays: number;
  lastHcmVersion?: string | null;
  lastHcmSnapshotAt?: Date;
};

export abstract class BalanceProjectionRepository {
  abstract findByEmployeeAndLocation(
    lookup: BalanceProjectionLookup,
  ): Promise<BalanceProjectionEntity | null>;

  abstract upsertFromHcmSnapshot(
    command: UpsertBalanceProjectionFromHcmCommand,
  ): Promise<BalanceProjectionEntity>;
}
