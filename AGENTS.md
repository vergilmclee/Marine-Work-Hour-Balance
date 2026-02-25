# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

ShiftCycle 18 is a client-only React + Vite + TypeScript SPA for tracking 18-day shift cycles. There is no backend, database, or external API — all data persists in browser `localStorage`.

### Development commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (Vite, default port 5173) |
| Production build | `npm run build` |
| Preview build | `npm run preview` |

### Known issues

- **Pre-existing TypeScript errors**: `tsc --noEmit` reports ~12 type errors (missing translation keys in `App.tsx`, missing props on `SituationWizard`, and `__dirname`/`path` in `vite.config.ts`). These are type-level only and do not prevent Vite from building or serving the app.
- **No ESLint or test framework**: The project has no eslint config and no test runner configured. There are no automated tests to run.
- **No lockfile**: The project ships without a `package-lock.json`. `npm install` generates one on first run.

### Gotchas

- Tailwind CSS is loaded via CDN (`<script src="https://cdn.tailwindcss.com">` in `index.html`), not as an npm dependency. Internet access is required for styles to load in the browser.
- The `index.html` importmap references esm.sh CDN URLs, but Vite overrides these during dev/build — the importmap is only relevant for direct browser usage without Vite.
