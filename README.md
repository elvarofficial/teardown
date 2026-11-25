# teardown

A Claude Code skill that turns any machine into a 3D simulator you can take apart.

Ask how something works. Claude builds it as one offline HTML page: the machine runs in the middle, every panel around it reads the real numbers, a button opens the part doing the work, and when nobody touches it the page tours itself.

![Mellis HB-7 robotic bee simulator](docs/bee.gif)

| Telson SC-8 robotic scorpion | Pelagos OC-8 robotic octopus |
|---|---|
| ![Telson SC-8 robotic scorpion](docs/scorpion.gif) | ![Pelagos OC-8 robotic octopus](docs/octopus.gif) |

## Install

```
npx skills add elvarofficial/teardown -g -a claude-code
```

Then, once, in the installed folder:

```
npm install && npx playwright install chromium
```

On Linux, use `npx playwright install --with-deps chromium` instead: it also installs the system libraries Chromium needs (it asks for sudo).

You need Node.js 20 or newer. For the video you also need `ffmpeg` on PATH, and for the sound Python 3 (standard library only):

| | ffmpeg | Python 3 |
|---|---|---|
| Windows | `winget install Gyan.FFmpeg`, then open a new terminal | `winget install Python.Python.3.13`, run as `python` |
| macOS | `brew install ffmpeg` | preinstalled or `brew install python`, run as `python3` |
| Linux | `sudo apt install ffmpeg` | preinstalled, run as `python3` |

Check it end to end with a first render (a still from the V8 film, no ffmpeg needed):

```
node sims/build.mjs v8-film
node sims/capture.mjs v8-film --size 1600x900 --dpr 1.2 --still 2.5
```

The first line it prints is the GPU it got. A `SwiftShader` or `llvmpipe` line means the frames are rendered on the CPU: still correct, just slow. On Linux, `TEARDOWN_ANGLE=vulkan` tries Vulkan instead of the default OpenGL, `TEARDOWN_ANGLE=off` restores Chromium's own choice. When no GPU path gives WebGL at all (a VM, a machine without a GPU), capture switches to the CPU renderer by itself.

## Use

Ask Claude Code in plain words:

> Build me a simulator of a 4-stroke motorcycle engine I can take apart.

> How does a mechanical watch keep time? Show me as a simulator.

> Make a teardown of a hydraulic excavator arm and record a 20-second video of it.

Or open one of the 3 examples first:

```
node sims/build.mjs v8-live          # teardown-out/dist/v8-live.html
node sims/build.mjs cessna-live
node sims/build.mjs strandbeest-live
```

## What is inside

| | |
|---|---|
| `SKILL.md` | What Claude reads: how a machine is built, the rules that make it look right, the review loop. |
| `sims/kit/` | Runtime, stage, shader warm-up. |
| `sims/v8-*`, `sims/cessna-*`, `sims/strandbeest-*` | 3 complete machines. `-shared` is the machine, `-live` the page you drive, `-film` the recorded tour. |
| `sims/build.mjs` | Bundles a machine into one HTML file, three.js and fonts inlined. |
| `sims/capture.mjs` | Renders the film frame by frame to a 60 fps mp4, or to review sheets of stills. |
| `sfx/`, `run_sfx.py` | Procedural sound on the film's timeline, mastered to −14 LUFS. |

## Credits

Built on [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT): the runtime, frame capture, sound engine and review rules come from there. Recorded samples are CC0 from Freesound, prepared by [Barty-Bart/motion-graphics](https://github.com/Barty-Bart/motion-graphics); sources in `sfx/samples/SOURCES.md`.

MIT licence.
