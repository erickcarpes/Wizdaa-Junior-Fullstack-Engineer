import request from 'supertest';
import {
  closeE2eTestContext,
  createE2eTestContext,
  E2eTestContext,
  resetE2eState,
} from './e2e-test-context';

describe('HCM integration module', () => {
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

  it('ingests a batch balance snapshot from HCM and creates local projections', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/hcm-sync/batch-balances')
      .send({
        batchId: 'batch-001',
        snapshotAt: '2026-04-24T10:00:00.000Z',
        balances: [
          {
            employeeId: 'emp-batch-1',
            locationId: 'loc-a',
            availableDays: 15,
            hcmVersion: 'v1',
          },
          {
            employeeId: 'emp-batch-2',
            locationId: 'loc-b',
            availableDays: 7,
            hcmVersion: 'v1',
          },
        ],
      })
      .expect(201);

    expect(response.body.batchId).toBe('batch-001');
    expect(response.body.appliedCount).toBe(2);
    expect(response.body.ignoredCount).toBe(0);

    const firstProjection =
      await context.prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-batch-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(firstProjection.availableDays).toBe(15);
    expect(firstProjection.syncStatus).toBe('IN_SYNC');

    const syncEvent = await context.prismaService.hcmSyncEvent.findFirstOrThrow({
      where: {
        direction: 'INBOUND',
        eventType: 'BATCH_BALANCE_SYNC',
      },
    });

    expect(syncEvent.status).toBe('PROCESSED');
  });

  it('ignores stale batch balance snapshots and preserves the newer local projection', async () => {
    await request(context.app.getHttpServer())
      .post('/hcm-sync/batch-balances')
      .send({
        batchId: 'batch-newer',
        snapshotAt: '2026-04-24T12:00:00.000Z',
        balances: [
          {
            employeeId: 'emp-stale-1',
            locationId: 'loc-a',
            availableDays: 20,
            hcmVersion: 'v2',
          },
        ],
      })
      .expect(201);

    const staleResponse = await request(context.app.getHttpServer())
      .post('/hcm-sync/batch-balances')
      .send({
        batchId: 'batch-older',
        snapshotAt: '2026-04-24T09:00:00.000Z',
        balances: [
          {
            employeeId: 'emp-stale-1',
            locationId: 'loc-a',
            availableDays: 5,
            hcmVersion: 'v1',
          },
        ],
      })
      .expect(201);

    expect(staleResponse.body.appliedCount).toBe(0);
    expect(staleResponse.body.ignoredCount).toBe(1);
    expect(staleResponse.body.ignored[0].reason).toBe('STALE_SNAPSHOT');

    const projection =
      await context.prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-stale-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projection.availableDays).toBe(20);
    expect(projection.lastHcmVersion).toBe('v2');
  });

  it('processes the pending outbound event and confirms the request in HCM', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 2.5,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-14T00:00:00.000Z'),
        status: 'APPROVED',
        managerId: 'manager-1',
      },
    });

    await context.prismaService.hcmSyncEvent.create({
      data: {
        timeOffRequestId: created.id,
        direction: 'OUTBOUND',
        eventType: 'TIME_OFF_SUBMISSION',
        status: 'PENDING',
        correlationId: created.id,
        idempotencyKey: `time-off-submission:${created.id}`,
        payload: JSON.stringify({
          requestId: created.id,
        }),
      },
    });

    const response = await request(context.app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    expect(response.body.processedCount).toBe(1);

    const requestAfterProcessing =
      await context.prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterProcessing.status).toBe('CONFIRMED_BY_HCM');
    expect(requestAfterProcessing.hcmSubmissionStatus).toBe('CONFIRMED');
    expect(requestAfterProcessing.hcmReferenceId).toBe(`mock-hcm-${created.id}`);

    const eventAfterProcessing =
      await context.prismaService.hcmSyncEvent.findFirstOrThrow({
        where: {
          timeOffRequestId: created.id,
        },
      });

    expect(eventAfterProcessing.status).toBe('PROCESSED');

    const projectionAfterProcessing =
      await context.prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projectionAfterProcessing.availableDays).toBe(7.5);
    expect(projectionAfterProcessing.reservedDays).toBe(0);
  });

  it('releases reservation when HCM rejects the outbound submission for insufficient balance', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 1,
      })
      .expect(201);

    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 2.5,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-14T00:00:00.000Z'),
        status: 'APPROVED',
        managerId: 'manager-1',
      },
    });

    await context.prismaService.hcmSyncEvent.create({
      data: {
        timeOffRequestId: created.id,
        direction: 'OUTBOUND',
        eventType: 'TIME_OFF_SUBMISSION',
        status: 'PENDING',
        correlationId: created.id,
        idempotencyKey: `time-off-submission:${created.id}`,
        payload: JSON.stringify({
          requestId: created.id,
        }),
      },
    });

    await request(context.app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    const requestAfterProcessing =
      await context.prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterProcessing.status).toBe('FAILED_HCM_VALIDATION');
    expect(requestAfterProcessing.hcmSubmissionStatus).toBe('REJECTED');
    expect(requestAfterProcessing.rejectionReason).toBe('INSUFFICIENT_BALANCE');

    const projectionAfterProcessing =
      await context.prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projectionAfterProcessing.reservedDays).toBe(0);

    const eventAfterProcessing =
      await context.prismaService.hcmSyncEvent.findFirstOrThrow({
        where: {
          timeOffRequestId: created.id,
        },
      });

    expect(eventAfterProcessing.status).toBe('FAILED');
  });

  it('retries an uncertain HCM submission after a transient transport failure', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/submission-failures')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        times: 1,
        reason: 'MOCK_HCM_TEMPORARY_UNAVAILABLE',
      })
      .expect(201);

    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 2.5,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-14T00:00:00.000Z'),
        status: 'APPROVED',
        managerId: 'manager-1',
      },
    });

    const createdEvent = await context.prismaService.hcmSyncEvent.create({
      data: {
        timeOffRequestId: created.id,
        direction: 'OUTBOUND',
        eventType: 'TIME_OFF_SUBMISSION',
        status: 'PENDING',
        correlationId: created.id,
        idempotencyKey: `time-off-submission:${created.id}`,
        payload: JSON.stringify({
          requestId: created.id,
        }),
      },
    });

    const firstAttempt = await request(context.app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    expect(firstAttempt.body.processedCount).toBe(1);

    const eventAfterFailure =
      await context.prismaService.hcmSyncEvent.findUniqueOrThrow({
        where: {
          id: createdEvent.id,
        },
      });

    expect(eventAfterFailure.status).toBe('UNCERTAIN');
    expect(eventAfterFailure.attempts).toBe(1);
    expect(eventAfterFailure.lastError).toBe('MOCK_HCM_TEMPORARY_UNAVAILABLE');
    expect(eventAfterFailure.nextAttemptAt).not.toBeNull();

    const requestAfterFailure =
      await context.prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterFailure.status).toBe('SUBMITTED_TO_HCM');
    expect(requestAfterFailure.hcmSubmissionStatus).toBe('PENDING_CONFIRMATION');

    await context.prismaService.hcmSyncEvent.update({
      where: {
        id: createdEvent.id,
      },
      data: {
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });

    const secondAttempt = await request(context.app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    expect(secondAttempt.body.processedCount).toBe(1);

    const requestAfterRetry =
      await context.prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterRetry.status).toBe('CONFIRMED_BY_HCM');
    expect(requestAfterRetry.hcmSubmissionStatus).toBe('CONFIRMED');

    const eventAfterRetry =
      await context.prismaService.hcmSyncEvent.findUniqueOrThrow({
        where: {
          id: createdEvent.id,
        },
      });

    expect(eventAfterRetry.status).toBe('PROCESSED');
    expect(eventAfterRetry.attempts).toBe(1);
    expect(eventAfterRetry.lastError).toBeNull();
    expect(eventAfterRetry.nextAttemptAt).toBeNull();
  });

  it('returns zero processed events when there is no pending HCM submission to process', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    expect(response.body.processedCount).toBe(0);
    expect(response.body.processedEvents).toEqual([]);
  });
});
