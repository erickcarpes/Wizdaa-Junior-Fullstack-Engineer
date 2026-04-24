import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ConfigureMockHcmSubmissionFailureDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  times!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
