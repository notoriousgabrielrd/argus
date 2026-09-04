const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const TOKEN = /YYYY|YY|MMMM|MMM|MM|M|DDDD|dddd|ddd|DD|D|HH|mm|ss/g

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0')
}

/**
 * The Moment tokens Obsidian's daily-note format actually uses. Anything else
 * is passed through untouched rather than guessed at.
 */
export function formatDatePattern(date: Date, pattern: string): string {
  return pattern.replace(TOKEN, (token) => {
    switch (token) {
      case 'YYYY':
        return String(date.getFullYear())
      case 'YY':
        return pad(date.getFullYear() % 100)
      case 'MMMM':
        return MONTHS[date.getMonth()]
      case 'MMM':
        return MONTHS[date.getMonth()].slice(0, 3)
      case 'MM':
        return pad(date.getMonth() + 1)
      case 'M':
        return String(date.getMonth() + 1)
      case 'dddd':
      case 'DDDD':
        return WEEKDAYS[date.getDay()]
      case 'ddd':
        return WEEKDAYS[date.getDay()].slice(0, 3)
      case 'DD':
        return pad(date.getDate())
      case 'D':
        return String(date.getDate())
      case 'HH':
        return pad(date.getHours())
      case 'mm':
        return pad(date.getMinutes())
      case 'ss':
        return pad(date.getSeconds())
      default:
        return token
    }
  })
}

export function parseDateInput(input?: string): Date {
  const value = input?.trim()
  if (!value || value.toLowerCase() === 'today') {
    return new Date()
  }
  if (value.toLowerCase() === 'yesterday') {
    return new Date(Date.now() - 86_400_000)
  }
  if (value.toLowerCase() === 'tomorrow') {
    return new Date(Date.now() + 86_400_000)
  }
  const relative = /^([+-]\d+)d$/i.exec(value)
  if (relative) {
    return new Date(Date.now() + Number(relative[1]) * 86_400_000)
  }
  const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (isoDay) {
    // Construct locally so a date-only input does not shift a day by timezone.
    return new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}
