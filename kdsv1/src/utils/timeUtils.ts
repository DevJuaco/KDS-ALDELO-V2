const parseSafeDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const cleaned = dateStr.replace("GMT", "").trim();
  const date = new Date(cleaned);
  return isNaN(date.getTime()) ? null : date;
};

export const formatOrderTime = (orderDateTime: string) => {
  const orderTime = parseSafeDate(orderDateTime);
  if (!orderTime) return "--:--";

  return orderTime.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

export const calculateElapsedTime = (orderDateTime: string) => {
  const orderDate = parseSafeDate(orderDateTime);
  if (!orderDate) return "0m";

  const diffMs = new Date().getTime() - orderDate.getTime();
  const diffMins = Math.floor(Math.max(0, diffMs) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  return diffHours > 0 ? `${diffHours}h ${remainingMins}m` : `${diffMins}m`;
};

export const getTimeColor = (orderDateTime: string, currentTime: Date, orderType?: string) => {
  const orderDate = parseSafeDate(orderDateTime);
  if (!orderDate) return "text-green-600 font-bold";

  const diffMins = Math.floor(
    (currentTime.getTime() - orderDate.getTime()) / 60000
  );
  const timeSettings = JSON.parse(localStorage.getItem('kds-time-settings') || '{}');

  // Seleccionar el alertDelay según el tipo de orden
  let alertDelay = 30; // valor por defecto
  if (orderType) {
    switch (orderType) {
      case '1': // DineIn
        alertDelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30');
        break;
      case '2': // TakeOut
        alertDelay = parseInt(timeSettings.alertDelayTakeOut ?? timeSettings.alertDelay ?? '30');
        break;
      case '3': // Delivery
        alertDelay = parseInt(timeSettings.alertDelayDelivery ?? timeSettings.alertDelay ?? '30');
        break;
      case '4': // DriveThru
        alertDelay = parseInt(timeSettings.alertDelayDriveThru ?? timeSettings.alertDelay ?? '30');
        break;
      default:
        alertDelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30');
    }
  } else {
    // Retrocompatibilidad: usar alertDelay si existe, sino usar alertDelayDineIn
    alertDelay = parseInt(timeSettings.alertDelay ?? timeSettings.alertDelayDineIn ?? '30');
  }

  if (diffMins > alertDelay) return "text-red-600 font-bold";
  if (diffMins > 15) return "text-yellow-600 font-bold";
  return "text-green-600 font-bold";
};
