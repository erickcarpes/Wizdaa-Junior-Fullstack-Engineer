import { TimeOffRequestStatus } from '@prisma/client';
import { DomainError } from '@/shared/domain/errors/domain.error';

export class CannotResolveHcmSubmissionError extends DomainError {
  constructor(requestId: string, status: TimeOffRequestStatus) {
    super(
      `Time-off request ${requestId} cannot resolve HCM submission from status ${status}.`,
    );
  }
}
