import { Injectable, NotFoundException } from '@nestjs/common';

type MockHcmBalance = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

type SubmitMockTimeOffInput = {
  requestId: string;
  employeeId: string;
  locationId: string;
  daysRequested: number;
};

type ConfigureMockHcmSubmissionFailureInput = {
  employeeId: string;
  locationId: string;
  times: number;
  reason?: string;
};

type MockHcmSubmissionFailure = {
  remainingFailures: number;
  reason: string;
};

@Injectable()
export class MockHcmService {
  private readonly balances = new Map<string, MockHcmBalance>();
  private readonly submissionFailures = new Map<string, MockHcmSubmissionFailure>();

  upsertBalance(balance: MockHcmBalance) {
    this.balances.set(this.key(balance.employeeId, balance.locationId), balance);

    return balance;
  }

  getBalance(employeeId: string, locationId: string) {
    const balance = this.balances.get(this.key(employeeId, locationId));

    if (!balance) {
      throw new NotFoundException(
        `Mock HCM balance not found for employeeId=${employeeId} and locationId=${locationId}.`,
      );
    }

    return balance;
  }

  configureSubmissionFailure(input: ConfigureMockHcmSubmissionFailureInput) {
    const key = this.key(input.employeeId, input.locationId);

    this.submissionFailures.set(key, {
      remainingFailures: input.times,
      reason: input.reason ?? 'MOCK_HCM_TEMPORARY_UNAVAILABLE',
    });

    return {
      employeeId: input.employeeId,
      locationId: input.locationId,
      remainingFailures: input.times,
      reason: input.reason ?? 'MOCK_HCM_TEMPORARY_UNAVAILABLE',
    };
  }

  submitTimeOff(input: SubmitMockTimeOffInput) {
    const failureConfig = this.submissionFailures.get(
      this.key(input.employeeId, input.locationId),
    );

    if (failureConfig && failureConfig.remainingFailures > 0) {
      const nextFailures = failureConfig.remainingFailures - 1;

      if (nextFailures === 0) {
        this.submissionFailures.delete(this.key(input.employeeId, input.locationId));
      } else {
        this.submissionFailures.set(this.key(input.employeeId, input.locationId), {
          ...failureConfig,
          remainingFailures: nextFailures,
        });
      }

      throw new Error(failureConfig.reason);
    }

    const currentBalance = this.getBalance(input.employeeId, input.locationId);

    if (currentBalance.availableDays < input.daysRequested) {
      return {
        accepted: false as const,
        reason: 'INSUFFICIENT_BALANCE',
      };
    }

    const nextBalance = {
      ...currentBalance,
      availableDays: currentBalance.availableDays - input.daysRequested,
    };

    this.upsertBalance(nextBalance);

    return {
      accepted: true as const,
      hcmReferenceId: `mock-hcm-${input.requestId}`,
      balance: nextBalance,
    };
  }

  clear() {
    this.balances.clear();
    this.submissionFailures.clear();
  }

  private key(employeeId: string, locationId: string) {
    return `${employeeId}::${locationId}`;
  }
}
