import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ReminderCheckbox, TabBar } from './ClassSections';
import type { ReminderCheck } from './class-sections-view';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const check = (over: Partial<ReminderCheck> = {}): ReminderCheck => ({ status: 'PREPARED', label: 'Prepared, not sent', detail: 'Copied, not yet recorded as shared', done: false, canTick: true, shareId: 'sh-1', ...over });
const noop = () => undefined;

describe('the before-class checkbox', () => {
  it('is an unchecked, enabled, labelled checkbox while the message is only prepared', () => {
    const out = html(React.createElement(ReminderCheckbox, { check: check(), busy: false, onConfirm: noop }));
    expect(out).toContain('type="checkbox"');
    expect(out).not.toContain('checked=""');
    expect(out).not.toContain('disabled=""');
    expect(out).toContain('for="reminder-sent-check"');
    expect(out).toContain('Tutor has sent the class reminder to the student');
    expect(out).toContain('Prepared, not sent');
    expect(out).toContain('0 of 1 done');
  });
  it('is checked and locked once recorded as sent', () => {
    const out = html(React.createElement(ReminderCheckbox, { check: check({ status: 'SENT', label: 'Sent', done: true, canTick: false, detail: 'Recorded as shared by Mira' }), busy: false, onConfirm: noop }));
    expect(out).toContain('checked=""');
    expect(out).toContain('disabled=""');
    expect(out).toContain('1 of 1 done');
  });
  it('is disabled when the person may not act, and says who can', () => {
    const out = html(React.createElement(ReminderCheckbox, { check: check({ canTick: false }), busy: false, onConfirm: noop }));
    expect(out).toContain('disabled=""');
    expect(out).toContain('Only the assigned Mentor or the tutor can record this.');
  });
  it('is disabled and unchecked when pending, and disabled while busy', () => {
    const pending = html(React.createElement(ReminderCheckbox, { check: check({ status: 'PENDING', label: 'Pending', canTick: false, shareId: null }), busy: false, onConfirm: noop }));
    expect(pending).toContain('disabled=""');
    expect(pending).not.toContain('checked=""');
    expect(html(React.createElement(ReminderCheckbox, { check: check(), busy: true, onConfirm: noop }))).toContain('disabled=""');
  });
  it('points the checkbox at its status text for screen readers', () => {
    const out = html(React.createElement(ReminderCheckbox, { check: check(), busy: false, onConfirm: noop }));
    expect(out).toContain('aria-describedby="reminder-sent-status"');
    expect(out).toContain('id="reminder-sent-status"');
  });
});

describe('the class tab bar', () => {
  const tabs = [{ key: 'before', label: 'Before class' }, { key: 'after', label: 'After class' }, { key: 'timing', label: 'Actual time' }, { key: 'verification', label: 'Verification' }];
  it('has the four tabs in order, one selected, only that one in the tab order', () => {
    const out = html(React.createElement(TabBar, { label: 'Sections', tabs, value: 'timing', onChange: noop }));
    expect([...out.matchAll(/role="tab"/g)]).toHaveLength(4);
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(out.match(/tabindex="0"/g)).toHaveLength(1);
    expect(out.match(/tabindex="-1"/g)).toHaveLength(3);
    expect(out.indexOf('Before class')).toBeLessThan(out.indexOf('After class'));
    expect(out.indexOf('Actual time')).toBeLessThan(out.indexOf('Verification'));
  });
  it('links each tab to its panel and scrolls sideways when narrow', () => {
    const out = html(React.createElement(TabBar, { label: 'Sections', tabs, value: 'before', onChange: noop }));
    expect(out).toContain('aria-controls="ws-panel-before"');
    expect(out).toContain('id="ws-tab-verification"');
    expect(out).toContain('overflow-x-auto');
  });
});
