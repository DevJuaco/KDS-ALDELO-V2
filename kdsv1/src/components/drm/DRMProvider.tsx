import React from 'react';
import type { ReactNode } from 'react';
import { useDRM } from '../../hooks/useDRM';
import ActivationForm from './ActivationForm';
import InvisibleLicense from './InvisibleLicense';
import '../../styles/drm-activation.css';

interface DRMProviderProps {
  children: ReactNode;
}

const DRMProvider: React.FC<DRMProviderProps> = ({ children }) => {
  const {
    isValid,
    isLoading,
    error,
    licenseData,
    isActivating,
    needsManualHostname,
    activateLicense,
    deactivateLicense
  } = useDRM();

  if (isLoading) {
    return (
      <div className="drm-loading">
        <div className="loading-spinner"></div>
        <p>Verificando licencia...</p>
      </div>
    );
  }

  if (!isValid) {
    return (
      <ActivationForm
        onActivate={activateLicense}
        isActivating={isActivating}
        error={error}
        needsManualHostname={needsManualHostname}
      />
    );
  }

  return (
    <div className="drm-app-container">
      {/* Sin DOM visible, solo registra comandos globales en consola */}
      <InvisibleLicense
        licenseData={licenseData}
        onDeactivate={deactivateLicense}
      />

      {/* Aplicación normal */}
      <div className="app-content">
        {children}
      </div>
    </div>
  );
};

export default DRMProvider;