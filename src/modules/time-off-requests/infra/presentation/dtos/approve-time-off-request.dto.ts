import { IsOptional, IsString } from 'class-validator';

export class ApproveTimeOffRequestDto {
  @IsOptional()
  @IsString()
  managerId?: string;
}
