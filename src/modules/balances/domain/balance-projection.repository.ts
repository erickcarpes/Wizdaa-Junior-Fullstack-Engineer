import { LedgerEntryType, LedgerSource } from '@prisma/client';
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

export type BalanceLedgerEntryView = {
  id: string;
  employeeId: string;
  locationId: string;
  timeOffRequestId: string | null;
  entryType: LedgerEntryType;
  deltaDays: number;
  source: LedgerSource;
  idempotencyKey: string;
  metadata: string | null;
  occurredAt: Date;
};

export abstract class BalanceProjectionRepository {
  abstract findByEmployeeAndLocation(
    lookup: BalanceProjectionLookup,
  ): Promise<BalanceProjectionEntity | null>;

  abstract upsertFromHcmSnapshot(
    command: UpsertBalanceProjectionFromHcmCommand,
  ): Promise<BalanceProjectionEntity>;

  abstract listLedgerEntries(
    lookup: BalanceProjectionLookup & { limit?: number },
  ): Promise<BalanceLedgerEntryView[]>;
}
