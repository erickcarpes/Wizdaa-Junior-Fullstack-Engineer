import { TimeOffRequestStatus } from '@prisma/client';
import { DomainError } from '@/shared/domain/errors/domain.error';

export class CannotRejectTimeOffRequestError extends DomainError {
  constructor(requestId: string, status: TimeOffRequestStatus) {
    super(
      `Time-off request ${requestId} cannot be rejected from status ${status}.`,
    );
  }
}
