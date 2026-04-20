import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { useOrderTypes } from '../hooks/useOrderTypes';

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

  const [dbPath, setDbPath] = useState('');
  const [dbPathSaving, setDbPathSaving] = useState(false);
  const [zones, setZones] = useState({});
  const [zonesSaving, setZonesSaving] = useState(false);

  const { toast, showToast, hideToast } = useToast();
  const { orderTypes } = useOrderTypes();

  useEffect(() => {
    fetch(`http://${window.location.hostname}:5001/config/database`)
      .then((r) => r.json())
      .then((d) => { if (d.path) setDbPath(d.path); })
      .catch(() => {});

    fetch(`http://${window.location.hostname}:5001/config/zones`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setZones(d); })
      .catch(() => {});
  }, []);

  const handleSaveDbPath = async () => {
    if (!dbPath.trim()) return;
    setDbPathSaving(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:5001/config/database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dbPath.trim() }),
      });
      const data = await res.json();
      if (data.success) showToast('Ruta de BD guardada. Reinicia el servidor para aplicar.', 'success');
      else showToast(data.error || 'Error al guardar la ruta', 'error');
    } catch {
      showToast('Error de conexión al guardar la ruta', 'error');
    } finally {
      setDbPathSaving(false);
    }
  };

  const handleSaveZones = async () => {
    setZonesSaving(true);
    try {
      const res = await fetch(`http://${window.location.hostname}:5001/config/zones`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zones),
      });
      const data = await res.json();
      if (data.success) showToast('Zonas guardadas correctamente', 'success');
      else showToast(data.error || 'Error al guardar zonas', 'error');
    } catch {
      showToast('Error de conexión al guardar zonas', 'error');
    } finally {
      setZonesSaving(false);
    }
  };

  useEffect(() => {
    const savedTimeSettings = localStorage.getItem('kds-time-settings');
    const savedDisplaySettings = localStorage.getItem('kds-display-settings');

    if (savedTimeSettings) {
      const parsed = JSON.parse(savedTimeSettings);
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
  }, []);

  // Aplicar fuente personalizada en tiempo real al cambiar el toggle
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
            <button
              onClick={() => { window.location.hash = ''; }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al KDS
            </button>
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

          {/* Configuración de Visualización */}
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

              <div className="flex items-center justify-between">
                <label className="text-gray-400">Mostrar Nombre de Empleado:</label>
                <input
                  type="checkbox"
                  checked={displaySettings.showEmployeeName !== false}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    showEmployeeName: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

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

              <div className="flex items-center justify-between">
                <label className="text-gray-400">Usar fuente personalizada (Bebas Neue):</label>
                <input
                  type="checkbox"
                  checked={displaySettings.useCustomFont !== false}
                  onChange={(e) => setDisplaySettings({
                    ...displaySettings,
                    useCustomFont: e.target.checked
                  })}
                  className="w-6 h-6 rounded bg-gray-800 border-gray-700 accent-blue-500"
                />
              </div>

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
            </div>
          </div>

          {/* Configuración Base de Datos */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Base de Datos Aldelo</h2>
            <div className="space-y-3">
              <label className="text-gray-400 text-sm">Ruta del archivo .mdb / .accdb:</label>
              <input
                type="text"
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
                placeholder="C:\\ruta\\a\\base.mdb"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveDbPath}
                disabled={dbPathSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
              >
                {dbPathSaving ? 'Guardando...' : 'Guardar ruta'}
              </button>
              <p className="text-gray-500 text-xs">Reinicia el servidor Flask para que el cambio tome efecto.</p>
            </div>
          </div>

          {/* Zonas de Cocina */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Zonas de Cocina</h2>
            <div className="space-y-3">
              {Object.keys(zones).length === 0 ? (
                <p className="text-gray-500">No se encontraron zonas en zones.json</p>
              ) : (
                Object.entries(zones).map(([key, name]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm w-6 text-right">{key}:</span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setZones({ ...zones, [key]: e.target.value })}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))
              )}
              <button
                onClick={handleSaveZones}
                disabled={zonesSaving || Object.keys(zones).length === 0}
                className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
              >
                {zonesSaving ? 'Guardando...' : 'Guardar zonas'}
              </button>
            </div>
          </div>

          {/* Información del Sistema */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h2 className="text-2xl font-semibold mb-4">Información del Sistema</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-400">
              <div className="flex flex-col">
                <span className="text-sm">Sistema POS:</span>
                <span className="text-white font-semibold text-lg">Aldelo POS</span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm">Versión del sistema:</span>
                <span className="text-white font-semibold text-lg">v2.0</span>
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
                    <span className="text-gray-400 text-sm">Domicilio</span>
                    <span className="text-white font-semibold">{orderTypes.DeliveryAliase}</span>
                  </div>
                  <div className="bg-gray-800 p-2 px-3 rounded-lg border border-gray-700 flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Drive-Thru</span>
                    <span className="text-white font-semibold">{orderTypes.DriveThruAliase}</span>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">No se pudieron cargar los alias</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
