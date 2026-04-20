// hooks/useOrderTypes.ts
import { useState, useEffect } from 'react';

interface OrderTypes {
  DeliveryAliase: string;
  DineInAliase: string;
  DriveThruAliase: string;
  StartOfDayTime: string;
  TakeOutAliase: string;
}

export function useOrderTypes() {
  const [orderTypes, setOrderTypes] = useState<OrderTypes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrderTypes = async () => {
    const apiUrl = localStorage.getItem('kds-api-url');
    
    if (!apiUrl) {
      setError('URL de API no configurada');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${apiUrl}/ordertypes`);
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data: OrderTypes = await response.json();
      setOrderTypes(data);
      
      // Guardar en localStorage
      localStorage.setItem('kds-order-types', JSON.stringify(data));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido';
      setError(errorMessage);
      console.error('Error loading order types:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cargar order types al inicializar
  useEffect(() => {
    // Primero intentar cargar desde localStorage
    const savedOrderTypes = localStorage.getItem('kds-order-types');
    if (savedOrderTypes) {
      try {
        setOrderTypes(JSON.parse(savedOrderTypes));
        setLoading(false);
      } catch (err) {
        console.error('Error parsing saved order types:', err);
        // Si hay error al parsear, cargar desde API
        loadOrderTypes();
      }
    } else {
      // Si no hay en localStorage, cargar desde API
      loadOrderTypes();
    }
  }, []);

  const refreshOrderTypes = () => {
    loadOrderTypes();
  };

  return {
    orderTypes,
    loading,
    error,
    refreshOrderTypes
  };
}