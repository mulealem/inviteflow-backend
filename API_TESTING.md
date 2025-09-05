# API Testing Examples (No Auth / No DB)

All endpoints are public; no database is used (state is in-memory). Ensure the server is running:

```bash
npm start
# or
./start.sh
```

## 1) Analyze Template

```bash
curl -X POST http://localhost:3008/analyze-template \
  -F "template=@examples/sample-template.docx"
```

## 2) Generate Documents

```bash
curl -X POST http://localhost:3008/generate-documents \
  -F "template=@examples/sample-template.docx" \
  -F "csvFile=@examples/sample-data.csv"
```

The response includes:

- batchId
- individualDocuments[]
- mergedDocumentId
- zipUrl to download all PDFs

## 3) Download All PDFs as ZIP

```bash
curl -L -o batch.zip "http://localhost:3008/batches/<batchId>/zip"
```

## 4) View a PDF via QR Link

Open the QR URL returned in the generation step in your browser, or:

```bash
curl -L -o invite.pdf "http://localhost:3008/view/<token>/file"
```

## Sample CSV Format

Use the CSV structure returned from the analyze-template endpoint:

```csv
eventTitle,guestName,eventDate,venue,company,email,phone,qrCode
Tech Summit 2025,Laura Thompson,2025-09-20,Convention Center,TechTrend,laura.t@techtrend.com,555-1234,QR456789
AI Conference,John Doe,2025-10-15,Tech Hub,InnovateCorp,john@innovate.com,555-5678,QR789123
```

## Web Interface

Open your browser and go to: http://localhost:3008

Use the forms to analyze a template, generate documents, and fetch the ZIP—all without authentication.
