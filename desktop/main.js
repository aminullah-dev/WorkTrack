// WorkTrack desktop shell: wraps the deployed company portal in a native
// window. The portal itself stays on Firebase Hosting, so web deploys reach
// desktop users without reinstalling.
const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const PORTAL_URL = process.env.WORKTRACK_PORTAL_URL || "https://worktrack-prod.web.app";
const PORTAL_ORIGIN = new URL(PORTAL_URL).origin;
// SMOKE=1 runs headless: load the portal, report, quit (used by CI/dev checks).
const SMOKE = process.env.SMOKE === "1";

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: !SMOKE,
    autoHideMenuBar: true,
    backgroundColor: "#f4f6f8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep the shell on the portal origin; everything else opens in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== PORTAL_ORIGIN) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.on("did-fail-load", (event, code, desc, url, isMainFrame) => {
    // -3 = aborted (e.g. SPA navigation interrupted a load) — not an outage.
    if (!isMainFrame || code === -3) return;
    if (SMOKE) {
      console.error(`SMOKE: failed to load ${url}: ${desc} (${code})`);
      app.exit(1);
    }
    win.loadFile(path.join(__dirname, "error.html"));
  });

  win.webContents.on("did-finish-load", () => {
    if (SMOKE && win.webContents.getURL().startsWith(PORTAL_ORIGIN)) {
      console.log(`SMOKE: loaded ${win.webContents.getURL()}`);
      app.quit();
    }
  });

  win.loadURL(PORTAL_URL);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
