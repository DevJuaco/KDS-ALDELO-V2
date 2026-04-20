/**
 * @deprecated
 * Este módulo ya no se usa para identificar dispositivos.
 *
 * El nuevo sistema DRM identifica dispositivos por:
 *   - Electron / Windows  → os.hostname() vía IPC (nativeAPI.getHostname)
 *   - React Native / Android → equipo_id (device ID nativo) vía postMessage
 *   - Web (navegador) → hostname manual ingresado por el usuario
 *
 * Ver: src/hooks/useDRM.ts
 */

import type { FingerprintData } from '../types/drm';

/**
 * @deprecated No usado en el nuevo sistema DRM.
 * Solo se mantiene para compatibilidad con imports anteriores.
 */
export function generateFingerprint(): Promise<FingerprintData> {
  return Promise.resolve({
    screen_data: `${screen.width}x${screen.height}:${screen.colorDepth}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    plugins: Array.from(navigator.plugins || []).map((p) => p.name).join(','),
    hardware_concurrency: navigator.hardwareConcurrency?.toString() || 'unknown',
    accept_language: navigator.language || '',
    fonts: '',
    canvas_hash: '',
  });
}

// No exponer en window.generateFingerprint — el nuevo sistema no lo usa.