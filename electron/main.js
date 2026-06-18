import pkg from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const { app, BrowserWindow, Tray, Menu, nativeImage } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;

async function createWindow() {
  const userDataPath = app.getPath('userData');
  process.env.PS_DATA_DIR = userDataPath;

  const serverPath = path.join(__dirname, '..', 'server.js');
  const serverUrl = await import(serverPath);
  const PORT = process.env.PORT || 3000;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, "..", "public", "favicon", "favicon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    backgroundColor: "#F8FAFC",
  });

  mainWindow.loadURL(`http://localhost:${PORT}/admin`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  createTray(PORT);
}

function createTray(port) {
  const iconSize = process.platform === "darwin" ? 22 : 32;
  let trayIcon;
  try {
    const iconPath = path.join(
      __dirname,
      "..",
      "public",
      "favicon",
      "favicon.ico",
    );
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage
        .createFromPath(iconPath)
        .resize({ width: iconSize, height: iconSize });
    }
  } catch {}

  tray = new Tray(trayIcon || nativeImage.createEmpty());
  tray.setToolTip("PrintShop Hub");

  const networkInterfaces = os.networkInterfaces();
  let ipAddress = "localhost";
  for (const name of Object.keys(networkInterfaces)) {
    for (const iface of networkInterfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ipAddress = iface.address;
        break;
      }
    }
    if (ipAddress !== "localhost") break;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Open PrintShop Hub`,
      click: () => {
        if (mainWindow) mainWindow.show();
        else createWindow(port);
      },
    },
    { type: "separator" },
    {
      label: `Local: http://localhost:${port}`,
      enabled: false,
    },
    {
      label: `Network: http://${ipAddress}:${port}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    if (mainWindow) mainWindow.show();
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", async () => {
  try {
    const { reopenDb } = await import("../db.js");
    if (typeof reopenDb === "function") reopenDb();
  } catch {}
});
