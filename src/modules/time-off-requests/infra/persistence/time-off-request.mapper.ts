import { TimeOffRequest } from '@prisma/client';
import {
  TimeOffRequestEntity,
  TimeOffRequestProps,
} from '@/modules/time-off-requests/domain/time-off-request.entity';

export class TimeOffRequestMapper {
  static toDomain(model: TimeOffRequest): TimeOffRequestEntity {
    const props: TimeOffRequestProps = {
      id: model.id,
      employeeId: model.employeeId,
      locationId: model.locationId,
      daysRequested: model.daysRequested,
      startDate: model.startDate,
      endDate: model.endDate,
      reason: model.reason,
      status: model.status,
      managerId: model.managerId,
      requestedBy: model.requestedBy,
      hcmReferenceId: model.hcmReferenceId,
      hcmSubmissionStatus: model.hcmSubmissionStatus,
      rejectionReason: model.rejectionReason,
      version: model.version,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    };

    return new TimeOffRequestEntity(props);
  }
}
