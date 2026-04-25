import { Injectable } from '@nestjs/common';
import { TimeOffRequestNotFoundError } from '@/modules/time-off-requests/domain/errors/time-off-request-not-found.error';
import { TimeOffRequestRepository } from '@/modules/time-off-requests/domain/time-off-request.repository';

@Injectable()
export class GetTimeOffRequestSyncEventsUseCase {
  constructor(
    private readonly timeOffRequestRepository: TimeOffRequestRepository,
  ) {}

  async execute(requestId: string) {
    const request = await this.timeOffRequestRepository.findById(requestId);

    if (!request) {
      throw new TimeOffRequestNotFoundError(requestId);
    }

    return this.timeOffRequestRepository.listSyncEvents(requestId);
  }
}
