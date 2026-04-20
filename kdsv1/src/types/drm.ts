export interface LicenseData {
  id?: number;
  clave_licencia: string;
  activaciones_permitidas: number;
  activaciones_actuales: number;
  fecha_expiracion: string | null;
  activa: boolean;
  created_at?: string;
  equipo_activo?: boolean;
}

export interface ActivationResponse {
  success: boolean;
  message?: string;
  error?: string;
  activaciones_actuales?: number;
  activaciones_permitidas?: number;
}

export interface VerificationResponse {
  success: boolean;
  error?: string;
  licencia?: LicenseData;
}

export interface LicenseStatus {
  isValid: boolean;
  isLoading: boolean;
  error: string | null;
  licenseData: LicenseData | null;
}

/**
 * Identificador de dispositivo según plataforma:
 * - Electron/Windows: hostname (os.hostname())
 * - React Native/Android: equipo_id (device ID nativo)
 * - Web: hostname manual ingresado por el usuario
 */
export type Platform = 'electron' | 'react-native' | 'web';

export interface DeviceIdentifier {
  tipo_identificador: 'hostname' | 'equipo_id';
  hostname?: string;       // Electron (Windows) y Web manual
  equipo_id?: string;      // React Native (Android)
  platform: Platform;
}

/** @deprecated Usar DeviceIdentifier. Mantenido por compatibilidad. */
export interface FingerprintData {
  screen_data: string;
  timezone: string;
  plugins: string;
  hardware_concurrency: string;
  accept_language: string;
  fonts: string;
  canvas_hash: string;
}

declare global {
  interface Window {
    /** @deprecated Usar nativeAPI/electronAPI en su lugar */
    generateFingerprint?: () => Promise<FingerprintData>;

    /** API universal: disponible en Electron y cualquier plataforma nativa */
    nativeAPI?: {
      getHostname: () => Promise<string>;
      activate: () => Promise<{ success: boolean; fingerprint?: string; message?: string; platform?: Platform }>;
      getPlatform: () => Promise<Platform>;
    };

    /** API específica de Electron (legacy + compatibilidad) */
    electronAPI?: {
      getHostname: () => Promise<string>;
      activate: () => Promise<{ success: boolean; fingerprint?: string; message?: string }>;
      isElectron: () => Promise<boolean>;
      printQueue: {
        read: () => Promise<any[]>;
        save: (queue: any[]) => Promise<{ success: boolean }>;
        clear: () => Promise<{ success: boolean }>;
        getPath: () => Promise<string>;
      };
      quitApp: () => void;
    };

    /** API de React Native WebView */
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };

    /** Callback para recibir mensajes desde React Native */
    onNativeMessage?: (data: { type: string; hostname?: string; equipo_id?: string }) => void;
  }
}