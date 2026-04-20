import { useState, useEffect } from 'react';

interface Zones {
  [key: string]: string;
}

export function useZones() {
  const [zones, setZones] = useState<Zones>({
    'all': 'Todo',
    '2': 'COCINA #1',
    '3': 'COCINA #2',
    '4': 'COCINA #3',
    '5': 'COCINA #4',
    '6': 'COCINA #5',
    '7': 'COCINA #6',
    '8': 'BAR',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const apiUrl = localStorage.getItem('kds-api-url');
        const response = await fetch(apiUrl + '/zones');
        if (response.ok) {
          const data = await response.json();
          setZones({
            'all': 'Todo',
            ...data
          });
        }
      } catch (error) {
        console.error('Error fetching zones:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchZones();
  }, []);

  return { zones, loading };
}