import { DomainError } from '@/shared/domain/errors/domain.error';

export class TimeOffRequestNotFoundError extends DomainError {
  constructor(requestId: string) {
    super(`Time-off request ${requestId} was not found.`);
  }
}
