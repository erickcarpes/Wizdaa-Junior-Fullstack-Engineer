import { HcmSubmissionStatus, TimeOffRequestStatus } from '@prisma/client';
import { CannotApproveTimeOffRequestError } from '@/modules/time-off-requests/domain/errors/cannot-approve-time-off-request.error';
import { CannotCancelTimeOffRequestError } from '@/modules/time-off-requests/domain/errors/cannot-cancel-time-off-request.error';
import { CannotRejectTimeOffRequestError } from '@/modules/time-off-requests/domain/errors/cannot-reject-time-off-request.error';
import { CannotSubmitTimeOffRequestToHcmError } from '@/modules/time-off-requests/domain/errors/cannot-submit-time-off-request-to-hcm.error';
import { CannotResolveHcmSubmissionError } from '@/modules/time-off-requests/domain/errors/cannot-resolve-hcm-submission.error';

export type TimeOffRequestProps = {
  id: string;
  employeeId: string;
  locationId: string;
  daysRequested: number;
  startDate: Date;
  endDate: Date;
  reason: string | null;
  status: TimeOffRequestStatus;
  managerId: string | null;
  requestedBy: string | null;
  hcmReferenceId: string | null;
  hcmSubmissionStatus: HcmSubmissionStatus;
  rejectionReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export class TimeOffRequestEntity {
  constructor(private readonly props: TimeOffRequestProps) {}

  get id() {
    return this.props.id;
  }

  get employeeId() {
    return this.props.employeeId;
  }

  get locationId() {
    return this.props.locationId;
  }

  get daysRequested() {
    return this.props.daysRequested;
  }

  get startDate() {
    return this.props.startDate;
  }

  get endDate() {
    return this.props.endDate;
  }

  get reason() {
    return this.props.reason;
  }

  get status() {
    return this.props.status;
  }

  get managerId() {
    return this.props.managerId;
  }

  get requestedBy() {
    return this.props.requestedBy;
  }

  get hcmReferenceId() {
    return this.props.hcmReferenceId;
  }

  get hcmSubmissionStatus() {
    return this.props.hcmSubmissionStatus;
  }

  get rejectionReason() {
    return this.props.rejectionReason;
  }

  get version() {
    return this.props.version;
  }

  get createdAt() {
    return this.props.createdAt;
  }

  get updatedAt() {
    return this.props.updatedAt;
  }

  approve(managerId?: string | null) {
    if (this.props.status !== TimeOffRequestStatus.PENDING_MANAGER_APPROVAL) {
      throw new CannotApproveTimeOffRequestError(this.props.id, this.props.status);
    }

    this.props.status = TimeOffRequestStatus.APPROVED;
    this.props.managerId = managerId ?? this.props.managerId;
  }

  reject(reason: string, managerId?: string | null) {
    if (this.props.status !== TimeOffRequestStatus.PENDING_MANAGER_APPROVAL) {
      throw new CannotRejectTimeOffRequestError(this.props.id, this.props.status);
    }

    this.props.status = TimeOffRequestStatus.REJECTED;
    this.props.rejectionReason = reason;
    this.props.managerId = managerId ?? this.props.managerId;
  }

  cancel(reason?: string | null) {
    if (
      this.props.status !== TimeOffRequestStatus.PENDING_MANAGER_APPROVAL &&
      this.props.status !== TimeOffRequestStatus.APPROVED
    ) {
      throw new CannotCancelTimeOffRequestError(this.props.id, this.props.status);
    }

    this.props.status = TimeOffRequestStatus.CANCELLED;
    this.props.rejectionReason = reason ?? this.props.rejectionReason;
  }

  markAsSubmittedToHcm() {
    if (this.props.status !== TimeOffRequestStatus.APPROVED) {
      throw new CannotSubmitTimeOffRequestToHcmError(
        this.props.id,
        this.props.status,
      );
    }

    this.props.status = TimeOffRequestStatus.SUBMITTED_TO_HCM;
    this.props.hcmSubmissionStatus = HcmSubmissionStatus.PENDING_CONFIRMATION;
  }

  confirmByHcm(hcmReferenceId: string) {
    if (this.props.status !== TimeOffRequestStatus.SUBMITTED_TO_HCM) {
      throw new CannotResolveHcmSubmissionError(
        this.props.id,
        this.props.status,
      );
    }

    this.props.status = TimeOffRequestStatus.CONFIRMED_BY_HCM;
    this.props.hcmSubmissionStatus = HcmSubmissionStatus.CONFIRMED;
    this.props.hcmReferenceId = hcmReferenceId;
    this.props.rejectionReason = null;
  }

  rejectByHcm(reason: string) {
    if (this.props.status !== TimeOffRequestStatus.SUBMITTED_TO_HCM) {
      throw new CannotResolveHcmSubmissionError(
        this.props.id,
        this.props.status,
      );
    }

    this.props.status = TimeOffRequestStatus.FAILED_HCM_VALIDATION;
    this.props.hcmSubmissionStatus = HcmSubmissionStatus.REJECTED;
    this.props.rejectionReason = reason;
  }

  moveToConflictReview(reason: string) {
    if (this.props.status !== TimeOffRequestStatus.SUBMITTED_TO_HCM) {
      throw new CannotResolveHcmSubmissionError(
        this.props.id,
        this.props.status,
      );
    }

    this.props.status = TimeOffRequestStatus.CONFLICT_REVIEW;
    this.props.hcmSubmissionStatus = HcmSubmissionStatus.UNKNOWN;
    this.props.rejectionReason = reason;
  }

  toJSON() {
    return { ...this.props };
  }
}
