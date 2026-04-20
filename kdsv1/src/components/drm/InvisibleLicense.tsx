import React, { useEffect } from 'react';
import type { LicenseData } from '../../types/drm';

interface InvisibleLicenseProps {
  licenseData: LicenseData | null;
  onDeactivate: () => void;
}

const InvisibleLicense: React.FC<InvisibleLicenseProps> = ({ licenseData, onDeactivate }) => {
  useEffect(() => {
    if (licenseData) {
      console.log('🔒 Licencia activa:', {
        licencia: licenseData.clave_licencia,
        activaciones: `${licenseData.activaciones_actuales}/${licenseData.activaciones_permitidas}`,
        expira: licenseData.fecha_expiracion || 'No expira'
      });
      
      // Agregar comando global para mostrar info de licencia
      (window as any).showLicenseInfo = () => {
        const message = `
🔒 INFORMACIÓN DE LICENCIA
Licencia: ${licenseData.clave_licencia}
Activaciones: ${licenseData.activaciones_actuales}/${licenseData.activaciones_permitidas}
${licenseData.fecha_expiracion ? `Expira: ${new Date(licenseData.fecha_expiracion).toLocaleDateString()}` : 'No expira'}
        
Escribe 'deactivateLicense()' en la consola para cerrar sesión.
        `;
        console.log(message);
        alert(message);
      };
      
      // Agregar comando global para desactivar
      (window as any).deactivateLicense = onDeactivate;
    }
    
    return () => {
      // Limpiar comandos globales
      delete (window as any).showLicenseInfo;
      delete (window as any).deactivateLicense;
    };
  }, [licenseData, onDeactivate]);

  return null; // No renderiza nada en el DOM
};

export default InvisibleLicense;