# InviteFlow – Event Invitation Automation API

Express app to generate many PDFs from a DOCX template and a CSV, with QR codes on each PDF. No authentication or database; all endpoints are public and state is kept in-memory.

## Features

- Analyze DOCX templates to extract variables and return CSV structure
- Generate individual PDFs for each CSV row
- Add QR codes to each generated PDF (QR opens a view URL for that PDF)
- Merge all PDFs into a single document
- Download merged PDF or all PDFs as a ZIP
- In-memory tracking of batches and documents (non-persistent)

## Setup

1. Copy env and configure

```
cp .env.example .env
```

Fill in FOXIT credentials.

2. Install dependencies:

```
npm install
```

3. Start the server:

```
npm start
```

Open http://localhost:3008.

## API Endpoints

All endpoints are public. No Authorization header is required.

Authentication and related endpoints were removed; none are available.

### 1. Analyze Template

**POST** `/analyze-template`

Analyzes a DOCX template and returns the variables found, along with a CSV template.

**Request:**

- Content-Type: `multipart/form-data`
- Body: `template` (file) - DOCX template file

**Response:**

```json
{
  "success": true,
  "variables": [
    "eventTitle",
    "guestName",
    "eventDate",
    "venue",
    "company",
    "email",
    "phone",
    "qrCode"
  ],
  "csvContent": "eventTitle,guestName,eventDate,venue,company,email,phone,qrCode\n",
  "message": "Template analyzed successfully. Use the CSV structure to populate your data."
}
```

### 2. Generate Documents

**POST** `/generate-documents`

Generates PDF documents from a DOCX template and populated CSV data.

**Request:**

- Content-Type: `multipart/form-data`
- Body:
  - `template` (file) - DOCX template file
  - `csvFile` (file) - CSV file with populated data

**Response:**

```json
{
  "success": true,
  "message": "Documents generated successfully",
  "individualDocuments": ["docId1", "docId2", "docId3"],
  "mergedDocumentId": "mergedDocId",
  "totalDocuments": 3,
  "downloadUrl": "https://na1.fusion.foxit.com/pdf-services/api/documents/mergedDocId/download"
}
```

### 3. Download Document

**GET** `/download/:documentId?filename=document`

Downloads a generated PDF document.

**Parameters:**

- `documentId` - The Foxit document ID
- `filename` (optional) - The filename for the download

## Usage Example

1. Analyze, then prepare CSV, then Generate as above.

2. Response includes zipUrl for all PDFs and mergedDocumentId for single merged PDF.

## Features Explained

### QR Code Integration

- Each generated PDF gets a QR code attached
- QR codes contain URLs that can be customized
- QR codes are added as separate pages to each PDF

### Document Merging

- All individual PDFs are merged into one large PDF
- Table of contents is automatically generated
- Bookmarks are added for easy navigation

### Error Handling

- Comprehensive error handling for all API calls
- File cleanup after processing
- Detailed error messages

## Environment Variables

- `PORT` - Server port (default: 3008)
- `BASE_URL` - Public base URL for QR links (default: http://localhost:3008)
- `FOXIT_CLIENT_ID`, `FOXIT_CLIENT_SECRET`, `FOXIT_BASE_URL`
- `CORS_ORIGIN` - Allowed origins (comma separated or `*`)

## Dependencies

- express, multer, axios, csv-parser, csv-writer, qrcode, form-data, cors
- dotenv, archiver, uuid

## File Structure

```
foxit-api-document-generator/
├── server.js          # Main application file
├── package.json       # Dependencies and scripts
├── README.md          # This file
└── uploads/           # Temporary file storage (auto-created)
```

## Notes

- Files are temporarily stored in the `uploads/` directory and cleaned up after processing
- QR code URLs use BASE_URL and unique tokens, and a simple viewer is built-in
- File size limit is set to 50MB for uploads
