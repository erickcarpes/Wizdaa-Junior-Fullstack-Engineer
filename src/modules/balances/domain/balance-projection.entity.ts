import { BalanceSyncStatus } from '@prisma/client';

export type BalanceProjectionProps = {
  id: string;
  employeeId: string;
  locationId: string;
  availableDays: number;
  reservedDays: number;
  syncStatus: BalanceSyncStatus;
  lastHcmVersion: string | null;
  lastHcmSnapshotAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export class BalanceProjectionEntity {
  constructor(private readonly props: BalanceProjectionProps) {}

  get id() {
    return this.props.id;
  }

  get employeeId() {
    return this.props.employeeId;
  }

  get locationId() {
    return this.props.locationId;
  }

  get availableDays() {
    return this.props.availableDays;
  }

  get reservedDays() {
    return this.props.reservedDays;
  }

  get syncStatus() {
    return this.props.syncStatus;
  }

  get lastHcmVersion() {
    return this.props.lastHcmVersion;
  }

  get lastHcmSnapshotAt() {
    return this.props.lastHcmSnapshotAt;
  }

  get version() {
    return this.props.version;
  }

  get createdAt() {
    return this.props.createdAt;
  }

  get updatedAt() {
    return this.props.updatedAt;
  }

  get displayAvailable() {
    return this.props.availableDays - this.props.reservedDays;
  }

  toJSON() {
    return {
      ...this.props,
      displayAvailable: this.displayAvailable,
    };
  }
}
