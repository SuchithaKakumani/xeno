const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');

const logger = require('./src/utils/logger');
const requestLogger = require('./src/middleware/requestLogger');
const { requireAuth, optionalAuth, JWT_SECRET } = require('./src/middleware/auth');
const db = require('./src/utils/db');
const jobRunner = require('./src/utils/jobRunner');
const { getSupportedCountries } = require('./src/validators/phoneValidator');
const swaggerDocument = require('./config/swagger.json');

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
app.use(cookieParser());
app.use(requestLogger);
app.use(express.static(path.join(__dirname, 'public')));

// Swagger Documentation API
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Multer config
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${require('uuid').v4()}${ext}`);
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

// ─── AUTHENTICATION ROUTES ──────────────────────────────────────────

/**
 * POST /api/auth/register
 */
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const newUser = await db.createUser(name, email, password);
    logger.info(`User registered successfully: ${email}`);
    res.status(201).json(newUser);
  } catch (err) {
    logger.warn(`Registration failed for ${email}: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/auth/login
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await db.authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    
    // Set HTTP-Only Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'strict',
    });

    logger.info(`User logged in: ${email}`);
    res.json({ user });
  } catch (err) {
    logger.error(`Login error for ${email}: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 */
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  logger.info('User logged out');
  res.json({ message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 */
app.get('/api/auth/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.user });
});

// ─── VALIDATION ROUTES ──────────────────────────────────────────────

/**
 * POST /api/validate
 * Upload a CSV and trigger validation job in background.
 */
app.post('/api/validate', optionalAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user ? req.user.id : null;
    const job = jobRunner.createJob(userId, req.file.originalname);
    
    logger.info(`Starting validation job ${job.id} for file: ${req.file.originalname} (User: ${userId || 'Anonymous'})`);

    // Run processing asynchronously
    jobRunner.startJob(job.id, req.file.path, OUTPUT_DIR, {
      chunkSize: req.body?.chunkSize,
    });

    // Accept request and return jobId for polling
    res.status(202).json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
    });
  } catch (err) {
    logger.error('Upload error in /api/validate:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * GET /api/validate/progress/:jobId
 * Server-Sent Events stream for tracking file processing progress.
 */
app.get('/api/validate/progress/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobRunner.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Add client to job push registry
  jobRunner.addClient(jobId, res);

  // Remove connection on close
  req.on('close', () => {
    logger.debug(`Client disconnected from job stream: ${jobId}`);
    if (job.clients) {
      job.clients = job.clients.filter(c => c !== res);
    }
  });
});

/**
 * GET /api/validate/history
 * Get history of previous validation runs (Requires auth).
 */
app.get('/api/validate/history', requireAuth, (req, res) => {
  try {
    const history = db.getHistory(req.user.id);
    res.json(history);
  } catch (err) {
    logger.error(`Error fetching history for ${req.user.email}:`, err);
    res.status(500).json({ error: 'Could not fetch history' });
  }
});

/**
 * DELETE /api/validate/history/:jobId
 * Delete a past validation run and its processed files (Requires auth).
 */
app.delete('/api/validate/history/:jobId', requireAuth, (req, res) => {
  const { jobId } = req.params;
  
  try {
    const deletedItem = db.deleteHistory(jobId, req.user.id);
    if (!deletedItem) {
      return res.status(404).json({ error: 'Job history item not found' });
    }

    // Clean up associated file directory
    const sessionDir = path.join(OUTPUT_DIR, deletedItem.sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      logger.info(`Deleted physical files for session: ${deletedItem.sessionId}`);
    }

    logger.info(`History record deleted: ${jobId} (User: ${req.user.email})`);
    res.json({ message: 'History record and files deleted successfully' });
  } catch (err) {
    logger.error(`Error deleting history for ${req.user.email}:`, err);
    res.status(500).json({ error: 'Could not delete history item' });
  }
});

// ─── STATIC PAGE ROUTES ─────────────────────────────────────────

/**
 * GET /login
 * Serves the dedicated login / registration page.
 */
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ─── GENERAL API ROUTES ─────────────────────────────────────────────

/**
 * GET /api/download/:sessionId/:filename
 * Download a processed file.
 */
app.get('/api/download/:sessionId/:filename', (req, res) => {
  const { sessionId, filename } = req.params;
  
  // Security check to prevent directory traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid file name' });
  }

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
    logger.error(`Multer or custom error: ${err.message}`);
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ─── START ──────────────────────────────────────────────────────────

if (!isVercel) {
  app.listen(PORT, () => {
    logger.info(`\n  ╔══════════════════════════════════════════╗`);
    logger.info(`  ║        XenoValidator is running!         ║`);
    logger.info(`  ║                                          ║`);
    logger.info(`  ║   Local:  http://localhost:${PORT}          ║`);
    logger.info(`  ║   Docs:   http://localhost:${PORT}/api-docs     ║`);
    logger.info(`  ║                                          ║`);
    logger.info(`  ╚══════════════════════════════════════════╝\n`);
  });
}

module.exports = app;
