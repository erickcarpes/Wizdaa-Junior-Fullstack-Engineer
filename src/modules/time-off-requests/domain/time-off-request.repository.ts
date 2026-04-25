import {
  HcmSyncDirection,
  HcmSyncEventStatus,
  HcmSyncEventType,
} from '@prisma/client';
import { TimeOffRequestEntity } from '@/modules/time-off-requests/domain/time-off-request.entity';

export type CreatePendingApprovalTimeOffRequestCommand = {
  employeeId: string;
  locationId: string;
  daysRequested: number;
  startDate: Date;
  endDate: Date;
  reason?: string;
  requestedBy?: string;
};

export type ApproveTimeOffRequestCommand = {
  requestId: string;
  managerId?: string;
};

export type RejectTimeOffRequestCommand = {
  requestId: string;
  reason: string;
  managerId?: string;
};

export type CancelTimeOffRequestCommand = {
  requestId: string;
  reason?: string;
};

export type TimeOffRequestSyncEventView = {
  id: string;
  timeOffRequestId: string | null;
  direction: HcmSyncDirection;
  eventType: HcmSyncEventType;
  status: HcmSyncEventStatus;
  correlationId: string;
  idempotencyKey: string;
  payload: string;
  error: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export abstract class TimeOffRequestRepository {
  abstract findById(id: string): Promise<TimeOffRequestEntity | null>;

  abstract createPendingApprovalWithReservation(
    command: CreatePendingApprovalTimeOffRequestCommand,
  ): Promise<TimeOffRequestEntity>;

  abstract saveApproved(
    timeOffRequest: TimeOffRequestEntity,
  ): Promise<TimeOffRequestEntity>;

  abstract saveRejected(
    timeOffRequest: TimeOffRequestEntity,
  ): Promise<TimeOffRequestEntity>;

  abstract saveCancelled(
    timeOffRequest: TimeOffRequestEntity,
  ): Promise<TimeOffRequestEntity>;

  abstract listSyncEvents(
    requestId: string,
  ): Promise<TimeOffRequestSyncEventView[]>;
}
