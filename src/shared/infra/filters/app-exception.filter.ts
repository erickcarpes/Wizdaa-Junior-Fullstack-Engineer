import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { BalanceProjectionNotFoundError } from "@/modules/balances/application/errors/balance-projection-not-found.error";
import { InvalidTimeOffRequestError } from "@/modules/time-off-requests/application/errors/invalid-time-off-request.error";
import { CannotApproveTimeOffRequestError } from "@/modules/time-off-requests/domain/errors/cannot-approve-time-off-request.error";
import { CannotCancelTimeOffRequestError } from "@/modules/time-off-requests/domain/errors/cannot-cancel-time-off-request.error";
import { CannotRejectTimeOffRequestError } from "@/modules/time-off-requests/domain/errors/cannot-reject-time-off-request.error";
import { CannotResolveHcmSubmissionError } from "@/modules/time-off-requests/domain/errors/cannot-resolve-hcm-submission.error";
import { CannotSubmitTimeOffRequestToHcmError } from "@/modules/time-off-requests/domain/errors/cannot-submit-time-off-request-to-hcm.error";
import { ConcurrentBalanceUpdateError } from "@/modules/time-off-requests/domain/errors/concurrent-balance-update.error";
import { InsufficientBalanceError } from "@/modules/time-off-requests/domain/errors/insufficient-balance.error";
import { TimeOffRequestNotFoundError } from "@/modules/time-off-requests/domain/errors/time-off-request-not-found.error";

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      response.status(status).json({
        statusCode: status,
        path: request.url,
        timestamp: new Date().toISOString(),
        ...(typeof payload === "string" ? { message: payload } : payload),
      });

      return;
    }

    const status = this.resolveStatus(exception);
    const message =
      exception instanceof Error ? exception.message : "Internal server error";

    response.status(status).json({
      statusCode: status,
      path: request.url,
      timestamp: new Date().toISOString(),
      message,
    });
  }

  private resolveStatus(exception: unknown) {
    if (
      exception instanceof TimeOffRequestNotFoundError ||
      exception instanceof BalanceProjectionNotFoundError
    ) {
      return HttpStatus.NOT_FOUND;
    }

    if (exception instanceof InvalidTimeOffRequestError) {
      return HttpStatus.BAD_REQUEST;
    }

    if (
      exception instanceof InsufficientBalanceError ||
      exception instanceof ConcurrentBalanceUpdateError ||
      exception instanceof CannotApproveTimeOffRequestError ||
      exception instanceof CannotRejectTimeOffRequestError ||
      exception instanceof CannotCancelTimeOffRequestError ||
      exception instanceof CannotSubmitTimeOffRequestToHcmError ||
      exception instanceof CannotResolveHcmSubmissionError
    ) {
      return HttpStatus.CONFLICT;
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
