const fs = require('fs');
const path = require('path');

const countryRules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'countryRules.json'), 'utf-8')
);

/**
 * Strips a phone string down to its raw digits,
 * removing the country-code prefix if present.
 */
function normalizePhone(rawPhone, countryCode) {
  if (!rawPhone) return '';
  let phone = String(rawPhone).replace(/[\s\-().+]/g, '');

  if (countryCode) {
    const cc = countryCode.toUpperCase();
    const rule = countryRules[cc];
    if (rule) {
      const prefix = rule.countryCode.replace('+', '');
      if (phone.startsWith(prefix) && phone.length > prefix.length) {
        phone = phone.slice(prefix.length);
      }
      // Also strip leading zero common in some countries
      if (['GB', 'AU', 'MY', 'JP', 'DE'].includes(cc) && phone.startsWith('0')) {
        phone = phone.slice(1);
      }
    }
  }
  return phone;
}

/**
 * Validates a phone number against the country-specific rules.
 * Returns { valid, normalized, error, warning }
 */
function validatePhone(rawPhone, countryCode) {
  const result = { valid: true, normalized: '', error: null, warning: null };

  if (!rawPhone || String(rawPhone).trim() === '') {
    result.valid = false;
    result.error = 'Phone number is empty';
    return result;
  }

  if (!countryCode || String(countryCode).trim() === '') {
    result.valid = false;
    result.error = 'Country code is required for phone validation';
    return result;
  }

  const cc = String(countryCode).toUpperCase().trim();
  const rule = countryRules[cc];

  if (!rule) {
    // Unknown country — do basic validation (digits only, 7-15 length)
    const phone = normalizePhone(rawPhone, null);
    if (!/^\d+$/.test(phone)) {
      result.valid = false;
      result.error = `Phone contains non-numeric characters: "${rawPhone}"`;
      return result;
    }
    if (phone.length < 7 || phone.length > 15) {
      result.valid = false;
      result.error = `Phone must be 7-15 digits for unknown country "${cc}", got ${phone.length}`;
      return result;
    }
    result.normalized = phone;
    result.warning = `No specific rules for country "${cc}" — applied generic validation`;
    return result;
  }

  const phone = normalizePhone(rawPhone, cc);
  result.normalized = phone;

  // Check digits only
  if (!/^\d+$/.test(phone)) {
    result.valid = false;
    result.error = `Phone contains non-numeric characters after cleanup: "${phone}" (original: "${rawPhone}")`;
    return result;
  }

  // Check digit count
  const expectedDigits = Array.isArray(rule.phone.digits) ? rule.phone.digits : [rule.phone.digits];
  if (!expectedDigits.includes(phone.length)) {
    result.valid = false;
    result.error = `${rule.name} phone must be ${expectedDigits.join(' or ')} digits, got ${phone.length} (value: "${phone}")`;
    return result;
  }

  // Check pattern
  if (rule.phone.pattern) {
    const regex = new RegExp(rule.phone.pattern);
    if (!regex.test(phone)) {
      result.valid = false;
      result.error = `${rule.name} phone "${phone}" doesn't match expected pattern. Example: ${rule.phone.example}`;
      return result;
    }
  }

  return result;
}

/**
 * Returns the list of supported country codes.
 */
function getSupportedCountries() {
  return Object.entries(countryRules).map(([code, info]) => ({
    code,
    name: info.name,
    phoneDigits: info.phone.digits,
    example: info.phone.example,
    countryCode: info.countryCode,
  }));
}

module.exports = { validatePhone, normalizePhone, getSupportedCountries };
