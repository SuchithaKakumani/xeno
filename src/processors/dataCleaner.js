/**
 * Data cleaner — post-validation normalization.
 * Trims whitespace, normalizes casing, and deduplicates rows.
 */

/**
 * Cleans a dataset that has already been validated.
 * The validationEngine already normalizes individual fields;
 * this module handles whole-row operations.
 */
function cleanData(data, headers) {
  const cleaned = [];
  const seenHashes = new Set();
  let duplicatesRemoved = 0;

  for (const row of data) {
    // Trim all values
    const trimmedRow = {};
    for (const h of headers) {
      const val = row[h];
      trimmedRow[h] = val !== null && val !== undefined ? String(val).trim() : '';
    }

    // Create row hash for deduplication
    const hash = headers.map(h => trimmedRow[h]).join('|');
    if (seenHashes.has(hash)) {
      duplicatesRemoved++;
      continue;
    }
    seenHashes.add(hash);

    cleaned.push(trimmedRow);
  }

  return {
    data: cleaned,
    duplicatesRemoved,
    cleanedCount: cleaned.length,
  };
}

/**
 * Generates a validation report as a JSON object.
 */
function generateReport(validationResult, cleaningResult, chunkInfo) {
  return {
    timestamp: new Date().toISOString(),
    input: {
      totalRows: validationResult.summary.totalRows,
      columnsDetected: validationResult.headers.length,
      fieldsMapped: validationResult.summary.mappedFields,
      unmappedColumns: validationResult.summary.unmappedColumns,
    },
    validation: {
      validRows: validationResult.summary.validRows,
      errorRows: validationResult.summary.errorRows,
      warningRows: validationResult.summary.warningRows,
      totalErrors: validationResult.summary.totalErrors,
      totalWarnings: validationResult.summary.totalWarnings,
      duplicateOrderIds: validationResult.summary.duplicateOrderIds,
    },
    cleaning: cleaningResult ? {
      duplicatesRemoved: cleaningResult.duplicatesRemoved,
      finalRowCount: cleaningResult.cleanedCount,
    } : null,
    chunking: chunkInfo || null,
    fieldMapping: validationResult.summary.fieldMapping,
  };
}

module.exports = { cleanData, generateReport };
