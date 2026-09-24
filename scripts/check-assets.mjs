#!/usr/bin/env node

/**
 * Validate the approved web asset manifest and the files used by the app.
 *
 * This intentionally uses only Node's standard library so it can run in CI
 * before dependencies are installed. Stale files are reported by default;
 * use --strict when a clean public asset directory is required.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const imageExtensions = new Set(['.webp', '.jpg', '.jpeg', '.png']);
const generatedExtensions = new Set(['.webp', '.jpg']);
const familyPrefixes = [
  'flower-field-', 'wreath-garden-', 'plum-forest-', 'dusk-lake-',
  'storyboard-', 'portrait-tang-', 'portrait-he-', 'portrait-xi-',
];

function parseArgs(argv) {
  const args = {
    publicDir: resolve(projectRoot, 'public/assets/generated'),
    manifest: resolve(projectRoot, 'assets/web-manifest.json'),
    strict: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--public-dir') args.publicDir = resolve(argv[++i]);
    else if (value === '--manifest') args.manifest = resolve(argv[++i]);
    else if (value === '--strict') args.strict = true;
    else if (value === '--json') args.json = true;
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/check-assets.mjs [options]

Validate the approved web assets and runtime references.

Options:
  --public-dir PATH  Published asset directory (default: public/assets/generated)
  --manifest PATH    Web manifest path (default: assets/web-manifest.json)
  --strict           Treat stale files as an error
  --json             Print a machine-readable report
  -h, --help         Show this help
`);
}

function pathIsInside(root, target) {
  const rel = relative(root, target);
  return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep);
}

async function listFiles(root) {
  const output = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
    }
  }
  await visit(root);
  return output;
}

function readUint24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function inspectImage(buffer) {
  if (buffer.length >= 24
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 16
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buffer.subarray(12, 16).toString('ascii');
    const dataOffset = 20;
    if (chunk === 'VP8X' && buffer.length >= dataOffset + 10) {
      return {
        format: 'webp',
        width: 1 + readUint24LE(buffer, dataOffset + 4),
        height: 1 + readUint24LE(buffer, dataOffset + 7),
      };
    }
    if (chunk === 'VP8 ' && buffer.length >= dataOffset + 10
        && buffer[dataOffset + 3] === 0x9d && buffer[dataOffset + 4] === 0x01 && buffer[dataOffset + 5] === 0x2a) {
      return {
        format: 'webp',
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    throw new Error(`Unsupported WebP encoding (${chunk || 'unknown chunk'})`);
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (marker === 0xda) break;
      if (offset + 1 >= buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      const isSof = (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf);
      if (isSof && length >= 7) {
        return { format: 'jpeg', height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
      }
      offset += length;
    }
  }
  throw new Error('Unsupported or invalid image data');
}

function expectedDerivativeNames(file) {
  const stem = basename(file, extname(file));
  return [file, `${stem}-screen.webp`, `${stem}-screen.jpg`, `${stem}-thumb.webp`, `${stem}-thumb.jpg`];
}

function isSafeGeneratedCandidate(name) {
  const extension = extname(name).toLowerCase();
  return generatedExtensions.has(extension) && familyPrefixes.some((prefix) => name.startsWith(prefix));
}

async function runtimeReferences() {
  const roots = [resolve(projectRoot, 'src'), resolve(projectRoot, 'index.html')];
  const files = [];
  for (const root of roots) {
    const details = await stat(root);
    if (details.isDirectory()) files.push(...await listFiles(root));
    else files.push(root);
  }
  const references = new Set();
  const pattern = /(?:assets\/)?generated\/([A-Za-z0-9._-]+\.(?:webp|jpe?g|png))/gi;
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(pattern)) references.add(match[1]);
  }
  return [...references].sort();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const errors = [];
  const warnings = [];
  let manifestRecords;
  try {
    const parsed = JSON.parse(await readFile(args.manifest, 'utf8'));
    manifestRecords = Array.isArray(parsed) ? parsed : parsed?.assets;
    if (!Array.isArray(manifestRecords) || !manifestRecords.length) throw new Error('manifest must contain a non-empty assets array');
  } catch (error) {
    errors.push(`Cannot read web manifest: ${error.message}`);
    manifestRecords = [];
  }

  const expected = new Set();
  const seen = new Set();
  for (const record of manifestRecords) {
    if (!record || typeof record.file !== 'string' || !record.file) {
      errors.push('Manifest contains an asset without a file name');
      continue;
    }
    if (seen.has(record.file)) errors.push(`Manifest contains duplicate file: ${record.file}`);
    seen.add(record.file);
    for (const file of expectedDerivativeNames(record.file)) expected.add(file);
    const publicPath = resolve(args.publicDir, record.file);
    if (!pathIsInside(args.publicDir, publicPath)) {
      errors.push(`Manifest file escapes public asset directory: ${record.file}`);
      continue;
    }
    try {
      const image = await readFile(publicPath);
      const info = inspectImage(image);
      const expectedSize = Array.isArray(record.size) ? record.size : null;
      if (!expectedSize || info.width !== expectedSize[0] || info.height !== expectedSize[1]) {
        errors.push(`${record.file}: dimensions ${info.width}x${info.height} do not match manifest ${expectedSize?.join('x') || 'unknown'}`);
      }
      if (extname(record.file).toLowerCase() === '.webp' && info.format !== 'webp') {
        errors.push(`${record.file}: expected WebP data`);
      }
      if (typeof record.sha256 === 'string') {
        const actualHash = createHash('sha256').update(image).digest('hex');
        if (actualHash !== record.sha256) errors.push(`${record.file}: sha256 does not match web manifest`);
      }
    } catch (error) {
      errors.push(`${record.file}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
    }
    const source = typeof record.source === 'string' ? resolve(projectRoot, record.source) : null;
    if (!source || !pathIsInside(projectRoot, source)) {
      errors.push(`${record.file}: invalid source path in manifest`);
    } else {
      try {
        const sourceInfo = inspectImage(await readFile(source));
        const expectedSize = Array.isArray(record.size) ? record.size : null;
        if (expectedSize && (sourceInfo.width !== expectedSize[0] || sourceInfo.height !== expectedSize[1])) {
          errors.push(`${record.file}: source dimensions do not match manifest`);
        }
      } catch (error) {
        errors.push(`${record.file}: source ${error.code === 'ENOENT' ? 'missing' : error.message}`);
      }
    }
    const stem = basename(record.file, extname(record.file));
    for (const [variant, maxEdge] of [['screen', 1280], ['thumb', 480]]) {
      for (const extension of ['.webp', '.jpg']) {
        const name = `${stem}-${variant}${extension}`;
        try {
          const info = inspectImage(await readFile(resolve(args.publicDir, name)));
          const expectedFormat = extension === '.webp' ? 'webp' : 'jpeg';
          if (info.format !== expectedFormat) errors.push(`${name}: expected ${expectedFormat} data`);
          if (Math.max(info.width, info.height) > maxEdge) errors.push(`${name}: exceeds ${maxEdge}px derivative limit`);
        } catch (error) {
          errors.push(`${name}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
        }
      }
    }
  }

  let publicFiles = [];
  try {
    publicFiles = await listFiles(args.publicDir);
  } catch (error) {
    errors.push(`Cannot read public asset directory: ${error.message}`);
  }
  const publicNames = new Set(publicFiles.map((file) => relative(args.publicDir, file).replaceAll(sep, '/')));
  const stale = [...publicNames].filter((name) => imageExtensions.has(extname(name).toLowerCase()) && !expected.has(name)).sort();
  const cleanCandidates = stale.filter(isSafeGeneratedCandidate);
  if (stale.length) warnings.push(`${stale.length} untracked image file${stale.length === 1 ? '' : 's'} in public assets`);

  let references = [];
  try {
    references = await runtimeReferences();
    for (const reference of references) {
      if (!publicNames.has(reference)) errors.push(`Runtime reference is missing: ${reference}`);
      if (!expected.has(reference)) errors.push(`Runtime reference is absent from web manifest derivatives: ${reference}`);
    }
  } catch (error) {
    errors.push(`Cannot scan runtime references: ${error.message}`);
  }

  const report = {
    manifestAssets: manifestRecords.length,
    expectedFiles: expected.size,
    publicFiles: publicFiles.length,
    runtimeReferences: references.length,
    staleFiles: stale,
    cleanCandidates,
    errors,
    warnings,
  };
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Checked ${report.manifestAssets} manifest assets and ${report.publicFiles} public files.`);
    console.log(`Runtime references: ${report.runtimeReferences}; expected derivatives: ${report.expectedFiles}.`);
    if (cleanCandidates.length) console.log(`Stale generated candidates (${cleanCandidates.length}): ${cleanCandidates.join(', ')}`);
    const manual = stale.filter((name) => !cleanCandidates.includes(name));
    if (manual.length) console.log(`Untracked files requiring manual review (${manual.length}): ${manual.join(', ')}`);
    for (const warning of warnings) console.warn(`Warning: ${warning}`);
    for (const error of errors) console.error(`Error: ${error}`);
  }
  if (args.strict && stale.length) errors.push('Strict asset check failed because stale files are present');
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`check-assets: ${error.message}`);
  process.exitCode = 1;
});
