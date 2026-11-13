"use client";

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

/**
 * The app navigation on small screens. From 1024px up the sidebar sits beside the page as before. Below that it is a drawer: closed by
 * default, opened by the menu button in the header, closed by the backdrop, the close button, Escape, or choosing a page. Nothing about
 * what the sidebar lists, or who sees what, changes here.
 */
interface DrawerState { open: boolean; setOpen: (open: boolean) => void }
const NavDrawerContext = React.createContext<DrawerState>({ open: false, setOpen: () => undefined });
export const useNavDrawer = () => React.useContext(NavDrawerContext);

/** The classes for the drawer frame in each state. Kept apart so they can be tested. */
export function drawerFrameClass(open: boolean): string {
  return `fixed inset-y-0 left-0 z-40 w-64 max-w-[85vw] transform transition-transform duration-200 ease-out motion-reduce:transition-none lg:static lg:z-auto lg:max-w-none lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`;
}

export function NavDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Choosing a page closes the drawer.
  React.useEffect(() => { setOpen(false); }, [pathname]);

  // Escape closes it, and the page behind it does not scroll while it is open.
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const value = React.useMemo(() => ({ open, setOpen }), [open]);
  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>;
}

/** Wraps the sidebar. Static beside the page on large screens, a drawer with a backdrop on small ones. */
export function SidebarFrame({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useNavDrawer();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" aria-hidden="true" onClick={() => setOpen(false)} data-testid="nav-backdrop" />}
      <div id="app-navigation" className={drawerFrameClass(open)} data-open={open} data-testid="nav-frame">
        <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation"
          className="absolute right-2 top-3 z-10 rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:hidden">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        {children}
      </div>
    </>
  );
}

/** The menu button in the header. Only shown below 1024px. */
export function NavToggle() {
  const { open, setOpen } = useNavDrawer();
  return (
    <button type="button" onClick={() => setOpen(!open)} aria-label="Open navigation" aria-expanded={open} aria-controls="app-navigation"
      className="mr-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:hidden">
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
