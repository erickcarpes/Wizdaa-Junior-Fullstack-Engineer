import { TimeOffRequestStatus } from '@prisma/client';
import { DomainError } from '@/shared/domain/errors/domain.error';

export class CannotCancelTimeOffRequestError extends DomainError {
  constructor(requestId: string, status: TimeOffRequestStatus) {
    super(
      `Time-off request ${requestId} cannot be cancelled from status ${status}.`,
    );
  }
}
