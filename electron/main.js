// Electron main process entry.
//
// On app-ready we start the existing Express server in-process (importing
// ../server.js is enough — it calls app.listen() at module top level), wait
// until /api/health responds, then open a BrowserWindow pointed at it.
//
// A fixed local port is used so multi-instance detection and any future
// deep-link/URL handling stay predictable. Port + host + NODE_ENV are set
// before the server.js import so server.js picks them up on load.

import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dev mode = running against the Vite dev server + a separately-spawned
// node server.js (see the "electron:dev" npm script). In dev, Electron
// does NOT embed the server — it just opens a window at the Vite URL.
const IS_DEV = process.env.NODE_ENV === 'development';

// Uncommon high port to avoid clashes with common dev tools (3000/3001/5173/8080).
const SERVER_PORT = 47821;
// Bind Express to 0.0.0.0 so phones on the same Wi-Fi can hit the upload page
// via the shop's LAN IP (this is what /api/local-ip + the QR poster rely on).
// The Electron window itself always connects to the loopback address.
const SERVER_BIND_HOST = '0.0.0.0';
const LOOPBACK = '127.0.0.1';
const LOCAL_URL = `http://${LOOPBACK}:${SERVER_PORT}`;
// The Vite dev server the repo has always used (see vite.config.ts).
const DEV_URL = 'http://localhost:3000';


process.env.PORT = String(SERVER_PORT);
process.env.HOST = SERVER_BIND_HOST;
// When packaged we always want production behavior (serve dist, no CORS shim).
if (app.isPackaged && !process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// In a packaged install the app dir is read-only under Program Files, so the
// SQLite file + uploads/ can't live next to the code. Redirect them to the
// per-user userData folder (e.g. %APPDATA%\PrintShop Hub\). server.js and db.js
// pick these up via env vars — set them BEFORE importing server.js.
//
// In dev (unpackaged) we leave the env vars unset so the existing repo-relative
// database.sqlite and uploads/ folder keep working exactly as before.
if (app.isPackaged) {
  const userData = app.getPath('userData');
  const dbPath = path.join(userData, 'database.sqlite');
  const uploadsDir = path.join(userData, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  process.env.PRINTSHOP_DB_PATH = dbPath;
  process.env.PRINTSHOP_UPLOADS_DIR = uploadsDir;
}

// Register a custom URL scheme so the Gmail-callback success page (opened in
// the OS browser) can pop the Electron app back to the front with a single
// click on "Return to PrintShop Hub". The protocol payload is discarded — we
// use it as a focus signal, not a router.
const PROTOCOL = 'printshop-hub';
if (process.defaultApp && process.argv.length >= 2) {
  // In dev, `electron .` needs the script path passed through for the
  // registered handler to relaunch correctly.
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Second launch focuses the existing window instead of starting a second server
// on an already-bound port. Also handles the case where Windows re-launches
// the app because the OS browser opened a printshop-hub:// URL.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// Poll /api/health until it responds 200 or we time out.
async function waitForServer(url, timeoutMs = 15_000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else reject(new Error(`HTTP ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1_000, () => req.destroy(new Error('timeout')));
      });
      return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms (last: ${lastErr?.message})`);
}

// Trimmed menu — Reload is included (staff-useful for network hiccups / stale
// state), DevTools + Force-Reload are not (dev-only clutter).
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f8fafc',
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // window.open handling. OAuth to Google is routed to the OS browser so it
  // picks up the user's existing Google session (Electron has its own cookie
  // jar and can't share cookies with Chrome/Edge — this is Google's
  // recommended desktop OAuth flow anyway: external browser + loopback
  // callback). Everything else also goes to the OS browser so we don't turn
  // this app into a general-purpose browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // F5 as a second reload accelerator (Ctrl+R is on the menu). Shop staff
  // hit F5 by muscle memory. F12 as a second DevTools accelerator so
  // debugging works without opening the menu.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' && !input.control && !input.meta && !input.alt) {
      mainWindow.webContents.reload();
      event.preventDefault();
    } else if (input.key === 'F12' && !input.control && !input.meta && !input.alt) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });

  // Shop staff run this on the counter machine — land them on the admin panel.
  // /admin resolves to the dashboard if a saved session exists, otherwise the
  // login page. The upload page stays reachable over the LAN via the QR code.
  const baseUrl = IS_DEV ? DEV_URL : LOCAL_URL;
  mainWindow.loadURL(`${baseUrl}/admin`);
}

app.whenReady().then(async () => {
  buildMenu();
  try {
    // Always embed the Express server in the Electron process. This keeps a
    // single better-sqlite3 build (against Electron's Node ABI) — running a
    // separate `node server.js` would need a second build against the system
    // Node ABI and the two would fight over @electron/rebuild.
    await import('../server.js');
    await waitForServer(`${LOCAL_URL}/api/health`);
    if (IS_DEV) {
      // In dev the frontend comes from Vite (HMR). Vite proxies /api to the
      // embedded server via VITE_API_TARGET (set by the electron:dev script).
      await waitForServer(DEV_URL, 30_000);
    }
  } catch (err) {
    console.error('❌ Failed waiting for server:', err.message);
    app.quit();
    return;
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

// Close the DB cleanly before the process exits. Importing db.js returns the
// same singleton connection server.js already opened, so this doesn't create
// a second handle.
app.on('will-quit', async () => {
  try {
    const { default: db } = await import('../db.js');
    db.close();
  } catch { /* nothing to close */ }
});
