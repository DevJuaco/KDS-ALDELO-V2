import { RefreshCw, ChevronDown, Settings } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useZones } from '../hooks/useZones';

export default function Header({
  activeTab = 'PREPARING',
  onTabChange = () => {},
  refreshing = false,
  onRefresh = () => {},
  notificationFilter = 'all',
  onNotificationFilterChange = () => {},
  prepararCount = 0,
  servidoCount = 0
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { zones, loading } = useZones();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (value) => {
    onNotificationFilterChange(value);
    setIsOpen(false);
  };

  const tabs = [
    { key: 'PREPARING', label: 'Preparar', count: prepararCount },
    { key: 'FINISHED', label: 'Servido', count: servidoCount }
  ];

  const zoneKeys = Object.keys(zones).filter(key => key !== 'all');

  return (
    <header className="bg-black border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-black tracking-tighter text-white">ALDELO</h1>
        
        <a
          href="/settings"
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-all shadow-lg"
          title="Configuración"
        >
          <Settings className="w-5 h-5" />
        </a>
      </div>

      <div className="flex gap-8">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`px-4 py-2 text-xl font-bold transition-all flex items-center gap-3 relative ${
              activeTab === tab.key ? 'text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            <span className={`px-2.5 py-0.5 rounded-full text-sm font-black ${
              activeTab === tab.key ? 'bg-white text-black' : 'bg-gray-800 text-gray-500'
            }`}>
              {tab.count}
            </span>
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative inline-block" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={loading}
            className="inline-flex items-center justify-between gap-x-3 rounded-xl bg-zinc-800 px-5 py-2 text-lg font-bold text-white hover:bg-zinc-700 transition-all min-w-[160px] disabled:opacity-50 shadow-lg"
          >
            {loading ? 'Cargando...' : zones[notificationFilter] || 'Todo'}
            <ChevronDown className={`w-5 h-5 text-white transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && !loading && (
            <div className="absolute right-0 z-10 mt-2 w-full origin-top-right rounded-xl bg-zinc-800 overflow-hidden shadow-2xl border border-gray-700">
              <button
                onClick={() => handleSelect('all')}
                className={`block w-full text-left px-5 py-3 text-lg font-medium text-white hover:bg-zinc-600 transition-colors ${
                  notificationFilter === 'all' ? 'bg-zinc-700' : ''
                }`}
              >
                Todo
              </button>

              {zoneKeys.map((zoneKey) => (
                <button
                  key={zoneKey}
                  onClick={() => handleSelect(zoneKey)}
                  className={`block w-full text-left px-5 py-3 text-lg font-medium text-white hover:bg-zinc-600 transition-colors ${
                    notificationFilter === zoneKey ? 'bg-zinc-700' : ''
                  }`}
                >
                  {zones[zoneKey]}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          className={`flex items-center justify-center p-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 text-white rounded-xl transition-all shadow-lg ${
            refreshing ? 'opacity-50' : ''
          }`}
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}
