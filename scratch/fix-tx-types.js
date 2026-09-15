/**
 * fix-tx-types.js
 * Adds explicit PrismaTxClient type to all $transaction callback parameters
 * that are untyped (i.e., `async (tx) =>` but not `async (tx: ...`) 
 */
const fs = require('fs');
const path = require('path');
const glob = require('glob');

const SRC_DIR = path.resolve(__dirname, '../apps/api/src');

// Find all TypeScript service files
const files = glob.sync(`${SRC_DIR}/**/*.ts`, {
  ignore: ['**/*.spec.ts', '**/*.d.ts', '**/dist/**'],
});

let fixedCount = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let modified = false;

  // Match: $transaction(async (tx) => {  — WITHOUT an existing type annotation
  const txPattern = /(\$transaction\(async\s*\(\s*)(tx)(\s*\)\s*=>)/g;

  if (txPattern.test(content)) {
    // Reset lastIndex after test
    txPattern.lastIndex = 0;
    
    const newContent = content.replace(txPattern, '$1tx: PrismaTxClient$3');
    
    if (newContent !== content) {
      // Check if PrismaTxClient is already imported
      if (!newContent.includes('PrismaTxClient')) {
        console.log(`  SKIP (already has type or no match): ${path.relative(SRC_DIR, file)}`);
        continue;
      }

      // Add import if not already present
      let finalContent = newContent;
      if (!finalContent.includes('PrismaTxClient')) {
        console.log(`  SKIP (no change needed): ${path.relative(SRC_DIR, file)}`);
        continue;
      }

      // Add the PrismaTxClient import if the file uses PrismaService but doesn't import PrismaTxClient
      const hasPrismaServiceImport = /from ['"].*prisma\.service['"]/i.test(finalContent);
      const alreadyImportsPrismaTxClient = finalContent.includes('PrismaTxClient');

      if (hasPrismaServiceImport && !alreadyImportsPrismaTxClient) {
        // Add PrismaTxClient to the existing prisma.service import
        finalContent = finalContent.replace(
          /(import\s*\{[^}]*)(PrismaService)([^}]*\}\s*from\s*['"][^'"]*prisma\.service['"])/,
          '$1PrismaService, PrismaTxClient$3'
        );
        // Handle case where PrismaService is imported with type keyword
        finalContent = finalContent.replace(
          /(import\s*type\s*\{[^}]*)(PrismaService)([^}]*\}\s*from\s*['"][^'"]*prisma\.service['"])/,
          '$1PrismaService, PrismaTxClient$3'
        );
      } else if (!hasPrismaServiceImport && !alreadyImportsPrismaTxClient) {
        // Need to find the relative path to prisma.service and add a new import
        const relPath = path.relative(path.dirname(file), path.join(SRC_DIR, 'common/prisma/prisma.service'))
          .replace(/\\/g, '/');
        const importLine = `import { PrismaTxClient } from '${relPath.startsWith('.') ? relPath : './' + relPath}';\n`;
        // Insert after last import block
        finalContent = finalContent.replace(
          /(import[^;]+;)(\s*\n\s*\n)/,
          `$1\n${importLine}$2`
        );
      }

      fs.writeFileSync(file, finalContent, 'utf-8');
      console.log(`  ✅ Fixed: ${path.relative(SRC_DIR, file)}`);
      fixedCount++;
      modified = true;
    }
  }
}

console.log(`\nDone. Fixed ${fixedCount} files.`);
