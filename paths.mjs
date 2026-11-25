// Paths and browser flags for the kit. Everything resolves from this folder, so the skill runs wherever it is installed.
// Override any of them with an environment variable.

import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE || 'ffprobe';
export const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

// three, esbuild, fonts and playwright: `npm install` in this folder puts them here.
export const DEPS = process.env.TEARDOWN_DEPS || path.join(ROOT, 'node_modules');
// Unset: playwright uses the Chromium that `npx playwright install chromium` downloaded.
export const CHROMIUM = process.env.CHROMIUM || undefined;

// Real GPU WebGL instead of a software rasteriser. ANGLE needs a backend per OS:
// - Windows: d3d11, and --force_high_performance_gpu keeps it off an integrated GPU when a discrete one exists.
// - macOS: metal. Without it headless Chromium gets no WebGL context at all and capture times out.
// - Linux: OpenGL by default, the most widely available. TEARDOWN_ANGLE=vulkan to try Vulkan, TEARDOWN_ANGLE=off for
//   Chromium's own choice (which is the CPU renderer, SwiftShader).
// capture.mjs prints the GPU it got on every run, and falls back to SOFTWARE_ARGS when these flags give no WebGL.
const LINUX_ANGLE = (process.env.TEARDOWN_ANGLE || 'gl').toLowerCase();
const gpuArgs = {
  win32: ['--use-angle=d3d11'],
  darwin: ['--use-angle=metal'],
  linux: LINUX_ANGLE === 'off' ? [] : ['--use-gl=angle', `--use-angle=${LINUX_ANGLE}`],
};
const COMMON_ARGS = ['--force_high_performance_gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-webgl', '--hide-scrollbars'];
export const CHROMIUM_ARGS = [...(gpuArgs[process.platform] || []), ...COMMON_ARGS];
// Last resort, works on any machine: WebGL on the CPU. Correct frames, many times slower.
export const SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...COMMON_ARGS];

// Builds and renders land in ./teardown-out of the folder you run from.
export const OUT = path.resolve(process.env.TEARDOWN_OUT || 'teardown-out');
export const DIST = path.join(OUT, 'dist');

// A missing package means `npm install` never ran in this folder (or ran somewhere else): say where to run it.
export const fromDeps = (id) => {
  try {
    return createRequire(path.join(DEPS, 'x.js'))(id);
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND' || !e.message.includes(`'${id}'`)) throw e;
    console.error(`${id} is not installed in ${DEPS}. Run these once in ${path.dirname(DEPS)}:\n  npm install\n` +
      `  npx playwright install ${process.platform === 'linux' ? '--with-deps ' : ''}chromium`);
    process.exit(1);
  }
};
export const playwright = () => fromDeps('playwright');

// Stop with an install hint instead of a spawn ENOENT stack trace when ffmpeg or ffprobe is missing.
const INSTALL_FFMPEG = {
  win32: 'winget install Gyan.FFmpeg   (then open a new terminal)',
  darwin: 'brew install ffmpeg',
  linux: 'sudo apt install ffmpeg   (or your distribution\'s package manager)',
};
export const requireTool = (bin, envVar) => {
  if (!spawnSync(bin, ['-version'], {stdio: 'ignore'}).error) return;
  const example = process.platform === 'win32'
    ? `$env:${envVar} = "C:\\path\\to\\${path.basename(bin, '.exe')}.exe"   (PowerShell)`
    : `export ${envVar}=/path/to/${path.basename(bin)}`;
  console.error(`${bin} not found. Install ffmpeg (ffprobe comes with it):\n  ${INSTALL_FFMPEG[process.platform] || 'https://ffmpeg.org/download.html'}\n` +
    `or point ${envVar} at the binary:\n  ${example}`);
  process.exit(1);
};
