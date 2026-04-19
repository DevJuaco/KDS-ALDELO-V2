export function formatOrderTime(dateString) {
  const date = new Date(dateString)
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function calculateElapsedTime(dateString) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)

  const hours = Math.floor(diff / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  const seconds = diff % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}

export function getTimeColor(dateString, currentTime, orderType) {
  const elapsedTimeString = calculateElapsedTime(dateString)
  const hoursMatch = elapsedTimeString.match(/(\d+)h/)
  const minutesMatch = elapsedTimeString.match(/(\d+)m/)
  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0
  const totalMinutes = hours * 60 + minutes

  // Default alert times by order type
  const alertTimes = {
    '1': 30, // Dine-in
    '2': 25, // Take-out
    '3': 35, // Drive-thru
    '4': 40  // Delivery
  }

  const alertTime = alertTimes[orderType] || 30

  if (totalMinutes >= alertTime + 10) {
    return 'text-red-700'
  }
  if (totalMinutes >= alertTime) {
    return 'text-orange-600'
  }
  return 'text-green-600'
}
