// Paths and browser flags for the kit. Everything resolves from this folder, so the skill runs wherever it is installed.
// Override any of them with an environment variable.

import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE || 'ffprobe';
export const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

// three, esbuild, fonts and playwright: `npm install` in this folder puts them here.
export const DEPS = process.env.TEARDOWN_DEPS || path.join(ROOT, 'node_modules');
// Playwright's default headless shell has no GPU WebGL on macOS: it falls back to SwiftShader and every 3D page
// dies with "Could not create a WebGL context ... BindToCurrentSequence failed". The full Chrome for Testing binary
// that `npx playwright install chromium` also downloads does get the real GPU, so use it when it is there.
// Set CHROMIUM to point at another binary.
const findFullChromium = () => {
  if (process.platform !== 'darwin') return undefined;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright');
  // prefer the revision playwright-core pins, then fall back to the newest one installed
  let pinned = null;
  try {
    const spec = JSON.parse(fs.readFileSync(path.join(DEPS, 'playwright-core', 'browsers.json'), 'utf8'));
    pinned = spec.browsers.find((b) => b.name === 'chromium')?.revision || null;
  } catch {}
  let versions = [];
  try {
    versions = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d));
  } catch {
    return undefined;
  }
  versions.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  if (pinned) {
    const exact = versions.find((d) => d === `chromium-${pinned}`);
    if (exact) versions = [exact, ...versions.filter((d) => d !== exact)];
  }
  for (const dir of versions) {
    const exe = path.join(root, dir, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
};
export const CHROMIUM = process.env.CHROMIUM || findFullChromium();
// Real GPU WebGL instead of a software rasteriser. On Windows d3d11 plus --force_high_performance_gpu keeps ANGLE off
// an integrated GPU when a discrete one exists. capture.mjs prints the GPU it got on every run.
export const CHROMIUM_ARGS = [
  ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
  '--force_high_performance_gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars',
];

// Builds and renders land in ./teardown-out of the folder you run from.
export const OUT = path.resolve(process.env.TEARDOWN_OUT || 'teardown-out');
export const DIST = path.join(OUT, 'dist');

export const fromDeps = (id) => createRequire(path.join(DEPS, 'x.js'))(id);
export const playwright = () => fromDeps('playwright');
