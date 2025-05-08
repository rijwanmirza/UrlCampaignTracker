const fs = require('fs');

// Read the source file
const filePath = 'server/traffic-generator.ts';
const backupPath = 'server/traffic-generator.ts.backup';
const content = fs.readFileSync(filePath, 'utf8');

// Create a backup if not already done
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, content, 'utf8');
}

// Replace pattern 1: with: { urls: true }
const updatedContent1 = content.replace(/with: \{ urls: true \}/g, 
  `with: { 
    urls: {
      where: (urls, { eq }) => eq(urls.status, 'active')
    } 
  }`);

// Replace pattern 2: urls: true inside multiline with block
const updatedContent2 = updatedContent1.replace(/with: \{\n(\s+)urls: true\n(\s+)\}/g, 
  `with: {
$1urls: {
$1  where: (urls, { eq }) => eq(urls.status, 'active')
$1}
$2}`);

// Write the updated content back to the file
fs.writeFileSync(filePath, updatedContent2, 'utf8');

console.log('Traffic generator file updated successfully');
