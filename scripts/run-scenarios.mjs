const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const requestedScenario = process.argv[2] ?? 'all';

const color = {
  green: (text) => `\u001b[32m${text}\u001b[0m`,
  yellow: (text) => `\u001b[33m${text}\u001b[0m`,
  red: (text) => `\u001b[31m${text}\u001b[0m`,
  cyan: (text) => `\u001b[36m${text}\u001b[0m`,
  bold: (text) => `\u001b[1m${text}\u001b[0m`,
};

async function api(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

async function step(name, method, path, body, expectedStatuses = [200, 201]) {
  process.stdout.write(`${color.cyan('->')} ${name}\n`);
  const result = await api(method, path, body);
  const accepted = expectedStatuses.includes(result.status);

  if (!accepted) {
    console.error(color.red(`   ${result.status} ${JSON.stringify(result.payload, null, 2)}`));
    throw new Error(`Step failed: ${name}`);
  }

  console.log(color.green(`   ${result.status}`));
  return result.payload;
}

async function reset() {
  await step('Reset local test state', 'POST', '/test-support/reset', undefined);
}

const scenarios = {
  'happy-path': async () => {
    await reset();
    await step('Seed mock HCM balance', 'POST', '/mock-hcm/admin/balances', {
      employeeId: 'emp-happy-cli',
      locationId: 'loc-a',
      availableDays: 10,
    });
    await step(
      'Refresh local balance projection',
      'POST',
      '/balances/emp-happy-cli/refresh?locationId=loc-a',
    );
    const created = await step('Create time-off request', 'POST', '/time-off-requests', {
      employeeId: 'emp-happy-cli',
      locationId: 'loc-a',
      daysRequested: 2,
      startDate: '2026-09-01T00:00:00.000Z',
      endDate: '2026-09-02T00:00:00.000Z',
      reason: 'CLI happy path',
      requestedBy: 'scenario-runner',
    });
    await step(`Approve request ${created.id}`, 'POST', `/time-off-requests/${created.id}/approve`, {
      managerId: 'manager-cli',
    });
    await step('Process outbound HCM submission', 'POST', '/hcm-sync/process-pending');
    const request = await step(
      'Fetch final request state',
      'GET',
      `/time-off-requests/${created.id}`,
    );
    const balance = await step(
      'Fetch final balance projection',
      'GET',
      '/balances/emp-happy-cli?locationId=loc-a',
    );

    return {
      scenario: 'happy-path',
      requestStatus: request.status,
      hcmSubmissionStatus: request.hcmSubmissionStatus,
      displayAvailable: balance.displayAvailable,
    };
  },
  'manager-reject': async () => {
    await reset();
    await step('Seed mock HCM balance', 'POST', '/mock-hcm/admin/balances', {
      employeeId: 'emp-reject-cli',
      locationId: 'loc-a',
      availableDays: 10,
    });
    await step(
      'Refresh local balance projection',
      'POST',
      '/balances/emp-reject-cli/refresh?locationId=loc-a',
    );
    const created = await step('Create time-off request', 'POST', '/time-off-requests', {
      employeeId: 'emp-reject-cli',
      locationId: 'loc-a',
      daysRequested: 2,
      startDate: '2026-09-03T00:00:00.000Z',
      endDate: '2026-09-04T00:00:00.000Z',
      reason: 'CLI manager reject path',
      requestedBy: 'scenario-runner',
    });
    await step(`Reject request ${created.id}`, 'POST', `/time-off-requests/${created.id}/reject`, {
      managerId: 'manager-cli',
      reason: 'Manager rejected overlap',
    });
    const request = await step(
      'Fetch rejected request state',
      'GET',
      `/time-off-requests/${created.id}`,
    );
    const ledger = await step(
      'Fetch balance ledger',
      'GET',
      '/balances/emp-reject-cli/ledger?locationId=loc-a&limit=5',
    );

    return {
      scenario: 'manager-reject',
      requestStatus: request.status,
      latestLedgerEntry: ledger[0]?.entryType ?? null,
      rejectionReason: request.rejectionReason,
    };
  },
  'cancel-before-submit': async () => {
    await reset();
    await step('Seed mock HCM balance', 'POST', '/mock-hcm/admin/balances', {
      employeeId: 'emp-cancel-cli',
      locationId: 'loc-a',
      availableDays: 10,
    });
    await step(
      'Refresh local balance projection',
      'POST',
      '/balances/emp-cancel-cli/refresh?locationId=loc-a',
    );
    const created = await step('Create time-off request', 'POST', '/time-off-requests', {
      employeeId: 'emp-cancel-cli',
      locationId: 'loc-a',
      daysRequested: 1,
      startDate: '2026-09-07T00:00:00.000Z',
      endDate: '2026-09-07T00:00:00.000Z',
      reason: 'CLI cancel path',
      requestedBy: 'scenario-runner',
    });
    await step(`Approve request ${created.id}`, 'POST', `/time-off-requests/${created.id}/approve`, {
      managerId: 'manager-cli',
    });
    await step(`Cancel request ${created.id}`, 'POST', `/time-off-requests/${created.id}/cancel`, {
      reason: 'Employee changed plans',
    });
    const request = await step(
      'Fetch cancelled request state',
      'GET',
      `/time-off-requests/${created.id}`,
    );
    const syncEvents = await step(
      'Fetch request sync events',
      'GET',
      `/time-off-requests/${created.id}/sync-events`,
    );

    return {
      scenario: 'cancel-before-submit',
      requestStatus: request.status,
      latestSyncStatus: syncEvents[0]?.status ?? null,
      cancellationReason: request.rejectionReason,
    };
  },
  'batch-stale': async () => {
    await reset();
    await step('Ingest newer batch snapshot', 'POST', '/hcm-sync/batch-balances', {
      batchId: 'cli-batch-newer',
      snapshotAt: '2026-09-10T12:00:00.000Z',
      balances: [
        {
          employeeId: 'emp-batch-cli',
          locationId: 'loc-a',
          availableDays: 20,
          hcmVersion: 'v2',
        },
      ],
    });
    const stale = await step('Ingest stale batch snapshot', 'POST', '/hcm-sync/batch-balances', {
      batchId: 'cli-batch-older',
      snapshotAt: '2026-09-10T08:00:00.000Z',
      balances: [
        {
          employeeId: 'emp-batch-cli',
          locationId: 'loc-a',
          availableDays: 5,
          hcmVersion: 'v1',
        },
      ],
    });
    const balance = await step(
      'Fetch balance after stale batch',
      'GET',
      '/balances/emp-batch-cli?locationId=loc-a',
    );

    return {
      scenario: 'batch-stale',
      ignoredCount: stale.ignoredCount,
      availableDays: balance.availableDays,
      lastHcmVersion: balance.lastHcmVersion,
    };
  },
  'hcm-rejection': async () => {
    await reset();
    await step('Seed mock HCM balance with high value', 'POST', '/mock-hcm/admin/balances', {
      employeeId: 'emp-hcm-reject-cli',
      locationId: 'loc-a',
      availableDays: 10,
    });
    await step(
      'Refresh local balance projection',
      'POST',
      '/balances/emp-hcm-reject-cli/refresh?locationId=loc-a',
    );
    await step('Lower remote HCM balance after local refresh', 'POST', '/mock-hcm/admin/balances', {
      employeeId: 'emp-hcm-reject-cli',
      locationId: 'loc-a',
      availableDays: 1,
    });
    const created = await step('Create time-off request', 'POST', '/time-off-requests', {
      employeeId: 'emp-hcm-reject-cli',
      locationId: 'loc-a',
      daysRequested: 2,
      startDate: '2026-09-08T00:00:00.000Z',
      endDate: '2026-09-09T00:00:00.000Z',
      reason: 'CLI HCM rejection path',
      requestedBy: 'scenario-runner',
    });
    await step(`Approve request ${created.id}`, 'POST', `/time-off-requests/${created.id}/approve`, {
      managerId: 'manager-cli',
    });
    await step('Process outbound HCM submission', 'POST', '/hcm-sync/process-pending');
    const request = await step(
      'Fetch rejected-by-HCM request state',
      'GET',
      `/time-off-requests/${created.id}`,
    );
    const balance = await step(
      'Fetch balance after HCM rejection',
      'GET',
      '/balances/emp-hcm-reject-cli?locationId=loc-a',
    );

    return {
      scenario: 'hcm-rejection',
      requestStatus: request.status,
      hcmSubmissionStatus: request.hcmSubmissionStatus,
      rejectionReason: request.rejectionReason,
      reservedDays: balance.reservedDays,
    };
  },
  'retry-uncertain': async () => {
    await reset();
    await step('Seed mock HCM balance', 'POST', '/mock-hcm/admin/balances', {
      employeeId: 'emp-conflict-cli',
      locationId: 'loc-a',
      availableDays: 10,
    });
    await step(
      'Configure transient submission failures',
      'POST',
      '/mock-hcm/admin/submission-failures',
      {
        employeeId: 'emp-conflict-cli',
        locationId: 'loc-a',
        times: 3,
        reason: 'MOCK_HCM_TEMPORARY_UNAVAILABLE',
      },
    );
    await step(
      'Refresh local balance projection',
      'POST',
      '/balances/emp-conflict-cli/refresh?locationId=loc-a',
    );
    const created = await step('Create time-off request', 'POST', '/time-off-requests', {
      employeeId: 'emp-conflict-cli',
      locationId: 'loc-a',
      daysRequested: 2,
      startDate: '2026-09-05T00:00:00.000Z',
      endDate: '2026-09-06T00:00:00.000Z',
      reason: 'CLI uncertain path',
      requestedBy: 'scenario-runner',
    });
    await step(`Approve request ${created.id}`, 'POST', `/time-off-requests/${created.id}/approve`, {
      managerId: 'manager-cli',
    });

    await step('Process pending sync attempt 1', 'POST', '/hcm-sync/process-pending');
    const request = await step(
      'Fetch request state after uncertain result',
      'GET',
      `/time-off-requests/${created.id}`,
    );
    const syncEvents = await step(
      'Fetch request sync events',
      'GET',
      `/time-off-requests/${created.id}/sync-events`,
    );

    return {
      scenario: 'retry-uncertain',
      requestStatus: request.status,
      latestSyncStatus: syncEvents[0]?.status ?? null,
      nextAttemptAt: syncEvents[0]?.nextAttemptAt ?? null,
    };
  },
};

async function main() {
  const scenarioNames =
    requestedScenario === 'all' ? Object.keys(scenarios) : [requestedScenario];

  for (const name of scenarioNames) {
    const scenario = scenarios[name];

    if (!scenario) {
      console.error(color.red(`Unknown scenario: ${name}`));
      process.exitCode = 1;
      return;
    }

    console.log(`\n${color.bold(`=== Scenario: ${name} ===`)}`);

    try {
      const summary = await scenario();
      console.log(color.green('Scenario completed'));
      console.table(summary);
    } catch (error) {
      console.error(color.red(`Scenario failed: ${name}`));
      console.error(error);
      process.exitCode = 1;
      return;
    }
  }
}

main();
