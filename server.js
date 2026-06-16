const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

const { parseCSV, writeCSV } = require('./src/processors/csvProcessor');
const { runValidation } = require('./src/validators/validationEngine');
const { cleanData, generateReport } = require('./src/processors/dataCleaner');
const { chunkData, createChunkZip } = require('./src/processors/fileChunker');
const { getSupportedCountries } = require('./src/validators/phoneValidator');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories
const isVercel = process.env.VERCEL === '1';
const UPLOAD_DIR = isVercel ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, 'uploads');
const OUTPUT_DIR = isVercel ? path.join(os.tmpdir(), 'output') : path.join(__dirname, 'output');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer config
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.csv', '.tsv', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported. Upload CSV, TSV, or TXT files.`));
    }
  },
});

// ─── API ROUTES ─────────────────────────────────────────────────────

/**
 * POST /api/validate
 * Upload and validate a CSV file.
 */
app.post('/api/validate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const sessionId = uuidv4();
    const sessionDir = path.join(OUTPUT_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });

    // Parse CSV
    const { headers, data } = await parseCSV(req.file.path);

    if (data.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty (no data rows found)' });
    }

    // Validate
    const validationResult = runValidation(data, headers);

    // Clean
    const cleaningResult = cleanData(validationResult.cleanedData, headers);

    // Write cleaned CSV
    const cleanedFilename = `validated_${path.parse(req.file.originalname).name}.csv`;
    const cleanedPath = path.join(sessionDir, cleanedFilename);
    await writeCSV(cleanedPath, headers, cleaningResult.data);

    // Chunk if large
    let chunkInfo = null;
    const chunkSize = parseInt(req.body?.chunkSize) || 1000;

    if (cleaningResult.data.length > chunkSize) {
      const baseName = path.parse(req.file.originalname).name;
      const chunks = await chunkData(headers, cleaningResult.data, sessionDir, baseName, chunkSize);
      const zipPath = await createChunkZip(chunks, sessionDir, baseName);

      chunkInfo = {
        totalChunks: chunks.length,
        chunkSize,
        chunks: chunks.map(c => ({
          filename: c.filename,
          rowCount: c.rowCount,
          downloadUrl: `/api/download/${sessionId}/${c.filename}`,
        })),
        zipDownloadUrl: `/api/download/${sessionId}/${path.basename(zipPath)}`,
      };
    }

    // Generate report
    const report = generateReport(validationResult, cleaningResult, chunkInfo);
    const reportPath = path.join(sessionDir, 'validation_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    // Response
    res.json({
      sessionId,
      summary: validationResult.summary,
      errors: validationResult.errors.slice(0, 500), // Cap at 500 for response size
      warnings: validationResult.warnings.slice(0, 500),
      totalErrors: validationResult.errors.length,
      totalWarnings: validationResult.warnings.length,
      cleaning: {
        duplicatesRemoved: cleaningResult.duplicatesRemoved,
        finalRowCount: cleaningResult.cleanedCount,
      },
      downloads: {
        cleanedFile: `/api/download/${sessionId}/${cleanedFilename}`,
        report: `/api/download/${sessionId}/validation_report.json`,
      },
      chunking: chunkInfo,
    });
  } catch (err) {
    console.error('Validation error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/download/:sessionId/:filename
 * Download a processed file.
 */
app.get('/api/download/:sessionId/:filename', (req, res) => {
  const { sessionId, filename } = req.params;
  const filePath = path.join(OUTPUT_DIR, sessionId, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(filePath, filename);
});

/**
 * GET /api/countries
 * Returns list of supported countries and their phone rules.
 */
app.get('/api/countries', (req, res) => {
  res.json(getSupportedCountries());
});

/**
 * GET /api/sample
 * Generates and returns a sample CSV for testing.
 */
app.get('/api/sample', (req, res) => {
  const rows = parseInt(req.query.rows) || 25;
  const csv = generateSampleCSV(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=sample_transactions.csv');
  res.send(csv);
});

/**
 * Generate sample transaction CSV data.
 */
function generateSampleCSV(rowCount) {
  const countries = ['SG', 'IN', 'US', 'GB', 'AU', 'JP', 'DE', 'AE'];
  const products = [
    { id: 'SKU-001', name: 'Wireless Mouse', price: 29.99 },
    { id: 'SKU-002', name: 'USB-C Hub', price: 45.50 },
    { id: 'SKU-003', name: 'Mechanical Keyboard', price: 89.99 },
    { id: 'SKU-004', name: 'Monitor Stand', price: 34.99 },
    { id: 'SKU-005', name: 'Webcam HD', price: 59.99 },
    { id: 'SKU-006', name: 'Desk Lamp LED', price: 24.99 },
    { id: 'SKU-007', name: 'Laptop Sleeve', price: 19.99 },
    { id: 'SKU-008', name: 'Ethernet Cable 5m', price: 12.99 },
  ];
  const payments = ['Credit Card', 'Debit Card', 'UPI', 'Net Banking', 'COD', 'Wallet', 'PayPal'];
  const statuses = ['Confirmed', 'Shipped', 'Delivered', 'Pending', 'Processing'];
  const payStatuses = ['Paid', 'Pending', 'Unpaid'];
  const names = [
    'Rahul Sharma', 'Emily Chen', 'James Wilson', 'Sakura Tanaka',
    'Priya Patel', 'Muhammad Ali', 'Anna Schmidt', 'David Lee',
    'Sofia Garcia', 'Wei Zhang', 'Aisha Khan', 'Oliver Brown',
    'Fatima Al Nahyan', 'Liam OBrien', 'Yuki Sato', 'Carlos Mendez',
  ];
  const phonesByCountry = {
    SG: ['91234567', '81234567', '61234567', '98765432'],
    IN: ['9876543210', '8765432109', '7654321098', '6543210987'],
    US: ['2025551234', '3105559876', '4155554321', '7185556789'],
    GB: ['7911123456', '7912234567', '2012345678', '1612345678'],
    AU: ['412345678', '298765432', '387654321', '712345678'],
    JP: ['9012345678', '8012345678', '7012345678', '30123456789'],
    DE: ['15123456789', '17123456789', '16123456789', '15198765432'],
    AE: ['501234567', '551234567', '561234567', '521234567'],
  };

  // Intentionally add some errors for testing
  const badPhones = ['123', 'abcdef', '00000', ''];
  const badDates = ['2024-13-45', 'not-a-date', '32/13/2024'];
  const badPayments = ['Bitcoin', 'Barter', ''];

  let csv = 'order_id,order_date,order_time,customer_name,customer_email,customer_phone,country_code,product_id,product_name,quantity,unit_price,total_amount,discount,tax,currency,payment_mode,payment_status,transaction_id,order_status,shipping_address\n';

  for (let i = 1; i <= rowCount; i++) {
    const country = countries[i % countries.length];
    const product = products[i % products.length];
    const qty = Math.ceil(Math.random() * 5);
    const discount = Math.random() > 0.7 ? (Math.random() * 10).toFixed(2) : '0.00';
    const tax = (product.price * qty * 0.08).toFixed(2);
    const total = (product.price * qty - parseFloat(discount) + parseFloat(tax)).toFixed(2);

    // Inject ~15% errors for realistic testing
    const injectError = Math.random() < 0.15;
    const phone = injectError && Math.random() < 0.4
      ? badPhones[Math.floor(Math.random() * badPhones.length)]
      : phonesByCountry[country][i % phonesByCountry[country].length];

    const date = injectError && Math.random() < 0.3
      ? badDates[Math.floor(Math.random() * badDates.length)]
      : `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;

    const payment = injectError && Math.random() < 0.3
      ? badPayments[Math.floor(Math.random() * badPayments.length)]
      : payments[i % payments.length];

    const name = names[i % names.length];
    const email = `${name.toLowerCase().replace(/\s/g, '.')}@example.com`;
    const txnId = `TXN-${String(i).padStart(6, '0')}`;
    const status = statuses[i % statuses.length];
    const payStatus = payStatuses[i % payStatuses.length];

    csv += `ORD-${String(i).padStart(5, '0')},${date},${String(10 + (i % 12)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00,${name},${email},${phone},${country},${product.id},${product.name},${qty},${product.price},${total},${discount},${tax},${country === 'US' ? 'USD' : country === 'IN' ? 'INR' : country === 'SG' ? 'SGD' : country === 'GB' ? 'GBP' : country === 'AU' ? 'AUD' : country === 'JP' ? 'JPY' : country === 'DE' ? 'EUR' : 'AED'},${payment},${payStatus},${txnId},${status},"123 Main St, ${country}"\n`;
  }

  return csv;
}

// ─── ERROR HANDLING ─────────────────────────────────────────────────

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ─── START ──────────────────────────────────────────────────────────

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║        XenoValidator is running!         ║`);
    console.log(`  ║                                          ║`);
    console.log(`  ║   Local:  http://localhost:${PORT}          ║`);
    console.log(`  ║                                          ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });
}

module.exports = app;
