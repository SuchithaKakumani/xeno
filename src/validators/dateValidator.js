/**
 * Multi-format date and time validator.
 * Validates dates against predefined patterns and attempts
 * intelligent parsing for international formats.
 */

const DATE_PATTERNS = [
  { name: 'ISO',        regex: /^(\d{4})-(\d{2})-(\d{2})$/,                    order: 'YMD' },
  { name: 'DD/MM/YYYY', regex: /^(\d{2})\/(\d{2})\/(\d{4})$/,                  order: 'DMY' },
  { name: 'MM/DD/YYYY', regex: /^(\d{2})\/(\d{2})\/(\d{4})$/,                  order: 'MDY' },
  { name: 'DD-MM-YYYY', regex: /^(\d{2})-(\d{2})-(\d{4})$/,                    order: 'DMY' },
  { name: 'DD.MM.YYYY', regex: /^(\d{2})\.(\d{2})\.(\d{4})$/,                  order: 'DMY' },
  { name: 'YYYY/MM/DD', regex: /^(\d{4})\/(\d{2})\/(\d{2})$/,                  order: 'YMD' },
  { name: 'DD-MMM-YYYY',regex: /^(\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})$/i, order: 'DMonY' },
];

const MONTH_NAMES = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const TIME_PATTERNS = [
  { name: 'HH:MM:SS',    regex: /^(\d{2}):(\d{2}):(\d{2})$/ },
  { name: 'HH:MM',       regex: /^(\d{2}):(\d{2})$/ },
  { name: 'HH:MM:SS AM', regex: /^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i },
  { name: 'HH:MM AM',    regex: /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i },
];

const DATETIME_PATTERNS = [
  { name: 'ISO 8601',    regex: /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/ },
];

function isValidDateParts(year, month, day) {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1900 || year > 2100) return false;

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return false;

  return true;
}

function parseDateComponents(match, order) {
  let year, month, day;

  switch (order) {
    case 'YMD':
      year = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      day = parseInt(match[3], 10);
      break;
    case 'DMY':
      day = parseInt(match[1], 10);
      month = parseInt(match[2], 10);
      year = parseInt(match[3], 10);
      break;
    case 'MDY':
      month = parseInt(match[1], 10);
      day = parseInt(match[2], 10);
      year = parseInt(match[3], 10);
      break;
    case 'DMonY':
      day = parseInt(match[1], 10);
      month = MONTH_NAMES[match[2].toLowerCase()];
      year = parseInt(match[3], 10);
      break;
    default:
      return null;
  }

  return { year, month, day };
}

/**
 * Validates a date string. Returns { valid, normalized, format, error }
 */
function validateDate(rawDate) {
  const result = { valid: false, normalized: null, format: null, error: null };

  if (!rawDate || String(rawDate).trim() === '') {
    result.error = 'Date is empty';
    return result;
  }

  const dateStr = String(rawDate).trim();

  // Check for datetime first
  for (const pattern of DATETIME_PATTERNS) {
    const match = dateStr.match(pattern.regex);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      if (isValidDateParts(year, month, day)) {
        result.valid = true;
        const pad = (n) => String(n).padStart(2, '0');
        result.normalized = `${year}-${pad(month)}-${pad(day)}`;
        result.format = pattern.name;
        return result;
      }
    }
  }

  // Try Unix timestamp (seconds)
  if (/^\d{10}$/.test(dateStr)) {
    const d = new Date(parseInt(dateStr, 10) * 1000);
    if (!isNaN(d.getTime())) {
      result.valid = true;
      result.normalized = d.toISOString().split('T')[0];
      result.format = 'Unix timestamp (s)';
      return result;
    }
  }

  // Try Unix timestamp (milliseconds)
  if (/^\d{13}$/.test(dateStr)) {
    const d = new Date(parseInt(dateStr, 10));
    if (!isNaN(d.getTime())) {
      result.valid = true;
      result.normalized = d.toISOString().split('T')[0];
      result.format = 'Unix timestamp (ms)';
      return result;
    }
  }

  // Try each date pattern
  // For ambiguous patterns (DD/MM/YYYY vs MM/DD/YYYY), try DD/MM/YYYY first
  for (const pattern of DATE_PATTERNS) {
    const match = dateStr.match(pattern.regex);
    if (match) {
      const parts = parseDateComponents(match, pattern.order);
      if (parts && isValidDateParts(parts.year, parts.month, parts.day)) {
        result.valid = true;
        const pad = (n) => String(n).padStart(2, '0');
        result.normalized = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
        result.format = pattern.name;
        return result;
      }
    }
  }

  // Final fallback — try native Date parsing
  const fallback = new Date(dateStr);
  if (!isNaN(fallback.getTime()) && fallback.getFullYear() >= 1900 && fallback.getFullYear() <= 2100) {
    result.valid = true;
    result.normalized = fallback.toISOString().split('T')[0];
    result.format = 'Native parse';
    return result;
  }

  result.error = `Unrecognized date format: "${rawDate}"`;
  return result;
}

/**
 * Validates a time string. Returns { valid, normalized, format, error }
 */
function validateTime(rawTime) {
  const result = { valid: false, normalized: null, format: null, error: null };

  if (!rawTime || String(rawTime).trim() === '') {
    result.error = 'Time is empty';
    return result;
  }

  const timeStr = String(rawTime).trim();

  for (const pattern of TIME_PATTERNS) {
    const match = timeStr.match(pattern.regex);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = match[3] && !isNaN(parseInt(match[3], 10)) ? parseInt(match[3], 10) : 0;
      const ampm = match.length > 3 ? match[match.length - 1] : null;

      if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
      }

      if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && seconds >= 0 && seconds <= 59) {
        const pad = (n) => String(n).padStart(2, '0');
        result.valid = true;
        result.normalized = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        result.format = pattern.name;
        return result;
      }
    }
  }

  result.error = `Unrecognized time format: "${rawTime}"`;
  return result;
}

module.exports = { validateDate, validateTime };
