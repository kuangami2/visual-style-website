#!/usr/bin/env node

/**
 * Generate image assets through an OpenAI-compatible /images/generations API.
 *
 * The script deliberately uses only Node's standard library so it can run in
 * this static project without installing dependencies. It loads .env locally,
 * never prints the API key, and records the prompt/configuration next to each
 * generated asset for reproducibility.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadEnv() {
  try {
    const text = await readFile(resolve(projectRoot, '.env'), 'utf8');
    return { ...parseDotEnv(text), ...process.env };
  } catch {
    return { ...process.env };
  }
}

function parseArgs(argv) {
  const args = {
    dryRun: false,
    count: 1,
    prompt: null,
    promptFile: null,
    slug: 'wan-late-home-hero',
    size: null,
    quality: null,
    force: false,
    resume: false,
    outputDir: resolve(projectRoot, 'assets/generated'),
    manifest: resolve(projectRoot, 'assets/generated/manifest.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--dry-run') args.dryRun = true;
    else if (value === '--prompt') args.prompt = argv[++i];
    else if (value === '--prompt-file') args.promptFile = argv[++i];
    else if (value === '--slug') args.slug = argv[++i];
    else if (value === '--size') args.size = argv[++i];
    else if (value === '--quality') args.quality = argv[++i];
    else if (value === '--force') args.force = true;
    else if (value === '--resume') args.resume = true;
    else if (value === '--count') args.count = Number.parseInt(argv[++i], 10);
    else if (value === '--output-dir') args.outputDir = resolve(argv[++i]);
    else if (value === '--manifest') args.manifest = resolve(argv[++i]);
    else if (value === '--help' || value === '-h') args.help = true;
    else throw new Error(`Unknown option: ${value}`);
  }

  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 10) {
    throw new Error('--count must be an integer from 1 to 10');
  }
  if (!args.slug || !/^[a-z0-9][a-z0-9._-]*$/i.test(args.slug)) {
    throw new Error('--slug may contain letters, numbers, dots, dashes and underscores only');
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/generate-images.mjs [options]

Generate a visual asset with the project .env configuration.

Options:
  --prompt TEXT       Prompt to send (otherwise the built-in main visual prompt)
  --prompt-file PATH  Read prompt text or a JSON object with a "prompt" field
  --slug NAME         Output basename (default: wan-late-home-hero)
  --size SIZE         API image size (default: OPENAI_IMAGE_SIZE or 1536x1024)
  --quality QUALITY   Optional API quality value, e.g. medium or high
  --force             Allow replacing existing files with the same slug
  --resume            Download a saved response for --slug without generating again
  --count N           Number of images (1-10, default: 1)
  --output-dir PATH   Asset directory (default: assets/generated)
  --manifest PATH     Manifest path (default: assets/generated/manifest.json)
  --dry-run           Validate config and print a redacted request without calling the API
  -h, --help          Show this help
`);
}

const defaultPrompt = `A cinematic editorial key visual for an interactive Chinese-style ancient garden story titled “晚些回去”. Three young women friends walk beside a spring flower field at golden hour: one in muted persimmon red, one in jade green, one in indigo blue. Willow branches and small wildflowers frame the foreground, a calm lake and distant low hills fade into warm haze, natural expressions and believable East Asian features, contemporary hanfu-inspired clothing with linen texture, painterly realism, warm gold light balanced with quiet teal shadows, gentle depth of field, elegant negative space on the left for interface copy. No text, no letters, no logo, no watermark, no border, no split panels, no UI screenshot.`;

function safeEndpoint(baseUrl) {
  try {
    const url = new URL(baseUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid endpoint]';
  }
}

function endpointFromEnv(env) {
  const configured = env.OPENAI_IMAGE_ENDPOINT || env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const normalized = configured.replace(/\/+$/, '');
  if (/\/images\/generations$/i.test(normalized)) return normalized;
  return `${normalized}/images/generations`;
}

function imageFormatFromMagic(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: '.png', mime: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mime: 'image/jpeg' };
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: '.webp', mime: 'image/webp' };
  }
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') {
    return { extension: '.gif', mime: 'image/gif' };
  }
  return null;
}

function inspectImage(buffer) {
  const format = imageFormatFromMagic(buffer);
  if (!format) throw new Error('Image data has an unsupported or invalid file signature');
  return format;
}

function imageBufferFromBase64(value) {
  const encoded = String(value).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
  return Buffer.from(encoded, 'base64');
}

async function fetchImage(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      throw new Error(controller.signal.aborted ? 'Image download timed out' : 'Image download network request failed');
    }
    if (!response.ok) throw new Error(`Image download failed (${response.status})`);
    try {
      return Buffer.from(await response.arrayBuffer());
    } catch {
      throw new Error(controller.signal.aborted ? 'Image download timed out' : 'Image download body could not be read');
    }
  } finally {
    clearTimeout(timer);
  }
}

async function downloadWithRetries(url, timeoutMs, slug) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchImage(url, timeoutMs);
    } catch (error) {
      if (attempt === 2) {
        throw new Error(`${error.message}. Saved response retained; retry with --resume --slug ${slug}.`);
      }
      console.log(`Image download retry ${attempt + 1}/2 (GET only).`);
    }
  }
}

function pendingPathFor(slug) {
  return resolve(projectRoot, 'tmp/imagegen-pending', `${slug}.json`);
}

async function loadPending(path, slug) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`No saved response exists for slug "${slug}".`);
    throw error;
  }
  let pending;
  try {
    pending = JSON.parse(text);
  } catch {
    // Parsing errors must not reveal the temporary image URL.
    throw new Error('Saved response contains invalid JSON');
  }
  const items = Array.isArray(pending?.item) ? pending.item : [pending?.item];
  if (pending?.slug !== slug || typeof pending.prompt !== 'string' || !items.length
      || items.some((item) => !item || (typeof item.url !== 'string' && typeof item.b64_json !== 'string'))) {
    throw new Error('Saved response has an invalid structure');
  }
  return { ...pending, items };
}

async function assertNoPending(path, slug) {
  try {
    await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`A saved response already exists for "${slug}". Use --resume --slug ${slug} to avoid another generation request.`);
}

async function writeAssetFile(path, content, args) {
  if (args.resume && !args.force) {
    try {
      const existing = await readFile(path);
      if (existing.equals(Buffer.isBuffer(content) ? content : Buffer.from(content))) return;
      throw new Error(`Existing output differs from the saved response: ${basename(path)}. Use a new slug or --force.`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await writeFile(path, content, { flag: args.force ? 'w' : 'wx' });
}

async function assertSlugAvailable(args) {
  if (args.force) return;
  let files;
  try {
    files = await readdir(args.outputDir);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const occupied = files.some((name) => {
    const assetName = name.endsWith('.json') ? basename(name, '.json') : name;
    const stem = basename(assetName, extname(assetName));
    return stem === args.slug || (stem.startsWith(`${args.slug}-`) && /^\d+$/.test(stem.slice(args.slug.length + 1)));
  });
  if (occupied) throw new Error(`Output slug "${args.slug}" already exists. Use a new --slug or explicitly add --force.`);
}

async function readPrompt(args) {
  if (args.prompt) return args.prompt.trim();
  if (!args.promptFile) return defaultPrompt;
  const source = await readFile(resolve(args.promptFile), 'utf8');
  try {
    const parsed = JSON.parse(source);
    if (typeof parsed === 'string') return parsed.trim();
    if (parsed && typeof parsed.prompt === 'string') return parsed.prompt.trim();
  } catch {
    // Plain text prompt files are supported as well.
  }
  return source.trim();
}

async function loadManifest(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    if (parsed && Array.isArray(parsed.assets)) return parsed;
  } catch {
    // A new manifest is created when no valid manifest exists.
  }
  return { project: 'wan-late-home', generatedAt: null, assets: [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const env = await loadEnv();
  const pendingPath = pendingPathFor(args.slug);
  const saved = args.resume ? await loadPending(pendingPath, args.slug) : null;
  if (saved) {
    args.outputDir = saved.outputDir || args.outputDir;
    args.manifest = saved.manifest || args.manifest;
    args.count = saved.items.length;
  }
  const endpoint = endpointFromEnv(env);
  const model = saved?.model || env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
  const size = saved?.size || args.size || env.OPENAI_IMAGE_SIZE || '1536x1024';
  const quality = saved ? (saved.quality || '') : (args.quality || env.OPENAI_IMAGE_QUALITY || '');
  const timeoutMs = Number.parseInt(env.OPENAI_IMAGE_TIMEOUT_MS || '180000', 10);
  const downloadTimeoutMs = Number.parseInt(env.OPENAI_IMAGE_DOWNLOAD_TIMEOUT_MS || '30000', 10);
  const prompt = saved?.prompt || await readPrompt(args);

  if (!prompt) throw new Error('Prompt is empty');
  if (args.dryRun) {
    console.log(JSON.stringify({
      dryRun: true,
      endpoint: safeEndpoint(endpoint),
      model,
      size,
      quality: quality || undefined,
      count: args.count,
      force: args.force,
      resume: args.resume,
      promptLength: prompt.length,
      outputDir: args.outputDir,
      manifest: args.manifest,
      apiKeyConfigured: Boolean(env.OPENAI_API_KEY),
    }, null, 2));
    return;
  }

  if (!args.resume && !env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured. Use --dry-run to validate without a key.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 10_000) throw new Error('OPENAI_IMAGE_TIMEOUT_MS must be at least 10000');
  if (!Number.isFinite(downloadTimeoutMs) || downloadTimeoutMs < 15_000 || downloadTimeoutMs > 30_000) {
    throw new Error('OPENAI_IMAGE_DOWNLOAD_TIMEOUT_MS must be between 15000 and 30000');
  }
  if (!args.resume) {
    await assertSlugAvailable(args);
    await assertNoPending(pendingPath, args.slug);
  }

  let payload = saved ? { data: saved.items } : null;
  if (!args.resume) {
  const body = { model, prompt, n: args.count, size };
  if (quality) body.quality = quality;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new Error(controller.signal.aborted ? 'Image API request timed out' : 'Image API network request failed');
    }
    if (!response.ok) {
      // Never read or print a service error body: proxies can echo credentials.
      if (response.body) await response.body.cancel().catch(() => {});
      throw new Error(`Image API request failed (${response.status})`);
    }
    try {
      payload = await response.json();
    } catch {
      // JSON parser messages can contain service response text, so replace them.
      throw new Error(controller.signal.aborted ? 'Image API response timed out' : 'Image API returned invalid JSON');
    }
  } finally {
    clearTimeout(timer);
  }
  }
  if (!Array.isArray(payload?.data) || payload.data.length === 0) throw new Error('Image API returned no data items');

  const generatedAt = saved?.generatedAt || new Date().toISOString();
  if (!args.resume) {
    // Save only the fields needed for recovery, never API credentials or the
    // complete response. Temporary URLs stay in the ignored local tmp folder.
    const items = payload.data.map((item) => {
      if (typeof item?.b64_json === 'string') return { b64_json: item.b64_json };
      if (typeof item?.url === 'string') return { url: item.url };
      return {};
    });
    const pending = {
      slug: args.slug, prompt, model, size, quality: quality || null, generatedAt,
      outputDir: args.outputDir, manifest: args.manifest,
      item: items.length === 1 ? items[0] : items,
    };
    await mkdir(dirname(pendingPath), { recursive: true });
    await writeFile(pendingPath, `${JSON.stringify(pending, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    console.log(`Saved local recovery record for ${args.slug}.`);
  } else {
    console.log(`Resuming ${args.slug}; no generation request will be sent.`);
  }

  await mkdir(args.outputDir, { recursive: true });
  const manifest = await loadManifest(args.manifest);
  const records = [];
  const outputs = [];

  for (let i = 0; i < payload.data.length; i += 1) {
    const item = payload.data[i];
    let image;
    let source = 'unknown';
    if (item?.b64_json) {
      image = imageBufferFromBase64(item.b64_json);
      source = 'b64_json';
    } else if (item?.url) {
      image = await downloadWithRetries(item.url, downloadTimeoutMs, args.slug);
      source = 'url';
    } else {
      throw new Error(`Image API item ${i + 1} has neither b64_json nor url`);
    }

    const { extension, mime } = inspectImage(image);
    const suffix = payload.data.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : '';
    const filename = `${args.slug}${suffix}${extension}`;
    const outputPath = resolve(args.outputDir, filename);
    const record = {
      file: filename,
      role: args.slug.includes('hero') ? 'hero' : 'generated visual',
      prompt,
      model,
      size,
      quality: quality || null,
      generatedAt,
      source,
      mime,
      sha256: createHash('sha256').update(image).digest('hex'),
    };
    records.push(record);
    outputs.push({ outputPath, image, record });
  }

  // Complete all downloads first so a failed item leaves no partial batch.
  for (const { outputPath, image, record } of outputs) {
    await writeAssetFile(outputPath, image, args);
    await writeAssetFile(`${outputPath}.json`, `${JSON.stringify(record, null, 2)}\n`, args);
    console.log(`Saved ${record.file} (${Math.round(image.length / 1024)} KiB)`);
  }

  const generatedNames = new Set(records.map((record) => record.file));
  manifest.assets = [...manifest.assets.filter((asset) => !generatedNames.has(asset.file)), ...records];
  manifest.generatedAt = generatedAt;
  await mkdir(dirname(args.manifest), { recursive: true });
  await writeFile(args.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await unlink(pendingPath);
  console.log(`Updated ${basename(args.manifest)} with ${records.length} asset${records.length === 1 ? '' : 's'}.`);
}

main().catch((error) => {
  console.error(`generate-images: ${error.message}`);
  process.exitCode = 1;
});
