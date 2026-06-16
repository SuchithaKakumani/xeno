# XenoValidator — Transaction Data Validation & Processing Platform

A scalable, enterprise-grade web platform for validating, cleaning, and processing international transaction datasets with intelligent country-specific rules.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Smart Column Detection** — Automatically maps CSV headers to validation rules via alias matching
- **Phone Validation** — Country-specific rules for 10+ countries (SG, IN, US, GB, AU, JP, DE, MY, AE, CA)
- **Date & Time Validation** — Supports ISO 8601, DD/MM/YYYY, MM/DD/YYYY, Unix timestamps, 12/24h time
- **Data Integrity Checks** — Required fields, numeric ranges, email format, currency codes, payment modes
- **Cross-field Validation** — Verifies quantity × price ≈ total with discount/tax adjustments
- **Cleaned Output** — Download a fully normalized CSV with standardized dates, phones, and deduplication
- **Auto File Chunking** — Large CSVs are split into configurable chunks with ZIP download
- **Validation Report** — JSON report with detailed error/warning summaries
- **Sample Data Generator** — Built-in sample CSV with realistic international transaction data
- **Professional UI** — Dark glassmorphism design with animated donut charts, counters, and drag-and-drop

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | Vanilla HTML/CSS/JS |
| CSV Processing | csv-parse + csv-stringify (streaming) |
| File Archiving | archiver (ZIP) |
| File Upload | multer |

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload (Node 18+)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
xeno/
├── server.js                          # Express entry point
├── package.json                       # Dependencies
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
│       ├── fileChunker.js             # Large file splitting + ZIP
│       └── dataCleaner.js             # Data normalization
└── public/
    ├── index.html                     # Main SPA
    ├── css/styles.css                 # Dark glassmorphism UI
    └── js/
        ├── app.js                     # Frontend logic
        └── particles.js              # Background animation
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/validate` | Upload and validate a CSV file |
| `GET` | `/api/download/:sessionId/:filename` | Download processed files |
| `GET` | `/api/countries` | List supported countries and phone rules |
| `GET` | `/api/sample?rows=50` | Download a sample CSV for testing |

## Supported Countries

| Country | Code | Phone Digits | Example |
|---------|------|-------------|---------|
| Singapore | SG | 8 | 91234567 |
| India | IN | 10 | 9876543210 |
| United States | US | 10 | 2025551234 |
| United Kingdom | GB | 10-11 | 7911123456 |
| Australia | AU | 9 | 412345678 |
| Japan | JP | 10-11 | 9012345678 |
| Germany | DE | 10-11 | 15123456789 |
| Malaysia | MY | 9-10 | 123456789 |
| UAE | AE | 9 | 501234567 |
| Canada | CA | 10 | 6135551234 |

## Adding a New Country

Simply add an entry to `config/countryRules.json`:

```json
{
  "BR": {
    "name": "Brazil",
    "phone": {
      "digits": [10, 11],
      "startsWithAny": ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      "pattern": "^[1-9]\\d{8,9}$",
      "example": "11987654321"
    },
    "countryCode": "+55",
    "currency": "BRL",
    "dateFormats": ["DD/MM/YYYY", "YYYY-MM-DD"]
  }
}
```

## Expected CSV Format

The validator auto-detects columns by matching headers to known aliases. A typical CSV includes:

```csv
order_id,order_date,customer_name,customer_phone,country_code,product_id,product_name,quantity,unit_price,total_amount,payment_mode,payment_status
ORD-001,2024-03-15,Rahul Sharma,9876543210,IN,SKU-001,Wireless Mouse,2,29.99,59.98,UPI,Paid
```

## License

MIT
