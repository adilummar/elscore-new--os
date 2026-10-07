import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateExceptionalRateDto } from './pricing.dto';

describe('CreateExceptionalRateDto', () => {
  it('rejects an exceptional rate without a grade', async () => {
    const dto = plainToInstance(CreateExceptionalRateDto, {
      subjectId: 'economics',
      hourlyRate: 14,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts a subject, grade record, and hourly rate', async () => {
    const dto = plainToInstance(CreateExceptionalRateDto, {
      subjectId: 'economics',
      gradeId: 'grade-5',
      hourlyRate: 14,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});
