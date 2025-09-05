require("dotenv").config();
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const QRCode = require("qrcode");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const archiver = require("archiver");

// In-memory store (database removed)
const store = {
  batches: new Map(), // batchId -> { id, createdAt, mergedDocumentId, docIds: [] }
  documentsByToken: new Map(), // token -> { documentId, viewedAt, batchId }
};

const app = express();
const PORT = process.env.PORT || 3087;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Foxit API configuration
const FOXIT_CONFIG = {
  client_id: process.env.FOXIT_CLIENT_ID,
  client_secret: process.env.FOXIT_CLIENT_SECRET,
  baseUrl: process.env.FOXIT_BASE_URL || "https://na1.fusion.foxit.com",
};

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || "*",
    credentials: true,
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Helper function to convert file to base64
const fileToBase64 = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString("base64");
};

// Helper function to write base64 to file
const base64ToFile = (base64String, filename) => {
  const buffer = Buffer.from(base64String, "base64");
  const filePath = path.join("uploads", filename);
  fs.writeFileSync(filePath, buffer);
  return filePath;
};

// Helper function to make Foxit API requests
const makeFoxitRequest = async (endpoint, data, headers = {}) => {
  const config = {
    method: "POST",
    url: `${FOXIT_CONFIG.baseUrl}${endpoint}`,
    headers: {
      client_id: FOXIT_CONFIG.client_id,
      client_secret: FOXIT_CONFIG.client_secret,
      "Content-Type": "application/json",
      ...headers,
    },
    data,
  };

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error("Foxit API Error:", error.response?.data || error.message);
    throw new Error(
      `Foxit API Error: ${error.response?.data?.message || error.message}`
    );
  }
};

// Helper function to upload file to Foxit
const uploadToFoxit = async (filePath) => {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));

  try {
    const response = await axios.post(
      `${FOXIT_CONFIG.baseUrl}/pdf-services/api/documents/upload`,
      formData,
      {
        headers: {
          client_id: FOXIT_CONFIG.client_id,
          client_secret: FOXIT_CONFIG.client_secret,
          ...formData.getHeaders(),
        },
      }
    );
    return response.data.documentId;
  } catch (error) {
    console.error("Upload Error:", error.response?.data || error.message);
    throw new Error(
      `Upload Error: ${error.response?.data?.message || error.message}`
    );
  }
};

// Helper function to check task status
const checkTaskStatus = async (taskId) => {
  try {
    const response = await axios.get(
      `${FOXIT_CONFIG.baseUrl}/pdf-services/api/tasks/${taskId}`,
      {
        headers: {
          client_id: FOXIT_CONFIG.client_id,
          client_secret: FOXIT_CONFIG.client_secret,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Task Status Error:", error.response?.data || error.message);
    throw new Error(
      `Task Status Error: ${error.response?.data?.message || error.message}`
    );
  }
};

// Helper function to wait for task completion
const waitForTaskCompletion = async (
  taskId,
  maxAttempts = 30,
  interval = 2000
) => {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkTaskStatus(taskId);
    if (status.status === "COMPLETED") {
      return status;
    } else if (status.status === "FAILED") {
      throw new Error("Task failed");
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Task timeout");
};

// Helper function to generate QR code
const generateQRCode = async (text) => {
  try {
    return await QRCode.toBuffer(text, {
      type: "png",
      width: 200,
      margin: 2,
    });
  } catch (error) {
    console.error("QR Code generation error:", error);
    throw error;
  }
};

// Helper function to attach QR code to PDF
const attachQRCodeToPDF = async (pdfBase64, qrText) => {
  try {
    // Generate QR code
    const qrBuffer = await generateQRCode(qrText);
    const qrFilePath = path.join("uploads", `qr_${Date.now()}.png`);
    fs.writeFileSync(qrFilePath, qrBuffer);

    // Upload QR code to Foxit
    const qrDocId = await uploadToFoxit(qrFilePath);

    // Create PDF from QR code image
    const createPdfResponse = await makeFoxitRequest(
      "/pdf-services/api/documents/create/pdf-from-image",
      {
        documentId: qrDocId,
      }
    );

    // Wait for QR PDF creation to complete
    const qrTaskStatus = await waitForTaskCompletion(createPdfResponse.taskId);
    const qrPdfDocId = qrTaskStatus.resultDocumentId;

    // Save original PDF to file for upload
    const originalPdfPath = base64ToFile(
      pdfBase64,
      `original_${Date.now()}.pdf`
    );
    const originalDocId = await uploadToFoxit(originalPdfPath);

    // Combine original PDF with QR code PDF
    const combineResponse = await makeFoxitRequest(
      "/pdf-services/api/documents/enhance/pdf-combine",
      {
        documentInfos: [
          { documentId: originalDocId },
          { documentId: qrPdfDocId },
        ],
        config: {
          addBookmark: false,
          continueMergeOnError: true,
          retainPageNumbers: false,
          addToc: false,
        },
      }
    );

    // Wait for combination to complete
    const combineTaskStatus = await waitForTaskCompletion(
      combineResponse.taskId
    );

    // Clean up temporary files
    fs.unlinkSync(qrFilePath);
    fs.unlinkSync(originalPdfPath);

    return combineTaskStatus.resultDocumentId;
  } catch (error) {
    console.error("QR Code attachment error:", error);
    throw error;
  }
};

// Auth and database removed

// Route 1: Analyze DOCX template and generate CSV
app.post("/analyze-template", upload.single("template"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No template file uploaded" });
    }

    // Convert DOCX to base64
    const base64String = fileToBase64(req.file.path);

    // Call Foxit AnalyzeDocumentBase64 API
    const analysisResult = await makeFoxitRequest(
      "/document-generation/api/AnalyzeDocumentBase64",
      {
        base64FileString: base64String,
      }
    );

    // Parse comma-separated variables
    const variables = analysisResult.singleTagsString
      .split(",")
      .map((v) => v.trim());

    // Create CSV file with headers
    const csvFilePath = path.join(
      "uploads",
      `template_variables_${Date.now()}.csv`
    );
    const csvWriter = createCsvWriter({
      path: csvFilePath,
      header: variables.map((variable) => ({
        id: variable,
        title: variable,
      })),
    });

    // Write empty CSV with headers
    await csvWriter.writeRecords([]);

    // Read the generated CSV file
    const csvContent = fs.readFileSync(csvFilePath, "utf8");

    // Clean up uploaded template file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      variables: variables,
      csvContent: csvContent,
      message:
        "Template analyzed successfully. Use the CSV structure to populate your data.",
    });
  } catch (error) {
    console.error("Template analysis error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Route 2: Generate PDFs from populated CSV and template
app.post(
  "/generate-documents",
  upload.fields([
    { name: "template", maxCount: 1 },
    { name: "csvFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!req.files.template || !req.files.csvFile) {
        return res
          .status(400)
          .json({ error: "Both template and CSV files are required" });
      }

      const templateFile = req.files.template[0];
      const csvFile = req.files.csvFile[0];

      // Convert template to base64
      const templateBase64 = fileToBase64(templateFile.path);

      // Parse CSV file
      const csvData = [];
      const csvStream = fs
        .createReadStream(csvFile.path)
        .pipe(csv())
        .on("data", (row) => csvData.push(row))
        .on("end", async () => {
          try {
            const documentIds = [];
            // Create a batch in memory
            const batch = {
              id: uuidv4(),
              created_at: new Date().toISOString(),
              merged_document_id: null,
              docIds: [],
            };
            store.batches.set(batch.id, batch);

            // Process each row in CSV
            for (let i = 0; i < csvData.length; i++) {
              const row = csvData[i];
              console.log(`Processing row ${i + 1}/${csvData.length}`);

              // Generate PDF for this row
              const generateResponse = await makeFoxitRequest(
                "/document-generation/api/GenerateDocumentBase64",
                {
                  outputFormat: "pdf",
                  currencyCulture: "en-US",
                  documentValues: row,
                  base64FileString: templateBase64,
                }
              );

              const pdfBase64 = generateResponse.base64FileString;

              // Create a unique token and QR code URL for viewing
              const qrToken = uuidv4();
              const qrText = `${BASE_URL}/view/${qrToken}`;

              // Attach QR code to PDF
              const finalDocumentId = await attachQRCodeToPDF(
                pdfBase64,
                qrText
              );
              // Store each document record in memory
              store.documentsByToken.set(qrToken, {
                documentId: finalDocumentId,
                viewedAt: null,
                batchId: batch.id,
              });
              batch.docIds.push(finalDocumentId);
              documentIds.push(finalDocumentId);
              console.log(
                `Generated document ${i + 1} with ID: ${finalDocumentId}`
              );
            }

            // Merge all PDFs into one
            console.log("Merging all documents...");
            const mergeResponse = await makeFoxitRequest(
              "/pdf-services/api/documents/enhance/pdf-combine",
              {
                documentInfos: documentIds.map((id) => ({ documentId: id })),
                config: {
                  addBookmark: true,
                  continueMergeOnError: true,
                  retainPageNumbers: true,
                  addToc: true,
                  tocTitle: "Generated Documents",
                },
              }
            );

            // Wait for merge to complete
            const mergeTaskStatus = await waitForTaskCompletion(
              mergeResponse.taskId
            );
            const mergedDocumentId = mergeTaskStatus.resultDocumentId;
            // Save merged doc to batch (memory)
            batch.merged_document_id = mergedDocumentId;

            // Clean up uploaded files
            fs.unlinkSync(templateFile.path);
            fs.unlinkSync(csvFile.path);

            res.json({
              success: true,
              message: "Documents generated successfully",
              batchId: batch.id,
              individualDocuments: documentIds,
              mergedDocumentId: mergedDocumentId,
              totalDocuments: csvData.length,
              downloadUrl: `${FOXIT_CONFIG.baseUrl}/pdf-services/api/documents/${mergedDocumentId}/download`,
              zipUrl: `${BASE_URL}/batches/${batch.id}/zip`,
            });
          } catch (error) {
            console.error("Document generation error:", error);
            res.status(500).json({ error: error.message });
          }
        });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Route to download a specific document
app.get("/download/:documentId", async (req, res) => {
  try {
    const { documentId } = req.params;
    const filename = req.query.filename || "document";

    const response = await axios.get(
      `${FOXIT_CONFIG.baseUrl}/pdf-services/api/documents/${documentId}/download?filename=${filename}`,
      {
        headers: {
          client_id: FOXIT_CONFIG.client_id,
          client_secret: FOXIT_CONFIG.client_secret,
        },
        responseType: "stream",
      }
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}.pdf"`
    );
    response.data.pipe(res);
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Zip download for a batch
app.get("/batches/:batchId/zip", async (req, res) => {
  try {
    const { batchId } = req.params;
    // Ensure batch exists (in memory)
    const batch = store.batches.get(batchId);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    const docIds = batch.docIds || [];
    if (docIds.length === 0)
      return res.status(400).json({ error: "No documents in batch" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="batch_${batchId}.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      throw err;
    });
    archive.pipe(res);

    // Stream each PDF into the zip
    for (let i = 0; i < docIds.length; i++) {
      const id = docIds[i];
      const filename = `document_${i + 1}.pdf`;
      const response = await axios.get(
        `${
          FOXIT_CONFIG.baseUrl
        }/pdf-services/api/documents/${id}/download?filename=${encodeURIComponent(
          filename
        )}`,
        {
          headers: {
            client_id: FOXIT_CONFIG.client_id,
            client_secret: FOXIT_CONFIG.client_secret,
          },
          responseType: "stream",
        }
      );
      archive.append(response.data, { name: filename });
    }

    await archive.finalize();
  } catch (error) {
    console.error("Zip batch error:", error);
    if (!res.headersSent)
      res.status(500).json({ error: "Failed to create zip" });
  }
});

// View document by QR token - HTML page
app.get("/view/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const doc = store.documentsByToken.get(token);
    if (!doc) return res.status(404).send("Not found");
    // Mark as viewed if first time (memory)
    if (!doc.viewedAt) {
      doc.viewedAt = new Date().toISOString();
      store.documentsByToken.set(token, doc);
    }
    // Serve a simple HTML that embeds the PDF
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invitation</title>
        <style>html,body{height:100%;margin:0}iframe{border:0;width:100%;height:100%}</style></head>
        <body>
          <iframe src="${BASE_URL}/view/${token}/file" title="Invitation PDF"></iframe>
        </body></html>`;
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (e) {
    console.error("View token error:", e);
    res.status(500).send("Error");
  }
});

// Stream the actual PDF for a token
app.get("/view/:token/file", async (req, res) => {
  try {
    const { token } = req.params;
    const record = store.documentsByToken.get(token);
    if (!record) return res.status(404).send("Not found");
    const foxit_document_id = record.documentId;
    const response = await axios.get(
      `${FOXIT_CONFIG.baseUrl}/pdf-services/api/documents/${foxit_document_id}/download?filename=invitation`,
      {
        headers: {
          client_id: FOXIT_CONFIG.client_id,
          client_secret: FOXIT_CONFIG.client_secret,
        },
        responseType: "stream",
      }
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="invitation.pdf"');
    response.data.pipe(res);
  } catch (e) {
    console.error("Stream token file error:", e);
    res.status(500).send("Error");
  }
});

// Health check route
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "InviteFlow – Event Invitation Automation API is running",
    base_url: BASE_URL,
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// Start server (no database)
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
