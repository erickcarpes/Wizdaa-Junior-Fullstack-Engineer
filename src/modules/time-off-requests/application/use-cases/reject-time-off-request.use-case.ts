import { Injectable } from '@nestjs/common';
import {
  RejectTimeOffRequestCommand,
  TimeOffRequestRepository,
} from '@/modules/time-off-requests/domain/time-off-request.repository';
import { TimeOffRequestNotFoundError } from '@/modules/time-off-requests/domain/errors/time-off-request-not-found.error';

@Injectable()
export class RejectTimeOffRequestUseCase {
  constructor(
    private readonly timeOffRequestRepository: TimeOffRequestRepository,
  ) {}

  async execute(command: RejectTimeOffRequestCommand) {
    const timeOffRequest = await this.timeOffRequestRepository.findById(
      command.requestId,
    );

    if (!timeOffRequest) {
      throw new TimeOffRequestNotFoundError(command.requestId);
    }

    timeOffRequest.reject(command.reason, command.managerId);

    return this.timeOffRequestRepository.saveRejected(timeOffRequest);
  }
}
