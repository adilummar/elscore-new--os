import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RejectMissedCheckoutDto } from './missed-checkout.dto';

describe('RejectMissedCheckoutDto', () => {
  it('requires a non-blank rejection reason', async () => {
    const dto = plainToInstance(RejectMissedCheckoutDto, { reason: '   ' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('trims a valid reason', async () => {
    const dto = plainToInstance(RejectMissedCheckoutDto, { reason: '  Please explain the missed checkout  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Please explain the missed checkout');
  });

  it('rejects a reason longer than 500 characters', async () => {
    const dto = plainToInstance(RejectMissedCheckoutDto, { reason: 'x'.repeat(501) });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
