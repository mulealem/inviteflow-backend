# API curl documentation

Base URL: http://localhost:3008

All endpoints are public; no authentication required.

## Health

```bash
curl -X GET http://localhost:3008/health
```

## Auth

Authentication endpoints were removed.

## Analyze Template

```bash
curl -X POST http://localhost:3008/analyze-template \
  -F "template=@/absolute/path/to/template.docx"
```

## Generate Documents

```bash
curl -X POST http://localhost:3008/generate-documents \
  -F "template=@/absolute/path/to/template.docx" \
  -F "csvFile=@/absolute/path/to/populated-data.csv"
```

## Download a Document (public)

```bash
# Replace DOCUMENT_ID and optionally filename
curl -L "http://localhost:3008/download/DOCUMENT_ID?filename=my-documents" \
  -H "Accept: application/pdf" \
  -o downloaded-document.pdf
```

## Download ZIP of a Batch

```bash
# Replace BATCH_ID (returned from /generate-documents)
curl -L "http://localhost:3008/batches/BATCH_ID/zip" -o batch.zip
```

## View by QR token (public HTML)

```bash
# Replace TOKEN_IN_QR (uuid generated per invitation)
curl -X GET "http://localhost:3008/view/TOKEN_IN_QR"
```

## Download/View raw PDF by QR token (public)

```bash
curl -L "http://localhost:3008/view/TOKEN_IN_QR/file" \
  -H "Accept: application/pdf" \
  -o invitation.pdf
```

## Notes

- `/generate-documents` returns `mergedDocumentId`, `batchId`, and a `zipUrl` you can call directly.
