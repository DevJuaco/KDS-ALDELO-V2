const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow = null;
let pythonProcess = null;
let staticServer = null;

const API_PORT = 5001;
const FRONTEND_PORT = 3002;

// ─── Modo desarrollo: Flask sirve todo en :5001 ───────────────────────────────
// ─── Modo producción: kds_api.exe en :5001 + servidor estático en :3002 ───────

function waitForApi(retries = 20, delay = 500) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://localhost:${API_PORT}/config/zones`, (res) => {
        if (res.statusCode < 500) resolve();
        else if (retries-- > 0) setTimeout(attempt, delay);
        else reject(new Error('API not ready'));
      }).on('error', () => {
        if (retries-- > 0) setTimeout(attempt, delay);
        else reject(new Error('API not reachable'));
      });
    };
    attempt();
  });
}

function startStaticServer() {
  const distPath = path.join(__dirname, '../dist');
  const server = http.createServer((req, res) => {
    let filePath = path.join(distPath, req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distPath, 'index.html');
    }
    const ext = path.extname(filePath);
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(FRONTEND_PORT, 'localhost', () => { staticServer = server; resolve(); }));
}

function startPythonBackend() {
  const exeName = process.platform === 'win32' ? 'kds_api.exe' : 'kds_api';
  const exePath = path.join(process.resourcesPath, exeName);
  if (!fs.existsSync(exePath)) {
    console.warn('kds_api no encontrado en', exePath);
    return;
  }
  pythonProcess = spawn(exePath, [], { cwd: process.resourcesPath, detached: false, windowsHide: true });
  pythonProcess.stdout.on('data', (d) => console.log('[API]', d.toString().trim()));
  pythonProcess.stderr.on('data', (d) => console.error('[API]', d.toString().trim()));
  pythonProcess.on('exit', (code) => console.log('[API] exited with code', code));
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../public/favicon.ico'),
  });

  mainWindow.loadURL(url);
  mainWindow.webContents.on('did-finish-load', () => console.log('KDS cargado:', url));
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => console.error('Error carga:', code, desc));
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.on('quit-app', () => app.quit());

app.whenReady().then(async () => {
  try {
    if (app.isPackaged) {
      startPythonBackend();
      await startStaticServer();
      await waitForApi().catch(() => console.warn('API no respondió a tiempo, continuando...'));
      createWindow(`http://localhost:${FRONTEND_PORT}`);
    } else {
      createWindow(`http://localhost:${API_PORT}`);
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(app.isPackaged ? `http://localhost:${FRONTEND_PORT}` : `http://localhost:${API_PORT}`);
      }
    });
  } catch (err) {
    console.error('Error iniciando KDS:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (staticServer) staticServer.close();
  if (pythonProcess) pythonProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => console.error('Error no capturado:', error));
process.on('unhandledRejection', (reason) => console.error('Promesa rechazada:', reason));
