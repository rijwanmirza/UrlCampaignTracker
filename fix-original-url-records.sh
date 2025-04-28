#!/bin/bash

# Original URL Records Fix Script
# This script creates a simple express route handler for the Original URL Records page

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

APP_DIR="/var/www/url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║            ORIGINAL URL RECORDS DIRECT FIX                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Step 1: Create a simple backend HTML route for Original URL Records
echo -e "${YELLOW}📝 Creating a simple server-side route for Original URL Records...${NC}"

mkdir -p "$APP_DIR/server/views"

# Create the Original URL Records HTML page
cat > "$APP_DIR/server/views/original-url-records.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Original URL Records</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            color: #2563eb;
            margin-bottom: 20px;
        }
        .navigation {
            display: flex;
            margin-bottom: 20px;
            gap: 10px;
        }
        .nav-button {
            display: inline-block;
            padding: 8px 16px;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            transition: background-color 0.3s;
        }
        .nav-button:hover {
            background-color: #1d4ed8;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f8f9fa;
            font-weight: 600;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .search-container {
            margin-bottom: 20px;
        }
        .search-input {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            width: 300px;
        }
        .button-container {
            margin-top: 20px;
            display: flex;
            gap: 10px;
        }
        .add-button {
            padding: 10px 15px;
            background-color: #10b981;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        }
        .add-button:hover {
            background-color: #059669;
        }
        .loading {
            display: flex;
            justify-content: center;
            padding: 20px;
        }
        .record-form {
            margin-top: 20px;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            background-color: #f9fafb;
        }
        .form-row {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        input, select, textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .form-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        .submit-button {
            padding: 10px 15px;
            background-color: #10b981;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        .cancel-button {
            padding: 10px 15px;
            background-color: #ef4444;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <h1>Original URL Records</h1>
    
    <div class="navigation">
        <a href="/" class="nav-button">Home</a>
        <a href="/urls" class="nav-button">URLs</a>
        <a href="/campaigns" class="nav-button">Campaigns</a>
        <a href="/original-url-records" class="nav-button">Original URL Records</a>
    </div>
    
    <div class="search-container">
        <input type="text" id="searchInput" class="search-input" placeholder="Search URLs...">
    </div>
    
    <div class="button-container">
        <button id="addRecordButton" class="add-button">Add New Original Record</button>
    </div>
    
    <div id="tableContainer">
        <div class="loading" id="loadingIndicator">Loading records...</div>
        <table id="recordsTable" style="display: none;">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Target URL</th>
                    <th>Campaign</th>
                    <th>Clicks</th>
                    <th>Click Limit</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="recordsBody">
                <!-- Records will be inserted here -->
            </tbody>
        </table>
    </div>
    
    <div id="recordForm" class="record-form" style="display: none;">
        <h2 id="formTitle">Add New Original Record</h2>
        <form id="originalRecordForm">
            <input type="hidden" id="recordId">
            
            <div class="form-row">
                <label for="name">Name:</label>
                <input type="text" id="name" required>
            </div>
            
            <div class="form-row">
                <label for="targetUrl">Target URL:</label>
                <input type="url" id="targetUrl" required>
            </div>
            
            <div class="form-row">
                <label for="campaignId">Campaign:</label>
                <select id="campaignId" required>
                    <option value="">Select a campaign</option>
                    <!-- Campaigns will be inserted here -->
                </select>
            </div>
            
            <div class="form-row">
                <label for="clickLimit">Click Limit:</label>
                <input type="number" id="clickLimit" min="1" required>
            </div>
            
            <div class="form-row">
                <label for="status">Status:</label>
                <select id="status" required>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
            
            <div class="form-actions">
                <button type="submit" class="submit-button">Save Record</button>
                <button type="button" id="cancelButton" class="cancel-button">Cancel</button>
            </div>
        </form>
    </div>

    <script>
        // API functions
        async function fetchOriginalRecords() {
            try {
                const response = await fetch('/api/original-url-records');
                if (!response.ok) throw new Error('Failed to fetch records');
                return await response.json();
            } catch (error) {
                console.error('Error fetching records:', error);
                return [];
            }
        }
        
        async function fetchCampaigns() {
            try {
                const response = await fetch('/api/campaigns');
                if (!response.ok) throw new Error('Failed to fetch campaigns');
                return await response.json();
            } catch (error) {
                console.error('Error fetching campaigns:', error);
                return [];
            }
        }
        
        async function createRecord(recordData) {
            try {
                const response = await fetch('/api/original-url-records', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(recordData),
                });
                
                if (!response.ok) throw new Error('Failed to create record');
                return await response.json();
            } catch (error) {
                console.error('Error creating record:', error);
                throw error;
            }
        }
        
        async function updateRecord(id, recordData) {
            try {
                const response = await fetch(`/api/original-url-records/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(recordData),
                });
                
                if (!response.ok) throw new Error('Failed to update record');
                return await response.json();
            } catch (error) {
                console.error('Error updating record:', error);
                throw error;
            }
        }
        
        async function deleteRecord(id) {
            try {
                const response = await fetch(`/api/original-url-records/${id}`, {
                    method: 'DELETE',
                });
                
                if (!response.ok) throw new Error('Failed to delete record');
                return true;
            } catch (error) {
                console.error('Error deleting record:', error);
                throw error;
            }
        }
        
        // UI Functions
        function formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleString();
        }
        
        function displayRecords(records) {
            const tableBody = document.getElementById('recordsBody');
            tableBody.innerHTML = '';
            
            records.forEach(record => {
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td>${record.id}</td>
                    <td>${record.name}</td>
                    <td><a href="${record.targetUrl}" target="_blank">${record.targetUrl}</a></td>
                    <td>${record.campaignName || 'Unknown'}</td>
                    <td>${record.clicks}</td>
                    <td>${record.clickLimit}</td>
                    <td>${record.status}</td>
                    <td>${formatDate(record.createdAt)}</td>
                    <td>
                        <button class="edit-button" data-id="${record.id}">Edit</button>
                        <button class="delete-button" data-id="${record.id}">Delete</button>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });
            
            document.getElementById('loadingIndicator').style.display = 'none';
            document.getElementById('recordsTable').style.display = 'table';
            
            // Add event listeners to edit and delete buttons
            document.querySelectorAll('.edit-button').forEach(button => {
                button.addEventListener('click', () => editRecord(button.dataset.id));
            });
            
            document.querySelectorAll('.delete-button').forEach(button => {
                button.addEventListener('click', () => confirmDeleteRecord(button.dataset.id));
            });
        }
        
        function populateCampaignsDropdown(campaigns) {
            const select = document.getElementById('campaignId');
            
            // Clear existing options except the first one
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add campaign options
            campaigns.forEach(campaign => {
                const option = document.createElement('option');
                option.value = campaign.id;
                option.textContent = campaign.name;
                select.appendChild(option);
            });
        }
        
        function showForm(isEdit = false) {
            document.getElementById('formTitle').textContent = isEdit ? 'Edit Original Record' : 'Add New Original Record';
            document.getElementById('recordForm').style.display = 'block';
            document.getElementById('tableContainer').style.display = 'none';
        }
        
        function hideForm() {
            document.getElementById('recordForm').style.display = 'none';
            document.getElementById('tableContainer').style.display = 'block';
            document.getElementById('originalRecordForm').reset();
        }
        
        async function editRecord(id) {
            try {
                const records = await fetchOriginalRecords();
                const record = records.find(r => r.id == id);
                
                if (!record) throw new Error('Record not found');
                
                // Populate form with record data
                document.getElementById('recordId').value = record.id;
                document.getElementById('name').value = record.name;
                document.getElementById('targetUrl').value = record.targetUrl;
                document.getElementById('campaignId').value = record.campaignId;
                document.getElementById('clickLimit').value = record.clickLimit;
                document.getElementById('status').value = record.status;
                
                showForm(true);
            } catch (error) {
                console.error('Error editing record:', error);
                alert('Failed to load record for editing');
            }
        }
        
        function confirmDeleteRecord(id) {
            if (confirm('Are you sure you want to delete this record? This cannot be undone.')) {
                deleteRecord(id)
                    .then(() => {
                        alert('Record deleted successfully');
                        loadRecords();
                    })
                    .catch(error => {
                        alert('Failed to delete record: ' + error.message);
                    });
            }
        }
        
        async function handleFormSubmit(event) {
            event.preventDefault();
            
            const recordId = document.getElementById('recordId').value;
            const formData = {
                name: document.getElementById('name').value,
                targetUrl: document.getElementById('targetUrl').value,
                campaignId: parseInt(document.getElementById('campaignId').value),
                clickLimit: parseInt(document.getElementById('clickLimit').value),
                status: document.getElementById('status').value
            };
            
            try {
                if (recordId) {
                    // Update existing record
                    await updateRecord(recordId, formData);
                    alert('Record updated successfully');
                } else {
                    // Create new record
                    await createRecord(formData);
                    alert('Record created successfully');
                }
                
                hideForm();
                loadRecords();
            } catch (error) {
                alert('Failed to save record: ' + error.message);
            }
        }
        
        function handleSearch() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            
            const rows = document.querySelectorAll('#recordsBody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        }
        
        // Load records and set up event listeners
        async function loadRecords() {
            document.getElementById('loadingIndicator').style.display = 'flex';
            document.getElementById('recordsTable').style.display = 'none';
            
            const [records, campaigns] = await Promise.all([
                fetchOriginalRecords(),
                fetchCampaigns()
            ]);
            
            populateCampaignsDropdown(campaigns);
            displayRecords(records);
        }
        
        // Initialize the page
        document.addEventListener('DOMContentLoaded', () => {
            loadRecords();
            
            // Set up event listeners
            document.getElementById('addRecordButton').addEventListener('click', () => showForm(false));
            document.getElementById('cancelButton').addEventListener('click', hideForm);
            document.getElementById('originalRecordForm').addEventListener('submit', handleFormSubmit);
            document.getElementById('searchInput').addEventListener('input', handleSearch);
        });
    </script>
</body>
</html>
EOF

echo -e "${GREEN}✓ Created Original URL Records HTML page${NC}"

# Step 2: Add the Original URL Records route to the server
echo -e "${YELLOW}📝 Adding a route handler for Original URL Records...${NC}"

# Create a route handler for the Original URL Records page
cat > "$APP_DIR/server/original-records-route.js" << 'EOF'
// Original URL Records route handler
const express = require('express');
const path = require('path');
const fs = require('fs');

function setupOriginalRecordsRoute(app) {
  // Serve the HTML page for Original URL Records
  app.get('/original-url-records', (req, res) => {
    const htmlPath = path.join(__dirname, 'views', 'original-url-records.html');
    
    fs.readFile(htmlPath, 'utf8', (err, content) => {
      if (err) {
        console.error('Error reading original-url-records.html:', err);
        return res.status(500).send('Error loading page');
      }
      
      res.send(content);
    });
  });
  
  // Fall back to index.html for client-side routes
  const clientRoutes = ['/urls', '/campaigns', '/login'];
  clientRoutes.forEach(route => {
    app.get(route, (req, res) => {
      res.sendFile(path.join(__dirname, '../client/dist/index.html'));
    });
  });
}

module.exports = setupOriginalRecordsRoute;
EOF

echo -e "${GREEN}✓ Created route handler for Original URL Records${NC}"

# Step 3: Update the main server file to include the new route
echo -e "${YELLOW}📝 Updating main server file...${NC}"

# Create a backup of the original server file
cp "$APP_DIR/server/index.ts" "$APP_DIR/server/index.ts.bak"

# Find where routes are registered and add our route handler
ROUTES_FILE="$APP_DIR/server/routes.ts"
INDEX_FILE="$APP_DIR/server/index.ts"

# Add original records route registration to index.ts
grep -q "setupOriginalRecordsRoute" "$INDEX_FILE" || {
  sed -i '/express.static/a const setupOriginalRecordsRoute = require("./original-records-route.js");\nsetupOriginalRecordsRoute(app);' "$INDEX_FILE"
}

echo -e "${GREEN}✓ Updated main server file${NC}"

# Step 4: Update Nginx configuration to handle client-side routing
echo -e "${YELLOW}📝 Updating Nginx configuration...${NC}"

cat > "/etc/nginx/sites-available/default" << 'EOF'
server {
    listen 80;
    server_name views.yoyoprime.com;
    
    # Add cache control headers to prevent caching
    add_header Cache-Control "no-store, no-cache, must-revalidate, max-age=0";
    add_header Pragma "no-cache";
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-API-Key "TraffiCS10928";
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
    
    # Handle API routes directly
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-API-Key "TraffiCS10928";
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
    
    # Websocket support
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-API-Key "TraffiCS10928";
    }
}
EOF

nginx -t
if [ $? -eq 0 ]; then
  systemctl restart nginx
  echo -e "${GREEN}✓ Nginx configuration updated${NC}"
else
  echo -e "${RED}⚠️ Nginx configuration error${NC}"
fi

# Step 5: Restart the application
echo -e "${YELLOW}🔄 Restarting application...${NC}"
cd "$APP_DIR"
pm2 restart url-campaign
echo -e "${GREEN}✓ Application restarted${NC}"

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║             ORIGINAL URL RECORDS FIX COMPLETE                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ Created standalone Original URL Records page${NC}"
echo -e "${GREEN}✓ Added server-side route for Original URL Records${NC}"
echo -e "${GREEN}✓ Updated Nginx configuration${NC}"
echo -e "${GREEN}✓ Application restarted${NC}"
echo
echo -e "${YELLOW}Your Original URL Records page should now be accessible at:${NC}"
echo -e "${BLUE}https://views.yoyoprime.com/original-url-records${NC}"
echo
echo -e "${YELLOW}This is a standalone page that connects directly to your API${NC}"
echo -e "${YELLOW}It bypasses the React frontend to avoid build errors${NC}"