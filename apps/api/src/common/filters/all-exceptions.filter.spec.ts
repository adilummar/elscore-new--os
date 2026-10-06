import { ArgumentsHost, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { PrismaExceptionFilter } from './prisma-exception.filter';

function host() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    json,
    host: {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ method: 'DELETE', url: '/api/v1/students/student-1' }),
      }),
    } as unknown as ArgumentsHost,
  };
}

describe('student deletion error envelope', () => {
  it('keeps the structured in-use conflict on the response', () => {
    const { json, host: http } = host();
    new AllExceptionsFilter().catch(
      new ConflictException({
        code: 'STUDENT_IN_USE',
        message: 'This Student cannot be deleted because they have existing demos and quotations. Historical business records must be preserved.',
        blockers: ['DEMO', 'QUOTATION'],
      }),
      http,
    );

    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 409,
      code: 'STUDENT_IN_USE',
      blockers: ['DEMO', 'QUOTATION'],
      message: expect.stringMatching(/demos and quotations/),
    }));
  });

  it('hides a raw Prisma foreign-key failure behind a safe conflict', () => {
    const { json, host: http } = host();
    new PrismaExceptionFilter().catch(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed on the field: `students`', {
        code: 'P2003',
        clientVersion: '5.19.1',
      }),
      http,
    );

    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(409);
    expect(body.message).toBe('This operation violates a data relationship constraint');
    expect(JSON.stringify(body)).not.toMatch(/students|Foreign key/);
    expect(body.code).toBeUndefined();
  });
});
