jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn().mockReturnValue({ value: 'mock-token' }),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  unstable_noStore: jest.fn(),
}));

import {
  createPayrollRunAction,
  getPayrollRunsAction,
  finalizePayrollRunAction,
  recordPayrollPaymentAction,
  createTutorPayableRunAction,
} from '../actions';

describe('Payroll Server Actions Error Handling', () => {
  const originalUrl = process.env.API_URL;

  beforeEach(() => {
    process.env.API_URL = 'http://localhost:3001/api/v1';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env.API_URL = originalUrl;
  });

  it('createPayrollRunAction catches backend 400 validation error and returns structured failure instead of throwing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        message: 'Employee EMP-0001 (System Admin) has no active compensation configured for period 2026-10-01 to 2026-10-31',
        error: 'Bad Request',
      }),
    } as Response);

    const res = await createPayrollRunAction({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      notes: 'October test run',
    });

    expect(res).toEqual({
      success: false,
      error: 'Employee EMP-0001 (System Admin) has no active compensation configured for period 2026-10-01 to 2026-10-31',
    });
    errorSpy.mockRestore();
  });

  it('createPayrollRunAction returns success object on 201 response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        data: { id: 'run-1', businessId: 'PAY-2026-10-001', status: 'DRAFT' },
        timestamp: new Date().toISOString(),
      }),
    } as Response);

    const res = await createPayrollRunAction({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    expect(res).toEqual({
      success: true,
      data: { id: 'run-1', businessId: 'PAY-2026-10-001', status: 'DRAFT' },
    });
  });

  it('getPayrollRunsAction returns empty array inside success object when no runs exist', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: [],
        timestamp: new Date().toISOString(),
      }),
    } as Response);

    const res = await getPayrollRunsAction();

    expect(res).toEqual({
      success: true,
      data: [],
    });
  });

  it('createTutorPayableRunAction catches missing class records error gracefully', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        statusCode: 400,
        message: 'No eligible verified class records found for period 2026-10-01 to 2026-10-31',
        error: 'Bad Request',
      }),
    } as Response);

    const res = await createTutorPayableRunAction({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    expect(res).toEqual({
      success: false,
      error: 'No eligible verified class records found for period 2026-10-01 to 2026-10-31',
    });
    errorSpy.mockRestore();
  });

  it('recordPayrollPaymentAction updates payment status and returns structured result', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: { id: 'item-1', paymentStatus: 'PAID', paymentReference: 'UTR-99999' },
        timestamp: new Date().toISOString(),
      }),
    } as Response);

    const res = await recordPayrollPaymentAction('item-1', {
      paymentReference: 'UTR-99999',
      paymentNotes: 'Settled via portal',
    });

    expect(res).toEqual({
      success: true,
      data: { id: 'item-1', paymentStatus: 'PAID', paymentReference: 'UTR-99999' },
    });
  });
});
