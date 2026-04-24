import { Injectable } from '@nestjs/common';
import { TimeOffRequestRepository } from '@/modules/time-off-requests/domain/time-off-request.repository';
import { TimeOffRequestNotFoundError } from '@/modules/time-off-requests/domain/errors/time-off-request-not-found.error';

@Injectable()
export class GetTimeOffRequestUseCase {
  constructor(
    private readonly timeOffRequestRepository: TimeOffRequestRepository,
  ) {}

  async execute(requestId: string) {
    const timeOffRequest = await this.timeOffRequestRepository.findById(
      requestId,
    );

    if (!timeOffRequest) {
      throw new TimeOffRequestNotFoundError(requestId);
    }

    return timeOffRequest;
  }
}
