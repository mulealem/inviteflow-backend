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

Open http://localhost:3087.

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

- `PORT` - Server port (default: 3087)
- `BASE_URL` - Public base URL for QR links (default: http://localhost:3087)
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

## Foxit API Integration

This service integrates with Foxit PDF Services and Document Generation APIs to analyze DOCX templates, generate PDFs from data, and post-process PDFs (adding QR pages and merging). Authentication is provided via `client_id` and `client_secret` HTTP headers; no OAuth flow is required.

Key Foxit endpoints used:

- Analyze template variables

  - Method: POST
  - Path: `/document-generation/api/AnalyzeDocumentBase64`
  - Input: `{ base64FileString }` from the uploaded DOCX
  - Output: `singleTagsString` (comma-separated placeholders found in the template)

- Generate a PDF from template + data

  - Method: POST
  - Path: `/document-generation/api/GenerateDocumentBase64`
  - Input: `{ outputFormat: "pdf", currencyCulture: "en-US", documentValues, base64FileString }`
  - Output: `{ base64FileString }` of the generated PDF

- Upload a file to Foxit (used for QR image and original PDF)

  - Method: POST
  - Path: `/pdf-services/api/documents/upload`
  - Input: multipart/form-data with `file`
  - Output: `{ documentId }`

- Create a PDF from an image (to turn QR PNG into a PDF page)

  - Method: POST
  - Path: `/pdf-services/api/documents/create/pdf-from-image`
  - Input: `{ documentId }` (from the uploaded QR image)
  - Output: `{ taskId }` to be polled

- Combine PDFs (used twice: original PDF + QR page, then final merged batch)

  - Method: POST
  - Path: `/pdf-services/api/documents/enhance/pdf-combine`
  - Input: `{ documentInfos: [{ documentId }...], config }`
  - Output: `{ taskId }` to be polled

- Task status polling

  - Method: GET
  - Path: `/pdf-services/api/tasks/{taskId}`
  - Output on success: `{ status: "COMPLETED", resultDocumentId }`

- Download final PDFs
  - Method: GET
  - Path: `/pdf-services/api/documents/{documentId}/download?filename=...`
  - Response: PDF stream

Headers for all Foxit API calls include:

```
client_id: ${FOXIT_CLIENT_ID}
client_secret: ${FOXIT_CLIENT_SECRET}
```

Flow overview:

1. Analyze template

   - DOCX is read and converted to base64
   - Foxit AnalyzeDocumentBase64 returns the list of tags, which we map to a CSV header

2. Generate per-row PDF + add QR

   - For each CSV row, GenerateDocumentBase64 returns a base64 PDF
   - A QR code is generated locally (PNG) that points to `BASE_URL/view/:token`
   - The QR PNG is uploaded to Foxit, converted into a single-page PDF
   - The original PDF and QR PDF are combined into a single document via `pdf-combine`
   - The resulting `resultDocumentId` is stored in-memory and associated with the view token

3. Merge all PDFs

   - All per-row document IDs are combined via `pdf-combine` with bookmarks/TOC enabled
   - We poll the task until `COMPLETED` and return the merged `resultDocumentId`

4. Downloads and ZIP
   - Single downloads proxy the Foxit download API
   - Batch ZIP is streamed by downloading each PDF from Foxit and archiving on-the-fly

Timeouts and limits:

- Upload size limit: 50 MB per file (configurable in multer)
- Task polling: up to ~60 seconds (30 attempts x 2s); adjust in `waitForTaskCompletion()` if needed
- Merge config sets `continueMergeOnError: true` to avoid failing the entire batch when one input is problematic

Security & deployment notes:

- Set `FOXIT_CLIENT_ID`/`FOXIT_CLIENT_SECRET` via environment variables (do not commit them)
- `BASE_URL` should be the public URL of your backend in production so QR links in PDFs work for recipients
- `CORS_ORIGIN` should include your Netlify site URL for the frontend to call this API from the browser
