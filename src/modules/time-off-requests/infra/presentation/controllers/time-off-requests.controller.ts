import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { BalanceProjectionNotFoundError } from "@/modules/balances/application/errors/balance-projection-not-found.error";
import { InvalidTimeOffRequestError } from "@/modules/time-off-requests/application/errors/invalid-time-off-request.error";
import { ApproveTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/approve-time-off-request.use-case";
import { CancelTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/cancel-time-off-request.use-case";
import { CreateTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/create-time-off-request.use-case";
import { GetTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/get-time-off-request.use-case";
import { GetTimeOffRequestSyncEventsUseCase } from "@/modules/time-off-requests/application/use-cases/get-time-off-request-sync-events.use-case";
import { RejectTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/reject-time-off-request.use-case";
import { CannotApproveTimeOffRequestError } from "@/modules/time-off-requests/domain/errors/cannot-approve-time-off-request.error";
import { CannotCancelTimeOffRequestError } from "@/modules/time-off-requests/domain/errors/cannot-cancel-time-off-request.error";
import { CannotRejectTimeOffRequestError } from "@/modules/time-off-requests/domain/errors/cannot-reject-time-off-request.error";
import { ConcurrentBalanceUpdateError } from "@/modules/time-off-requests/domain/errors/concurrent-balance-update.error";
import { InsufficientBalanceError } from "@/modules/time-off-requests/domain/errors/insufficient-balance.error";
import { TimeOffRequestNotFoundError } from "@/modules/time-off-requests/domain/errors/time-off-request-not-found.error";
import { ApproveTimeOffRequestDto } from "@/modules/time-off-requests/infra/presentation/dtos/approve-time-off-request.dto";
import { CancelTimeOffRequestDto } from "@/modules/time-off-requests/infra/presentation/dtos/cancel-time-off-request.dto";
import { CreateTimeOffRequestDto } from "@/modules/time-off-requests/infra/presentation/dtos/create-time-off-request.dto";
import { RejectTimeOffRequestDto } from "@/modules/time-off-requests/infra/presentation/dtos/reject-time-off-request.dto";

@Controller("time-off-requests")
export class TimeOffRequestsController {
  constructor(
    private readonly approveTimeOffRequestUseCase: ApproveTimeOffRequestUseCase,
    private readonly cancelTimeOffRequestUseCase: CancelTimeOffRequestUseCase,
    private readonly createTimeOffRequestUseCase: CreateTimeOffRequestUseCase,
    private readonly getTimeOffRequestUseCase: GetTimeOffRequestUseCase,
    private readonly getTimeOffRequestSyncEventsUseCase: GetTimeOffRequestSyncEventsUseCase,
    private readonly rejectTimeOffRequestUseCase: RejectTimeOffRequestUseCase,
  ) {}

  @Post()
  async create(@Body() body: CreateTimeOffRequestDto) {
    try {
      const timeOffRequest = await this.createTimeOffRequestUseCase.execute({
        employeeId: body.employeeId,
        locationId: body.locationId,
        daysRequested: Number(body.daysRequested),
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        reason: body.reason,
        requestedBy: body.requestedBy,
      });

      return timeOffRequest.toJSON();
    } catch (error) {
      if (error instanceof InvalidTimeOffRequestError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof BalanceProjectionNotFoundError) {
        throw new NotFoundException(error.message);
      }

      if (error instanceof InsufficientBalanceError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof ConcurrentBalanceUpdateError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  @Get(":requestId")
  async getById(@Param("requestId") requestId: string) {
    try {
      const timeOffRequest =
        await this.getTimeOffRequestUseCase.execute(requestId);

      return timeOffRequest.toJSON();
    } catch (error) {
      if (error instanceof TimeOffRequestNotFoundError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }

  @Get(":requestId/sync-events")
  async getSyncEvents(@Param("requestId") requestId: string) {
    try {
      return await this.getTimeOffRequestSyncEventsUseCase.execute(requestId);
    } catch (error) {
      if (error instanceof TimeOffRequestNotFoundError) {
        throw new NotFoundException(error.message);
      }

      throw error;
    }
  }

  @Post(":requestId/approve")
  async approve(
    @Param("requestId") requestId: string,
    @Body() body: ApproveTimeOffRequestDto,
  ) {
    try {
      const timeOffRequest = await this.approveTimeOffRequestUseCase.execute({
        requestId,
        managerId: body?.managerId,
      });

      return timeOffRequest.toJSON();
    } catch (error) {
      if (error instanceof TimeOffRequestNotFoundError) {
        throw new NotFoundException(error.message);
      }

      if (error instanceof CannotApproveTimeOffRequestError) {
        throw new ConflictException(error.message);
      }

      if (error instanceof ConcurrentBalanceUpdateError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  @Post(":requestId/reject")
  async reject(
    @Param("requestId") requestId: string,
    @Body() body: RejectTimeOffRequestDto,
  ) {
    try {
      const timeOffRequest = await this.rejectTimeOffRequestUseCase.execute({
        requestId,
        reason: body.reason,
        managerId: body.managerId,
      });

      return timeOffRequest.toJSON();
    } catch (error) {
      if (error instanceof TimeOffRequestNotFoundError) {
        throw new NotFoundException(error.message);
      }

      if (error instanceof CannotRejectTimeOffRequestError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }

  @Post(":requestId/cancel")
  async cancel(
    @Param("requestId") requestId: string,
    @Body() body: CancelTimeOffRequestDto,
  ) {
    try {
      const timeOffRequest = await this.cancelTimeOffRequestUseCase.execute({
        requestId,
        reason: body.reason,
      });

      return timeOffRequest.toJSON();
    } catch (error) {
      if (error instanceof TimeOffRequestNotFoundError) {
        throw new NotFoundException(error.message);
      }

      if (error instanceof CannotCancelTimeOffRequestError) {
        throw new ConflictException(error.message);
      }

      throw error;
    }
  }
}
