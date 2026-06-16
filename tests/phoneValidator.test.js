const { validatePhone, normalizePhone } = require('../src/validators/phoneValidator');

describe('Phone Validator & Normalizer', () => {
  describe('normalizePhone', () => {
    test('should strip formatting characters', () => {
      expect(normalizePhone('+65 9123-4567', 'SG')).toBe('91234567');
      expect(normalizePhone('(202) 555-1234', 'US')).toBe('2025551234');
    });

    test('should strip country code prefix if present', () => {
      expect(normalizePhone('+919876543210', 'IN')).toBe('9876543210');
      expect(normalizePhone('+6591234567', 'SG')).toBe('91234567');
    });

    test('should strip leading zero for countries where common', () => {
      expect(normalizePhone('07911123456', 'GB')).toBe('7911123456');
    });
  });

  describe('validatePhone', () => {
    test('should reject empty or null inputs', () => {
      const res = validatePhone('', 'SG');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('empty');
    });

    test('should reject if country code is missing', () => {
      const res = validatePhone('91234567', '');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Country code is required');
    });

    test('should validate Singapore phone numbers correctly', () => {
      expect(validatePhone('91234567', 'SG').valid).toBe(true);
      expect(validatePhone('81234567', 'SG').valid).toBe(true);
      expect(validatePhone('12345678', 'SG').valid).toBe(false); // wrong start digit
      expect(validatePhone('9123456', 'SG').valid).toBe(false);  // too short
    });

    test('should validate India phone numbers correctly', () => {
      expect(validatePhone('9876543210', 'IN').valid).toBe(true);
      expect(validatePhone('5876543210', 'IN').valid).toBe(false); // wrong start digit
      expect(validatePhone('987654321', 'IN').valid).toBe(false);  // too short
    });

    test('should use generic validation for unknown country codes', () => {
      const res = validatePhone('1234567890', 'ZZ');
      expect(res.valid).toBe(true);
      expect(res.warning).toContain('generic validation');
    });

    test('should reject non-numeric characters', () => {
      expect(validatePhone('9123456A', 'SG').valid).toBe(false);
    });
  });
});
