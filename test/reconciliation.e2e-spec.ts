import request from 'supertest';
import {
  closeE2eTestContext,
  createE2eTestContext,
  E2eTestContext,
  resetE2eState,
} from './e2e-test-context';

describe('Reconciliation module', () => {
  let context: E2eTestContext;

  beforeAll(async () => {
    context = await createE2eTestContext();
  });

  beforeEach(async () => {
    await resetE2eState(context);
  });

  afterAll(async () => {
    await closeE2eTestContext(context);
  });

  it('moves an exhausted uncertain submission to conflict review during reconciliation', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-reconcile-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/submission-failures')
      .send({
        employeeId: 'emp-reconcile-1',
        locationId: 'loc-a',
        times: 3,
        reason: 'MOCK_HCM_TEMPORARY_UNAVAILABLE',
      })
      .expect(201);

    await request(context.app.getHttpServer())
      .post('/balances/emp-reconcile-1/refresh')
      .query({ locationId: 'loc-a' })
      .expect(201);

    const created = await request(context.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp-reconcile-1',
        locationId: 'loc-a',
        daysRequested: 2,
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-02T00:00:00.000Z',
        reason: 'Reconciliation scenario',
        requestedBy: 'employee-user-7',
      })
      .expect(201);

    await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({
        managerId: 'manager-6',
      })
      .expect(201);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(context.app.getHttpServer())
        .post('/hcm-sync/process-pending')
        .expect(201);

      if (attempt < 2) {
        await context.prismaService.hcmSyncEvent.updateMany({
          where: {
            timeOffRequestId: created.body.id,
            status: 'UNCERTAIN',
          },
          data: {
            nextAttemptAt: new Date(Date.now() - 1000),
          },
        });
      }
    }

    const eventAfterRetries =
      await context.prismaService.hcmSyncEvent.findFirstOrThrow({
        where: {
          timeOffRequestId: created.body.id,
        },
      });

    expect(eventAfterRetries.status).toBe('UNCERTAIN');
    expect(eventAfterRetries.nextAttemptAt).toBeNull();

    const reconciliationResponse = await request(context.app.getHttpServer())
      .post('/reconciliation/emp-reconcile-1')
      .query({ locationId: 'loc-a' })
      .expect(201);

    expect(reconciliationResponse.body.resolvedCount).toBe(1);
    expect(reconciliationResponse.body.resolvedRequests[0].resolution).toBe(
      'MOVED_TO_CONFLICT_REVIEW',
    );

    const requestAfterReconciliation =
      await context.prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.body.id,
        },
      });

    expect(requestAfterReconciliation.status).toBe('CONFLICT_REVIEW');
    expect(requestAfterReconciliation.hcmSubmissionStatus).toBe('UNKNOWN');

    const projectionAfterReconciliation =
      await context.prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-reconcile-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projectionAfterReconciliation.syncStatus).toBe('CONFLICT');
  });

  it('confirms a submitted request during reconciliation when HCM already accepted it', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-reconcile-success-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-reconcile-success-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2,
        syncStatus: 'IN_SYNC',
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-reconcile-success-1',
        locationId: 'loc-a',
        daysRequested: 2,
        startDate: new Date('2026-08-10T00:00:00.000Z'),
        endDate: new Date('2026-08-11T00:00:00.000Z'),
        status: 'SUBMITTED_TO_HCM',
        hcmSubmissionStatus: 'PENDING_CONFIRMATION',
        managerId: 'manager-reconcile',
      },
    });

    await context.prismaService.hcmSyncEvent.create({
      data: {
        timeOffRequestId: created.id,
        direction: 'OUTBOUND',
        eventType: 'TIME_OFF_SUBMISSION',
        status: 'UNCERTAIN',
        correlationId: created.id,
        idempotencyKey: `time-off-submission:${created.id}`,
        payload: JSON.stringify({
          requestId: created.id,
        }),
        attempts: 1,
        nextAttemptAt: new Date(Date.now() + 60_000),
        lastError: 'TEMPORARY_FAILURE',
      },
    });

    await context.mockHcmService.submitTimeOff({
      requestId: created.id,
      employeeId: 'emp-reconcile-success-1',
      locationId: 'loc-a',
      daysRequested: 2,
    });

    const response = await request(context.app.getHttpServer())
      .post('/reconciliation/emp-reconcile-success-1')
      .query({ locationId: 'loc-a' })
      .expect(201);

    expect(response.body.resolvedCount).toBe(1);
    expect(response.body.resolvedRequests[0].resolution).toBe(
      'CONFIRMED_FROM_HCM',
    );

    const requestAfterReconciliation =
      await context.prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterReconciliation.status).toBe('CONFIRMED_BY_HCM');
    expect(requestAfterReconciliation.hcmSubmissionStatus).toBe('CONFIRMED');

    const eventAfterReconciliation =
      await context.prismaService.hcmSyncEvent.findFirstOrThrow({
        where: {
          timeOffRequestId: created.id,
        },
      });

    expect(eventAfterReconciliation.status).toBe('PROCESSED');
    expect(eventAfterReconciliation.lastError).toBeNull();
    expect(eventAfterReconciliation.nextAttemptAt).toBeNull();
  });
});
