import React, { useState } from 'react';
import type { LicenseData } from '../../types/drm';

interface LicenseStatusProps {
  licenseData: LicenseData | null;
  onDeactivate: () => void;
}

const LicenseStatus: React.FC<LicenseStatusProps> = ({ licenseData, onDeactivate }) => {
  const [showDetails, setShowDetails] = useState<boolean>(false);

  if (!licenseData) return null;

  return (
    <div className="license-status">
      <div className="status-bar">
        <div className="status-info">
          <span className="status-indicator">✅</span>
          <span className="status-text">Licencia Activa</span>
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className="details-btn"
          >
            {showDetails ? '▲' : '▼'} Detalles
          </button>
        </div>
        <div className="status-actions">
          <button 
            onClick={onDeactivate}
            className="deactivate-btn"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="license-details">
          <div className="detail-item">
            <strong>Licencia:</strong> {licenseData.clave_licencia}
          </div>
          <div className="detail-item">
            <strong>Activaciones:</strong> {licenseData.activaciones_actuales} / {licenseData.activaciones_permitidas}
          </div>
          {licenseData.fecha_expiracion && (
            <div className="detail-item">
              <strong>Expira:</strong> {new Date(licenseData.fecha_expiracion).toLocaleDateString()}
            </div>
          )}
        </div>
      )}

      <style>{`
        .license-status {
          background: #f8f9fa;
          border-bottom: 1px solid #dee2e6;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .status-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
        }
        .status-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-indicator {
          font-size: 1.1em;
        }
        .status-text {
          font-weight: 600;
          color: #28a745;
        }
        .details-btn {
          background: none;
          border: 1px solid #6c757d;
          color: #6c757d;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .details-btn:hover {
          background: #6c757d;
          color: white;
        }
        .deactivate-btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 0.375rem 0.75rem;
          border-radius: 4px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background 0.2s;
        }
        .deactivate-btn:hover {
          background: #c82333;
        }
        .license-details {
          padding: 1rem;
          background: white;
          border-top: 1px solid #dee2e6;
          font-size: 0.875rem;
        }
        .detail-item {
          margin-bottom: 0.5rem;
        }
        .detail-item:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
};

export default LicenseStatus;