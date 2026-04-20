import { RefreshCw, ChevronDown, Settings } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useZones } from '../hooks/useZones';

interface Props {
  activeTab: 'PREPARING' | 'FINISHED';
  onTabChange: (tab: 'PREPARING' | 'FINISHED') => void;
  refreshing: boolean;
  onRefresh: () => void;
  notificationFilter: string;
  onNotificationFilterChange: (filter: string) => void;
  prepararCount: number;
  servidoCount: number;
}

export default function KDSHeader({
  activeTab,
  onTabChange,
  refreshing,
  onRefresh,
  notificationFilter,
  onNotificationFilterChange,
  prepararCount,
  servidoCount
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { zones, loading } = useZones();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (value: string) => {
    onNotificationFilterChange(value);
    setIsOpen(false);
  };

  const tabs = [
    { key: 'PREPARING', label: 'Preparar', count: prepararCount },
    { key: 'FINISHED', label: 'Servido', count: servidoCount }
  ];

  const zoneKeys = Object.keys(zones).filter(key => key !== 'all');

  return (
    <header className="bg-black border-b border-gray-800 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">ALDELO</h1>

        {/* CORREGIDO: Etiqueta <a> completa y bien formada */}
        <a
          href="/settings"
          className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          title="Configuración"
        >
          <Settings className="w-5 h-5" />
        </a>
      </div>

      <div className="flex gap-4 pl-44">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key as 'PREPARING' | 'FINISHED')}
            className={`px-8 py-1 text-xl font-semibold transition-all flex items-center gap-2 ${activeTab === tab.key ? 'text-white border-b-4 border-white' : 'text-gray-500'
              }`}
          >
            {tab.label}
            <span className={`px-2 py-0.5 rounded-full text-sm ${activeTab === tab.key
              ? 'bg-white text-black'
              : 'bg-gray-700 text-gray-300'
              }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative inline-block" ref={dropdownRef}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            disabled={loading}
            className="inline-flex items-center justify-between gap-x-3 rounded-2xl bg-zinc-800 px-5 py-1 text-lg font-semibold text-white hover:bg-zinc-700 transition-colors min-w-[150px] disabled:opacity-50"
          >
            {loading ? 'Cargando...' : zones[notificationFilter] || 'Todo'}
            <ChevronDown className={`w-5 h-5 text-white transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOpen && !loading && (
            <div className="absolute right-0 z-10 mt-2 w-full origin-top-right rounded-xl bg-zinc-800 overflow-hidden shadow-xl">
              <button
                onClick={() => handleSelect('all')}
                className={`block w-full text-left px-5 py-2 text-lg font-medium text-white hover:bg-slate-600 transition-colors ${notificationFilter === 'all' ? 'bg-slate-600' : ''
                  }`}
              >
                Todo
              </button>

              {zoneKeys.map((zoneKey) => (
                <button
                  key={zoneKey}
                  onClick={() => handleSelect(zoneKey)}
                  className={`block w-full text-left px-5 py-2 text-lg font-medium text-white hover:bg-slate-600 transition-colors ${notificationFilter === zoneKey ? 'bg-slate-600' : ''
                    }`}
                >
                  {zones[zoneKey]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-right">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className={`flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg transition-all ${refreshing ? 'opacity-50' : ''
              }`}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}