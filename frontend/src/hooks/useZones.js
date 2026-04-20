import { useState, useEffect } from 'react';

export function useZones() {
  const [zones, setZones] = useState({ all: 'Todo' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:5001/config/zones`);
        if (res.ok) {
          const data = await res.json();
          setZones({ all: 'Todo', ...data });
        }
      } catch (err) {
        console.error('Error fetching zones:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchZones();
  }, []);

  return { zones, loading };
}
