import { Injectable } from '@nestjs/common';
import {
  CancelTimeOffRequestCommand,
  TimeOffRequestRepository,
} from '@/modules/time-off-requests/domain/time-off-request.repository';
import { TimeOffRequestNotFoundError } from '@/modules/time-off-requests/domain/errors/time-off-request-not-found.error';

@Injectable()
export class CancelTimeOffRequestUseCase {
  constructor(
    private readonly timeOffRequestRepository: TimeOffRequestRepository,
  ) {}

  async execute(command: CancelTimeOffRequestCommand) {
    const timeOffRequest = await this.timeOffRequestRepository.findById(
      command.requestId,
    );

    if (!timeOffRequest) {
      throw new TimeOffRequestNotFoundError(command.requestId);
    }

    timeOffRequest.cancel(command.reason);

    return this.timeOffRequestRepository.saveCancelled(timeOffRequest);
  }
}
