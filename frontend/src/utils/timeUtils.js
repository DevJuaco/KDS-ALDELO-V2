const parseSafeDate = (dateStr) => {
  if (!dateStr) return null;
  const cleaned = dateStr.replace('GMT', '').trim();
  const date = new Date(cleaned);
  return isNaN(date.getTime()) ? null : date;
};

export function formatOrderTime(dateString) {
  const orderTime = parseSafeDate(dateString);
  if (!orderTime) return '--:--';
  return orderTime.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function calculateElapsedTime(dateString) {
  const orderDate = parseSafeDate(dateString);
  if (!orderDate) return '0m';
  const diffMs = new Date().getTime() - orderDate.getTime();
  const diffMins = Math.floor(Math.max(0, diffMs) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  return diffHours > 0 ? `${diffHours}h ${remainingMins}m` : `${diffMins}m`;
}

export function getTimeColor(dateString, currentTime, orderType) {
  const orderDate = parseSafeDate(dateString);
  if (!orderDate) return 'text-green-600 font-bold';

  const diffMins = Math.floor((currentTime.getTime() - orderDate.getTime()) / 60000);
  const timeSettings = JSON.parse(localStorage.getItem('kds-time-settings') || '{}');

  let alertDelay = 30;
  if (orderType) {
    switch (orderType) {
      case '1': alertDelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30'); break;
      case '2': alertDelay = parseInt(timeSettings.alertDelayTakeOut ?? timeSettings.alertDelay ?? '30'); break;
      case '3': alertDelay = parseInt(timeSettings.alertDelayDelivery ?? timeSettings.alertDelay ?? '30'); break;
      case '4': alertDelay = parseInt(timeSettings.alertDelayDriveThru ?? timeSettings.alertDelay ?? '30'); break;
      default:  alertDelay = parseInt(timeSettings.alertDelayDineIn ?? timeSettings.alertDelay ?? '30');
    }
  } else {
    alertDelay = parseInt(timeSettings.alertDelay ?? timeSettings.alertDelayDineIn ?? '30');
  }

  if (diffMins > alertDelay) return 'text-red-600 font-bold';
  if (diffMins > 15) return 'text-yellow-600 font-bold';
  return 'text-green-600 font-bold';
}
