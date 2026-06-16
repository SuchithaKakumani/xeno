const fs = require('fs');
const path = require('path');
const { validatePhone, normalizePhone } = require('./phoneValidator');
const { validateDate, validateTime } = require('./dateValidator');
const {
  validateEmail, validateNumeric, validateString,
  validateEnum, validateCurrency, validateCountryCode, validateCrossField,
} = require('./dataIntegrityValidator');

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'validationSchema.json'), 'utf-8')
);

/**
 * Maps CSV column headers to schema field names using alias matching.
 * Returns { mappedFields: { schemaField: csvColumn }, unmappedColumns: [] }
 */
function mapColumns(csvHeaders) {
  const allFields = {
    ...schema.orderFields,
    ...schema.productFields,
    ...schema.paymentFields,
  };

  const mappedFields = {};
  const unmappedColumns = [];
  const normalizedHeaders = csvHeaders.map(h => h.toLowerCase().trim().replace(/\s+/g, '_'));

  for (const header of csvHeaders) {
    const normalizedHeader = header.toLowerCase().trim().replace(/\s+/g, '_');
    let matched = false;

    for (const [fieldName, fieldDef] of Object.entries(allFields)) {
      if (fieldDef.aliases && fieldDef.aliases.includes(normalizedHeader)) {
        mappedFields[fieldName] = header;
        matched = true;
        break;
      }
    }

    if (!matched) {
      unmappedColumns.push(header);
    }
  }

  return { mappedFields, unmappedColumns };
}

/**
 * Validates a single row against the schema.
 * Returns { errors: [], warnings: [], cleanedRow: {} }
 */
function validateRow(row, mappedFields, rowIndex) {
  const errors = [];
  const warnings = [];
  const cleanedRow = { ...row };

  const allFields = {
    ...schema.orderFields,
    ...schema.productFields,
    ...schema.paymentFields,
  };

  // Get country code for phone validation
  const countryCol = mappedFields['country_code'];
  const countryCode = countryCol ? String(row[countryCol] || '').trim().toUpperCase() : null;

  for (const [fieldName, csvColumn] of Object.entries(mappedFields)) {
    const fieldDef = allFields[fieldName];
    if (!fieldDef) continue;

    const rawValue = row[csvColumn];
    const isEmpty = rawValue === null || rawValue === undefined || String(rawValue).trim() === '';

    // Required check
    if (fieldDef.required && isEmpty) {
      errors.push({
        row: rowIndex,
        field: csvColumn,
        schemaField: fieldName,
        value: rawValue,
        type: 'error',
        message: `Required field "${csvColumn}" is empty`,
      });
      continue;
    }

    if (isEmpty) continue;

    const trimmedValue = String(rawValue).trim();

    switch (fieldDef.type) {
      case 'phone': {
        const phoneResult = validatePhone(trimmedValue, countryCode);
        if (!phoneResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: phoneResult.error,
          });
        } else {
          cleanedRow[csvColumn] = phoneResult.normalized || trimmedValue;
          if (phoneResult.warning) {
            warnings.push({
              row: rowIndex, field: csvColumn, schemaField: fieldName,
              value: rawValue, type: 'warning', message: phoneResult.warning,
            });
          }
        }
        break;
      }

      case 'date': {
        const dateResult = validateDate(trimmedValue);
        if (!dateResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: dateResult.error,
          });
        } else {
          cleanedRow[csvColumn] = dateResult.normalized;
        }
        break;
      }

      case 'time': {
        const timeResult = validateTime(trimmedValue);
        if (!timeResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: timeResult.error,
          });
        } else {
          cleanedRow[csvColumn] = timeResult.normalized;
        }
        break;
      }

      case 'email': {
        const emailResult = validateEmail(trimmedValue);
        if (!emailResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: emailResult.error,
          });
        } else {
          cleanedRow[csvColumn] = trimmedValue.toLowerCase();
        }
        break;
      }

      case 'integer': {
        const intResult = validateNumeric(rawValue, csvColumn, {
          isInteger: true,
          min: fieldDef.min,
          max: fieldDef.max,
          required: fieldDef.required,
        });
        if (!intResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: intResult.error,
          });
        } else if (intResult.normalized !== null) {
          cleanedRow[csvColumn] = intResult.normalized;
        }
        if (intResult.warning) {
          warnings.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'warning', message: intResult.warning,
          });
        }
        break;
      }

      case 'decimal': {
        const decResult = validateNumeric(rawValue, csvColumn, {
          isInteger: false,
          min: fieldDef.min,
          max: fieldDef.max,
          maxDecimals: fieldDef.maxDecimals,
          required: fieldDef.required,
        });
        if (!decResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: decResult.error,
          });
        } else if (decResult.normalized !== null) {
          cleanedRow[csvColumn] = decResult.normalized;
        }
        if (decResult.warning) {
          warnings.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'warning', message: decResult.warning,
          });
        }
        break;
      }

      case 'enum': {
        const enumResult = validateEnum(rawValue, csvColumn, {
          allowedValues: fieldDef.allowedValues,
          caseInsensitive: fieldDef.caseInsensitive,
          required: fieldDef.required,
        });
        if (!enumResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: enumResult.error,
          });
        } else if (enumResult.normalized) {
          cleanedRow[csvColumn] = enumResult.normalized;
        }
        break;
      }

      case 'currency': {
        const curResult = validateCurrency(trimmedValue);
        if (!curResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: curResult.error,
          });
        } else {
          cleanedRow[csvColumn] = trimmedValue.toUpperCase();
        }
        break;
      }

      case 'country': {
        const countryResult = validateCountryCode(trimmedValue);
        if (!countryResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: countryResult.error,
          });
        } else {
          cleanedRow[csvColumn] = countryResult.normalized || trimmedValue.toUpperCase();
        }
        break;
      }

      case 'string': {
        const strResult = validateString(rawValue, csvColumn, {
          minLength: fieldDef.minLength || 0,
          maxLength: fieldDef.maxLength || Infinity,
          required: fieldDef.required,
        });
        if (!strResult.valid) {
          errors.push({
            row: rowIndex, field: csvColumn, schemaField: fieldName,
            value: rawValue, type: 'error', message: strResult.error,
          });
        } else {
          cleanedRow[csvColumn] = trimmedValue;
        }
        break;
      }
    }
  }

  // Cross-field validation
  const crossWarnings = validateCrossField(row, mappedFields);
  for (const w of crossWarnings) {
    warnings.push({
      row: rowIndex, field: 'cross-field', schemaField: 'cross-field',
      value: '', type: 'warning', message: w,
    });
  }

  return { errors, warnings, cleanedRow };
}

/**
 * Run full validation on a parsed dataset.
 * data: array of row objects
 * headers: array of column names
 */
function runValidation(data, headers) {
  const { mappedFields, unmappedColumns } = mapColumns(headers);

  const allErrors = [];
  const allWarnings = [];
  const cleanedData = [];
  const seenOrderIds = new Set();
  let duplicateCount = 0;

  const orderIdCol = mappedFields['order_id'];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowIndex = i + 2; // +2 for 1-indexed + header row

    // Duplicate order ID check
    if (orderIdCol) {
      const oid = String(row[orderIdCol] || '').trim();
      if (oid && seenOrderIds.has(oid)) {
        allWarnings.push({
          row: rowIndex, field: orderIdCol, schemaField: 'order_id',
          value: oid, type: 'warning', message: `Duplicate order ID: "${oid}"`,
        });
        duplicateCount++;
      }
      if (oid) seenOrderIds.add(oid);
    }

    const { errors, warnings, cleanedRow } = validateRow(row, mappedFields, rowIndex);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
    cleanedData.push(cleanedRow);
  }

  const summary = {
    totalRows: data.length,
    validRows: data.length - new Set(allErrors.map(e => e.row)).size,
    errorRows: new Set(allErrors.map(e => e.row)).size,
    warningRows: new Set(allWarnings.map(w => w.row)).size,
    totalErrors: allErrors.length,
    totalWarnings: allWarnings.length,
    duplicateOrderIds: duplicateCount,
    mappedFields: Object.keys(mappedFields).length,
    unmappedColumns,
    fieldMapping: Object.entries(mappedFields).map(([schema, csv]) => ({
      schemaField: schema,
      csvColumn: csv,
    })),
  };

  return {
    summary,
    errors: allErrors,
    warnings: allWarnings,
    cleanedData,
    headers,
  };
}

/**
 * Runs validation asynchronously on a parsed dataset.
 * Triggers progressCallback(current, total) periodically.
 */
async function runValidationAsync(data, headers, progressCallback) {
  const { mappedFields, unmappedColumns } = mapColumns(headers);

  const allErrors = [];
  const allWarnings = [];
  const cleanedData = [];
  const seenOrderIds = new Set();
  let duplicateCount = 0;

  const orderIdCol = mappedFields['order_id'];
  const chunkSize = 2000; // Process in chunks of 2,000 rows

  for (let i = 0; i < data.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, data.length);
    for (let j = i; j < end; j++) {
      const row = data[j];
      const rowIndex = j + 2; // +2 for 1-indexed + header row

      // Duplicate order ID check
      if (orderIdCol) {
        const oid = String(row[orderIdCol] || '').trim();
        if (oid && seenOrderIds.has(oid)) {
          allWarnings.push({
            row: rowIndex, field: orderIdCol, schemaField: 'order_id',
            value: oid, type: 'warning', message: `Duplicate order ID: "${oid}"`,
          });
          duplicateCount++;
        }
        if (oid) seenOrderIds.add(oid);
      }

      const { errors, warnings, cleanedRow } = validateRow(row, mappedFields, rowIndex);
      allErrors.push(...errors);
      allWarnings.push(...warnings);
      cleanedData.push(cleanedRow);
    }

    if (progressCallback) {
      await progressCallback(end, data.length);
    }
    // Yield to the event loop
    await new Promise(resolve => setImmediate(resolve));
  }

  const summary = {
    totalRows: data.length,
    validRows: data.length - new Set(allErrors.map(e => e.row)).size,
    errorRows: new Set(allErrors.map(e => e.row)).size,
    warningRows: new Set(allWarnings.map(w => w.row)).size,
    totalErrors: allErrors.length,
    totalWarnings: allWarnings.length,
    duplicateOrderIds: duplicateCount,
    mappedFields: Object.keys(mappedFields).length,
    unmappedColumns,
    fieldMapping: Object.entries(mappedFields).map(([schema, csv]) => ({
      schemaField: schema,
      csvColumn: csv,
    })),
  };

  return {
    summary,
    errors: allErrors,
    warnings: allWarnings,
    cleanedData,
    headers,
  };
}

module.exports = { runValidation, runValidationAsync, mapColumns };
