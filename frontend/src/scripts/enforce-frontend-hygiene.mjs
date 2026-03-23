import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendRoot = path.resolve(__dirname, '../..');
const srcRoot = path.join(frontendRoot, 'src');

const violations = {
  jsxInSrc: [],
  generatedBindingsInComponents: [],
  createPortalOutsideSharedUi: [],
  bespokeModalShellOutsideSharedUi: [],
};

const normalize = (p) => p.split(path.sep).join('/');
const isSharedUiFile = (relPath) => relPath.startsWith('src/shared/ui/');

function hasBespokeModalShell(source) {
  const hasFixedFullscreenWrapper = /class(Name)?\s*=\s*["'`][^"'`]*\bfixed\s+inset-0\b[^"'`]*["'`]/.test(source);
  const hasModalBackdrop = /class(Name)?\s*=\s*["'`][^"'`]*\bbg-black\/(?:75|80)\b[^"'`]*\bbackdrop-blur/.test(source);
  const hasDialogSemantics = /role\s*=\s*["'](?:dialog|alertdialog)["']|aria-modal\s*=\s*["']true["']/.test(source);

  return (hasFixedFullscreenWrapper && hasModalBackdrop)
    || (hasFixedFullscreenWrapper && hasDialogSemantics);
}

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
      continue;
    }

    if (entry.isFile() && relPath.startsWith('src/') && /\.(ts|tsx|js|jsx|mjs)$/.test(relPath)) {
      const source = await fs.readFile(absPath, 'utf8');
      const usesCreatePortal = /\bcreatePortal\s*\(|import\s*\{[^}]*\bcreatePortal\b[^}]*\}\s*from\s*['\"]react-dom['\"]/.test(source);

      if (
        relPath !== 'src/shared/ui/dialog-base.tsx'
        && usesCreatePortal
      ) {
        violations.createPortalOutsideSharedUi.push(relPath);
      }

      if (!isSharedUiFile(relPath) && hasBespokeModalShell(source)) {
        violations.bespokeModalShellOutsideSharedUi.push(relPath);
      }
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
    violations.jsxInSrc.length > 0
    || violations.generatedBindingsInComponents.length > 0
    || violations.createPortalOutsideSharedUi.length > 0
    || violations.bespokeModalShellOutsideSharedUi.length > 0;

  if (hasViolations) {
    console.error('Frontend hygiene checks failed.');
    printSection('Disallowed .jsx files under frontend/src:', violations.jsxInSrc);
    printSection(
      'Disallowed generated bindings paths under src/components/**/frontend/bindings:',
      violations.generatedBindingsInComponents,
    );
    printSection(
      'Disallowed createPortal usage outside src/shared/ui/dialog-base.tsx:',
      violations.createPortalOutsideSharedUi,
    );
    printSection(
      'Disallowed bespoke fullscreen modal shells outside src/shared/ui:',
      violations.bespokeModalShellOutsideSharedUi,
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