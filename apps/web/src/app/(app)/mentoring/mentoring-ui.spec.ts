import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Empty, ListSkeleton, Notice, PageHeader, ProgressBar, QueueTabs, Segmented, StatusChip, chipTone, linkButton } from './mentoring-ui';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe('Mentoring visual system', () => {
  it('maps the existing tone words onto chip tones, and unknown words onto neutral', () => {
    expect(['success', 'warning', 'danger', 'info', 'default', undefined, 'x'].map((v) => chipTone(v))).toEqual(['success', 'warning', 'danger', 'info', 'neutral', 'neutral', 'neutral']);
  });

  it('shows a status as a dot and words, never colour alone', () => {
    const out = html(React.createElement(StatusChip, { tone: 'warning' }, 'Awaiting verification'));
    expect(out).toContain('Awaiting verification');
    expect(out).toContain('aria-hidden="true"');
  });

  it('gives a page one h1 and an optional subtitle and actions', () => {
    const out = html(React.createElement(PageHeader, { title: 'Classes', subtitle: 'Today', actions: React.createElement('button', null, 'Go') }));
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toContain('Today');
    expect(out).toContain('Go');
  });

  it('marks the open tab with aria-pressed and shows counts, highlighting urgent ones only when above zero', () => {
    const out = html(React.createElement(QueueTabs, { label: 'Queues', value: 'b', onChange: () => undefined, items: [{ key: 'a', label: 'A', count: 0, urgent: true }, { key: 'b', label: 'B', count: 3, urgent: true }] }));
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(out.match(/bg-amber-100/g)).toHaveLength(1);
  });

  it('keeps segmented choices pressable by keyboard and labelled', () => {
    const out = html(React.createElement(Segmented, { label: 'Day or week', value: 'day', onChange: () => undefined, items: [{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }] }));
    expect(out).toContain('aria-label="Day or week"');
    expect(out.match(/<button/g)).toHaveLength(2);
  });

  it('clamps progress to 0..100 and names it', () => {
    expect(html(React.createElement(ProgressBar, { percent: 140, label: 'Verified' }))).toContain('aria-valuenow="100"');
    expect(html(React.createElement(ProgressBar, { percent: -5, label: 'Verified' }))).toContain('aria-valuenow="0"');
  });

  it('makes errors alerts and loading a labelled status', () => {
    expect(html(React.createElement(Notice, { tone: 'error' }, 'Failed'))).toContain('role="alert"');
    expect(html(React.createElement(ListSkeleton, { label: 'Loading' }))).toContain('role="status"');
    expect(html(React.createElement(Empty, { title: 'Nothing here', testId: 'e' }, 'Try another date'))).toContain('Try another date');
  });

  it('keeps every link-button at least 36px tall, and 44px when it fills the width', () => {
    expect(linkButton()).toContain('min-h-9');
    expect(linkButton('primary', true)).toContain('min-h-11');
    expect(linkButton('primary')).toContain('bg-brand-600');
  });
});
