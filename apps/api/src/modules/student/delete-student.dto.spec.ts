import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DeleteStudentDto } from './dto/delete-student.dto';

async function validateReason(payload: object) {
  const dto = plainToInstance(DeleteStudentDto, payload);
  return validate(dto);
}

describe('DeleteStudentDto', () => {
  it('requires a reason', async () => {
    const errors = await validateReason({});
    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('trims the reason and accepts a normal explanation', async () => {
    const dto = plainToInstance(DeleteStudentDto, { reason: '  Created by mistake  ' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.reason).toBe('Created by mistake');
  });

  it('rejects a blank reason', async () => {
    const errors = await validateReason({ reason: '   ' });
    expect(errors.some((error) => error.property === 'reason')).toBe(true);
  });

  it('rejects a reason longer than 500 characters', async () => {
    const errors = await validateReason({ reason: 'a'.repeat(501) });
    expect(errors.some((error) => error.constraints && 'maxLength' in error.constraints)).toBe(true);
  });

  it('accepts a reason of 500 characters', async () => {
    const errors = await validateReason({ reason: 'a'.repeat(500) });
    expect(errors).toHaveLength(0);
  });
});
