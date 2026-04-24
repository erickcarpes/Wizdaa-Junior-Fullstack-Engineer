import { DomainError } from '@/shared/domain/errors/domain.error';

export class InvalidTimeOffRequestError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
