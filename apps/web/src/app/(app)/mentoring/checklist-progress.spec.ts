import { ChecklistItemView, computeProgress, describeProgress, groupChecklist, isItemResolved, itemStatus } from './checklist-progress';

const item = (key: string, over: Partial<ChecklistItemView> = {}): ChecklistItemView => ({ key, label: `Item ${key}`, mandatory: true, state: 'PENDING_COLLECTION', ...over });

describe('item status and resolution (mirrors the rule the API enforces on verification)', () => {
  it.each([
    ['VERIFIED', {}, 'COMPLETED', true],
    ['COLLECTED', {}, 'AWAITING_VERIFICATION', false],
    ['PENDING_COLLECTION', {}, 'PENDING', false],
    ['UNAVAILABLE', { reason: 'School closed' }, 'UNAVAILABLE', true],
    ['NOT_APPLICABLE', { reason: 'Home schooled' }, 'NOT_APPLICABLE', true],
    ['UNAVAILABLE', { reason: '   ' }, 'PENDING', false],
    ['NOT_APPLICABLE', { reason: null }, 'PENDING', false],
    ['PENDING_COLLECTION', { exception: true }, 'EXCEPTION', true],
    ['VERIFIED', { exception: true }, 'COMPLETED', true],
  ] as const)('%s %p is %s (resolved: %s)', (state, extra, status, resolved) => {
    const i = item('a', { state, ...extra });
    expect(itemStatus(i)).toBe(status);
    expect(isItemResolved(i)).toBe(resolved);
  });

  it('an ordinary completed tick is not an exception', () => {
    expect(item('a', { state: 'VERIFIED' }).exception).toBeUndefined();
    expect(itemStatus(item('a', { state: 'VERIFIED' }))).not.toBe('EXCEPTION');
  });
});

describe('progress', () => {
  const items = [
    item('a', { state: 'VERIFIED', group: 'g1', groupLabel: 'Group one' }),
    item('b', { state: 'VERIFIED', group: 'g1', groupLabel: 'Group one' }),
    item('c', { state: 'UNAVAILABLE', reason: 'Not issued', group: 'g2', groupLabel: 'Group two' }),
    item('d', { state: 'COLLECTED', group: 'g2', groupLabel: 'Group two' }),
    item('e', { exception: true, group: 'g3', groupLabel: 'Group three' }),
    item('f', { mandatory: false, group: 'g3', groupLabel: 'Group three' }),
  ];

  it('counts completed, resolved-otherwise, exceptions and outstanding mandatory items', () => {
    expect(computeProgress(items)).toEqual({
      total: 6, completed: 2, resolvedOther: 2, exceptions: 1, outstandingMandatory: ['d'], groupsTotal: 3, groupsResolved: 1, percent: 67,
    });
  });

  it('an advisory item never blocks, and a stage with nothing outstanding can be verified', () => {
    const progress = computeProgress([item('a', { state: 'VERIFIED' }), item('b', { mandatory: false })]);
    expect(progress.outstandingMandatory).toEqual([]);
    expect(progress.percent).toBe(50);
  });

  it('an empty checklist is 0 of 0 and never divides by zero', () => {
    expect(computeProgress([])).toMatchObject({ total: 0, completed: 0, percent: 0, outstandingMandatory: [] });
  });

  it('describes progress in words', () => {
    expect(describeProgress(computeProgress(items))).toBe('2 of 6 completed · 2 unavailable or excepted');
    expect(describeProgress(computeProgress([item('a', { state: 'VERIFIED' })]))).toBe('1 of 1 completed');
  });
});

describe('grouping', () => {
  it('keeps requirements and their items in order', () => {
    const groups = groupChecklist([item('a', { group: 'g1', groupLabel: 'One' }), item('b', { group: 'g2', groupLabel: 'Two' }), item('c', { group: 'g1', groupLabel: 'One' })]);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.key)])).toEqual([['g1', ['a', 'c']], ['g2', ['b']]]);
  });

  it('ungrouped stages form one group without a heading', () => {
    const groups = groupChecklist([item('a'), item('b')]);
    expect(groups).toEqual([{ key: null, label: null, items: [expect.objectContaining({ key: 'a' }), expect.objectContaining({ key: 'b' })] }]);
  });
});
