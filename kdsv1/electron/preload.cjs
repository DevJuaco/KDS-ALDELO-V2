const { contextBridge, ipcRenderer } = require('electron');

// ===== API ESPECÍFICA DE ELECTRON (Compatibilidad) =====
contextBridge.exposeInMainWorld('electronAPI', {
    // DRM: Obtener hostname del sistema Windows
    getHostname: () => ipcRenderer.invoke('drm:getHostname'),

    // DRM: Activar el sistema (retorna el fingerprint/hostname)
    activate: () => ipcRenderer.invoke('drm:activate'),

    // DRM: Verificar si está en Electron
    isElectron: () => ipcRenderer.invoke('drm:isElectron'),

    // Cola de impresión (persistencia en archivo JSON)
    printQueue: {
        read: () => ipcRenderer.invoke('printQueue:read'),
        save: (queue) => ipcRenderer.invoke('printQueue:save', queue),
        clear: () => ipcRenderer.invoke('printQueue:clear'),
        getPath: () => ipcRenderer.invoke('printQueue:getPath'),
    },

    // Cerrar aplicación
    quitApp: () => ipcRenderer.send('quit-app'),
});

// ===== API UNIVERSAL (Para compatibilidad con múltiples plataformas) =====
contextBridge.exposeInMainWorld('nativeAPI', {
    // Obtener hostname del sistema (Windows usa os.hostname())
    getHostname: () => ipcRenderer.invoke('drm:getHostname'),

    // Activar el sistema y retornar fingerprint (hostname en Windows)
    activate: async () => {
        const result = await ipcRenderer.invoke('drm:activate');
        return {
            ...result,
            platform: 'electron', // Identificar que viene de Electron
        };
    },

    // Detectar plataforma
    getPlatform: () => Promise.resolve('electron'),
});

console.log('✅ Preload script cargado correctamente con API universal (DRM por hostname)');
