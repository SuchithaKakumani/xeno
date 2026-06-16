# XenoValidator — Transaction Data Validation & Processing Platform

A premium, scalable web platform for validating, cleaning, and processing international transaction datasets with intelligent country-specific rules.

## Tech Stack Decision

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Node.js + Express | Fastest streaming CSV processing, non-blocking I/O for large files |
| **Frontend** | Vanilla HTML/CSS/JS | Zero build step, maximum performance, premium glassmorphism UI |
| **CSV Parsing** | `csv-parse` + `csv-stringify` | Streaming parser handles GBs without memory overflow |
| **Validation** | Custom rules engine | Configurable JSON-driven validation rules per country |
| **File Chunking** | Node.js streams | Efficient splitting with backpressure support |
| **Styling** | Vanilla CSS with CSS Variables | Dark mode, animations, glassmorphism — no framework overhead |

---

## Proposed Changes

### Backend — Express API Server

#### [NEW] [server.js](file:///c:/Users/palla/xeno/server.js)
Main Express server entry point. Configures multer for file uploads, CORS, static file serving, and API routes.

#### [NEW] [package.json](file:///c:/Users/palla/xeno/package.json)
Dependencies: `express`, `multer`, `csv-parse`, `csv-stringify`, `uuid`, `archiver` (for zip downloads of chunks).

---

### Validation Engine

#### [NEW] [src/validators/phoneValidator.js](file:///c:/Users/palla/xeno/src/validators/phoneValidator.js)
Country-specific phone validation driven by configurable rules:
- **Singapore (SG)**: 8 digits, starts with 6/8/9
- **India (IN)**: 10 digits, starts with 6-9
- **US (US)**: 10 digits
- **UK (GB)**: 10-11 digits
- **Australia (AU)**: 9 digits (without leading 0)
- **Malaysia (MY)**: 9-10 digits
- **Japan (JP)**: 10-11 digits
- **Germany (DE)**: 10-11 digits
- Easily extendable via `config/countryRules.json`

#### [NEW] [src/validators/dateValidator.js](file:///c:/Users/palla/xeno/src/validators/dateValidator.js)
Validates dates against multiple predefined formats:
- `YYYY-MM-DD`, `DD/MM/YYYY`, `MM/DD/YYYY`, `DD-MMM-YYYY`
- ISO 8601 datetime, Unix timestamps
- Configurable per-column format expectations

#### [NEW] [src/validators/dataIntegrityValidator.js](file:///c:/Users/palla/xeno/src/validators/dataIntegrityValidator.js)
General integrity checks:
- Required field presence
- Numeric fields (price, quantity, total) — non-negative, proper decimal
- Email format validation
- Currency code validation (ISO 4217)
- Order ID uniqueness
- Payment mode validation (Credit Card, Debit Card, UPI, Net Banking, COD, Wallet, etc.)
- SKU/Product code format
- Cross-field consistency (e.g., quantity × unit_price ≈ total)

#### [NEW] [src/validators/validationEngine.js](file:///c:/Users/palla/xeno/src/validators/validationEngine.js)
Orchestrates all validators. Processes each row, collects errors/warnings, produces a validation report with row-level and field-level detail.

---

### Configuration

#### [NEW] [config/countryRules.json](file:///c:/Users/palla/xeno/config/countryRules.json)
Configurable country-specific validation rules (phone patterns, date formats, currency defaults).

#### [NEW] [config/validationSchema.json](file:///c:/Users/palla/xeno/config/validationSchema.json)
Defines expected column names, types, required/optional status, and format patterns for order, product, and payment fields.

---

### File Processing

#### [NEW] [src/processors/csvProcessor.js](file:///c:/Users/palla/xeno/src/processors/csvProcessor.js)
Streaming CSV parser and writer. Handles:
- Auto-detection of delimiters (comma, semicolon, tab)
- UTF-8 BOM handling
- Header normalization

#### [NEW] [src/processors/fileChunker.js](file:///c:/Users/palla/xeno/src/processors/fileChunker.js)
Splits large CSVs into configurable chunks (default: 1000 rows each). Preserves headers in each chunk. Creates a ZIP archive of all chunks for single download.

#### [NEW] [src/processors/dataCleaner.js](file:///c:/Users/palla/xeno/src/processors/dataCleaner.js)
Cleans validated data:
- Trims whitespace
- Normalizes phone numbers (removes spaces, dashes, country code prefix)
- Standardizes date formats to ISO 8601
- Fixes case inconsistencies (payment modes, country codes)
- Removes duplicate rows

---

### Frontend — Premium Glassmorphism UI

#### [NEW] [public/index.html](file:///c:/Users/palla/xeno/public/index.html)
Single-page application with:
- Animated hero section with particle background
- Drag-and-drop file upload zone with progress indicator
- Real-time validation dashboard
- Results table with error highlighting
- Download section for cleaned files and chunks

#### [NEW] [public/css/styles.css](file:///c:/Users/palla/xeno/public/css/styles.css)
Premium dark-mode glassmorphism design:
- CSS custom properties for theming
- Glassmorphism cards with backdrop-filter
- Smooth gradient animations
- Micro-interactions on hover/focus
- Responsive grid layout
- Google Fonts (Inter)

#### [NEW] [public/js/app.js](file:///c:/Users/palla/xeno/public/js/app.js)
Frontend application logic:
- File upload with drag-and-drop and progress bar
- AJAX calls to validation API
- Real-time results rendering with animated counters
- Error/warning table with filtering and sorting
- Download management for cleaned files and chunks

#### [NEW] [public/js/particles.js](file:///c:/Users/palla/xeno/public/js/particles.js)
Lightweight canvas-based particle animation for hero background.

---

### Standout Features (Differentiators)

1. **Live Validation Dashboard** — Animated donut charts and counters showing pass/fail/warning ratios in real-time
2. **Smart Column Detection** — Auto-detects column types and maps them to validation rules
3. **Validation History** — Stores recent validation sessions with quick re-download (localStorage)
4. **Drag & Drop Zone** — Animated file drop with file type preview and size estimation
5. **Row-Level Error Inspector** — Click any error to see the exact row, field, expected format, and actual value
6. **Export Validation Report** — Download a PDF/JSON summary of all validation findings
7. **Configurable Rules Panel** — UI to add custom country rules without touching code
8. **Chunked Download with Progress** — Shows chunk generation progress and offers individual or ZIP download
9. **Sample Data Generator** — Built-in button to generate sample transaction CSV for testing

---

### Project Structure
```
xeno/
├── server.js                          # Express entry point
├── package.json                       # Dependencies
├── .gitignore                         # Node ignores
├── README.md                          # Project documentation
├── config/
│   ├── countryRules.json              # Phone/date rules per country
│   └── validationSchema.json          # Column definitions & types
├── src/
│   ├── validators/
│   │   ├── phoneValidator.js          # Country-specific phone validation
│   │   ├── dateValidator.js           # Multi-format date validation
│   │   ├── dataIntegrityValidator.js  # General field checks
│   │   └── validationEngine.js        # Orchestrator
│   └── processors/
│       ├── csvProcessor.js            # Streaming CSV parse/write
│       ├── fileChunker.js             # Large file splitting
│       └── dataCleaner.js             # Data normalization
├── public/
│   ├── index.html                     # Main SPA
│   ├── css/
│   │   └── styles.css                 # Glassmorphism dark UI
│   └── js/
│       ├── app.js                     # Frontend logic
│       └── particles.js              # Background animation
├── uploads/                           # Temp upload storage (gitignored)
└── output/                            # Processed files (gitignored)
```

---

## Verification Plan

### Manual Verification
1. Start the server with `npm start` and navigate to `http://localhost:3000`
2. Upload a sample CSV with various international phone numbers, dates, and payment modes
3. Verify validation dashboard shows correct pass/fail/warning counts
4. Download the cleaned file and verify corrections
5. Upload a large CSV (>5000 rows) and verify chunking produces correct ZIP download
6. Test drag-and-drop, error inspector, and validation history features
7. Verify responsive design on different viewport sizes
