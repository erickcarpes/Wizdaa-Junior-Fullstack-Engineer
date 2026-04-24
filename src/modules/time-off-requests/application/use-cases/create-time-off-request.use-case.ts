import { Injectable } from '@nestjs/common';
import {
  CreatePendingApprovalTimeOffRequestCommand,
  TimeOffRequestRepository,
} from '@/modules/time-off-requests/domain/time-off-request.repository';
import { InvalidTimeOffRequestError } from '@/modules/time-off-requests/application/errors/invalid-time-off-request.error';

@Injectable()
export class CreateTimeOffRequestUseCase {
  constructor(
    private readonly timeOffRequestRepository: TimeOffRequestRepository,
  ) {}

  async execute(command: CreatePendingApprovalTimeOffRequestCommand) {
    this.validate(command);

    return this.timeOffRequestRepository.createPendingApprovalWithReservation(
      command,
    );
  }

  private validate(command: CreatePendingApprovalTimeOffRequestCommand) {
    if (
      typeof command.employeeId !== 'string' ||
      !command.employeeId.trim()
    ) {
      throw new InvalidTimeOffRequestError('employeeId is required.');
    }

    if (
      typeof command.locationId !== 'string' ||
      !command.locationId.trim()
    ) {
      throw new InvalidTimeOffRequestError('locationId is required.');
    }

    if (
      typeof command.daysRequested !== 'number' ||
      !Number.isFinite(command.daysRequested) ||
      command.daysRequested <= 0
    ) {
      throw new InvalidTimeOffRequestError(
        'daysRequested must be greater than zero.',
      );
    }

    if (Number.isNaN(command.startDate.getTime())) {
      throw new InvalidTimeOffRequestError('startDate must be a valid date.');
    }

    if (Number.isNaN(command.endDate.getTime())) {
      throw new InvalidTimeOffRequestError('endDate must be a valid date.');
    }

    if (command.endDate < command.startDate) {
      throw new InvalidTimeOffRequestError(
        'endDate must be greater than or equal to startDate.',
      );
    }
  }
}
