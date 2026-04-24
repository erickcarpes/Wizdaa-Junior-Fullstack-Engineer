import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ConfigureMockHcmSubmissionFailureDto } from '@/modules/mock-hcm/infra/presentation/dtos/configure-mock-hcm-submission-failure.dto';
import { UpsertMockHcmBalanceDto } from '@/modules/mock-hcm/infra/presentation/dtos/upsert-mock-hcm-balance.dto';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';

@Controller('mock-hcm')
export class MockHcmController {
  constructor(private readonly mockHcmService: MockHcmService) {}

  @Get('balances/:employeeId')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Query('locationId') locationId: string,
  ) {
    return this.mockHcmService.getBalance(employeeId, locationId);
  }

  @Post('admin/balances')
  upsertBalance(@Body() body: UpsertMockHcmBalanceDto) {
    return this.mockHcmService.upsertBalance(body);
  }

  @Post('admin/submission-failures')
  configureSubmissionFailure(
    @Body() body: ConfigureMockHcmSubmissionFailureDto,
  ) {
    return this.mockHcmService.configureSubmissionFailure(body);
  }
}
