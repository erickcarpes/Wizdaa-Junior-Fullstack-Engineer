import {
  HcmSyncDirection,
  HcmSyncEventStatus,
  HcmSyncEventType,
  LedgerEntryType,
  LedgerSource,
  TimeOffRequestStatus,
} from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/infrastructure/prisma/prisma.service";
import { BalanceProjectionNotFoundError } from "@/modules/balances/application/errors/balance-projection-not-found.error";
import { ConcurrentBalanceUpdateError } from "@/modules/time-off-requests/domain/errors/concurrent-balance-update.error";
import { InsufficientBalanceError } from "@/modules/time-off-requests/domain/errors/insufficient-balance.error";
import {
  CreatePendingApprovalTimeOffRequestCommand,
  TimeOffRequestRepository,
} from "@/modules/time-off-requests/domain/time-off-request.repository";
import { TimeOffRequestEntity } from "@/modules/time-off-requests/domain/time-off-request.entity";
import { TimeOffRequestMapper } from "@/modules/time-off-requests/infra/persistence/time-off-request.mapper";

@Injectable()
export class PrismaTimeOffRequestRepository implements TimeOffRequestRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findById(id: string) {
    const model = await this.prismaService.timeOffRequest.findUnique({
      where: { id },
    });

    return model ? TimeOffRequestMapper.toDomain(model) : null;
  }

  async createPendingApprovalWithReservation(
    command: CreatePendingApprovalTimeOffRequestCommand,
  ) {
    return this.prismaService.$transaction(async (tx) => {
      const balanceProjection = await tx.balanceProjection.findUnique({
        where: {
          employeeId_locationId: {
            employeeId: command.employeeId,
            locationId: command.locationId,
          },
        },
      });

      if (!balanceProjection) {
        throw new BalanceProjectionNotFoundError(
          command.employeeId,
          command.locationId,
        );
      }

      const displayAvailable =
        balanceProjection.availableDays - balanceProjection.reservedDays;

      if (displayAvailable < command.daysRequested) {
        throw new InsufficientBalanceError(
          command.daysRequested,
          displayAvailable,
        );
      }

      const updatedRows = await tx.balanceProjection.updateMany({
        where: {
          employeeId: command.employeeId,
          locationId: command.locationId,
          version: balanceProjection.version,
        },
        data: {
          reservedDays: {
            increment: command.daysRequested,
          },
          version: {
            increment: 1,
          },
        },
      });

      if (updatedRows.count === 0) {
        throw new ConcurrentBalanceUpdateError(
          command.employeeId,
          command.locationId,
        );
      }

      const createdTimeOffRequest = await tx.timeOffRequest.create({
        data: {
          employeeId: command.employeeId,
          locationId: command.locationId,
          daysRequested: command.daysRequested,
          startDate: command.startDate,
          endDate: command.endDate,
          reason: command.reason ?? null,
          requestedBy: command.requestedBy ?? null,
          status: TimeOffRequestStatus.PENDING_MANAGER_APPROVAL,
        },
      });

      await tx.balanceLedgerEntry.create({
        data: {
          employeeId: command.employeeId,
          locationId: command.locationId,
          timeOffRequestId: createdTimeOffRequest.id,
          entryType: LedgerEntryType.REQUEST_RESERVED,
          deltaDays: -command.daysRequested,
          source: LedgerSource.READYON,
          idempotencyKey: `request_reserved:${createdTimeOffRequest.id}`,
          metadata: JSON.stringify({
            requestId: createdTimeOffRequest.id,
            action: "reserve-balance",
          }),
        },
      });

      return TimeOffRequestMapper.toDomain(createdTimeOffRequest);
    });
  }

  async saveApproved(timeOffRequest: TimeOffRequestEntity) {
    return this.prismaService.$transaction(async (tx) => {
      const updatedRows = await tx.timeOffRequest.updateMany({
        where: {
          id: timeOffRequest.id,
          version: timeOffRequest.version,
        },
        data: {
          status: timeOffRequest.status,
          managerId: timeOffRequest.managerId,
          version: {
            increment: 1,
          },
        },
      });

      if (updatedRows.count === 0) {
        throw new ConcurrentBalanceUpdateError(
          timeOffRequest.employeeId,
          timeOffRequest.locationId,
        );
      }

      const refreshed = await tx.timeOffRequest.findUniqueOrThrow({
        where: {
          id: timeOffRequest.id,
        },
      });

      await tx.hcmSyncEvent.create({
        data: {
          timeOffRequestId: refreshed.id,
          direction: HcmSyncDirection.OUTBOUND,
          eventType: HcmSyncEventType.TIME_OFF_SUBMISSION,
          status: HcmSyncEventStatus.PENDING,
          correlationId: refreshed.id,
          idempotencyKey: `time-off-submission:${refreshed.id}`,
          payload: JSON.stringify({
            requestId: refreshed.id,
            employeeId: refreshed.employeeId,
            locationId: refreshed.locationId,
            daysRequested: refreshed.daysRequested,
            startDate: refreshed.startDate,
            endDate: refreshed.endDate,
            managerId: refreshed.managerId,
          }),
        },
      });

      return TimeOffRequestMapper.toDomain(refreshed);
    });
  }

  async saveRejected(timeOffRequest: TimeOffRequestEntity) {
    return this.prismaService.$transaction(async (tx) => {
      await tx.timeOffRequest.update({
        where: {
          id: timeOffRequest.id,
        },
        data: {
          status: timeOffRequest.status,
          managerId: timeOffRequest.managerId,
          rejectionReason: timeOffRequest.rejectionReason,
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceProjection.update({
        where: {
          employeeId_locationId: {
            employeeId: timeOffRequest.employeeId,
            locationId: timeOffRequest.locationId,
          },
        },
        data: {
          reservedDays: {
            decrement: timeOffRequest.daysRequested,
          },
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceLedgerEntry.create({
        data: {
          employeeId: timeOffRequest.employeeId,
          locationId: timeOffRequest.locationId,
          timeOffRequestId: timeOffRequest.id,
          entryType: LedgerEntryType.REQUEST_RELEASED,
          deltaDays: timeOffRequest.daysRequested,
          source: LedgerSource.READYON,
          idempotencyKey: `request_rejected:${timeOffRequest.id}`,
          metadata: JSON.stringify({
            requestId: timeOffRequest.id,
            action: "release-balance-after-manager-rejection",
            reason: timeOffRequest.rejectionReason,
          }),
        },
      });

      const refreshed = await tx.timeOffRequest.findUniqueOrThrow({
        where: {
          id: timeOffRequest.id,
        },
      });

      return TimeOffRequestMapper.toDomain(refreshed);
    });
  }

  async saveCancelled(timeOffRequest: TimeOffRequestEntity) {
    return this.prismaService.$transaction(async (tx) => {
      await tx.timeOffRequest.update({
        where: {
          id: timeOffRequest.id,
        },
        data: {
          status: timeOffRequest.status,
          rejectionReason: timeOffRequest.rejectionReason,
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceProjection.update({
        where: {
          employeeId_locationId: {
            employeeId: timeOffRequest.employeeId,
            locationId: timeOffRequest.locationId,
          },
        },
        data: {
          reservedDays: {
            decrement: timeOffRequest.daysRequested,
          },
          version: {
            increment: 1,
          },
        },
      });

      await tx.balanceLedgerEntry.create({
        data: {
          employeeId: timeOffRequest.employeeId,
          locationId: timeOffRequest.locationId,
          timeOffRequestId: timeOffRequest.id,
          entryType: LedgerEntryType.REQUEST_RELEASED,
          deltaDays: timeOffRequest.daysRequested,
          source: LedgerSource.READYON,
          idempotencyKey: `request_cancelled:${timeOffRequest.id}`,
          metadata: JSON.stringify({
            requestId: timeOffRequest.id,
            action: "release-balance-after-cancellation",
            reason: timeOffRequest.rejectionReason,
          }),
        },
      });

      await tx.hcmSyncEvent.updateMany({
        where: {
          timeOffRequestId: timeOffRequest.id,
          status: HcmSyncEventStatus.PENDING,
        },
        data: {
          status: HcmSyncEventStatus.IGNORED_STALE,
          lastError: "Request cancelled before submission.",
          processedAt: new Date(),
        },
      });

      const refreshed = await tx.timeOffRequest.findUniqueOrThrow({
        where: {
          id: timeOffRequest.id,
        },
      });

      return TimeOffRequestMapper.toDomain(refreshed);
    });
  }

  async listSyncEvents(requestId: string) {
    return this.prismaService.hcmSyncEvent.findMany({
      where: {
        timeOffRequestId: requestId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
