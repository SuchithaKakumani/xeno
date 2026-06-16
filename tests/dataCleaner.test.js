const { cleanData, generateReport } = require('../src/processors/dataCleaner');

describe('Data Cleaner', () => {
  describe('cleanData', () => {
    test('should trim whitespace from all fields', () => {
      const data = [{ col1: ' value1 ', col2: 'value2\t' }];
      const headers = ['col1', 'col2'];
      const res = cleanData(data, headers);
      expect(res.data[0].col1).toBe('value1');
      expect(res.data[0].col2).toBe('value2');
    });

    test('should remove duplicate rows and count them', () => {
      const data = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '1', name: 'Alice' }, // duplicate
      ];
      const headers = ['id', 'name'];
      const res = cleanData(data, headers);
      expect(res.duplicatesRemoved).toBe(1);
      expect(res.cleanedCount).toBe(2);
      expect(res.data.length).toBe(2);
    });
  });

  describe('generateReport', () => {
    test('should format validation and cleaning summaries into a report', () => {
      const valResult = {
        summary: {
          totalRows: 10,
          validRows: 8,
          errorRows: 2,
          warningRows: 1,
          totalErrors: 3,
          totalWarnings: 1,
          duplicateOrderIds: 0,
          mappedFields: 2,
          unmappedColumns: [],
          fieldMapping: [],
        },
        headers: ['col1', 'col2'],
      };
      const cleanResult = {
        duplicatesRemoved: 1,
        cleanedCount: 9,
      };

      const report = generateReport(valResult, cleanResult, null);
      expect(report.timestamp).toBeDefined();
      expect(report.input.totalRows).toBe(10);
      expect(report.validation.validRows).toBe(8);
      expect(report.cleaning.duplicatesRemoved).toBe(1);
    });
  });
});
