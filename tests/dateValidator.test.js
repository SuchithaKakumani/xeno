const { validateDate, validateTime } = require('../src/validators/dateValidator');

describe('Date & Time Validator', () => {
  describe('validateDate', () => {
    test('should reject empty date', () => {
      const res = validateDate('');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('empty');
    });

    test('should validate ISO format correctly', () => {
      const res = validateDate('2024-03-15');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('2024-03-15');
      expect(res.format).toBe('ISO');
    });

    test('should validate slash formats correctly', () => {
      const res = validateDate('15/03/2024');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('2024-03-15');
      expect(res.format).toBe('DD/MM/YYYY');
    });

    test('should validate month names format correctly', () => {
      const res = validateDate('15-Mar-2024');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('2024-03-15');
      expect(res.format).toBe('DD-MMM-YYYY');
    });

    test('should validate Unix timestamps (seconds)', () => {
      const res = validateDate('1710460800'); // 2024-03-15T00:00:00.000Z
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('2024-03-15');
      expect(res.format).toBe('Unix timestamp (s)');
    });

    test('should validate Unix timestamps (milliseconds)', () => {
      const res = validateDate('1710460800000');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('2024-03-15');
      expect(res.format).toBe('Unix timestamp (ms)');
    });

    test('should reject invalid dates', () => {
      expect(validateDate('2024-13-45').valid).toBe(false);
      expect(validateDate('31/02/2024').valid).toBe(false);
    });
  });

  describe('validateTime', () => {
    test('should validate HH:MM:SS format', () => {
      const res = validateTime('14:30:15');
      expect(res.valid).toBe(true);
      expect(res.normalized).toBe('14:30:15');
    });

    test('should validate 12-hour AM/PM formats', () => {
      expect(validateTime('02:30 PM').normalized).toBe('14:30:00');
      expect(validateTime('12:15 AM').normalized).toBe('00:15:00');
    });

    test('should reject invalid times', () => {
      expect(validateTime('25:00').valid).toBe(false);
      expect(validateTime('14:65').valid).toBe(false);
    });
  });
});
