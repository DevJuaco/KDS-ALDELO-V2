import { ArrowLeft, Save, RefreshCw, Power } from 'lucide-react';
import { useState, useEffect } from 'react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useOrderTypes } from '../hooks/useOrderTypes';

// Los tipos Window.electronAPI vienen de src/types/drm.ts
export default function SettingsPage() {
  const [timeSettings, setTimeSettings] = useState({
    alertDelayDineIn: 30,
    alertDelayTakeOut: 30,
    alertDelayDelivery: 30,
    alertDelayDriveThru: 30,
    autoRefresh: 30,
  });

  const [displaySettings, setDisplaySettings] = useState({
    soundAlert: true,
    cardsPerPage: 10,
    showServeButton: true,
    showEmployeeName: true,
    showOrderIdInHeader: false,
    showElapsedTimeInHeader: false,
    useCustomFont: true,
    usaHoraKDS: false,
  });

  const [apiUrlPrefix, setApiUrlPrefix] = useState('http://');
  const [apiUrlBase, setApiUrlBase] = useState('');
  const [apiUrlSuffix, setApiUrlSuffix] = useState(':5000');
  const { toast, showToast, hideToast } = useToast();
  const { orderTypes, loading, error, refreshOrderTypes } = useOrderTypes();
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  useEffect(() => {
    const savedTimeSettings = localStorage.getItem('kds-time-settings');
    const savedDisplaySettings = localStorage.getItem('kds-display-settings');
    const savedApiUrl = localStorage.getItem('kds-api-url');

    if (savedTimeSettings) {
      const parsed = JSON.parse(savedTimeSettings);
      // Migración: Si existe el valor antiguo alertDelay, usarlo para todos los tipos
      if (parsed.alertDelay && !parsed.alertDelayDineIn) {
        setTimeSettings({
          alertDelayDineIn: parsed.alertDelay,
          alertDelayTakeOut: parsed.alertDelay,
          alertDelayDelivery: parsed.alertDelay,
          alertDelayDriveThru: parsed.alertDelay,
          autoRefresh: parsed.autoRefresh || 30,
        });
      } else {
        setTimeSettings(parsed);
      }
    }
    if (savedDisplaySettings) {
      setDisplaySettings(JSON.parse(savedDisplaySettings));
    }

    // Parsear la URL completa para separar prefix, base y suffix
    if (savedApiUrl) {
      const urlMatch = savedApiUrl.match(/^(https?:\/\/)([^:]+)(:\d+)?$/);
      if (urlMatch) {
        setApiUrlPrefix(urlMatch[1] || 'http://');
        setApiUrlBase(urlMatch[2] || '');
        setApiUrlSuffix(urlMatch[3] || ':5000');
      } else {
        // Si no coincide con el patrón, poner toda la URL en base
        setApiUrlBase(savedApiUrl);
      }
    }
    // Parsear la URL completa para separar prefix, base y suffix
    if (savedApiUrl) {
      const urlMatch = savedApiUrl.match(/^(https?:\/\/)([^:]+)(:\d+)?$/);
      if (urlMatch) {
        setApiUrlPrefix(urlMatch[1] || 'http://');
        setApiUrlBase(urlMatch[2] || '');
        setApiUrlSuffix(urlMatch[3] || ':5000');
      } else {
        // Si no coincide con el patrón, poner toda la URL en base
        setApiUrlBase(savedApiUrl);
      }
    }
  }, []);

  // Efecto para aplicar la fuente personalizada
  useEffect(() => {
    if (displaySettings.useCustomFont) {
      document.body.classList.remove('use-default-font');
    } else {
      document.body.classList.add('use-default-font');
    }
  }, [displaySettings.useCustomFont]);

  const handleSave = () => {
    try {
      localStorage.setItem('kds-time-settings', JSON.stringify(timeSettings));
      localStorage.setItem('kds-display-settings', JSON.stringify(displaySettings));

      // Concatenar y guardar solo la URL completa
      const fullApiUrl = `${apiUrlPrefix}${apiUrlBase}${apiUrlSuffix}`;
      localStorage.setItem('kds-api-url', fullApiUrl);

      showToast('Configuración guardada correctamente', 'success');
    } catch (error) {
      showToast('Error al guardar la configuración', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
      <div className="container mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold">Configuración del Sistema</h1>
          <div className="flex gap-4">
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-semibold flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Guardar Cambios
            </button>
            <a
              href="/"
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al KDS
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuración de Intervalos de Tiempo */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Intervalos de Tiempo</h2>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-300 mb-3">Alerta de retraso por tipo de orden (min):</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-sm">{orderTypes?.DineInAliase || 'Mesas'}:</label>
                  <input
                    type="number"
                    min="1"
                    value={timeSettings.alertDelayDineIn}
                    onChange={(e) => setTimeSettings({
                      ...timeSettings,
                      alertDelayDineIn: parseInt(e.target.value)
                    })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-sm">{orderTypes?.TakeOutAliase || 'Para llevar'}:</label>
                  <input
                    type="number"
                    min="1"
                    value={timeSettings.alertDelayTakeOut}
                    onChange={(e) => setTimeSettings({
                      ...timeSettings,
                      alertDelayTakeOut: parseInt(e.target.value)
                    })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-sm">{orderTypes?.DeliveryAliase || 'Domicilio'}:</label>
                  <input
                    type="number"
                    min="1"
                    value={timeSettings.alertDelayDelivery}
                    onChange={(e) => setTimeSettings({
                      ...timeSettings,
                      alertDelayDelivery: parseInt(e.target.value)
                    })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-gray-400 text-sm">{orderTypes?.DriveThruAliase || 'Drive-Thru'}:</label>
                  <input
                    type="number"
                    min="1"
                    value={timeSettings.alertDelayDriveThru}
                    onChange={(e) => setTimeSettings({
                      ...timeSettings,
                      alertDelayDriveThru: parseInt(e.target.value)
                    })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="w-48 text-gray-400">Auto-refresh (segundos):</label>
                <input
                  type="number"
                  min="5"
                  value={timeSettings.autoRefresh}
                  onChange={(e) => setTimeSettings({
                    ...timeSettings,
                    autoRefresh: parseInt(e.target.value)
                  })}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Configuración de Visualización</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Sonido de alerta:</label>
                <input
                  type="checkbox"
                  checked={displaySettings.soundAlert}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    soundAlert: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

              {/* Nuevo: Select para número de tarjetas por página */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Tarjetas por página:</label>
                <select
                  value={displaySettings.cardsPerPage}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    cardsPerPage: parseInt(e.target.value)
                  })}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={5}>5 Ordenes</option>
                  <option value={10}>Galeria Ordenes</option>
                </select>
              </div>

              {/* Nuevo: Mostrar/Ocultar botón de Servir Todo */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Mostrar botón "Servir Todo":</label>
                <input
                  type="checkbox"
                  checked={displaySettings.showServeButton}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    showServeButton: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

              {/* Nuevo: Mostrar/Ocultar nombre de empleado */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Mostrar Nombre de Empleado:</label>
                <input
                  type="checkbox"
                  checked={displaySettings.showEmployeeName !== false} // Default true
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    showEmployeeName: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

              {/* Nuevo: Mostrar Order ID en Cabecera */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Ver Order ID en Cabecera (no turno):</label>
                <input
                  type="checkbox"
                  checked={displaySettings.showOrderIdInHeader}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    showOrderIdInHeader: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

              {/* Nuevo: Mostrar Tiempo Transcurrido en Cabecera */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Ver Tiempo Transcurrido en Cabecera:</label>
                <input
                  type="checkbox"
                  checked={displaySettings.showElapsedTimeInHeader}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    showElapsedTimeInHeader: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

              {/* Nuevo: Usar fuente personalizada (Bebas Neue) */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Usar fuente personalizada (Bebas Neue):</label>
                <input
                  type="checkbox"
                  checked={displaySettings.useCustomFont !== false} // Default true
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    useCustomFont: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

              {/* Nuevo: Usar hora KDS */}
              <div className="flex items-center justify-between">
                <label className="text-gray-400">Usar hora KDS en lugar de POS:</label>
                <input
                  type="checkbox"
                  checked={displaySettings.usaHoraKDS || false}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    usaHoraKDS: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

              {/* Configuración de URL de la API con prefijo y sufijo editables */}
              <div className="space-y-2 mt-4">
                <label className="text-gray-400 block">URL de la API:</label>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={apiUrlPrefix}
                    onChange={(e) => setApiUrlPrefix(e.target.value)}
                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="http://"
                  />
                  <input
                    type="text"
                    value={apiUrlBase}
                    onChange={(e) => setApiUrlBase(e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="192.168.1.100"
                  />
                  <input
                    type="text"
                    value={apiUrlSuffix}
                    onChange={(e) => setApiUrlSuffix(e.target.value)}
                    className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder=":5000"
                  />
                </div>

                <div className="text-xs text-gray-500 p-2 bg-gray-800 rounded">
                  URL Completa: <span className="text-blue-400">{apiUrlPrefix}{apiUrlBase}{apiUrlSuffix}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Información del Sistema */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Información del Sistema</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-gray-400">
              <div className="flex flex-col">
                <span className="text-sm">Sistema POS:</span>
                <span className="text-white font-semibold text-lg">Aldelo POS</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm">Versión del sistema:</span>
                <span className="text-white font-semibold text-lg">{import.meta.env.PUBLIC_APP_VERSION}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm">Última actualización:</span>
                <span className="text-white font-semibold text-lg">{import.meta.env.PUBLIC_BUILD_DATE}</span>
              </div>
            </div>
          </div>

          {/* Alias de Tipos de Orden */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Alias de Tipos de Orden</h2>
            <div className="space-y-3">
              {orderTypes ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-gray-800 p-2 px-3 rounded-lg border border-gray-700 flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Mesas</span>
                    <span className="text-white font-semibold">{orderTypes.DineInAliase}</span>
                  </div>
                  <div className="bg-gray-800 p-2 px-3 rounded-lg border border-gray-700 flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Para llevar</span>
                    <span className="text-white font-semibold">{orderTypes.TakeOutAliase}</span>
                  </div>
                  <div className="bg-gray-800 p-2 px-3 rounded-lg border border-gray-700 flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Dine-In</span>
                    <span className="text-white font-semibold">{orderTypes.DeliveryAliase}</span>
                  </div>
                  <div className="bg-gray-800 p-2 px-3 rounded-lg border border-gray-700 flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Domicilio</span>
                    <span className="text-white font-semibold">{orderTypes.DriveThruAliase}</span>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">No se pudieron cargar los alias</div>
              )}

              <button
                onClick={refreshOrderTypes}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors mt-4"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Actualizando...' : 'Actualizar Alias'}
              </button>

              {error && (
                <div className="text-red-400 text-sm mt-2">Error: {error}</div>
              )}
            </div>
          </div>
          {/* Cerrar Programa (solo visible en Electron) */}
          {isElectron && (
            <div className="bg-gray-900 rounded-lg p-6 border border-red-900/50">
              <h2 className="text-2xl font-semibold mb-4 text-red-400">Cerrar Programa</h2>
              <p className="text-gray-400 mb-4">
                Cierra completamente la aplicación KDS. Las órdenes no se perderán.
              </p>
              <button
                onClick={() => setShowQuitConfirm(true)}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold"
              >
                <Power className="w-5 h-5" />
                Cerrar Programa
              </button>
            </div>
          )}
        </div>

        {/* Modal de confirmación */}
        {showQuitConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center">
                  <Power className="w-6 h-6 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white">¿Cerrar el programa?</h3>
              </div>
              <p className="text-gray-400 mb-6">
                Se cerrará completamente la aplicación KDS. ¿Estás seguro?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowQuitConfirm(false)}
                  className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => window.electronAPI?.quitApp()}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-semibold flex items-center gap-2"
                >
                  <Power className="w-4 h-4" />
                  Sí, cerrar
                </button>
              </div>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}