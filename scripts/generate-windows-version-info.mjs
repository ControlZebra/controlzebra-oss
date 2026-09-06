#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Keep the version resource in sync with main.Version without modifying the
// generated source template. Node is already required by the frontend build.
const [version, input, output] = process.argv.slice(2);
if (!version || !input || !output || process.argv.length !== 5) {
  throw new Error('Usage: node generate-windows-version-info.mjs VERSION INPUT_JSON OUTPUT_JSON');
}
const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
if (!match || match.slice(1, 4).some(part => Number(part) > 65535)) {
  throw new Error('Version must have three numeric components between 0 and 65535.');
}
const info = JSON.parse(await readFile(input, 'utf8'));
info.fixed = { ...info.fixed, file_version: `${match.slice(1, 4).join('.')}.0` };
for (const translations of Object.values(info.info)) {
  translations.ProductVersion = version.replace(/^v/, '');
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(info, null, 2)}\n`);
