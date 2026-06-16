const fs = require('fs');
const path = require('path');

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'validationSchema.json'), 'utf-8')
);

const VALID_CURRENCIES = new Set(schema.validCurrencies);

/**
 * Validates an email address format.
 */
function validateEmail(email) {
  if (!email || String(email).trim() === '') return { valid: false, error: 'Email is empty' };
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(String(email).trim())) {
    return { valid: false, error: `Invalid email format: "${email}"` };
  }
  return { valid: true, error: null };
}

/**
 * Validates a numeric field (integer or decimal).
 */
function validateNumeric(value, fieldName, options = {}) {
  const { min, max, isInteger = false, maxDecimals, required = true } = options;
  const result = { valid: true, error: null, warning: null, normalized: null };

  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) {
      result.valid = false;
      result.error = `${fieldName} is required but empty`;
    }
    return result;
  }

  const strVal = String(value).trim().replace(/,/g, ''); // Remove comma separators
  const num = Number(strVal);

  if (isNaN(num)) {
    result.valid = false;
    result.error = `${fieldName} must be numeric, got "${value}"`;
    return result;
  }

  if (isInteger && !Number.isInteger(num)) {
    result.valid = false;
    result.error = `${fieldName} must be a whole number, got "${value}"`;
    return result;
  }

  if (min !== undefined && num < min) {
    result.valid = false;
    result.error = `${fieldName} must be >= ${min}, got ${num}`;
    return result;
  }

  if (max !== undefined && num > max) {
    result.valid = false;
    result.error = `${fieldName} must be <= ${max}, got ${num}`;
    return result;
  }

  if (maxDecimals !== undefined) {
    const decimalPart = strVal.includes('.') ? strVal.split('.')[1] : '';
    if (decimalPart.length > maxDecimals) {
      result.warning = `${fieldName} has ${decimalPart.length} decimal places, expected max ${maxDecimals}`;
    }
  }

  result.normalized = num;
  return result;
}

/**
 * Validates a string field for length constraints.
 */
function validateString(value, fieldName, options = {}) {
  const { minLength = 0, maxLength = Infinity, required = true } = options;
  const result = { valid: true, error: null };

  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) {
      result.valid = false;
      result.error = `${fieldName} is required but empty`;
    }
    return result;
  }

  const str = String(value).trim();
  if (str.length < minLength) {
    result.valid = false;
    result.error = `${fieldName} must be at least ${minLength} characters, got ${str.length}`;
    return result;
  }

  if (str.length > maxLength) {
    result.valid = false;
    result.error = `${fieldName} must be at most ${maxLength} characters, got ${str.length}`;
    return result;
  }

  return result;
}

/**
 * Validates an enum field against allowed values.
 */
function validateEnum(value, fieldName, options = {}) {
  const { allowedValues = [], caseInsensitive = true, required = true } = options;
  const result = { valid: true, error: null, normalized: null };

  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) {
      result.valid = false;
      result.error = `${fieldName} is required but empty`;
    }
    return result;
  }

  const str = String(value).trim();
  const compareVal = caseInsensitive ? str.toLowerCase() : str;
  const allowed = caseInsensitive ? allowedValues.map(v => v.toLowerCase()) : allowedValues;

  if (!allowed.includes(compareVal)) {
    result.valid = false;
    result.error = `${fieldName} value "${str}" is not allowed. Expected one of: ${allowedValues.slice(0, 8).join(', ')}${allowedValues.length > 8 ? '...' : ''}`;
    return result;
  }

  result.normalized = compareVal;
  return result;
}

/**
 * Validates currency code against ISO 4217.
 */
function validateCurrency(value) {
  if (!value || String(value).trim() === '') return { valid: true, error: null }; // optional
  const code = String(value).trim().toUpperCase();
  if (!VALID_CURRENCIES.has(code)) {
    return { valid: false, error: `Unknown currency code: "${value}"` };
  }
  return { valid: true, error: null };
}

/**
 * Validates country code (ISO 3166-1 alpha-2).
 */
function validateCountryCode(value) {
  if (!value || String(value).trim() === '') {
    return { valid: false, error: 'Country code is required but empty' };
  }
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return { valid: false, error: `Country code must be 2 uppercase letters, got "${value}"` };
  }
  return { valid: true, error: null, normalized: code };
}

/**
 * Cross-field consistency check: quantity × unit_price ≈ total.
 * Allows for small floating-point differences and discount/tax adjustments.
 */
function validateCrossField(row, mappedFields) {
  const warnings = [];

  const qtyField = mappedFields['quantity'];
  const priceField = mappedFields['unit_price'];
  const totalField = mappedFields['total_amount'];
  const discountField = mappedFields['discount'];
  const taxField = mappedFields['tax'];

  if (qtyField && priceField && totalField) {
    const qty = parseFloat(String(row[qtyField] || '0').replace(/,/g, ''));
    const price = parseFloat(String(row[priceField] || '0').replace(/,/g, ''));
    const total = parseFloat(String(row[totalField] || '0').replace(/,/g, ''));
    const discount = discountField ? parseFloat(String(row[discountField] || '0').replace(/,/g, '')) : 0;
    const tax = taxField ? parseFloat(String(row[taxField] || '0').replace(/,/g, '')) : 0;

    if (!isNaN(qty) && !isNaN(price) && !isNaN(total)) {
      const expected = (qty * price) - discount + tax;
      const diff = Math.abs(total - expected);
      if (diff > 0.5) {
        warnings.push(
          `Total amount (${total}) doesn't match qty(${qty}) × price(${price}) - discount(${discount}) + tax(${tax}) = ${expected.toFixed(2)}`
        );
      }
    }
  }

  return warnings;
}

module.exports = {
  validateEmail,
  validateNumeric,
  validateString,
  validateEnum,
  validateCurrency,
  validateCountryCode,
  validateCrossField,
};
