import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApproveTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/approve-time-off-request.use-case";
import { CancelTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/cancel-time-off-request.use-case";
import { CreateTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/create-time-off-request.use-case";
import { GetTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/get-time-off-request.use-case";
import { GetTimeOffRequestSyncEventsUseCase } from "@/modules/time-off-requests/application/use-cases/get-time-off-request-sync-events.use-case";
import { RejectTimeOffRequestUseCase } from "@/modules/time-off-requests/application/use-cases/reject-time-off-request.use-case";
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
  }

  @Get(":requestId")
  async getById(@Param("requestId") requestId: string) {
    const timeOffRequest = await this.getTimeOffRequestUseCase.execute(
      requestId,
    );

    return timeOffRequest.toJSON();
  }

  @Get(":requestId/sync-events")
  async getSyncEvents(@Param("requestId") requestId: string) {
    return await this.getTimeOffRequestSyncEventsUseCase.execute(requestId);
  }

  @Post(":requestId/approve")
  async approve(
    @Param("requestId") requestId: string,
    @Body() body: ApproveTimeOffRequestDto,
  ) {
    const timeOffRequest = await this.approveTimeOffRequestUseCase.execute({
      requestId,
      managerId: body?.managerId,
    });

    return timeOffRequest.toJSON();
  }

  @Post(":requestId/reject")
  async reject(
    @Param("requestId") requestId: string,
    @Body() body: RejectTimeOffRequestDto,
  ) {
    const timeOffRequest = await this.rejectTimeOffRequestUseCase.execute({
      requestId,
      reason: body.reason,
      managerId: body.managerId,
    });

    return timeOffRequest.toJSON();
  }

  @Post(":requestId/cancel")
  async cancel(
    @Param("requestId") requestId: string,
    @Body() body: CancelTimeOffRequestDto,
  ) {
    const timeOffRequest = await this.cancelTimeOffRequestUseCase.execute({
      requestId,
      reason: body.reason,
    });

    return timeOffRequest.toJSON();
  }
}
