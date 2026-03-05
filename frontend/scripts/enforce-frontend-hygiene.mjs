import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(frontendRoot, 'src');

const violations = {
  jsxInSrc: [],
  generatedBindingsInComponents: [],
};

const normalize = (p) => p.split(path.sep).join('/');

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    const relPath = normalize(path.relative(frontendRoot, absPath));

    if (entry.isDirectory()) {
      const generatedBindingsPattern = /^src\/components\/.*\/frontend\/bindings(?:\/|$)/;
      if (generatedBindingsPattern.test(relPath)) {
        violations.generatedBindingsInComponents.push(relPath);
      }

      await walk(absPath);
      continue;
    }

    if (entry.isFile() && relPath.startsWith('src/') && relPath.endsWith('.jsx')) {
      violations.jsxInSrc.push(relPath);
    }
  }
}

function printSection(title, values) {
  if (values.length === 0) {
    return;
  }

  console.error(`\n${title}`);
  for (const value of values) {
    console.error(` - ${value}`);
  }
}

async function main() {
  await walk(srcRoot);

  const hasViolations =
    violations.jsxInSrc.length > 0 || violations.generatedBindingsInComponents.length > 0;

  if (hasViolations) {
    console.error('Frontend hygiene checks failed.');
    printSection('Disallowed .jsx files under frontend/src:', violations.jsxInSrc);
    printSection(
      'Disallowed generated bindings paths under src/components/**/frontend/bindings:',
      violations.generatedBindingsInComponents,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Frontend hygiene checks passed.');
}

main().catch((error) => {
  console.error('Failed to run frontend hygiene checks:', error);
  process.exitCode = 1;
});