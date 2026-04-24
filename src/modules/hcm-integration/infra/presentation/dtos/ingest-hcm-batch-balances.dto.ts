import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class IngestHcmBatchBalanceRowDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  availableDays!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  hcmVersion?: string;
}

export class IngestHcmBatchBalancesDto {
  @IsString()
  @IsNotEmpty()
  batchId!: string;

  @IsISO8601()
  snapshotAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IngestHcmBatchBalanceRowDto)
  balances!: IngestHcmBatchBalanceRowDto[];
}
