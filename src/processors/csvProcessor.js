const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify');
const fs = require('fs');

/**
 * Detects the delimiter used in a CSV file by examining the first few lines.
 */
function detectDelimiter(sample) {
  const delimiters = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;

  for (const d of delimiters) {
    const count = (sample.match(new RegExp('\\' + d, 'g')) || []).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/**
 * Parses a CSV file and returns { headers, data }.
 * Handles BOM, auto-detects delimiter.
 */
function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Strip BOM
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    // Detect delimiter from first 5 lines
    const sampleLines = content.split('\n').slice(0, 5).join('\n');
    const delimiter = detectDelimiter(sampleLines);

    const records = [];
    let headers = null;

    const parser = parse(content, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    parser.on('readable', function () {
      let record;
      while ((record = parser.read()) !== null) {
        if (!headers) {
          headers = Object.keys(record);
        }
        records.push(record);
      }
    });

    parser.on('error', (err) => reject(err));

    parser.on('end', () => {
      if (!headers && records.length === 0) {
        reject(new Error('CSV file is empty or unreadable'));
        return;
      }
      resolve({ headers: headers || [], data: records });
    });
  });
}

/**
 * Writes an array of row objects to a CSV file.
 */
function writeCSV(filePath, headers, data) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const stringifier = stringify({ header: true, columns: headers });

    stringifier.pipe(output);

    stringifier.on('error', reject);
    output.on('finish', resolve);

    for (const row of data) {
      const orderedRow = {};
      for (const h of headers) {
        orderedRow[h] = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
      }
      stringifier.write(orderedRow);
    }

    stringifier.end();
  });
}

module.exports = { parseCSV, writeCSV, detectDelimiter };
