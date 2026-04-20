// hooks/useDRM.ts
// Sistema DRM basado en identificador de dispositivo por plataforma:
//   - Electron/Windows  → os.hostname() vía IPC (nativeAPI.getHostname)
//   - React Native/Android → equipo_id vía ReactNativeWebView.postMessage
//   - Web               → hostname manual ingresado por el usuario
import { useState, useEffect, useRef } from 'react';
import type {
  LicenseStatus,
  ActivationResponse,
  VerificationResponse,
  LicenseData,
  Platform,
  DeviceIdentifier,
} from '../types/drm';

const API_BASE_URL = 'https://drm.solucionesintegralespos.com/api';

// ─── Utilidades de plataforma ─────────────────────────────────────────────────

async function detectPlatform(): Promise<Platform> {
  try {
    if (typeof window !== 'undefined' && window.nativeAPI) {
      return await window.nativeAPI.getPlatform();
    }
    if (typeof window !== 'undefined' && window.electronAPI) {
      return 'electron';
    }
    if (typeof window !== 'undefined' && window.ReactNativeWebView) {
      return 'react-native';
    }
  } catch (e) {
    console.warn('Error detectando plataforma:', e);
  }
  return 'web';
}

/**
 * Obtiene el identificador del dispositivo según la plataforma.
 *
 * Prioridad de búsqueda:
 *  1. Memoria (cachedDeviceId)
 *  2. localStorage (device_fingerprint_cache)
 *  3. nativeAPI.getHostname() para Electron
 *  4. ReactNativeWebView postMessage para React Native
 *  5. localStorage (manual_web_hostname) para Web
 *  6. null → la UI pedirá ingreso manual
 */
let cachedDeviceId: string | null = null;

async function getDeviceId(platform: Platform): Promise<string | null> {
  // 1. Caché en memoria
  if (cachedDeviceId) return cachedDeviceId;

  // 2. Caché persistente en localStorage
  const stored = localStorage.getItem('device_fingerprint_cache');
  if (stored) {
    cachedDeviceId = stored;
    console.log('📦 DeviceId recuperado de caché localStorage:', stored);
    return stored;
  }

  try {
    // 3. Web: Intentar hostname manual guardado previamente
    if (platform === 'web') {
      const manual = localStorage.getItem('manual_web_hostname');
      if (manual) {
        cachedDeviceId = manual;
        localStorage.setItem('device_fingerprint_cache', manual);
        console.log('📦 Hostname manual recuperado:', manual);
        return manual;
      }
      // No hay manual → retornar null para que la UI pida ingreso
      return null;
    }

    let deviceId: string | null = null;

    // 4. Electron/Windows: obtener hostname del sistema vía IPC
    if (typeof window !== 'undefined' && window.nativeAPI) {
      console.log('📡 Usando nativeAPI.getHostname');
      deviceId = await window.nativeAPI.getHostname();
    } else if (typeof window !== 'undefined' && window.electronAPI) {
      console.log('📡 Usando electronAPI.getHostname');
      deviceId = await window.electronAPI.getHostname();
    }

    // 5. React Native/Android: solicitar equipo_id vía postMessage
    else if (typeof window !== 'undefined' && window.ReactNativeWebView) {
      console.log('📡 Solicitando equipo_id a React Native');
      deviceId = await new Promise<string | null>((resolve) => {
        window.onNativeMessage = (data) => {
          if ((data.type === 'hostname' || data.type === 'equipo_id') && (data.hostname || data.equipo_id)) {
            resolve((data.hostname || data.equipo_id) as string);
          }
        };
        try {
          window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'getHostname' }));
        } catch (e) {
          console.error('Error enviando postMessage a React Native:', e);
          resolve(null);
        }
        setTimeout(() => {
          console.warn('⚠️ Timeout en getDeviceId React Native');
          resolve(null);
        }, 5000);
      });
    }

    if (deviceId) {
      cachedDeviceId = deviceId;
      localStorage.setItem('device_fingerprint_cache', deviceId);
      console.log('✅ DeviceId obtenido:', deviceId, '| plataforma:', platform);
    }

    return deviceId;
  } catch (error) {
    console.error('Error obteniendo deviceId:', error);
    return null;
  }
}

/**
 * Construye el payload de la petición DRM según la plataforma.
 */
function buildRequestData(
  licenseKey: string,
  deviceId: string,
  platform: Platform,
): Record<string, string> {
  if (platform === 'react-native') {
    return {
      clave_licencia: licenseKey,
      tipo_identificador: 'equipo_id',
      equipo_id: deviceId,
    };
  }
  // Electron (Windows) y Web manual usan hostname
  return {
    clave_licencia: licenseKey,
    tipo_identificador: 'hostname',
    hostname: deviceId,
  };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useDRM() {
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus>({
    isValid: false,
    isLoading: true,
    error: null,
    licenseData: null,
  });

  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [needsManualHostname, setNeedsManualHostname] = useState<boolean>(false);

  const initialized = useRef(false);
  const verificationInterval = useRef<NodeJS.Timeout | null>(null);

  // Efecto principal: inicialización
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      try {
        const savedLicenseKey = localStorage.getItem('drm_license_key');
        const savedFingerprint = localStorage.getItem('fingerprint');
        const savedLicenseData = localStorage.getItem('drm_license_data');

        if (savedLicenseKey && savedFingerprint && savedLicenseData) {
          const licenseData: LicenseData = JSON.parse(savedLicenseData);

          // Verificación inicial con el servidor (en background/silent)
          setLicenseStatus({
            isValid: true,
            isLoading: false,
            error: null,
            licenseData,
          });

          // Iniciar verificaciones periódicas
          startPeriodicVerification(savedLicenseKey);

          // Verificar silenciosamente con el servidor
          verifyWithServerSilent(savedLicenseKey, savedFingerprint);
        } else {
          // Sin licencia guardada
          setLicenseStatus({
            isValid: false,
            isLoading: false,
            error: null,
            licenseData: null,
          });
        }
      } catch (error) {
        console.error('Error inicializando DRM:', error);
        setLicenseStatus({
          isValid: false,
          isLoading: false,
          error: 'Error cargando licencia',
          licenseData: null,
        });
      }
    };

    init();

    return () => {
      if (verificationInterval.current) {
        clearInterval(verificationInterval.current);
      }
    };
  }, []);

  // ─── Verificación periódica ────────────────────────────────────────────────

  const startPeriodicVerification = (licenseKey: string) => {
    if (verificationInterval.current) {
      clearInterval(verificationInterval.current);
    }
    // Verificar cada 4 horas
    verificationInterval.current = setInterval(async () => {
      console.log('🔄 Verificación periódica DRM');
      const fingerprint = localStorage.getItem('fingerprint');
      if (fingerprint) {
        await verifyWithServerSilent(licenseKey, fingerprint);
      }
    }, 4 * 60 * 60 * 1000);
  };

  /**
   * Verificación silenciosa: si el servidor rechaza explícitamente,
   * revocar acceso. Si hay error de red/timeout, mantener acceso.
   */
  const verifyWithServerSilent = async (
    licenseKey: string,
    fingerprint: string,
  ): Promise<void> => {
    try {
      const platform = await detectPlatform();
      const requestData = buildRequestData(licenseKey, fingerprint, platform);

      console.log('🔄 Verificando licencia con servidor...', { platform, fingerprint });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_BASE_URL}/verificar.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn('⚠️ Error HTTP en verificación, manteniendo acceso offline:', response.status);
        return;
      }

      const data: VerificationResponse = JSON.parse(await response.text());

      if (data.success) {
        console.log('✅ Licencia verificada y válida en servidor');
        if (data.licencia) {
          localStorage.setItem('drm_license_data', JSON.stringify(data.licencia));
          setLicenseStatus((prev) => ({
            ...prev,
            isValid: true,
            licenseData: data.licencia ?? prev.licenseData,
            error: null,
          }));
        }
      } else {
        // El servidor rechaza explícitamente → revocar
        console.error('❌ Licencia REVOCADA en servidor:', data.error);
        revokeLocalAccess(data.error ?? 'Licencia revocada en el servidor');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('⏱️ Timeout en verificación DRM - modo offline, acceso mantenido');
      } else {
        console.warn('⚠️ Error de red en verificación DRM - acceso mantenido:', error);
      }
    }
  };

  const revokeLocalAccess = (reason: string) => {
    console.warn('🚫 Revocando acceso local:', reason);
    localStorage.removeItem('fingerprint');
    localStorage.removeItem('drm_license_key');
    localStorage.removeItem('drm_license_data');
    localStorage.removeItem('device_fingerprint_cache');
    cachedDeviceId = null;

    setLicenseStatus({
      isValid: false,
      isLoading: false,
      error: reason,
      licenseData: null,
    });

    if (verificationInterval.current) {
      clearInterval(verificationInterval.current);
      verificationInterval.current = null;
    }
  };

  // ─── Activación ───────────────────────────────────────────────────────────

  /**
   * Activa la licencia usando el identificador del dispositivo según plataforma.
   * Si es Web y no hay hostname manual, retorna needsManualHostname=true.
   */
  const activateLicense = async (licenseKey: string, manualHostname?: string): Promise<ActivationResponse> => {
    if (!licenseKey.trim()) {
      return { success: false, error: 'La clave de licencia es requerida' };
    }

    setIsActivating(true);

    try {
      const platform = await detectPlatform();
      console.log('🔐 Activando DRM en plataforma:', platform);

      // Si es web y se proporciona hostname manual, guardarlo
      if (platform === 'web' && manualHostname) {
        localStorage.setItem('manual_web_hostname', manualHostname.trim());
        localStorage.setItem('device_fingerprint_cache', manualHostname.trim());
        cachedDeviceId = manualHostname.trim();
      }

      // Obtener identificador del dispositivo
      const deviceId = await getDeviceId(platform);

      // Si es web y no hay deviceId, indicar que se necesita hostname manual
      if (!deviceId) {
        if (platform === 'web') {
          setNeedsManualHostname(true);
          setIsActivating(false);
          return { success: false, error: 'Ingresa el nombre del equipo para continuar' };
        }
        return {
          success: false,
          error: 'No se pudo obtener el identificador del dispositivo',
        };
      }

      setNeedsManualHostname(false);
      console.log('📱 Identificador del dispositivo:', deviceId, '| plataforma:', platform);

      // Construir payload según plataforma
      const requestData = buildRequestData(licenseKey, deviceId, platform);
      console.log('📤 Enviando solicitud de activación al servidor DRM...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE_URL}/activar.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let data: ActivationResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('El servidor respondió con un formato inválido');
      }

      console.log('📥 Respuesta del servidor DRM:', data);

      if (data.success) {
        const licenseData: LicenseData = {
          clave_licencia: licenseKey,
          activaciones_permitidas: data.activaciones_permitidas ?? 5,
          activaciones_actuales: data.activaciones_actuales ?? 1,
          fecha_expiracion: null,
          activa: true,
        };

        // Guardar en localStorage
        localStorage.setItem('fingerprint', deviceId);
        localStorage.setItem('drm_license_key', licenseKey);
        localStorage.setItem('drm_license_data', JSON.stringify(licenseData));

        setLicenseStatus({
          isValid: true,
          isLoading: false,
          error: null,
          licenseData,
        });

        startPeriodicVerification(licenseKey);
        console.log(`✅ DRM activado exitosamente [${platform}] - DeviceId: ${deviceId}`);
      }

      return data;
    } catch (error) {
      let errorMsg = 'Error de conexión';
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMsg = 'Tiempo de espera agotado. Verifica tu conexión a internet.';
        } else {
          errorMsg = error.message;
        }
      }
      setLicenseStatus((prev) => ({ ...prev, error: errorMsg }));
      return { success: false, error: errorMsg };
    } finally {
      setIsActivating(false);
    }
  };

  // ─── Desactivación ────────────────────────────────────────────────────────

  /**
   * Desactiva la licencia en el servidor y limpia el estado local.
   */
  const deactivateLicense = async (): Promise<void> => {
    const licenseKey = localStorage.getItem('drm_license_key');
    const fingerprint = localStorage.getItem('fingerprint');

    if (!licenseKey || !fingerprint) {
      // Solo limpiar local si no hay datos en servidor
      cleanLocalState();
      return;
    }

    try {
      const platform = await detectPlatform();
      const requestData = buildRequestData(licenseKey, fingerprint, platform);

      console.log('🔓 Desactivando DRM en servidor...', { platform });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE_URL}/desactivar.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = JSON.parse(await response.text());

      if (data.success) {
        console.log('✅ DRM desactivado en servidor');
      } else {
        console.warn('⚠️ El servidor no pudo desactivar:', data.error);
      }
    } catch (error) {
      console.warn('⚠️ Error al desactivar en servidor (se limpia local de todos modos):', error);
    } finally {
      cleanLocalState();
    }
  };

  const cleanLocalState = () => {
    if (verificationInterval.current) {
      clearInterval(verificationInterval.current);
      verificationInterval.current = null;
    }
    localStorage.removeItem('fingerprint');
    localStorage.removeItem('drm_license_key');
    localStorage.removeItem('drm_license_data');
    localStorage.removeItem('device_fingerprint_cache');
    localStorage.removeItem('manual_web_hostname');
    cachedDeviceId = null;

    setLicenseStatus({
      isValid: false,
      isLoading: false,
      error: null,
      licenseData: null,
    });
  };

  // ─── Verificación manual ──────────────────────────────────────────────────

  const verifyLicense = async (): Promise<boolean> => {
    const keyToVerify = localStorage.getItem('drm_license_key');
    const fingerprint = localStorage.getItem('fingerprint');

    if (!keyToVerify || !fingerprint) return false;

    setLicenseStatus((prev) => ({ ...prev, isLoading: true }));

    try {
      await verifyWithServerSilent(keyToVerify, fingerprint);
      return licenseStatus.isValid;
    } finally {
      setLicenseStatus((prev) => ({ ...prev, isLoading: false }));
    }
  };

  return {
    ...licenseStatus,
    isActivating,
    needsManualHostname,
    activateLicense,
    verifyLicense,
    deactivateLicense,
  };
}