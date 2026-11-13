import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { NavToggle, SidebarFrame, drawerFrameClass } from './NavDrawer';

jest.mock('next/navigation', () => ({ usePathname: () => '/mentoring/classes' }));

describe('the small-screen navigation drawer', () => {
  it('is off-canvas when closed and on-canvas when open, and always static from 1024px up', () => {
    expect(drawerFrameClass(false)).toContain('-translate-x-full');
    expect(drawerFrameClass(true)).toContain(' translate-x-0');
    expect(drawerFrameClass(false)).toContain('lg:static');
    expect(drawerFrameClass(false)).toContain('lg:translate-x-0');
  });

  it('respects reduced motion', () => {
    expect(drawerFrameClass(true)).toContain('motion-reduce:transition-none');
  });

  it('gives the menu button a name, a state and the id it controls, and hides it from 1024px up', () => {
    const out = renderToStaticMarkup(React.createElement(NavToggle));
    expect(out).toContain('aria-label="Open navigation"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-controls="app-navigation"');
    expect(out).toContain('lg:hidden');
  });

  it('renders the sidebar inside the drawer frame with a close button, and no backdrop while closed', () => {
    const out = renderToStaticMarkup(React.createElement(SidebarFrame, null, React.createElement('nav', null, 'Links')));
    expect(out).toContain('id="app-navigation"');
    expect(out).toContain('aria-label="Close navigation"');
    expect(out).toContain('Links');
    expect(out).not.toContain('nav-backdrop');
  });
});
