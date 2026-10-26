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

import { getDepartmentsAction, getRolesAction } from '../actions';

describe('Vacancies Department & Role Data Loading Actions', () => {
  const originalUrl = process.env.API_URL;

  beforeEach(() => {
    process.env.API_URL = 'http://localhost:3001/api/v1';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env.API_URL = originalUrl;
  });

  it('unwraps NestJS paginated department response envelope into clean array', async () => {
    const mockApiResponse = {
      data: [
        { id: 'dept-1', code: 'ACADEMICS', name: 'Academics', status: 'ACTIVE' },
        { id: 'dept-2', code: 'FINANCE', name: 'Finance', status: 'ACTIVE' },
        { id: 'dept-3', code: 'HR', name: 'Human Resources', status: 'ACTIVE' },
        { id: 'dept-4', code: 'MARKETING', name: 'Marketing', status: 'ACTIVE' },
        { id: 'dept-5', code: 'SALES', name: 'Sales', status: 'ACTIVE' },
        { id: 'dept-6', code: 'ADMIN', name: 'Administration', status: 'ACTIVE' },
      ],
      pagination: { nextCursor: null, hasNextPage: false, limit: 100 },
    };

    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: mockApiResponse, timestamp: new Date().toISOString() }),
    } as Response);

    const departments = await getDepartmentsAction();

    expect(Array.isArray(departments)).toBe(true);
    expect(departments).toHaveLength(6);
    expect(departments[0]).toEqual({
      id: 'dept-1',
      code: 'ACADEMICS',
      name: 'Academics',
      status: 'ACTIVE',
    });
  });

  it('unwraps direct array response if returned by alternative mock/endpoint', async () => {
    const directArray = [
      { id: 'dept-1', code: 'ACADEMICS', name: 'Academics', status: 'ACTIVE' },
    ];

    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: directArray, timestamp: new Date().toISOString() }),
    } as Response);

    const departments = await getDepartmentsAction();

    expect(Array.isArray(departments)).toBe(true);
    expect(departments).toHaveLength(1);
    expect(departments[0].code).toBe('ACADEMICS');
  });

  it('returns empty array on API failure without throwing error', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal Server Error' }),
    } as Response);

    const departments = await getDepartmentsAction();

    expect(Array.isArray(departments)).toBe(true);
    expect(departments).toEqual([]);
  });

  it('unwraps NestJS paginated roles response into clean array', async () => {
    const mockRolesResponse = {
      data: [
        { id: 'role-1', code: 'COUNSELOR', name: 'Counselor', isSystem: true },
        { id: 'role-2', code: 'SALES_HEAD', name: 'Sales Head', isSystem: true },
      ],
      pagination: { nextCursor: null, hasNextPage: false, limit: 100 },
    };

    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: mockRolesResponse, timestamp: new Date().toISOString() }),
    } as Response);

    const roles = await getRolesAction();

    expect(Array.isArray(roles)).toBe(true);
    expect(roles).toHaveLength(2);
    expect(roles[0].code).toBe('COUNSELOR');
  });

  it('filters active departments and preserves stable IDs for dropdown options', () => {
    const rawDepartments = [
      { id: '0695dc15-d9cf-4ac2-9b61-9ad967cd333c', code: 'FINANCE', name: 'Finance', status: 'ACTIVE' },
      { id: '5c8e3f45-7877-4600-a433-6e83eb1a2801', code: 'SALES', name: 'Sales', status: 'ACTIVE' },
      { id: 'dept-archived', code: 'OLD_UNIT', name: 'Closed Branch', status: 'INACTIVE' },
    ];

    const activeDepts = rawDepartments.filter(d => d.status === 'ACTIVE' || !d.status);

    expect(activeDepts).toHaveLength(2);
    expect(activeDepts.map(d => d.id)).toEqual([
      '0695dc15-d9cf-4ac2-9b61-9ad967cd333c',
      '5c8e3f45-7877-4600-a433-6e83eb1a2801',
    ]);
  });
});
