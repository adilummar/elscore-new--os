/**
 * add-prisma-tx-imports.js
 * Adds 'PrismaTxClient' to the prisma.service import in every file
 * that uses PrismaTxClient but doesn't yet import it.
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const SRC_DIR = path.resolve(__dirname, '../apps/api/src');

const files = glob.sync(`${SRC_DIR}/**/*.ts`, {
  ignore: ['**/*.spec.ts', '**/*.d.ts'],
});

let fixedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');

  // Only process files that USE PrismaTxClient
  if (!content.includes('PrismaTxClient')) continue;

  // Skip if already imported
  if (/import[^;]+PrismaTxClient[^;]+;/.test(content)) {
    console.log(`  ✅ Already imported: ${path.relative(SRC_DIR, file)}`);
    continue;
  }

  // Find the existing PrismaService import line (handles various path patterns)
  const prismaImportRegex = /(import\s*\{)([^}]*)(PrismaService)([^}]*)(\}\s*from\s*['"][^'"]*prisma\.service['"])/;
  
  if (prismaImportRegex.test(content)) {
    // PrismaService already imported — add PrismaTxClient to same import
    const newContent = content.replace(
      prismaImportRegex,
      (match, open, before, service, after, closing) => {
        // Avoid double-adding
        if (before.includes('PrismaTxClient') || after.includes('PrismaTxClient')) return match;
        return `${open}${before}${service}, PrismaTxClient${after}${closing}`;
      }
    );
    if (newContent !== content) {
      fs.writeFileSync(file, newContent, 'utf-8');
      console.log(`  ✅ Added PrismaTxClient to PrismaService import: ${path.relative(SRC_DIR, file)}`);
      fixedCount++;
    }
  } else {
    // PrismaService not imported — find relative path to prisma.service and add new import line
    const relativePath = path.relative(path.dirname(file), path.join(SRC_DIR, 'common/prisma/prisma.service'))
      .replace(/\\/g, '/');
    const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
    const newImportLine = `import { PrismaTxClient } from '${importPath}';\n`;
    
    // Insert after the last existing import statement
    const lastImportMatch = content.match(/([\s\S]*import[^;]+;)(\s*\n)/);
    if (lastImportMatch) {
      const insertPos = content.lastIndexOf('import');
      const afterLastImport = content.indexOf(';', insertPos) + 1;
      const newContent = content.slice(0, afterLastImport) + '\n' + newImportLine + content.slice(afterLastImport);
      fs.writeFileSync(file, newContent, 'utf-8');
      console.log(`  ✅ Added new PrismaTxClient import: ${path.relative(SRC_DIR, file)}`);
      fixedCount++;
    } else {
      console.log(`  ⚠️  Could not find import location: ${path.relative(SRC_DIR, file)}`);
    }
  }
}

console.log(`\nDone. Fixed ${fixedCount} files.`);
