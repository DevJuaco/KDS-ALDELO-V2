import { useState, useEffect } from 'react';

const DEFAULTS = {
  DineInAliase: 'Mesas',
  TakeOutAliase: 'Para Llevar',
  DriveThruAliase: 'Drive Thru',
  DeliveryAliase: 'Domicilio',
};

export function useOrderTypes() {
  const [orderTypes, setOrderTypes] = useState(() => {
    try {
      const saved = localStorage.getItem('kds-order-types');
      return saved ? JSON.parse(saved) : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [loading, setLoading] = useState(false);

  const loadOrderTypes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://${window.location.hostname}:5001/config/ordertypes`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.error) {
        setOrderTypes(data);
        localStorage.setItem('kds-order-types', JSON.stringify(data));
      }
    } catch (err) {
      console.error('Error loading order types:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrderTypes();
  }, []);

  return { orderTypes, loading, refreshOrderTypes: loadOrderTypes };
}
