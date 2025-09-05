#!/bin/bash

# Test script for InviteFlow – Event Invitation Automation API

echo "Starting InviteFlow – Event Invitation Automation API..."
echo "========================================"

# Start the server in background
node server.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Health check
echo "Checking server health..."
curl -s http://localhost:3008/health | jq '.' || echo "Health check failed"

# Show URLs
echo "Server is running on http://localhost:3008"
echo "Web interface available at: http://localhost:3008"
echo "Server PID: $SERVER_PID"
echo ""
echo "To stop the server, run: kill $SERVER_PID"
echo ""
echo "API Endpoints:"
echo "- POST /analyze-template (upload DOCX template)"
echo "- POST /generate-documents (upload template + CSV)"
echo "- GET /download/:documentId (download generated PDF)"
echo ""
echo "Press Ctrl+C to stop this script (server will continue running)"

# Keep script running
wait
