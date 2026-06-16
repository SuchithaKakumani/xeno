const {
  validateEmail,
  validateNumeric,
  validateString,
  validateEnum,
  validateCurrency,
  validateCountryCode,
  validateCrossField,
} = require('../src/validators/dataIntegrityValidator');

describe('Data Integrity Validator', () => {
  describe('validateEmail', () => {
    test('should validate correct emails', () => {
      expect(validateEmail('test@example.com').valid).toBe(true);
      expect(validateEmail('john.doe@sub.domain.co').valid).toBe(true);
    });

    test('should reject invalid email formats', () => {
      expect(validateEmail('testexample.com').valid).toBe(false);
      expect(validateEmail('@example.com').valid).toBe(false);
      expect(validateEmail('test@example.').valid).toBe(false);
    });
  });

  describe('validateNumeric', () => {
    test('should validate standard number range', () => {
      const res = validateNumeric('15.5', 'price', { min: 0, max: 100 });
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe(15.5);
    });

    test('should reject integers with decimals if isInteger is true', () => {
      const res = validateNumeric('15.5', 'quantity', { isInteger: true });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('whole number');
    });

    test('should warn if decimal places exceed maximum', () => {
      const res = validateNumeric('15.555', 'price', { maxDecimals: 2 });
      expect(res.valid).toBe(true);
      expect(res.warning).toContain('decimal places');
    });
  });

  describe('validateString', () => {
    test('should validate length constraints', () => {
      expect(validateString('ABC', 'code', { minLength: 2, maxLength: 5 }).valid).toBe(true);
      expect(validateString('A', 'code', { minLength: 2 }).valid).toBe(false);
      expect(validateString('ABCDEF', 'code', { maxLength: 5 }).valid).toBe(false);
    });
  });

  describe('validateEnum', () => {
    test('should validate allowed values', () => {
      const options = { allowedValues: ['UPI', 'Credit Card'], caseInsensitive: true };
      expect(validateEnum('upi', 'payment', options).valid).toBe(true);
      expect(validateEnum('Credit Card', 'payment', options).valid).toBe(true);
      expect(validateEnum('Bitcoin', 'payment', options).valid).toBe(false);
    });
  });

  describe('validateCurrency', () => {
    test('should validate ISO currencies', () => {
      expect(validateCurrency('USD').valid).toBe(true);
      expect(validateCurrency('INR').valid).toBe(true);
      expect(validateCurrency('XYZ').valid).toBe(false);
    });
  });

  describe('validateCrossField', () => {
    test('should pass if total matches quantity * price - discount + tax', () => {
      const row = {
        qty: '2',
        price: '29.99',
        total: '61.98',
        discount: '3.00',
        tax: '5.00',
      };
      const mappings = {
        quantity: 'qty',
        unit_price: 'price',
        total_amount: 'total',
        discount: 'discount',
        tax: 'tax',
      };
      const warnings = validateCrossField(row, mappings);
      expect(warnings.length).toBe(0);
    });

    test('should warn if total doesn\'t match math within tolerance', () => {
      const row = {
        qty: '2',
        price: '29.99',
        total: '10.00',
        discount: '0.00',
        tax: '0.00',
      };
      const mappings = {
        quantity: 'qty',
        unit_price: 'price',
        total_amount: 'total',
      };
      const warnings = validateCrossField(row, mappings);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Total amount');
    });
  });
});
