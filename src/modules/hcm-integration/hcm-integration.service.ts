import {
  HcmSyncDirection,
  HcmSyncEventStatus,
  HcmSyncEventType,
  LedgerEntryType,
  LedgerSource,
  TimeOffRequestStatus,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';
import { TimeOffRequestMapper } from '@/modules/time-off-requests/infra/persistence/time-off-request.mapper';

@Injectable()
export class HcmIntegrationService {
  private static readonly MAX_SUBMISSION_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MINUTES = 2;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mockHcmService: MockHcmService,
  ) {}

  async ingestBatchBalances(input: {
    batchId: string;
    snapshotAt: Date;
    balances: Array<{
      employeeId: string;
      locationId: string;
      availableDays: number;
      hcmVersion?: string;
    }>;
  }) {
    const existingEvent = await this.prismaService.hcmSyncEvent.findUnique({
      where: {
        direction_eventType_idempotencyKey: {
          direction: HcmSyncDirection.INBOUND,
          eventType: HcmSyncEventType.BATCH_BALANCE_SYNC,
          idempotencyKey: `batch-balance-sync:${input.batchId}`,
        },
      },
    });

    if (existingEvent) {
      return {
        batchId: input.batchId,
        status: 'ALREADY_PROCESSED',
      };
    }

    return this.prismaService.$transaction(async (tx) => {
      await tx.hcmSyncEvent.create({
        data: {
          direction: HcmSyncDirection.INBOUND,
          eventType: HcmSyncEventType.BATCH_BALANCE_SYNC,
          status: HcmSyncEventStatus.PENDING,
          correlationId: input.batchId,
          idempotencyKey: `batch-balance-sync:${input.batchId}`,
          payload: JSON.stringify({
            batchId: input.batchId,
            snapshotAt: input.snapshotAt.toISOString(),
            balances: input.balances,
          }),
        },
      });

      const applied: Array<{
        employeeId: string;
        locationId: string;
        action: 'CREATED' | 'UPDATED';
      }> = [];
      const ignored: Array<{
        employeeId: string;
        locationId: string;
        reason: 'STALE_SNAPSHOT';
      }> = [];

      for (const row of input.balances) {
        const currentProjection = await tx.balanceProjection.findUnique({
          where: {
            employeeId_locationId: {
              employeeId: row.employeeId,
              locationId: row.locationId,
            },
          },
        });

        if (
          currentProjection?.lastHcmSnapshotAt &&
          currentProjection.lastHcmSnapshotAt > input.snapshotAt
        ) {
          ignored.push({
            employeeId: row.employeeId,
            locationId: row.locationId,
            reason: 'STALE_SNAPSHOT',
          });
          continue;
        }

        const nextHcmVersion =
          row.hcmVersion ?? `${input.batchId}:${row.employeeId}:${row.locationId}`;
        const isUpdate = Boolean(currentProjection);
        const availableDaysChanged =
          currentProjection?.availableDays !== row.availableDays;

        await tx.balanceProjection.upsert({
          where: {
            employeeId_locationId: {
              employeeId: row.employeeId,
              locationId: row.locationId,
            },
          },
          create: {
            employeeId: row.employeeId,
            locationId: row.locationId,
            availableDays: row.availableDays,
            reservedDays: 0,
            syncStatus: 'IN_SYNC',
            lastHcmVersion: nextHcmVersion,
            lastHcmSnapshotAt: input.snapshotAt,
          },
          update: {
            availableDays: row.availableDays,
            syncStatus: 'IN_SYNC',
            lastHcmVersion: nextHcmVersion,
            lastHcmSnapshotAt: input.snapshotAt,
            version: {
              increment: 1,
            },
          },
        });

        if (availableDaysChanged) {
          await tx.balanceLedgerEntry.create({
            data: {
              employeeId: row.employeeId,
              locationId: row.locationId,
              entryType: LedgerEntryType.HCM_SNAPSHOT_REPLACED,
              deltaDays:
                row.availableDays - (currentProjection?.availableDays ?? 0),
              source: LedgerSource.HCM_BATCH,
              idempotencyKey: `hcm_snapshot_replaced:${input.batchId}:${row.employeeId}:${row.locationId}`,
              metadata: JSON.stringify({
                batchId: input.batchId,
                snapshotAt: input.snapshotAt.toISOString(),
                previousAvailableDays: currentProjection?.availableDays ?? null,
                nextAvailableDays: row.availableDays,
              }),
            },
          });
        }

        applied.push({
          employeeId: row.employeeId,
          locationId: row.locationId,
          action: isUpdate ? 'UPDATED' : 'CREATED',
        });
      }

      await tx.hcmSyncEvent.update({
        where: {
          direction_eventType_idempotencyKey: {
            direction: HcmSyncDirection.INBOUND,
            eventType: HcmSyncEventType.BATCH_BALANCE_SYNC,
            idempotencyKey: `batch-balance-sync:${input.batchId}`,
          },
        },
        data: {
          status: HcmSyncEventStatus.PROCESSED,
          processedAt: new Date(),
        },
      });

      return {
        batchId: input.batchId,
        snapshotAt: input.snapshotAt.toISOString(),
        appliedCount: applied.length,
        ignoredCount: ignored.length,
        applied,
        ignored,
      };
    });
  }

  async refreshBalance(employeeId: string, locationId: string) {
    return {
      employeeId,
      locationId,
      source: 'mock-hcm',
      status: 'NOT_IMPLEMENTED',
    };
  }

  async submitTimeOff(requestId: string) {
    return {
      requestId,
      status: 'NOT_IMPLEMENTED',
    };
  }

  async processPendingTimeOffSubmissions() {
    const pendingEvents = await this.prismaService.hcmSyncEvent.findMany({
      where: {
        eventType: 'TIME_OFF_SUBMISSION',
        status: {
          in: [HcmSyncEventStatus.PENDING, HcmSyncEventStatus.UNCERTAIN],
        },
        OR: [
          {
            nextAttemptAt: null,
          },
          {
            nextAttemptAt: {
              lte: new Date(),
            },
          },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const processedEvents = [];

    for (const event of pendingEvents) {
      const submissionContext = await this.prepareSubmission(event.id);

      if (!submissionContext) {
        continue;
      }

      try {
        const hcmResult = this.mockHcmService.submitTimeOff({
          requestId: submissionContext.requestId,
          employeeId: submissionContext.employeeId,
          locationId: submissionContext.locationId,
          daysRequested: submissionContext.daysRequested,
        });

        if (!hcmResult.accepted) {
          processedEvents.push(
            await this.rejectSubmission(submissionContext, hcmResult.reason),
          );
          continue;
        }

        processedEvents.push(
          await this.confirmSubmission(
            submissionContext,
            hcmResult.hcmReferenceId,
            hcmResult.balance.availableDays,
          ),
        );
      } catch (error) {
        processedEvents.push(
          await this.scheduleSubmissionRetry(submissionContext, error),
        );
      }
    }

    return {
      processedCount: processedEvents.length,
      processedEvents,
    };
  }

  private async prepareSubmission(eventId: string) {
    return this.prismaService.$transaction(async (tx) => {
      const currentEvent = await tx.hcmSyncEvent.findUniqueOrThrow({
        where: {
          id: eventId,
        },
      });

      if (!currentEvent.timeOffRequestId) {
        await tx.hcmSyncEvent.update({
          where: {
            id: currentEvent.id,
          },
          data: {
            status: HcmSyncEventStatus.FAILED,
            error: 'Missing timeOffRequestId.',
            lastError: 'Missing timeOffRequestId.',
            processedAt: new Date(),
          },
        });

        return null;
      }

      const requestModel = await tx.timeOffRequest.findUniqueOrThrow({
        where: {
          id: currentEvent.timeOffRequestId,
        },
      });

      const timeOffRequest = TimeOffRequestMapper.toDomain(requestModel);

      if (timeOffRequest.status === TimeOffRequestStatus.APPROVED) {
        timeOffRequest.markAsSubmittedToHcm();

        await tx.timeOffRequest.update({
          where: {
            id: timeOffRequest.id,
          },
          data: {
            status: timeOffRequest.status,
            hcmSubmissionStatus: timeOffRequest.hcmSubmissionStatus,
            version: {
              increment: 1,
            },
          },
        });
      } else if (
        timeOffRequest.status !== TimeOffRequestStatus.SUBMITTED_TO_HCM
      ) {
        await tx.hcmSyncEvent.update({
          where: {
            id: currentEvent.id,
          },
          data: {
            status: HcmSyncEventStatus.IGNORED_STALE,
            lastError: `Request is no longer submittable. Current status=${timeOffRequest.status}.`,
            processedAt: new Date(),
          },
        });

        return null;
      }

      return {
        eventId: currentEvent.id,
        requestId: timeOffRequest.id,
        employeeId: timeOffRequest.employeeId,
        locationId: timeOffRequest.locationId,
        daysRequested: timeOffRequest.daysRequested,
      };
    });
  }

  private async scheduleSubmissionRetry(
    submissionContext: {
      eventId: string;
      requestId: string;
    },
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : 'UNKNOWN_HCM_SUBMISSION_ERROR';

    return this.prismaService.$transaction(async (tx) => {
      const currentEvent = await tx.hcmSyncEvent.findUniqueOrThrow({
        where: {
          id: submissionContext.eventId,
        },
      });

      const nextAttempts = currentEvent.attempts + 1;
      const retryAt = this.buildNextAttemptAt(nextAttempts);
      const hasRemainingAttempts =
        nextAttempts < HcmIntegrationService.MAX_SUBMISSION_ATTEMPTS;

      return tx.hcmSyncEvent.update({
        where: {
          id: submissionContext.eventId,
        },
        data: {
          status: HcmSyncEventStatus.UNCERTAIN,
          attempts: {
            increment: 1,
          },
          error: hasRemainingAttempts ? null : message,
          lastError: message,
          nextAttemptAt: hasRemainingAttempts ? retryAt : null,
          processedAt: hasRemainingAttempts ? null : new Date(),
        },
      });
    });
  }

  private async rejectSubmission(
    submissionContext: {
      eventId: string;
      requestId: string;
      employeeId: string;
      locationId: string;
      daysRequested: number;
    },
    reason: string,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      const requestModel = await tx.timeOffRequest.findUniqueOrThrow({
        where: {
          id: submissionContext.requestId,
        },
      });

      const timeOffRequest = TimeOffRequestMapper.toDomain(requestModel);
      timeOffRequest.rejectByHcm(reason);

      await tx.timeOffRequest.update({
        where: {
          id: timeOffRequest.id,
        },
        data: {
          status: timeOffRequest.status,
          hcmSubmissionStatus: timeOffRequest.hcmSubmissionStatus,
          rejectionReason: timeOffRequest.rejectionReason,
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceProjection.update({
        where: {
          employeeId_locationId: {
            employeeId: submissionContext.employeeId,
            locationId: submissionContext.locationId,
          },
        },
        data: {
          reservedDays: {
            decrement: submissionContext.daysRequested,
          },
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceLedgerEntry.create({
        data: {
          employeeId: submissionContext.employeeId,
          locationId: submissionContext.locationId,
          timeOffRequestId: submissionContext.requestId,
          entryType: LedgerEntryType.REQUEST_RELEASED,
          deltaDays: submissionContext.daysRequested,
          source: LedgerSource.SYSTEM_RECONCILIATION,
          idempotencyKey: `request_released:${submissionContext.requestId}`,
          metadata: JSON.stringify({
            requestId: submissionContext.requestId,
            action: 'release-balance-after-hcm-rejection',
            reason,
          }),
        },
      });

      return tx.hcmSyncEvent.update({
        where: {
          id: submissionContext.eventId,
        },
        data: {
          status: HcmSyncEventStatus.FAILED,
          error: reason,
          lastError: reason,
          nextAttemptAt: null,
          processedAt: new Date(),
        },
      });
    });
  }

  private async confirmSubmission(
    submissionContext: {
      eventId: string;
      requestId: string;
      employeeId: string;
      locationId: string;
      daysRequested: number;
    },
    hcmReferenceId: string,
    nextAvailableDays: number,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      const requestModel = await tx.timeOffRequest.findUniqueOrThrow({
        where: {
          id: submissionContext.requestId,
        },
      });

      const timeOffRequest = TimeOffRequestMapper.toDomain(requestModel);
      timeOffRequest.confirmByHcm(hcmReferenceId);

      await tx.timeOffRequest.update({
        where: {
          id: timeOffRequest.id,
        },
        data: {
          status: timeOffRequest.status,
          hcmSubmissionStatus: timeOffRequest.hcmSubmissionStatus,
          hcmReferenceId: timeOffRequest.hcmReferenceId,
          rejectionReason: null,
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceProjection.update({
        where: {
          employeeId_locationId: {
            employeeId: submissionContext.employeeId,
            locationId: submissionContext.locationId,
          },
        },
        data: {
          availableDays: nextAvailableDays,
          reservedDays: {
            decrement: submissionContext.daysRequested,
          },
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceLedgerEntry.create({
        data: {
          employeeId: submissionContext.employeeId,
          locationId: submissionContext.locationId,
          timeOffRequestId: submissionContext.requestId,
          entryType: LedgerEntryType.REQUEST_CONFIRMED,
          deltaDays: -submissionContext.daysRequested,
          source: LedgerSource.HCM_REALTIME,
          idempotencyKey: `request_confirmed:${submissionContext.requestId}`,
          metadata: JSON.stringify({
            requestId: submissionContext.requestId,
            action: 'confirm-request-after-hcm-acceptance',
            hcmReferenceId,
          }),
        },
      });

      return tx.hcmSyncEvent.update({
        where: {
          id: submissionContext.eventId,
        },
        data: {
          status: HcmSyncEventStatus.PROCESSED,
          error: null,
          lastError: null,
          nextAttemptAt: null,
          processedAt: new Date(),
        },
      });
    });
  }

  private buildNextAttemptAt(nextAttempts: number) {
    const minutes =
      nextAttempts * HcmIntegrationService.RETRY_DELAY_MINUTES;

    return new Date(Date.now() + minutes * 60 * 1000);
  }
}
