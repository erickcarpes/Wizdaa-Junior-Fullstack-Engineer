import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RejectTimeOffRequestDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  managerId?: string;
}
