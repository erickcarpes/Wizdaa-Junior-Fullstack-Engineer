import { Injectable } from '@nestjs/common';
import {
  ApproveTimeOffRequestCommand,
  TimeOffRequestRepository,
} from '@/modules/time-off-requests/domain/time-off-request.repository';
import { TimeOffRequestNotFoundError } from '@/modules/time-off-requests/domain/errors/time-off-request-not-found.error';

@Injectable()
export class ApproveTimeOffRequestUseCase {
  constructor(
    private readonly timeOffRequestRepository: TimeOffRequestRepository,
  ) {}

  async execute(command: ApproveTimeOffRequestCommand) {
    const timeOffRequest = await this.timeOffRequestRepository.findById(
      command.requestId,
    );

    if (!timeOffRequest) {
      throw new TimeOffRequestNotFoundError(command.requestId);
    }

    timeOffRequest.approve(command.managerId);

    return this.timeOffRequestRepository.saveApproved(timeOffRequest);
  }
}
