import { BalanceProjectionEntity } from '@/modules/balances/domain/balance-projection.entity';

export type BalanceProjectionLookup = {
  employeeId: string;
  locationId: string;
};

export abstract class BalanceProjectionRepository {
  abstract findByEmployeeAndLocation(
    lookup: BalanceProjectionLookup,
  ): Promise<BalanceProjectionEntity | null>;
}
