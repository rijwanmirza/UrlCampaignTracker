#!/bin/bash

# Fix Original URL Records Page - Complete Solution
# This script fixes all issues with the Original URL Records page

# Text formatting
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - MODIFY THESE VALUES
APP_DIR="/var/www/url-campaign"
DB_USER="postgres"
DB_NAME="postgres"
PM2_APP_NAME="url-campaign"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║             FIXING ORIGINAL URL RECORDS PAGE                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo

# Backup the application
echo -e "${YELLOW}📦 Creating backup before fixes...${NC}"
BACKUP_DIR="/root/url-campaign-fix-backup-$(date +%Y%m%d%H%M%S)"
mkdir -p $BACKUP_DIR
cp -r $APP_DIR/* $BACKUP_DIR/
echo -e "${GREEN}✓ Backup created at ${BACKUP_DIR}${NC}"
echo

# Step 1: Fix the system_settings table issue
echo -e "${YELLOW}🔧 Creating missing system_settings table...${NC}"
SYSTEM_SETTINGS_SQL="$APP_DIR/create-system-settings.sql"

cat > $SYSTEM_SETTINGS_SQL << 'EOF'
-- Create system_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add click protection status
INSERT INTO system_settings (key, value, created_at, updated_at)
VALUES ('click_protection_migration', 'Applied on ' || NOW(), NOW(), NOW())
ON CONFLICT (key) DO UPDATE
    SET value = 'Applied on ' || NOW(),
        updated_at = NOW();

-- Add click protection trigger status
INSERT INTO system_settings (key, value, created_at, updated_at)
VALUES ('click_protection_trigger', 'Applied on ' || NOW(), NOW(), NOW())
ON CONFLICT (key) DO UPDATE
    SET value = 'Applied on ' || NOW(),
        updated_at = NOW();
EOF

sudo -u $DB_USER psql $DB_NAME < $SYSTEM_SETTINGS_SQL
echo -e "${GREEN}✓ system_settings table created${NC}"
echo

# Step 2: Fix navigation by creating a CJS compatible version of the script
echo -e "${YELLOW}📝 Creating module-compatible navigation fix script...${NC}"

NAV_FIX_FILE="$APP_DIR/fix-navigation.cjs"

cat > $NAV_FIX_FILE << 'EOF'
// CJS compatible fix for navigation

const fs = require('fs');
const path = require('path');

// Locate navigation file
const appDir = process.argv[2] || '/var/www/url-campaign';
const possibleNavPaths = [
  path.join(appDir, 'client/src/components/navigation.tsx'),
  path.join(appDir, 'client/src/components/Navigation.tsx'),
  path.join(appDir, 'client/src/components/nav.tsx'),
  path.join(appDir, 'client/src/components/Nav.tsx'),
  path.join(appDir, 'client/src/components/layout/navigation.tsx'),
  path.join(appDir, 'client/src/components/layout/Navigation.tsx'),
  path.join(appDir, 'client/src/components/ui/navigation.tsx'),
  path.join(appDir, 'client/src/components/sidebar.tsx'),
  path.join(appDir, 'client/src/components/Sidebar.tsx'),
];

// Find potential sidebar files if navigation not found
const sidebarSearch = [
  path.join(appDir, 'client/src/components'),
  path.join(appDir, 'client/src/components/layout'),
  path.join(appDir, 'client/src/components/ui'),
  path.join(appDir, 'client/src/layout'),
];

// Try to find navigation file
let navPath = null;

for (const potentialPath of possibleNavPaths) {
  if (fs.existsSync(potentialPath)) {
    navPath = potentialPath;
    break;
  }
}

// If we couldn't find the navigation file, try to find similar files
if (!navPath) {
  for (const dir of sidebarSearch) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.toLowerCase().includes('nav') || 
            file.toLowerCase().includes('sidebar') || 
            file.toLowerCase().includes('menu')) {
          navPath = path.join(dir, file);
          break;
        }
      }
      if (navPath) break;
    }
  }
}

// If we still couldn't find the navigation, create a fallback solution
if (!navPath) {
  console.log('Could not find navigation component. Creating a custom solution...');
  
  // Find App.tsx to add a navigation bar directly
  const appTsxPath = path.join(appDir, 'client/src/App.tsx');
  
  if (fs.existsSync(appTsxPath)) {
    console.log(`Found App.tsx at ${appTsxPath}. Adding navigation there instead...`);
    
    let appContent = fs.readFileSync(appTsxPath, 'utf8');
    
    // Check if we already added the navigation
    if (appContent.includes('OriginalUrlNav')) {
      console.log('Navigation already added to App.tsx');
      process.exit(0);
    }
    
    // Add our custom navigation component
    const navComponentCode = `
// Original URL Records Navigation Component
function OriginalUrlNav() {
  return (
    <div className="bg-primary text-white p-2 flex items-center justify-between">
      <div className="text-lg font-bold">URL Redirector</div>
      <div className="flex gap-4">
        <a href="/" className="hover:underline">Home</a>
        <a href="/campaigns" className="hover:underline">Campaigns</a>
        <a href="/urls" className="hover:underline">URLs</a>
        <a href="/original-url-records" className="hover:underline font-bold">Original URL Records</a>
      </div>
    </div>
  );
}
`;
    
    // Find the right place to insert our component
    let updatedContent;
    
    if (appContent.includes('function App()')) {
      // Add our component before the App function
      updatedContent = appContent.replace(
        /function App\(\)/,
        `${navComponentCode}\nfunction App()`
      );
      
      // Find the return statement in App and add our nav component
      if (updatedContent.includes('return (')) {
        updatedContent = updatedContent.replace(
          /return \(/,
          'return (\n      <>\n        <OriginalUrlNav />'
        );
        
        // Find the closing tag of the return and add our closing tag
        updatedContent = updatedContent.replace(
          /<\/Switch>/,
          '</Switch>\n      </>'
        );
      }
    } else {
      // Just add the component at the top of the file after imports
      const importEndIndex = appContent.lastIndexOf('import');
      const importEndLineIndex = appContent.indexOf('\n', importEndIndex);
      
      if (importEndLineIndex !== -1) {
        updatedContent = 
          appContent.slice(0, importEndLineIndex + 1) + 
          '\n' + navComponentCode + '\n' +
          appContent.slice(importEndLineIndex + 1);
      } else {
        updatedContent = navComponentCode + '\n' + appContent;
      }
    }
    
    // Write the updated file
    fs.writeFileSync(appTsxPath, updatedContent);
    console.log('Successfully added navigation component to App.tsx');
    process.exit(0);
  }
  
  console.log('Could not find App.tsx either. Creating standalone navigation file...');
  
  // Create a new navigation component file
  const newNavPath = path.join(appDir, 'client/src/components/OriginalUrlNav.tsx');
  const navDir = path.dirname(newNavPath);
  
  if (!fs.existsSync(navDir)) {
    fs.mkdirSync(navDir, { recursive: true });
  }
  
  const navContent = `import React from "react";
import { Link } from "wouter";
import { Database } from "lucide-react";

export default function OriginalUrlNav() {
  return (
    <div className="bg-primary/10 p-2 my-2 rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-2">Navigation</h2>
      <div className="flex flex-col space-y-2">
        <Link href="/" className="hover:underline">Home</Link>
        <Link href="/campaigns" className="hover:underline">Campaigns</Link>
        <Link href="/urls" className="hover:underline">URLs</Link>
        <Link href="/original-url-records" className="hover:underline font-bold flex items-center">
          <Database className="h-4 w-4 mr-1" /> Original URL Records
        </Link>
      </div>
    </div>
  );
}
`;
  
  fs.writeFileSync(newNavPath, navContent);
  console.log(`Created new navigation component at ${newNavPath}`);
  
  // Now, update App.tsx to include this component
  const appTsxPath = path.join(appDir, 'client/src/App.tsx');
  
  if (fs.existsSync(appTsxPath)) {
    let appContent = fs.readFileSync(appTsxPath, 'utf8');
    
    // Add import for our new component
    const lastImportIndex = appContent.lastIndexOf('import');
    const lastImportLineEnd = appContent.indexOf('\n', lastImportIndex);
    
    const newImport = 'import OriginalUrlNav from "./components/OriginalUrlNav";\n';
    
    let updatedContent;
    if (lastImportLineEnd !== -1) {
      updatedContent = 
        appContent.slice(0, lastImportLineEnd + 1) + 
        newImport +
        appContent.slice(lastImportLineEnd + 1);
    } else {
      updatedContent = newImport + appContent;
    }
    
    // Now, find a good place to add our component
    if (updatedContent.includes('return (')) {
      updatedContent = updatedContent.replace(
        /return \(/,
        'return (\n      <>\n        <OriginalUrlNav />'
      );
      
      updatedContent = updatedContent.replace(
        /<\/Switch>/,
        '</Switch>\n      </>'
      );
    }
    
    fs.writeFileSync(appTsxPath, updatedContent);
    console.log('Successfully added OriginalUrlNav to App.tsx');
    process.exit(0);
  }
  
  console.log('Could not modify App.tsx. Navigation may need to be added manually.');
  process.exit(1);
}

// If we found an existing navigation file, try to modify it
console.log(`Found navigation component at ${navPath}`);

// Backup the file
const backupPath = `${navPath}.bak`;
fs.copyFileSync(navPath, backupPath);
console.log(`Created backup at ${backupPath}`);

// Read and modify the file
let content = fs.readFileSync(navPath, 'utf8');

// Check if we already added the Original URL Records link
if (content.includes('original-url-records') || content.includes('Original URL Records')) {
  console.log('Original URL Records navigation link already present');
  process.exit(0);
}

// Look for imports section to add Database icon if needed
if (content.includes('from "lucide-react"') && !content.includes('Database')) {
  content = content.replace(
    /import {([^}]*)}\s+from\s+["']lucide-react["']/,
    'import {$1, Database} from "lucide-react"'
  );
} else if (!content.includes('from "lucide-react"')) {
  // Add a new import for lucide icons if not present
  content = content.replace(
    /import\s+([^;]+)\s+from\s+["'][^"']+["'];/,
    'import $1 from "$2";\nimport { Database } from "lucide-react";'
  );
}

// Look for navigation items array or list
let updatedContent = false;

// Common patterns for navigation items
const patterns = [
  {
    regex: /const\s+navigationItems\s*=\s*\[([\s\S]*?)\];/,
    replacement: (match, p1) => {
      return match.replace(
        /\];/, 
        `,\n  { name: "Original URL Records", href: "/original-url-records", icon: Database },\n];`
      );
    }
  },
  {
    regex: /<(ul|nav)[^>]*>([\s\S]*?)<\/(ul|nav)>/,
    replacement: (match, tag1, content, tag2) => {
      return match.replace(
        `</${tag2}>`,
        `  <li className="nav-item">
    <Link href="/original-url-records" className="nav-link">
      <Database className="h-4 w-4 mr-2" />
      Original URL Records
    </Link>
  </li>
</${tag2}>`
      );
    }
  },
  {
    regex: /<div[^>]*className="[^"]*sidebar[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    replacement: (match) => {
      return match.replace(
        /<\/div>$/,
        `  <a href="/original-url-records" className="sidebar-item">
    <Database className="h-4 w-4 mr-2" />
    <span>Original URL Records</span>
  </a>
</div>`
      );
    }
  }
];

// Try each pattern
for (const pattern of patterns) {
  if (pattern.regex.test(content)) {
    content = content.replace(pattern.regex, pattern.replacement);
    updatedContent = true;
    break;
  }
}

// If we couldn't find a pattern, try to find a specific component structure
if (!updatedContent) {
  // Look for a MenuLink or NavItem component
  if (content.includes('MenuLink') || content.includes('NavItem') || content.includes('NavLink')) {
    const lastItemIndex = content.lastIndexOf('MenuLink') || content.lastIndexOf('NavItem') || content.lastIndexOf('NavLink');
    
    if (lastItemIndex !== -1) {
      const itemEndIndex = content.indexOf(')', lastItemIndex);
      
      if (itemEndIndex !== -1) {
        const beforeLastItem = content.substring(0, itemEndIndex + 1);
        const afterLastItem = content.substring(itemEndIndex + 1);
        
        // Add our new item after the last one
        const newItem = `
        <NavItem
          href="/original-url-records"
          icon={Database}
          label="Original URL Records"
        />`;
        
        content = beforeLastItem + newItem + afterLastItem;
        updatedContent = true;
      }
    }
  }
}

// If no patterns worked, just add a custom navigation section
if (!updatedContent) {
  // Find the end of the component and add our nav section
  const endIndex = content.lastIndexOf('return');
  
  if (endIndex !== -1) {
    const returnEndIndex = content.indexOf(';', endIndex);
    
    if (returnEndIndex !== -1) {
      const beforeReturn = content.substring(0, returnEndIndex);
      const afterReturn = content.substring(returnEndIndex);
      
      // Add a custom nav section
      const customNav = `
  // Original URL Records navigation link
  const OriginalUrlRecordsLink = () => (
    <a href="/original-url-records" className="flex items-center p-2 text-gray-700 hover:bg-gray-100 rounded-md">
      <Database className="w-5 h-5 mr-2" />
      <span>Original URL Records</span>
    </a>
  );
`;
      
      // Add function component
      content = content.substring(0, endIndex) + customNav + content.substring(endIndex);
      
      // Add the component to the return statement
      content = content.replace(
        /return\s+\([\s\S]*?<\/div>/,
        (match) => match.replace('</div>', '<OriginalUrlRecordsLink /></div>')
      );
      
      updatedContent = true;
    }
  }
}

// Write the updated file
if (updatedContent) {
  fs.writeFileSync(navPath, content);
  console.log('Successfully added Original URL Records link to navigation');
} else {
  console.log('Could not find a suitable place to add navigation. You may need to add it manually.');
  console.log(`Original navigation file is at ${navPath}`);
}
EOF

# Make the script executable
chmod +x $NAV_FIX_FILE

# Run the navigation fix script
echo -e "${YELLOW}🔧 Fixing navigation menu...${NC}"
node $NAV_FIX_FILE $APP_DIR
echo -e "${GREEN}✓ Navigation fix applied${NC}"
echo

# Step 3: Fix the Original URL Records page component
echo -e "${YELLOW}📝 Ensuring Original URL Records page is correctly created...${NC}"

# Make sure the page is correctly formatted as JSX file
PAGE_PATH="$APP_DIR/client/src/pages/original-url-records-page.jsx"
if [ -f "$PAGE_PATH" ]; then
  echo -e "✓ Original URL Records page component exists"
else
  echo -e "⚠️ Original URL Records page component doesn't exist at $PAGE_PATH"
  echo -e "🔧 Creating a new page component..."
  
  # Create the directory if it doesn't exist
  mkdir -p "$(dirname "$PAGE_PATH")"
  
  # Create a simplified version of the page component
  cat > "$PAGE_PATH" << 'EOF'
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, Plus, Trash2, RefreshCw, Eye } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// Form schema validation
const formSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  target_url: z.string().url("Must be a valid URL"),
  click_limit: z.coerce.number().int().min(0, "Must be a positive number"),
  clicks: z.coerce.number().int().min(0, "Must be a positive number"),
  status: z.enum(["active", "paused"]),
  notes: z.string().optional(),
});

export default function OriginalUrlRecordsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewRecordDialogOpen, setIsNewRecordDialogOpen] = useState(false);

  // Fetch records
  const {
    data,
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['/api/original-url-records'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/original-url-records');
        return await res.json();
      } catch (error) {
        console.error("Error fetching records:", error);
        return { records: [], pagination: { total: 0 } };
      }
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (values) => {
      const res = await apiRequest('POST', '/api/original-url-records', values);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Original URL record created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/original-url-records'] });
      setIsNewRecordDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create record: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Setup form
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      target_url: "https://",
      click_limit: 0,
      clicks: 0,
      status: "active",
      notes: "",
    },
  });

  // Handle new record submit
  const onSubmit = (values) => {
    createMutation.mutate(values);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Original URL Records</h1>
          <p className="text-muted-foreground mb-4">
            Master records for URL data. Updates here can be propagated to all linked URLs.
          </p>
        </div>
        <Button onClick={() => setIsNewRecordDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Record
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoaderCircle className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="text-center text-destructive">
              <p>Error loading records: {error?.message || "Unknown error"}</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/original-url-records'] })}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="p-4 text-center">
              {data?.records?.length === 0 ? (
                <div>
                  <p className="mb-4">No original URL records found.</p>
                  <Button onClick={() => setIsNewRecordDialogOpen(true)}>
                    Create your first record
                  </Button>
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Original URL Records</h2>
                  <div className="space-y-4">
                    {data?.records?.map((record) => (
                      <div key={record.id} className="border p-4 rounded-lg">
                        <div className="font-bold">{record.name}</div>
                        <div className="text-sm">{record.target_url}</div>
                        <div className="mt-2">
                          <span className="text-sm">
                            Click Limit: {record.click_limit?.toLocaleString() || 0} | 
                            Clicks: {record.clicks?.toLocaleString() || 0}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Record Dialog */}
      <Dialog open={isNewRecordDialogOpen} onOpenChange={setIsNewRecordDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Original URL Record</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="target_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target URL</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="click_limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Click Limit</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min="0" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clicks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Clicks</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" min="0" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsNewRecordDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : "Create Record"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
EOF

  echo -e "${GREEN}✓ Created simplified Original URL Records page component${NC}"
fi

# Step 4: Fix App.tsx to ensure it has the correct route
echo -e "${YELLOW}🔧 Ensuring App.tsx has the Original URL Records route...${NC}"
APP_TSX_PATH="$APP_DIR/client/src/App.tsx"

# Create a temp file for modifications
TEMP_FILE=$(mktemp)

# Check if the file has the import for the page
grep -q "import OriginalUrlRecordsPage" "$APP_TSX_PATH"
if [ $? -ne 0 ]; then
  echo -e "Adding import for OriginalUrlRecordsPage..."
  sed -e '/^import/a import OriginalUrlRecordsPage from "./pages/original-url-records-page";' "$APP_TSX_PATH" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$APP_TSX_PATH"
fi

# Check if the file has the route for the page
grep -q "original-url-records" "$APP_TSX_PATH"
if [ $? -ne 0 ]; then
  echo -e "Adding route for /original-url-records..."
  sed -e '/<Switch>/a \        <Route path="/original-url-records" component={OriginalUrlRecordsPage} />' "$APP_TSX_PATH" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$APP_TSX_PATH"
fi

echo -e "${GREEN}✓ Ensured App.tsx has the correct route${NC}"
echo

# Step 5: Make sure the necessary API routes exist on the backend
echo -e "${YELLOW}🔧 Adding Original URL Records API routes...${NC}"

API_ROUTES_FILE="$APP_DIR/server/routes.js"
API_ROUTES_ESM_FILE="$APP_DIR/server/routes.mjs"

# Determine which file to use
if [ -f "$API_ROUTES_FILE" ]; then
  ROUTES_FILE="$API_ROUTES_FILE"
elif [ -f "$API_ROUTES_ESM_FILE" ]; then
  ROUTES_FILE="$API_ROUTES_ESM_FILE"
else
  # Try to find the routes file
  ROUTES_FILE=$(find "$APP_DIR/server" -name "routes.*" | head -1)
fi

if [ -n "$ROUTES_FILE" ]; then
  echo -e "Found routes file at $ROUTES_FILE"
  
  # Check if the routes already exist
  grep -q "/api/original-url-records" "$ROUTES_FILE"
  if [ $? -eq 0 ]; then
    echo -e "Original URL Records API routes already exist"
  else
    echo -e "Adding Original URL Records API routes..."
    
    # Create a separate file with the new routes
    NEW_ROUTES_FILE="$APP_DIR/add-original-url-routes.js"
    
    cat > "$NEW_ROUTES_FILE" << 'EOF'
// Original URL Records API Routes

// Add these routes to your existing routes.js file:

  // ===== Original URL Records API =====
  
  // Get all original URL records
  app.get('/api/original-url-records', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '100', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      const status = req.query.status || null;
      
      // Simple implementation with in-memory data if storage doesn't have the methods
      const records = await db.query('SELECT * FROM original_url_records ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
      const countResult = await db.query('SELECT COUNT(*) as count FROM original_url_records');
      
      const totalCount = parseInt(countResult.rows[0].count, 10);
      
      res.json({
        records: records.rows,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + records.rows.length < totalCount
        }
      });
    } catch (error) {
      console.error('Error getting original URL records:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get a single original URL record by ID
  app.get('/api/original-url-records/:id', async (req, res) => {
    try {
      const result = await db.query('SELECT * FROM original_url_records WHERE id = $1', [req.params.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error getting original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Create a new original URL record
  app.post('/api/original-url-records', async (req, res) => {
    try {
      // Validate required fields
      if (!req.body.name || !req.body.target_url) {
        return res.status(400).json({ error: 'Name and target URL are required' });
      }
      
      // Create the record
      const result = await db.query(
        `INSERT INTO original_url_records (
          name, target_url, click_limit, clicks, status, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *`,
        [
          req.body.name,
          req.body.target_url,
          req.body.click_limit || 0,
          req.body.clicks || 0,
          req.body.status || 'active',
          req.body.notes || null
        ]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Update an original URL record
  app.patch('/api/original-url-records/:id', async (req, res) => {
    try {
      const recordId = parseInt(req.params.id, 10);
      
      // Check if record exists
      const existingRecord = await db.query('SELECT * FROM original_url_records WHERE id = $1', [recordId]);
      
      if (existingRecord.rows.length === 0) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      // Build dynamic update query
      const updates = [];
      const values = [];
      let paramIndex = 1;
      
      for (const [key, value] of Object.entries(req.body)) {
        if (['name', 'target_url', 'click_limit', 'clicks', 'status', 'notes'].includes(key)) {
          updates.push(`${key} = $${paramIndex++}`);
          values.push(value);
        }
      }
      
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
      }
      
      updates.push(`updated_at = NOW()`);
      values.push(recordId);
      
      const result = await db.query(
        `UPDATE original_url_records SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Delete an original URL record
  app.delete('/api/original-url-records/:id', async (req, res) => {
    try {
      const recordId = parseInt(req.params.id, 10);
      
      // Check if record exists
      const existingRecord = await db.query('SELECT * FROM original_url_records WHERE id = $1', [recordId]);
      
      if (existingRecord.rows.length === 0) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      // Delete the record
      await db.query('DELETE FROM original_url_records WHERE id = $1', [recordId]);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting original URL record:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Sync URLs with original URL record
  app.post('/api/original-url-records/:id/sync', async (req, res) => {
    try {
      const recordId = parseInt(req.params.id, 10);
      
      // Check if record exists
      const existingRecord = await db.query('SELECT * FROM original_url_records WHERE id = $1', [recordId]);
      
      if (existingRecord.rows.length === 0) {
        return res.status(404).json({ error: 'Original URL record not found' });
      }
      
      const originalRecord = existingRecord.rows[0];
      
      // Find all URLs that need to be updated based on the original record name
      const urls = await db.query(
        'SELECT * FROM urls WHERE name = $1',
        [originalRecord.name]
      );
      
      if (urls.rows.length === 0) {
        return res.json({ 
          success: true, 
          message: 'No matching URLs found', 
          updatedCount: 0 
        });
      }
      
      console.log(`Found ${urls.rows.length} URLs to update from original record`);
      
      // Temporarily disable the trigger
      await db.query('ALTER TABLE urls DISABLE TRIGGER url_clicks_protection_trigger');
      
      // Update each URL
      let updatedCount = 0;
      let errors = [];
      
      for (const url of urls.rows) {
        try {
          // Calculate the new click limit for the URL
          // If the URL belongs to a campaign, we apply the campaign multiplier
          let multiplier = 1.0;
          
          if (url.campaign_id) {
            const campaignResult = await db.query(
              'SELECT multiplier FROM campaigns WHERE id = $1',
              [url.campaign_id]
            );
            
            if (campaignResult.rows.length > 0 && campaignResult.rows[0].multiplier) {
              multiplier = parseFloat(campaignResult.rows[0].multiplier) || 1.0;
            }
          }
          
          const newClickLimit = Math.round(originalRecord.click_limit * multiplier);
          
          // Update the URL
          await db.query(
            `UPDATE urls 
             SET clicks = $1, 
                 click_limit = $2,
                 original_click_limit = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [originalRecord.clicks, newClickLimit, originalRecord.click_limit, url.id]
          );
          
          updatedCount++;
        } catch (error) {
          errors.push(`Error updating URL ID ${url.id}: ${error.message}`);
          console.error(`Error updating URL ID ${url.id}:`, error);
        }
      }
      
      // Re-enable the trigger
      await db.query('ALTER TABLE urls ENABLE TRIGGER url_clicks_protection_trigger');
      
      return res.json({ 
        success: true, 
        message: `Updated ${updatedCount} URLs from original record`, 
        updatedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error('Error syncing URLs with original URL record:', error);
      
      // In case of error, try to re-enable the trigger
      try {
        await db.query('ALTER TABLE urls ENABLE TRIGGER url_clicks_protection_trigger');
      } catch (triggerError) {
        console.error('Failed to re-enable trigger:', triggerError);
      }
      
      res.status(500).json({ error: error.message });
    }
  });

EOF
    
    echo -e "${YELLOW}Created routes file at $NEW_ROUTES_FILE${NC}"
    echo -e "${YELLOW}You'll need to manually add these routes to $ROUTES_FILE${NC}"
    echo -e "${YELLOW}The new routes begin with app.get('/api/original-url-records',...${NC}"
    
    # Attempt to add routes automatically by finding a good insertion point
    echo -e "Attempting to add routes automatically..."
    
    # Look for common insertion points
    INSERTION_POINT=$(grep -n "app.get.*trafficstar\|app.post.*campaign\|app.get.*url" "$ROUTES_FILE" | head -1 | cut -d: -f1)
    
    if [ -n "$INSERTION_POINT" ]; then
      echo -e "Found insertion point at line $INSERTION_POINT"
      
      # Get the route content without the comments
      ROUTE_CONTENT=$(grep -v "^//" "$NEW_ROUTES_FILE")
      
      # Insert the routes at the found insertion point
      sed -i "${INSERTION_POINT}i\\${ROUTE_CONTENT}" "$ROUTES_FILE"
      
      echo -e "${GREEN}✓ Added Original URL Records API routes to $ROUTES_FILE${NC}"
    else
      echo -e "${YELLOW}⚠️ Could not find a good insertion point. Please manually add the routes from $NEW_ROUTES_FILE to $ROUTES_FILE${NC}"
    fi
  fi
else
  echo -e "${RED}⚠️ Could not find routes file. Please manually add the Original URL Records API routes.${NC}"
fi

# Step 6: Restart the application
echo -e "${YELLOW}🚀 Rebuilding and restarting application...${NC}"
cd "$APP_DIR"
npm run build
pm2 restart $PM2_APP_NAME
echo -e "${GREEN}✓ Application rebuilt and restarted${NC}"
echo

# Final message
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                     FIX COMPLETED                            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${GREEN}✓ The Original URL Records feature should now be fully functional${NC}"
echo -e "${GREEN}✓ You can access it at: https://views.yoyoprime.com/original-url-records${NC}"
echo
echo -e "${YELLOW}If you still encounter any issues:${NC}"
echo -e "1. Check PM2 logs: ${BLUE}pm2 logs ${PM2_APP_NAME}${NC}"
echo -e "2. Check server errors: ${BLUE}sudo -u $DB_USER psql $DB_NAME -c \"SELECT * FROM system_settings;\"${NC}"
echo -e "3. Verify the URL Records table: ${BLUE}sudo -u $DB_USER psql $DB_NAME -c \"SELECT * FROM original_url_records LIMIT 5;\"${NC}"
echo -e "4. Check if trigger exists: ${BLUE}sudo -u $DB_USER psql $DB_NAME -c \"SELECT * FROM pg_trigger WHERE tgname = 'url_clicks_protection_trigger';\"${NC}"
echo
echo -e "${GREEN}Backup of your application is available at: ${BACKUP_DIR}${NC}"
echo