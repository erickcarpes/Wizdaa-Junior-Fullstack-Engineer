import { Body, Controller, Post } from '@nestjs/common';
import { HcmIntegrationService } from '@/modules/hcm-integration/hcm-integration.service';
import { IngestHcmBatchBalancesDto } from '@/modules/hcm-integration/infra/presentation/dtos/ingest-hcm-batch-balances.dto';

@Controller('hcm-sync')
export class HcmIntegrationController {
  constructor(
    private readonly hcmIntegrationService: HcmIntegrationService,
  ) {}

  @Post('process-pending')
  processPending() {
    return this.hcmIntegrationService.processPendingTimeOffSubmissions();
  }

  @Post('batch-balances')
  ingestBatchBalances(@Body() body: IngestHcmBatchBalancesDto) {
    return this.hcmIntegrationService.ingestBatchBalances({
      batchId: body.batchId,
      snapshotAt: new Date(body.snapshotAt),
      balances: body.balances,
    });
  }
}
