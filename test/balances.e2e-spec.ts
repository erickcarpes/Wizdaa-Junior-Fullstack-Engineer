import request from 'supertest';
import {
  closeE2eTestContext,
  createE2eTestContext,
  E2eTestContext,
  resetE2eState,
} from './e2e-test-context';

describe('Balances module', () => {
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

  it('returns the current balance projection with displayAvailable', async () => {
    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 2,
        version: 3,
      },
    });

    const response = await request(context.app.getHttpServer())
      .get('/balances/emp-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(response.body.employeeId).toBe('emp-1');
    expect(response.body.locationId).toBe('loc-a');
    expect(response.body.availableDays).toBe(10);
    expect(response.body.reservedDays).toBe(2);
    expect(response.body.displayAvailable).toBe(8);
  });

  it('returns 404 when the balance projection does not exist locally', async () => {
    const response = await request(context.app.getHttpServer())
      .get('/balances/emp-missing-balance')
      .query({ locationId: 'loc-a' })
      .expect(404);

    expect(response.body.message).toContain(
      'Balance projection not found for employeeId=emp-missing-balance',
    );
  });

  it('refreshes the local balance projection from mock HCM on demand', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-refresh-1',
        locationId: 'loc-a',
        availableDays: 12,
      })
      .expect(201);

    const refreshResponse = await request(context.app.getHttpServer())
      .post('/balances/emp-refresh-1/refresh')
      .query({ locationId: 'loc-a' })
      .expect(201);

    expect(refreshResponse.body.employeeId).toBe('emp-refresh-1');
    expect(refreshResponse.body.locationId).toBe('loc-a');
    expect(refreshResponse.body.availableDays).toBe(12);
    expect(refreshResponse.body.reservedDays).toBe(0);
    expect(refreshResponse.body.syncStatus).toBe('IN_SYNC');

    const balanceResponse = await request(context.app.getHttpServer())
      .get('/balances/emp-refresh-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(balanceResponse.body.availableDays).toBe(12);
    expect(balanceResponse.body.displayAvailable).toBe(12);
  });

  it('returns 404 when refreshing a balance that does not exist in mock HCM', async () => {
    const response = await request(context.app.getHttpServer())
      .post('/balances/emp-refresh-missing/refresh')
      .query({ locationId: 'loc-a' })
      .expect(404);

    expect(response.body.message).toContain(
      'Mock HCM balance not found for employeeId=emp-refresh-missing',
    );
  });

  it('creates a request successfully after refreshing the local balance projection from mock HCM', async () => {
    await request(context.app.getHttpServer())
      .post('/mock-hcm/admin/balances')
      .send({
        employeeId: 'emp-refresh-create-1',
        locationId: 'loc-a',
        availableDays: 8,
      })
      .expect(201);

    await request(context.app.getHttpServer())
      .post('/balances/emp-refresh-create-1/refresh')
      .query({ locationId: 'loc-a' })
      .expect(201);

    const createResponse = await request(context.app.getHttpServer())
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

    const balanceResponse = await request(context.app.getHttpServer())
      .get('/balances/emp-refresh-create-1')
      .query({ locationId: 'loc-a' })
      .expect(200);

    expect(balanceResponse.body.availableDays).toBe(8);
    expect(balanceResponse.body.reservedDays).toBe(3);
    expect(balanceResponse.body.displayAvailable).toBe(5);
  });

  it('returns balance ledger entries for an employee and location', async () => {
    await context.prismaService.balanceProjection.create({
      data: {
        employeeId: 'emp-ledger-1',
        locationId: 'loc-a',
        availableDays: 10,
        reservedDays: 0,
      },
    });

    const created = await request(context.app.getHttpServer())
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

    const ledgerResponse = await request(context.app.getHttpServer())
      .get('/balances/emp-ledger-1/ledger')
      .query({ locationId: 'loc-a', limit: 10 })
      .expect(200);

    expect(Array.isArray(ledgerResponse.body)).toBe(true);
    expect(ledgerResponse.body[0].timeOffRequestId).toBe(created.body.id);
    expect(ledgerResponse.body[0].entryType).toBe('REQUEST_RESERVED');
  });
});
