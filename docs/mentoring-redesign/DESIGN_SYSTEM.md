# Mentoring visual system (fallback, not generator output)

**Generator status: not run.** `.claude/skills/ui-ux-pro-max` contains only `SKILL.md`. Its `references/`, `scripts/search.py` and design data are missing, so the documented workflow and its pre-delivery checklist could not be run. This system is built from the app's existing tokens and conventions (`tailwind.config.ts`: slate neutrals, `brand` green for actions, teal `primary` for the sidebar and the active workspace tab, `shadow-card`). No dependency was added. Nothing here should be described as skill-generated.

Source of truth: `apps/web/src/app/(app)/mentoring/mentoring-ui.tsx` (tested in `mentoring-ui.spec.ts`).

| Part | Rule |
|---|---|
| Type | Page title 24px semibold, tight tracking. Body 14px. Column headings and hints 12px, slate-600 or darker. No text below 12px. |
| Surfaces | `PANEL`: white, one soft ring (`ring-slate-200/70`), `shadow-card`. Used for tables and the few blocks that must stand apart. No box around every block. |
| Tables | Faint 1px rule between rows, uppercase 12px headings on a very light band, hover tint. A class or meeting that waits on the Mentor gets a 3px amber edge on its first cell instead of a coloured row. |
| Status | `StatusChip`: dot plus words, five tones (neutral, info, success, warning, danger), 800/900 text on 50 tints. In tables, `Check`/`Clock`/`AlertTriangle`/`Minus` icon plus words. Never colour alone. |
| Actions | One green primary action per row or page (`linkButton('primary')`), everything else white with a ring. Minimum 36px high; 44px full-width on mobile cards. |
| Navigation | Shell: breadcrumb, three 44px workspace tabs (active is the teal primary), quiet secondary row. Queue tabs: underline with a count badge, amber only when the count is above zero. |
| Responsive | Below 1024px tables become cards (`lg:hidden` / `hidden lg:block`). Tab rows and the shell scroll horizontally instead of wrapping. |
| States | `ListSkeleton` while loading, `Empty` with a next step, `Notice tone="error"` with a retry action. |
| Focus | `FOCUS` ring on every interactive element (2px brand-500, offset 2). |

Contrast: chip and amber text pairs are 800/900 on 50 tints (above 7:1); secondary text is slate-600 or darker on white (above 7:1 for slate-600, 4.5:1 minimum). These were chosen by reading the Tailwind palette, **not measured in a browser**.

Not verified: visual rendering at 375, 768 and 1280 px, keyboard order, screen-reader output. See the verification section of the final report.
