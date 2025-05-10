// This script will find and fix the high budget detection issue
const fs = require('fs');
const path = require('path');

// Define the server directory path
const serverDir = path.join(__dirname, 'server');

// Function to recursively search for files
function findFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findFiles(filePath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      const content = fs.readFileSync(filePath, 'utf8');

      // Look for signs of budget tracking with Drizzle operators
      if (
        (content.includes('url_budget_logs') || content.includes('UrlBudgetLog')) &&
        (content.includes('spent_value') || content.includes('spentValue')) &&
        (content.includes('db.execute') || content.includes('ne2') || content.includes('gt('))
      ) {
        fileList.push({
          path: filePath,
          content
        });
      }
    }
  });

  return fileList;
}

// Function to fix the file content
function fixFileContent(content) {
  // Replace Drizzle ORM operators with standard SQL
  let fixed = content;

  // Replace gt(10) with standard SQL > 10
  fixed = fixed.replace(/\$\{gt\((\d+)\)\}/g, '> $1');
  fixed = fixed.replace(/gt\((\d+)\)/g, '> $1');

  // Replace ne2 function with standard SQL !=
  fixed = fixed.replace(/\$\{ne2\(([^)]+)\)\}/g, '!= $1');
  fixed = fixed.replace(/ne2\(([^)]+)\)/g, '!= $1');

  // Replace eq function with standard SQL =
  fixed = fixed.replace(/\$\{eq\(([^)]+)\)\}/g, '= $1');
  fixed = fixed.replace(/eq\(([^)]+)\)/g, '= $1');

  // Replace db.execute with pool.query for raw SQL strings
  fixed = fixed.replace(/await db\.execute\(sql`([\s\S]*?)`\)/g, (match, query) => {
    return `await pool.query(\`${query.replace(/\${([^}]+)}/g, '$$$1')}\`)`;
  });

  // Replace db.execute with pool.query for non-template literals
  fixed = fixed.replace(/await db\.execute\(([^)]*)\)/g, 'await pool.query($1)');

  // Ensure the .rows property is used when accessing results
  fixed = fixed.replace(/const ([a-zA-Z0-9_]+) = await pool\.query/g, 'const $1Result = await pool.query');
  fixed = fixed.replace(/for\s*\(\s*const\s+([a-zA-Z0-9_]+)\s+of\s+([a-zA-Z0-9_]+)Result\s*\)/g, 'for (const $1 of $2Result.rows)');

  // Add import for pool if not present
  if (fixed.includes('pool.query') && !fixed.includes('import { pool }')) {
    if (fixed.includes('import { db }')) {
      fixed = fixed.replace('import { db }', 'import { db, pool }');
    } else {
      fixed = 'import { pool } from "../db";\n' + fixed;
    }
  }

  return fixed;
}

// Find relevant files
console.log('Searching for files with high budget tracking...');
const filesToFix = findFiles(serverDir);

if (filesToFix.length === 0) {
  console.log('No files found that need fixing.');
} else {
  console.log(`Found ${filesToFix.length} files that need fixing.`);

  // Fix each file
  filesToFix.forEach(file => {
    console.log(`Fixing file: ${file.path}`);
    const fixedContent = fixFileContent(file.content);

    // Create a backup of the original file
    fs.writeFileSync(`${file.path}.backup`, file.content);

    // Write the fixed content
    fs.writeFileSync(file.path, fixedContent);

    console.log(`Fixed file: ${file.path} (backup created at ${file.path}.backup)`);
  });

  console.log('All files fixed successfully!');
  console.log('Now you can deploy these changes to your VPS.');
}

// Also fix the migration check file explicitly
const migrationCheckPath = path.join(serverDir, 'migrations', 'check-migration-needed.ts');
if (fs.existsSync(migrationCheckPath)) {
  console.log(`Fixing migration check file: ${migrationCheckPath}`);
  let content = fs.readFileSync(migrationCheckPath, 'utf8');

  // Create backup
  fs.writeFileSync(`${migrationCheckPath}.backup`, content);

  // Apply the specific fix for migration checks
  content = content.replace(/await db\.execute\(/g, 'await pool.query(');

  // Make sure pool is imported
  if (!content.includes('import { pool }')) {
    if (content.includes('import { db }')) {
      content = content.replace('import { db }', 'import { db, pool }');
    } else {
      content = 'import { pool } from "../db";\n' + content;
    }
  }

  fs.writeFileSync(migrationCheckPath, content);
  console.log(`Fixed migration check file (backup created at ${migrationCheckPath}.backup)`);
}

console.log('\nOnce deployed to your VPS, restart the application with:');
console.log('pm2 restart url-tracker');