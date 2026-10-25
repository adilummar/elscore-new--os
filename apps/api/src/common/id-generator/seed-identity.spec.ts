import {
  SYSTEM_ACTOR_EMAIL,
  SYSTEM_ACTOR_ID,
  isSystemActorIdentity,
  shouldCreateInitialCeoAdmin,
  systemActorCreateData,
} from './seed-identity';

describe('seed identity rules', () => {
  it('creates the bootstrap CEO admin only when the user table is empty', () => {
    expect(shouldCreateInitialCeoAdmin(0)).toBe(true);
    expect(shouldCreateInitialCeoAdmin(1)).toBe(false);
    expect(shouldCreateInitialCeoAdmin(4)).toBe(false);
  });

  it('rejects an invalid user count instead of treating it as an empty database', () => {
    expect(() => shouldCreateInitialCeoAdmin(-1)).toThrow(/non-negative integer/);
    expect(() => shouldCreateInitialCeoAdmin(1.5)).toThrow(/non-negative integer/);
  });

  it('recognizes the system actor by id or email', () => {
    expect(isSystemActorIdentity({ id: SYSTEM_ACTOR_ID, email: 'other@example.com' })).toBe(true);
    expect(isSystemActorIdentity({ id: 'user-1', email: 'SYSTEM@elscore.internal' })).toBe(true);
    expect(isSystemActorIdentity({ id: 'user-1', email: 'person@example.com' })).toBe(false);
  });

  it('creates the system actor with no CEO or HR role', () => {
    const data = systemActorCreateData('dept-admin');
    expect(data.id).toBe(SYSTEM_ACTOR_ID);
    expect(data.email).toBe(SYSTEM_ACTOR_EMAIL);
    expect(data).not.toHaveProperty('userRoles');
    expect(JSON.stringify(data)).not.toMatch(/CEO|HR_MANAGER|HR_EXECUTIVE|HR_ASSISTANT/);
    expect(data.employee.create.businessId).toBe('SYS-0000');
    expect(data.employee.create.departmentId).toBe('dept-admin');
  });
});
