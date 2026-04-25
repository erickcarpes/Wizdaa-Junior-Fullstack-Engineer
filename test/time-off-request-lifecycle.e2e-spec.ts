import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { MockHcmService } from '@/modules/mock-hcm/mock-hcm.service';

describe('Time-off request lifecycle', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let mockHcmService: MockHcmService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    prismaService = moduleRef.get(PrismaService);
    mockHcmService = moduleRef.get(MockHcmService);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  beforeEach(async () => {
    mockHcmService.clear();
    await prismaService.hcmSyncEvent.deleteMany();
    await prismaService.balanceLedgerEntry.deleteMany();
    await prismaService.timeOffRequest.deleteMany();
    await prismaService.balanceProjection.deleteMany();
  });

  afterAll(async () => {
    mockHcmService.clear();
    await prismaService.hcmSyncEvent.deleteMany();
    await prismaService.balanceLedgerEntry.deleteMany();
    await prismaService.timeOffRequest.deleteMany();
    await prismaService.balanceProjection.deleteMany();
    await app.close();
  });

  it('returns the current balance projection with displayAvailable', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2,
        version: 3,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/balances/emp-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(response.body.employeeId).toBe('emp-1');
    expect(response.body.locationId).toBe('loc-a');
    expect(response.body.availableDays).toBe(10);
    expect(response.body.reservedDays).toBe(2);
    expect(response.body.displayAvailable).toBe(8);
  });

  it('refreshes the local balance projection from mock HCM on demand', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-refresh-1',
        locationId: 'loc-a',
        availableDays: 12,
      })
      .expect(201);

    const refreshResponse = await request(app.getHttpServer())
      .post('/balances/emp-refresh-1/refresh')
      .query({ locationId: 'loc-a' })
      .expect(201);

    expect(refreshResponse.body.employeeId).toBe('emp-refresh-1');
    expect(refreshResponse.body.locationId).toBe('loc-a');
    expect(refreshResponse.body.availableDays).toBe(12);
    expect(refreshResponse.body.reservedDays).toBe(0);
    expect(refreshResponse.body.syncStatus).toBe('IN_SYNC');

    const balanceResponse = await request(app.getHttpServer())
      .get('/balances/emp-refresh-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(balanceResponse.body.availableDays).toBe(12);
    expect(balanceResponse.body.displayAvailable).toBe(12);
  });

  it('ingests a batch balance snapshot from HCM and creates local projections', async () => {
    const response = await request(app.getHttpServer())
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

    const firstProjection = await prismaService.balanceProjection.findUniqueOrThrow(
      {
        where: {
          employeeId_locationId: {
            employeeId: 'emp-batch-1',
            locationId: 'loc-a',
          },
        },
      },
    );

    expect(firstProjection.availableDays).toBe(15);
    expect(firstProjection.syncStatus).toBe('IN_SYNC');

    const syncEvent = await prismaService.hcmSyncEvent.findFirstOrThrow({
      where: {
        direction: 'INBOUND',
        eventType: 'BATCH_BALANCE_SYNC',
      },
    });

    expect(syncEvent.status).toBe('PROCESSED');
  });

  it('ignores stale batch balance snapshots and preserves the newer local projection', async () => {
    await request(app.getHttpServer())
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

    const staleResponse = await request(app.getHttpServer())
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

    const projection = await prismaService.balanceProjection.findUniqueOrThrow({
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

  it('creates a request successfully after refreshing the local balance projection from mock HCM', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-refresh-create-1',
        locationId: 'loc-a',
        availableDays: 8,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/balances/emp-refresh-create-1/refresh')
      .query({ locationId: 'loc-a' })
      .expect(201);

    const createResponse = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp-refresh-create-1',
        locationId: 'loc-a',
        daysRequested: 3,
        startDate: '2026-05-20T00:00:00.000Z',
        endDate: '2026-05-22T00:00:00.000Z',
        reason: 'Vacation after refresh',
        requestedBy: 'employee-user-refresh',
      })
      .expect(201);

    expect(createResponse.body.status).toBe('PENDING_MANAGER_APPROVAL');

    const balanceResponse = await request(app.getHttpServer())
      .get('/balances/emp-refresh-create-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(balanceResponse.body.availableDays).toBe(8);
    expect(balanceResponse.body.reservedDays).toBe(3);
    expect(balanceResponse.body.displayAvailable).toBe(5);
  });

  it('creates a time-off request and reserves balance locally', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 0,
      },
    });

    const createResponse = await request(app.getHttpServer())
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

    const balanceResponse = await request(app.getHttpServer())
      .get('/balances/emp-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(balanceResponse.body.availableDays).toBe(10);
    expect(balanceResponse.body.reservedDays).toBe(2.5);
    expect(balanceResponse.body.displayAvailable).toBe(7.5);

    const persistedRequest = await request(app.getHttpServer())
      .get(`/time-off-requests/${createResponse.body.id}`)
      .expect(200);

    expect(persistedRequest.body.id).toBe(createResponse.body.id);

    const ledgerEntry = await prismaService.balanceLedgerEntry.findFirstOrThrow({
      where: {
        timeOffRequestId: createResponse.body.id,
      },
    });

    expect(ledgerEntry.entryType).toBe('REQUEST_RESERVED');
    expect(ledgerEntry.deltaDays).toBe(-2.5);
  });

  it('returns balance ledger entries for an employee and location', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-ledger-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 0,
      },
    });

    const created = await request(app.getHttpServer())
      .post('/time-off-requests')
      .send({
        employeeId: 'emp-ledger-1',
        locationId: 'loc-a',
        daysRequested: 2,
        startDate: '2026-05-12T00:00:00.000Z',
        endDate: '2026-05-13T00:00:00.000Z',
        reason: 'Ledger scenario',
        requestedBy: 'employee-ledger',
      })
      .expect(201);

    const ledgerResponse = await request(app.getHttpServer())
      .get('/balances/emp-ledger-1/ledger')
      .query({ locationId: 'loc-a', limit: 10 })
      .expect(200);

    expect(Array.isArray(ledgerResponse.body)).toBe(true);
    expect(ledgerResponse.body[0].timeOffRequestId).toBe(created.body.id);
    expect(ledgerResponse.body[0].entryType).toBe('REQUEST_RESERVED');
  });

  it('rejects invalid request payloads via DTO validation', async () => {
    const response = await request(app.getHttpServer())
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
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 1,
      },
    });

    const created = await prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'PENDING_MANAGER_APPROVAL',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.id}/approve`)
      .send({
        managerId: 'manager-1',
      })
      .expect(201);

    expect(response.body.id).toBe(created.id);
    expect(response.body.status).toBe('APPROVED');
    expect(response.body.managerId).toBe('manager-1');

    const syncEvent = await prismaService.hcmSyncEvent.findFirstOrThrow({
      where: {
        timeOffRequestId: created.id,
      },
    });

    expect(syncEvent.direction).toBe('OUTBOUND');
    expect(syncEvent.eventType).toBe('TIME_OFF_SUBMISSION');
    expect(syncEvent.status).toBe('PENDING');
  });

  it('returns sync events for a time-off request', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-sync-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-sync-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 1,
      },
    });

    const created = await prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-sync-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'PENDING_MANAGER_APPROVAL',
      },
    });

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.id}/approve`)
      .send({
        managerId: 'manager-sync',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/time-off-requests/${created.id}/sync-events`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0].timeOffRequestId).toBe(created.id);
    expect(response.body[0].eventType).toBe('TIME_OFF_SUBMISSION');
  });

  it('rejects a pending manager approval request and releases the reserved balance', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 2.5,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-14T00:00:00.000Z'),
        status: 'PENDING_MANAGER_APPROVAL',
      },
    });

    const response = await request(app.getHttpServer())
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

    const projection = await prismaService.balanceProjection.findUniqueOrThrow({
      where: {
        employeeId_locationId: {
          employeeId: 'emp-1',
          locationId: 'loc-a',
        },
      },
    });

    expect(projection.reservedDays).toBe(0);
  });

  it('cancels an approved request, releases reservation, and invalidates pending outbound sync', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await prismaService.timeOffRequest.create({
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

    await prismaService.hcmSyncEvent.create({
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

    const response = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.id}/cancel`)
      .send({
        reason: 'Employee changed plans',
      })
      .expect(201);

    expect(response.body.status).toBe('CANCELLED');
    expect(response.body.rejectionReason).toBe('Employee changed plans');

    const projection = await prismaService.balanceProjection.findUniqueOrThrow({
      where: {
        employeeId_locationId: {
          employeeId: 'emp-1',
          locationId: 'loc-a',
        },
      },
    });

    expect(projection.reservedDays).toBe(0);

    const syncEvent = await prismaService.hcmSyncEvent.findFirstOrThrow({
      where: {
        timeOffRequestId: created.id,
      },
    });

    expect(syncEvent.status).toBe('IGNORED_STALE');
  });

  it('processes the pending outbound event and confirms the request in HCM', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await prismaService.timeOffRequest.create({
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

    await prismaService.hcmSyncEvent.create({
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

    const response = await request(app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    expect(response.body.processedCount).toBe(1);

    const requestAfterProcessing =
      await prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterProcessing.status).toBe('CONFIRMED_BY_HCM');
    expect(requestAfterProcessing.hcmSubmissionStatus).toBe('CONFIRMED');
    expect(requestAfterProcessing.hcmReferenceId).toBe(`mock-hcm-${created.id}`);

    const eventAfterProcessing = await prismaService.hcmSyncEvent.findFirstOrThrow(
      {
        where: {
          timeOffRequestId: created.id,
        },
      },
    );

    expect(eventAfterProcessing.status).toBe('PROCESSED');

    const projectionAfterProcessing =
      await prismaService.balanceProjection.findUniqueOrThrow({
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
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 1,
      })
      .expect(201);

    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await prismaService.timeOffRequest.create({
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

    await prismaService.hcmSyncEvent.create({
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

    await request(app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    const requestAfterProcessing =
      await prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterProcessing.status).toBe('FAILED_HCM_VALIDATION');
    expect(requestAfterProcessing.hcmSubmissionStatus).toBe('REJECTED');
    expect(requestAfterProcessing.rejectionReason).toBe('INSUFFICIENT_BALANCE');

    const projectionAfterProcessing =
      await prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projectionAfterProcessing.reservedDays).toBe(0);

    const eventAfterProcessing = await prismaService.hcmSyncEvent.findFirstOrThrow(
      {
        where: {
          timeOffRequestId: created.id,
        },
      },
    );

    expect(eventAfterProcessing.status).toBe('FAILED');
  });

  it('retries an uncertain HCM submission after a transient transport failure', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/mock-hcm/admin/submission-failures')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-a',
        times: 1,
        reason: 'MOCK_HCM_TEMPORARY_UNAVAILABLE',
      })
      .expect(201);

    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await prismaService.timeOffRequest.create({
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

    const createdEvent = await prismaService.hcmSyncEvent.create({
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

    const firstAttempt = await request(app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    expect(firstAttempt.body.processedCount).toBe(1);

    const eventAfterFailure = await prismaService.hcmSyncEvent.findUniqueOrThrow({
      where: {
        id: createdEvent.id,
      },
    });

    expect(eventAfterFailure.status).toBe('UNCERTAIN');
    expect(eventAfterFailure.attempts).toBe(1);
    expect(eventAfterFailure.lastError).toBe('MOCK_HCM_TEMPORARY_UNAVAILABLE');
    expect(eventAfterFailure.nextAttemptAt).not.toBeNull();

    const requestAfterFailure =
      await prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(requestAfterFailure.status).toBe('SUBMITTED_TO_HCM');
    expect(requestAfterFailure.hcmSubmissionStatus).toBe('PENDING_CONFIRMATION');

    await prismaService.hcmSyncEvent.update({
      where: {
        id: createdEvent.id,
      },
      data: {
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });

    const secondAttempt = await request(app.getHttpServer())
      .post('/hcm-sync/process-pending')
      .expect(201);

    expect(secondAttempt.body.processedCount).toBe(1);

    const requestAfterRetry = await prismaService.timeOffRequest.findUniqueOrThrow(
      {
        where: {
          id: created.id,
        },
      },
    );

    expect(requestAfterRetry.status).toBe('CONFIRMED_BY_HCM');
    expect(requestAfterRetry.hcmSubmissionStatus).toBe('CONFIRMED');

    const eventAfterRetry = await prismaService.hcmSyncEvent.findUniqueOrThrow({
      where: {
        id: createdEvent.id,
      },
    });

    expect(eventAfterRetry.status).toBe('PROCESSED');
    expect(eventAfterRetry.attempts).toBe(1);
    expect(eventAfterRetry.lastError).toBeNull();
    expect(eventAfterRetry.nextAttemptAt).toBeNull();
  });

  it('moves an exhausted uncertain submission to conflict review during reconciliation', async () => {
    await request(app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-reconcile-1',
        locationId: 'loc-a',
        availableDays: 10,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/mock-hcm/admin/submission-failures')
      .send({
        employeeId: 'emp-reconcile-1',
        locationId: 'loc-a',
        times: 3,
        reason: 'MOCK_HCM_TEMPORARY_UNAVAILABLE',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/balances/emp-reconcile-1/refresh')
      .query({ locationId: 'loc-a' })
      .expect(201);

    const created = await request(app.getHttpServer())
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

    await request(app.getHttpServer())
      .post(`/time-off-requests/${created.body.id}/approve`)
      .send({
        managerId: 'manager-6',
      })
      .expect(201);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post('/hcm-sync/process-pending')
        .expect(201);

      if (attempt < 2) {
        await prismaService.hcmSyncEvent.updateMany({
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

    const eventAfterRetries = await prismaService.hcmSyncEvent.findFirstOrThrow({
      where: {
        timeOffRequestId: created.body.id,
      },
    });

    expect(eventAfterRetries.status).toBe('UNCERTAIN');
    expect(eventAfterRetries.nextAttemptAt).toBeNull();

    const reconciliationResponse = await request(app.getHttpServer())
      .post('/reconciliation/emp-reconcile-1')
      .query({ locationId: 'loc-a' })
      .expect(201);

    expect(reconciliationResponse.body.resolvedCount).toBe(1);
    expect(reconciliationResponse.body.resolvedRequests[0].resolution).toBe(
      'MOVED_TO_CONFLICT_REVIEW',
    );

    const requestAfterReconciliation =
      await prismaService.timeOffRequest.findUniqueOrThrow({
        where: {
          id: created.body.id,
        },
      });

    expect(requestAfterReconciliation.status).toBe('CONFLICT_REVIEW');
    expect(requestAfterReconciliation.hcmSubmissionStatus).toBe('UNKNOWN');

    const projectionAfterReconciliation =
      await prismaService.balanceProjection.findUniqueOrThrow({
        where: {
          employeeId_locationId: {
            employeeId: 'emp-reconcile-1',
            locationId: 'loc-a',
          },
        },
      });

    expect(projectionAfterReconciliation.syncStatus).toBe('CONFLICT');
  });

  it('rejects approve when request is not in pending manager approval state', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 1,
      },
    });

    const created = await prismaService.timeOffRequest.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        daysRequested: 1,
        startDate: new Date('2026-05-12T00:00:00.000Z'),
        endDate: new Date('2026-05-12T00:00:00.000Z'),
        status: 'APPROVED',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.id}/approve`)
      .send({
        managerId: 'manager-1',
      })
      .expect(409);

    expect(response.body.message).toContain('cannot be approved');
  });

  it('rejects cancel when request is already submitted to HCM', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2.5,
      },
    });

    const created = await prismaService.timeOffRequest.create({
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

    const response = await request(app.getHttpServer())
      .post(`/time-off-requests/${created.id}/cancel`)
      .send({
        reason: 'Too late',
      })
      .expect(409);

    expect(response.body.message).toContain('cannot be cancelled');
  });

  it('rejects a request when local available balance is insufficient', async () => {
    await prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 3,
        reservedDays: 1,
      },
    });

    const response = await request(app.getHttpServer())
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

    const requests = await prismaService.timeOffRequest.findMany();
    expect(requests).toHaveLength(0);
  });
});
