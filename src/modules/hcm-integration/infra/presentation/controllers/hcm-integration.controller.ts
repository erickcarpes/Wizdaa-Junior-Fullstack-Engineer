import { Controller, Post } from '@nestjs/common';
import { HcmIntegrationService } from '@/modules/hcm-integration/hcm-integration.service';

@Controller('hcm-sync')
export class HcmIntegrationController {
  constructor(
    private readonly hcmIntegrationService: HcmIntegrationService,
  ) {}

  @Post('process-pending')
  processPending() {
    return this.hcmIntegrationService.processPendingTimeOffSubmissions();
  }
}
