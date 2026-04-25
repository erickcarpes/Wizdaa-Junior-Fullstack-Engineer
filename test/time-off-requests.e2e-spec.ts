import request from 'supertest';
import {
  closeE2eTestContext,
  createE2eTestContext,
  E2eTestContext,
  resetE2eState,
} from './e2e-test-context';

describe('Time-off requests module', () => {
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

  it('creates a time-off request and reserves balance locally', async () => {
    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 0,
      },
    });

    const createResponse = await request(context.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 2.5,
        startDate: '2026-05-12T00:00:00.000Z',
        endDate: '2026-05-14T00:00:00.000Z',
        reason: 'Vacation',
        requestedBy: 'employee-user-1',
      })
      .expect(201);

    expect(createResponse.body.employeeId).toBe('emp-1');
    expect(createResponse.body.locationId).toBe('loc-a');
    expect(createResponse.body.daysRequested).toBe(2.5);
    expect(createResponse.body.status).toBe('PENDING_MANAGER_APPROVAL');
    expect(createResponse.body.hcmSubmissionStatus).toBe('NOT_SUBMITTED');

    const balanceResponse = await request(context.app.getHttpServer())
      .get('/balances/emp-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(balanceResponse.body.availableDays).toBe(10);
    expect(balanceResponse.body.reservedDays).toBe(2.5);
    expect(balanceResponse.body.displayAvailable).toBe(7.5);

    const persistedRequest = await request(context.app.getHttpServer())
      .get(`/time-off-requests/${createResponse.body.id}`)
      .expect(200);

    expect(persistedRequest.body.id).toBe(createResponse.body.id);

    const ledgerEntry =
      await context.prismaService.balanceLedgerEntry.findFirstOrThrow({
        where: {
          timeOffRequestId: createResponse.body.id,
        },
      });

    expect(ledgerEntry.entryType).toBe('REQUEST_RESERVED');
    expect(ledgerEntry.deltaDays).toBe(-2.5);
  });

  it('rejects invalid request payloads via DTO validation', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: '',
        locationId: 'loc-a',
        daysRequested: 0,
        startDate: 'invalid-date',
        endDate: '2026-05-14T00:00:00.000Z',
        unexpected: 'field',
      })
      .expect(400);

    const message = Array.isArray(response.body.message)
      ? response.body.message.join(' | ')
      : String(response.body.message);

    expect(message).toContain('employeeId should not be empty');
    expect(message).toContain('daysRequested must not be less than 0.000001');
    expect(message).toContain('startDate must be a valid ISO 8601 date string');
    expect(message).toContain('property unexpected should not exist');
  });

  it('approves a pending manager approval request', async () => {
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
        reservedDays: 1,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'PENDING_MANAGER_APPROVAL',
      },
    });

    const response = await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.id}/approve`)
      .send({
        managerId: 'manager-1',
      })
      .expect(201);

    expect(response.body.id).toBe(created.id);
    expect(response.body.status).toBe('APPROVED');
    expect(response.body.managerId).toBe('manager-1');

    const syncEvent = await context.prismaService.hcmSyncEvent.findFirstOrThrow({
      where: {
        timeOffRequestId: created.id,
      },
    });

    expect(syncEvent.direction).toBe('OUTBOUND');
    expect(syncEvent.eventType).toBe('TIME_OFF_SUBMISSION');
    expect(syncEvent.status).toBe('PENDING');
  });

  it('returns sync events for a time-off request', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-sync-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-sync-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 1,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-sync-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'PENDING_MANAGER_APPROVAL',
      },
    });

    await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.id}/approve`)
      .send({
        managerId: 'manager-sync',
      })
      .expect(201);

    const response = await request(context.app.getHttpServer())
      .get(`/time-off-requests/${created.id}/sync-events`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0].timeOffRequestId).toBe(created.id);
    expect(response.body[0].eventType).toBe('TIME_OFF_SUBMISSION');
  });

  it('returns 404 when loading a time-off request by id that does not exist', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/time-off-requests/request-does-not-exist')
      .expect(404);

    expect(response.body.message).toContain(
      'Time-off request request-does-not-exist was not found.',
    );
  });

  it('returns 404 when loading sync events for a request that does not exist', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/time-off-requests/request-does-not-exist/sync-events')
      .expect(404);

    expect(response.body.message).toContain(
      'Time-off request request-does-not-exist was not found.',
    );
  });

  it('rejects a pending manager approval request and releases the reserved balance', async () => {
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
        status: 'PENDING_MANAGER_APPROVAL',
      },
    });

    const response = await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.id}/reject`)
      .send({
        reason: 'Manager rejected vacation overlap',
        managerId: 'manager-1',
      })
      .expect(201);

    expect(response.body.status).toBe('REJECTED');
    expect(response.body.rejectionReason).toBe(
      'Manager rejected vacation overlap',
    );

    const projection =
      await context.prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projection.reservedDays).toBe(0);
  });

  it('returns 404 when approving a request that does not exist', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/time-off-requests/request-does-not-exist/approve')
      .send({
        managerId: 'manager-404',
      })
      .expect(404);

    expect(response.body.message).toContain(
      'Time-off request request-does-not-exist was not found.',
    );
  });

  it('returns 404 when rejecting a request that does not exist', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/time-off-requests/request-does-not-exist/reject')
      .send({
        reason: 'No request to reject',
        managerId: 'manager-404',
      })
      .expect(404);

    expect(response.body.message).toContain(
      'Time-off request request-does-not-exist was not found.',
    );
  });

  it('returns 404 when cancelling a request that does not exist', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/time-off-requests/request-does-not-exist/cancel')
      .send({
        reason: 'No request to cancel',
      })
      .expect(404);

    expect(response.body.message).toContain(
      'Time-off request request-does-not-exist was not found.',
    );
  });

  it('rejects manager rejection when request is not in pending manager approval state', async () => {
    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-reject-invalid-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 0,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-reject-invalid-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'CONFIRMED_BY_HCM',
        hcmSubmissionStatus: 'CONFIRMED',
      },
    });

    const response = await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.id}/reject`)
      .send({
        reason: 'Late manager decision',
        managerId: 'manager-invalid',
      })
      .expect(409);

    expect(response.body.message).toContain('cannot be rejected');
  });

  it('cancels an approved request, releases reservation, and invalidates pending outbound sync', async () => {
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
      .post(`/time-off-requests/${created.id}/cancel`)
      .send({
        reason: 'Employee changed plans',
      })
      .expect(201);

    expect(response.body.status).toBe('CANCELLED');
    expect(response.body.rejectionReason).toBe('Employee changed plans');

    const projection =
      await context.prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projection.reservedDays).toBe(0);

    const syncEvent = await context.prismaService.hcmSyncEvent.findFirstOrThrow({
      where: {
        timeOffRequestId: created.id,
      },
    });

    expect(syncEvent.status).toBe('IGNORED_STALE');
  });

  it('rejects approve when request is not in pending manager approval state', async () => {
    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 1,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'APPROVED',
      },
    });

    const response = await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.id}/approve`)
      .send({
        managerId: 'manager-1',
      })
      .expect(409);

    expect(response.body.message).toContain('cannot be approved');
  });

  it('rejects cancel when request is already submitted to HCM', async () => {
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
        status: 'SUBMITTED_TO_HCM',
        hcmSubmissionStatus: 'PENDING_CONFIRMATION',
      },
    });

    const response = await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.id}/cancel`)
      .send({
        reason: 'Too late',
      })
      .expect(409);

    expect(response.body.message).toContain('cannot be cancelled');
  });

  it('rejects cancel when request is already confirmed by HCM', async () => {
    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-cancel-invalid-1',
        locationId: 'loc-a',
        availableDays: 7,
        reservedDays: 0,
      },
    });

    const created = await context.prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-cancel-invalid-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'CONFIRMED_BY_HCM',
        hcmSubmissionStatus: 'CONFIRMED',
        hcmReferenceId: 'mock-hcm-confirmed',
      },
    });

    const response = await request(context.app.getHttpServer())
      .post(`/time-off-requests/${created.id}/cancel`)
      .send({
        reason: 'Trying to cancel confirmed leave',
      })
      .expect(409);

    expect(response.body.message).toContain('cannot be cancelled');
  });

  it('returns 404 when creating a request without a local balance projection', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp-missing-projection',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: '2026-05-12T00:00:00.000Z',
        endDate: '2026-05-12T00:00:00.000Z',
        reason: 'No local projection',
        requestedBy: 'employee-missing-projection',
      })
      .expect(404);

    expect(response.body.message).toContain(
      'Balance projection not found for employeeId=emp-missing-projection',
    );
  });

  it('rejects a request when local available balance is insufficient', async () => {
    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 3,
        reservedDays: 1,
      },
    });

    const response = await request(context.app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 2.5,
        startDate: '2026-05-12T00:00:00.000Z',
        endDate: '2026-05-14T00:00:00.000Z',
      })
      .expect(409);

    expect(response.body.message).toContain('Insufficient balance');

    const requests = await context.prismaService.timeOffRequest.findMany();
    expect(requests).toHaveLength(0);
  });
});
