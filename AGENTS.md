# PrintShop Hub — Agent Guide

## Quick start
```bash
npm install
npm run dev              # Vite (port 5000) + Express (port 3001) concurrently
npm run build            # Vite build to dist/
npm start                # Production: serves dist/ + API on port 3000
npm run frontend         # Vite only
npm run backend          # Express only
npm run electron         # Build + run as Electron desktop app
npm run electron:dev     # Build + run Electron in dev mode
npm run electron:dist    # Build distributable for current platform
npm run electron:dist:win   # Build Windows NSIS installer
npm run electron:dist:mac   # Build macOS DMG
npm run electron:dist:linux # Build Linux AppImage + deb
```

## Architecture
- **Frontend**: React 19 + TypeScript + Vite, port 5000, Tailwind via local `tailwind.min.js` (NOT npm package)
- **Backend**: Express 5 ESM, port 3001 (dev) / 3000 (prod)
- **DB**: SQLite via `better-sqlite3` (`database.sqlite`, WAL mode). Tables: `jobs`, `settings`, `discount_rules`
- **Styling**: No component library — raw Tailwind utility classes everywhere
- **No tests, no linter, no typecheck script** in package.json
- **`@/` path alias**: vite maps to `/src` but source files live at root level (not in `src/`), and tsconfig maps to `./*`. Currently unused — all imports use relative paths.
- **Electron**: Main process (`electron/main.js`) starts Express, creates BrowserWindow. Preload (`electron/preload.js`) exposes minimal API via contextBridge.

## Key conventions
- **ESM only** — `"type": "module"` in package.json. Electron main process also ESM.
- **i18n**: `localStorage` key `ps_language` (`"en"`/`"ar"`). RTL via `<html dir>`.
- **Admin auth**: Bearer token in `localStorage` key `ps_admin_token`. Default password `admin123` (stored in settings table).
- **Keyboard shortcuts**: Ctrl+K (admin login), Ctrl+U (upload), Escape (back/cancel)
- **File uploads**: Multer, 50MB limit, stored in `uploads/`
- **Page count**: Server-side PDF counting via `pdf-lib`. Client-side fallback heuristics in `utils/pricingUtils.ts`.
- **Data directory**: In Electron, DB + uploads go to `app.getPath('userData')`. Override via `PS_DATA_DIR` env var.
- **Source protection**: Vite build uses `sourcemap: false` + `terser` with `drop_console`. Electron app packaged as `asar` (native module `better-sqlite3` unpacked).

## Database migrations
Inline in `db.js`:
```js
try { db.exec(`ALTER TABLE jobs ADD COLUMN paperType TEXT DEFAULT 'normal'`); } catch (e) {}
```
Migration script: `node migrate-to-sqlite.js` (converts from legacy `db.json`). Old file backed up as `db.json.bak_<timestamp>`.

## API routes (all `/api`)
| Route | Method | Notes |
|---|---|---|
| `/upload` | POST | `multipart/form-data`: `file` + `metadata` (JSON string) |
| `/jobs` | GET, DELETE | |
| `/jobs/:id/file` | POST | Replace file for existing job |
| `/jobs/:id/status` | PUT | |
| `/jobs/:id/preferences` | PUT | `{colorMode, copies, paperType}` |
| `/settings` | GET, POST | Key-value shop config |
| `/settings/logo` | POST | Upload shop logo |
| `/auth/verify` | POST | `{password}` → `{success}` |
| `/discount-rules` | GET, POST, PUT, DELETE | CRUD |

## Noteworthy gotchas
- **Dockerfile is broken** — ends with incomplete `RUN npm ` command
- **No strict mode** in tsconfig — `strict` not enabled
- **Express 5** — verify middleware signatures (e.g. error handler has 4 params)
- **.env** currently sets `NODE_ENV=production` — comment it out or change for dev hot reload
- **`uploads/` directory** is gitignored; auto-created on server start. In Electron, created in userData.
- **`better-sqlite3` native module** — must be in `asarUnpack` in electron-builder config
- **Electron requires build step** — `npm run electron` calls `npm run build` first
- **Tray icon** shows local + network IP for customer access
