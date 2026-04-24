import {
  BalanceSyncStatus,
  HcmSyncEventStatus,
  TimeOffRequestStatus,
} from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';
import { TimeOffRequestMapper } from '@/modules/time-off-requests/infra/persistence/time-off-request.mapper';

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly mockHcmService: MockHcmService,
  ) {}

  async reconcileEmployeeBalance(employeeId: string, locationId: string) {
    const hcmBalance = this.mockHcmService.getBalance(employeeId, locationId);

    const balanceProjection = await this.prismaService.balanceProjection.upsert({
      where: {
        employeeId_locationId: {
          employeeId,
          locationId,
        },
      },
      create: {
        employeeId,
        locationId,
        availableDays: hcmBalance.availableDays,
        reservedDays: 0,
        syncStatus: BalanceSyncStatus.IN_SYNC,
        lastHcmVersion: `reconciliation:${Date.now()}`,
        lastHcmSnapshotAt: new Date(),
      },
      update: {
        availableDays: hcmBalance.availableDays,
        syncStatus: BalanceSyncStatus.IN_SYNC,
        lastHcmVersion: `reconciliation:${Date.now()}`,
        lastHcmSnapshotAt: new Date(),
        version: {
          increment: 1,
        },
      },
    });

    const pendingRequests = await this.prismaService.timeOffRequest.findMany({
      where: {
        employeeId,
        locationId,
        status: TimeOffRequestStatus.SUBMITTED_TO_HCM,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const resolvedRequests = [];

    for (const requestModel of pendingRequests) {
      const acceptedSubmission = this.mockHcmService.getAcceptedSubmission(
        requestModel.id,
      );

      if (acceptedSubmission) {
        const resolved = await this.prismaService.$transaction(async (tx) => {
          const request = TimeOffRequestMapper.toDomain(requestModel);
          request.confirmByHcm(acceptedSubmission.hcmReferenceId);

          await tx.timeOffRequest.update({
            where: {
              id: request.id,
            },
            data: {
              status: request.status,
              hcmSubmissionStatus: request.hcmSubmissionStatus,
              hcmReferenceId: request.hcmReferenceId,
              rejectionReason: null,
              version: {
                increment: 1,
              },
            },
          });

          await tx.hcmSyncEvent.updateMany({
            where: {
              timeOffRequestId: request.id,
              status: HcmSyncEventStatus.UNCERTAIN,
            },
            data: {
              status: HcmSyncEventStatus.PROCESSED,
              error: null,
              lastError: null,
              nextAttemptAt: null,
              processedAt: new Date(),
            },
          });

          return {
            requestId: request.id,
            status: request.status,
            resolution: 'CONFIRMED_FROM_HCM',
          };
        });

        resolvedRequests.push(resolved);
        continue;
      }

      const uncertainEvent = await this.prismaService.hcmSyncEvent.findFirst({
        where: {
          timeOffRequestId: requestModel.id,
          status: HcmSyncEventStatus.UNCERTAIN,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (uncertainEvent?.nextAttemptAt === null) {
        const resolved = await this.prismaService.$transaction(async (tx) => {
          const request = TimeOffRequestMapper.toDomain(requestModel);
          request.moveToConflictReview(
            'HCM submission outcome remained uncertain after retries.',
          );

          await tx.timeOffRequest.update({
            where: {
              id: request.id,
            },
            data: {
              status: request.status,
              hcmSubmissionStatus: request.hcmSubmissionStatus,
              rejectionReason: request.rejectionReason,
              version: {
                increment: 1,
              },
            },
          });

          await tx.balanceProjection.update({
            where: {
              employeeId_locationId: {
                employeeId,
                locationId,
              },
            },
            data: {
              syncStatus: BalanceSyncStatus.CONFLICT,
              version: {
                increment: 1,
              },
            },
          });

          return {
            requestId: request.id,
            status: request.status,
            resolution: 'MOVED_TO_CONFLICT_REVIEW',
          };
        });

        resolvedRequests.push(resolved);
      }
    }

    return {
      employeeId,
      locationId,
      balanceSyncStatus: balanceProjection.syncStatus,
      availableDays: hcmBalance.availableDays,
      resolvedCount: resolvedRequests.length,
      resolvedRequests,
    };
  }
}
