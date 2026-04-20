import React, { useState, useEffect } from 'react';
import type { ActivationResponse, Platform } from '../../types/drm';
import '../../styles/drm-activation.css';

interface ActivationFormProps {
  onActivate: (licenseKey: string, manualHostname?: string) => Promise<ActivationResponse>;
  isActivating: boolean;
  error: string | null;
  needsManualHostname?: boolean;
}

async function detectPlatform(): Promise<Platform> {
  try {
    if (typeof window !== 'undefined' && window.nativeAPI)          return await window.nativeAPI.getPlatform();
    if (typeof window !== 'undefined' && window.electronAPI)        return 'electron';
    if (typeof window !== 'undefined' && window.ReactNativeWebView) return 'react-native';
  } catch { /* ignorar */ }
  return 'web';
}

const ActivationForm: React.FC<ActivationFormProps> = ({
  onActivate,
  isActivating,
  error,
  needsManualHostname = false,
}) => {
  const [licenseKey, setLicenseKey]               = useState('');
  const [manualHostname, setManualHostname]       = useState('');
  const [platform, setPlatform]                   = useState<Platform>('web');
  const [hardwareId, setHardwareId]               = useState<string>('');
  const [hostnameConfirmed, setHostnameConfirmed] = useState(false);

  useEffect(() => {
    detectPlatform().then(async (plat) => {
      setPlatform(plat);
      if (plat === 'electron') {
        if (window.nativeAPI) {
          try { setHardwareId(await window.nativeAPI.getHostname()); } catch {}
        } else if (window.electronAPI) {
          try { setHardwareId(await window.electronAPI.getHostname()); } catch {}
        }
      } else if (plat === 'react-native') {
        window.onNativeMessage = (data) => {
          if ((data.type === 'hostname' || data.type === 'equipo_id') && (data.hostname || data.equipo_id)) {
            setHardwareId((data.hostname || data.equipo_id) as string);
          }
        };
        try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'getHostname' })); } catch {}
      }
    });

    const saved = localStorage.getItem('manual_web_hostname');
    if (saved) {
      setManualHostname(saved);
      setHostnameConfirmed(true);
    }
  }, []);

  const isWebPlatform = platform === 'web' || needsManualHostname;

  // Hostname que se muestra en el box
  const displayedId = isWebPlatform
    ? (hostnameConfirmed ? manualHostname : null)
    : hardwareId || 'Obteniendo ID...';

  const confirmHostname = () => {
    const val = manualHostname.trim().toUpperCase();
    if (!val) return;
    localStorage.setItem('manual_web_hostname', val);
    localStorage.setItem('device_fingerprint_cache', val);
    setManualHostname(val);
    setHostnameConfirmed(true);
  };

  const handleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const onlyNumbers = e.target.value.replace(/[^0-9]/g, '');
    let formatted = '';
    for (let i = 0; i < onlyNumbers.length; i++) {
      if (i > 0 && i % 4 === 0) {
        formatted += '-';
      }
      formatted += onlyNumbers[i];
    }
    setLicenseKey(formatted.slice(0, 14));
  };

  const handleActivate = async () => {
    if (!licenseKey.trim()) return;
    const hostnameToSend = isWebPlatform ? manualHostname.trim() : undefined;
    await onActivate(licenseKey, hostnameToSend);
  };

  const isReady = licenseKey.trim().length === 14 &&
    (!isWebPlatform || hostnameConfirmed);

  return (
    <div className="drm-activation-pending">
      <div className="activation-message">

        {/* Ícono advertencia */}
        <span className="icon">⚠️</span>

        <h2>Activación Pendiente</h2>

        <p className="subtitle-gray">El sistema está pendiente de activación.</p>
        <p className="subtitle-green">Ingrese su clave de licencia para activar el sistema.</p>

        {/* Hostname manual (solo web) */}
        {isWebPlatform && !hostnameConfirmed && (
          <div className="manual-hostname-container">
            <p className="small-info">Nombre único de este equipo en la red:</p>
            <div className="input-group">
              <input
                type="text"
                className="manual-input"
                value={manualHostname}
                onChange={(e) => setManualHostname(e.target.value.toUpperCase())}
                placeholder="CAJA-01"
                disabled={isActivating}
                maxLength={50}
                onKeyDown={(e) => e.key === 'Enter' && confirmHostname()}
              />
              <button
                type="button"
                onClick={confirmHostname}
                disabled={!manualHostname.trim() || isActivating}
              >
                Confirmar
              </button>
            </div>
          </div>
        )}

        {/* Box del ID del equipo */}
        {(displayedId || !isWebPlatform) && (
          <div className="device-id-display">
            <small>ID del Equipo (Fingerprint):</small>
            <strong>{displayedId ?? '—'}</strong>
          </div>
        )}

        {/* Aviso si aún no confirmó hostname en web */}
        {isWebPlatform && !hostnameConfirmed && (
          <p className="loading-id-display">↑ Confirma el nombre del equipo para continuar</p>
        )}

        {/* Error */}
        {error && (
          <div className="activation-error">
            <svg fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Input clave de licencia */}
        <div className="license-input-container">
          <input
            type="text"
            className="license-input"
            value={licenseKey}
            onChange={handleLicenseChange}
            placeholder="XXXX-XXXX-XXXX"
            disabled={isActivating || (isWebPlatform && !hostnameConfirmed)}
            maxLength={14}
            onKeyDown={(e) => e.key === 'Enter' && isReady && handleActivate()}
          />
        </div>

        {/* Botón Activar */}
        <button
          className={`activate-button${isReady ? ' ready' : ''}`}
          onClick={handleActivate}
          disabled={isActivating || !isReady}
        >
          <span>🔒</span>
          <span>{isActivating ? 'Activando...' : 'Activar Sistema'}</span>
        </button>

        {/* Botón Recargar */}
        <button
          className="reload-button"
          onClick={() => window.location.reload()}
        >
          <span>🔄</span>
          <span>Recargar Página</span>
        </button>

        <p className="activation-footer">
          ¿Sin licencia? Contacta al <strong>administrador del sistema</strong>
        </p>
      </div>
    </div>
  );
};

export default ActivationForm;