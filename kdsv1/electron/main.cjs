const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const os = require('os'); // Para obtener el hostname del sistema Windows

let mainWindow = null;
let server = null;
let PORT = 3002;

// Iniciar servidor Express (tu código actual)
function startServer() {
  return new Promise((resolve, reject) => {
    const expressApp = express();

    // CORS
    expressApp.use(cors());

    // Servir archivos estáticos
    expressApp.use(express.static(path.join(__dirname, '../dist')));

    // Health check
    expressApp.get('/health', (req, res) => {
      res.json({ status: 'OK' });
    });

    // Manejo SPA manual (tu código)
    expressApp.use((req, res, next) => {
      const filePath = path.join(__dirname, '../dist', req.path);

      // Si el archivo existe, servirlo
      if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        res.sendFile(filePath);
      } else {
        // Si no existe, servir index.html para SPA
        res.sendFile(path.join(__dirname, '../dist', 'index.html'));
      }
    });

    // Iniciar servidor
    server = expressApp.listen(PORT, 'localhost', () => {
      console.log(`✅ Servidor Express iniciado en http://localhost:${PORT}`);
      resolve();
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️  Puerto ${PORT} ocupado, intentando cerrar servidor anterior...`);
        PORT = PORT + 1;
        startServer().then(resolve).catch(reject);
      } else {
        console.error('❌ Error iniciando servidor:', err);
        reject(err);
      }
    });
  });
}

function createWindow() {
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
    icon: path.join(__dirname, '../build/icon.png')
  });

  // Cargar la app desde el servidor local
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Abrir DevTools solo en desarrollo
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Log de navegación (solo para debugging)
  mainWindow.webContents.on('did-navigate', (event, url) => {
    console.log('📍 Navegó a:', url);
  });

  // Manejar enlaces externos
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Log cuando termine de cargar
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Aplicación cargada correctamente');
  });
}

// IPC: Cerrar la aplicación desde el renderer
ipcMain.on('quit-app', () => {
  console.log('🛑 Cerrando aplicación desde Settings...');
  app.quit();
});

// Inicializar la aplicación
app.whenReady().then(async () => {
  try {
    console.log('🚀 Iniciando KDS System...');

    // Primero iniciar el servidor
    await startServer();

    // Esperar un momento para que el servidor esté listo
    setTimeout(() => {
      createWindow();
    }, 500);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('❌ Error iniciando la aplicación:', error);
    app.quit();
  }
});

// ===== HANDLERS IPC PARA DRM =====

// Handler para obtener el hostname del sistema Windows (os.hostname())
ipcMain.handle('drm:getHostname', () => {
  const hostname = os.hostname();
  console.log('🔐 DRM: Hostname del sistema solicitado:', hostname);
  return hostname;
});

// Handler para activar DRM (retorna hostname como fingerprint)
ipcMain.handle('drm:activate', () => {
  const hostname = os.hostname();
  console.log('✅ DRM: Activación con hostname del sistema:', hostname);
  return {
    success: true,
    fingerprint: hostname,
    message: 'Activación exitosa',
    platform: 'electron'
  };
});

// Handler para verificar si es ambiente Electron
ipcMain.handle('drm:isElectron', () => {
  return true;
});


// ===== HANDLERS IPC PARA COLA DE IMPRESIÓN =====

// Ruta del archivo JSON de la cola (en userData para persistencia)
function getPrintQueuePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'print-queue.json');
}

// Leer la cola desde el archivo JSON
ipcMain.handle('printQueue:read', () => {
  const filePath = getPrintQueuePath();
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ PrintQueue: Error leyendo archivo JSON:', err);
    return [];
  }
});

// Guardar la cola en el archivo JSON
ipcMain.handle('printQueue:save', (_event, queue) => {
  const filePath = getPrintQueuePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(queue, null, 2), 'utf-8');
    console.log(`💾 PrintQueue: Cola guardada (${queue.length} items) → ${filePath}`);
    return { success: true };
  } catch (err) {
    console.error('❌ PrintQueue: Error guardando archivo JSON:', err);
    return { success: false, error: err.message };
  }
});

// Limpiar la cola (eliminar el archivo JSON)
ipcMain.handle('printQueue:clear', () => {
  const filePath = getPrintQueuePath();
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.log('🗑️ PrintQueue: Cola limpiada');
    return { success: true };
  } catch (err) {
    console.error('❌ PrintQueue: Error limpiando archivo JSON:', err);
    return { success: false, error: err.message };
  }
});

// Obtener la ruta del archivo de la cola (para debugging)
ipcMain.handle('printQueue:getPath', () => {
  return getPrintQueuePath();
});


// Limpiar al cerrar
app.on('window-all-closed', () => {
  if (server) {
    server.close(() => {
      console.log('🛑 Servidor cerrado');
    });
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
  }
});

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promesa rechazada:', reason);
});