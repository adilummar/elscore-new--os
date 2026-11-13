import { readFileSync } from 'fs';
import { join } from 'path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MeetLinkDisplay } from './ClassSections';
import { SubjectMeetLink } from './students/[id]/TutorPanel';
import type { TutorTools } from './tutor-types';

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const LINK = 'https://meet.google.com/abc-defg-hij';
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\r\n/g, '\n');
const tools = (over: Partial<TutorTools> = {}): TutorTools => ({
  assignments: [], canAssign: false, canManageAvailability: false, loadCandidates: jest.fn(), assign: jest.fn(), remove: jest.fn(), loadAvailability: jest.fn(), saveAvailability: jest.fn(), ...over,
});

describe('the Meet link on a class', () => {
  it('is a link that opens in a new tab, safely', () => {
    const out = html(React.createElement(MeetLinkDisplay, { link: LINK, source: 'SUBJECT' }));
    expect(out).toContain(`href="${LINK}"`);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('opens in a new tab');
  });

  it('says plainly when there is none, and does not invent one', () => {
    const out = html(React.createElement(MeetLinkDisplay, { link: null }));
    expect(out).toContain('No Google Meet link has been added for this class.');
    expect(out).not.toContain('<a ');
  });

  it('never links an address that is not https', () => {
    for (const bad of ['http://insecure.example', 'javascript:alert(1)', 'meet.google.com/abc']) {
      const out = html(React.createElement(MeetLinkDisplay, { link: bad }));
      expect(out).not.toContain('<a ');
      expect(out).toContain('No Google Meet link has been added for this class.');
    }
  });

  it('says so when the link was saved on the single class earlier', () => {
    expect(html(React.createElement(MeetLinkDisplay, { link: LINK, source: 'CLASS' }))).toContain('saved on this class earlier');
    expect(html(React.createElement(MeetLinkDisplay, { link: LINK, source: 'SUBJECT' }))).not.toContain('saved on this class earlier');
  });

  it('has no input and no Save link button anywhere in the Before class tab or the reminder card', () => {
    const drawer = read('ClassWorkspaceDrawer.tsx');
    const before = drawer.slice(drawer.indexOf("ws-panel-before"), drawer.indexOf("ws-panel-after"));
    expect(before).not.toMatch(/<Input|<input|Save link|meet-link|setLink/);
    expect(drawer).not.toContain('Meet link for this class');
    expect(drawer).not.toContain("'/meet-link'");
    expect(drawer).not.toMatch(/`\/\$\{classKey\}\/meet-link`/);
  });
});

describe('the Meet link of a subject', () => {
  it('is an input with a Save link button for the assigned Mentor', () => {
    const out = html(React.createElement(SubjectMeetLink, { subjectId: 'sub-en', link: LINK, tools: tools({ canEditMeetLink: true, setMeetLink: jest.fn() }) }));
    expect(out).toContain('type="url"');
    expect(out).toContain(`value="${LINK}"`);
    expect(out).toContain('Save link');
    expect(out).toContain('for="subject-meet-link-sub-en"');
    expect(out).toContain('Every class of this subject and every class reminder uses this link');
  });

  it('is only a link, with no input, for anyone who may not change it', () => {
    const out = html(React.createElement(SubjectMeetLink, { subjectId: 'sub-en', link: LINK, tools: tools({ canEditMeetLink: false }) }));
    expect(out).not.toContain('<input');
    expect(out).not.toContain('Save link');
    expect(out).toContain(`href="${LINK}"`);
    expect(out).toContain('target="_blank"');
  });

  it('says there is none for a subject without a link', () => {
    expect(html(React.createElement(SubjectMeetLink, { subjectId: 'sub-en', link: null, tools: tools() }))).toContain('No Google Meet link has been added for this subject.');
  });
});
