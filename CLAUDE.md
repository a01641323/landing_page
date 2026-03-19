# CLAUDE.md — Landing Page

## Overview
Artist landing page for Matías Hidalgo. Four full-screen sections with Three.js GLSL shader effects,
floating 3D shapes, particle systems, and post-process transitions. Static site — no build step.

## File Map
```
index.html          → 4 sections: Él y ella, Residuos de una voz, Príncipe turquesa, Matías Hidalgo
main.js             → All JS: Three.js scenes, shaders, scroll system, platform switcher, links
style.css           → Layout, fonts, text styles. Section backgrounds transparent (Three.js renders them)
links               → Plain-text file with streaming platform URLs per album
icons/              → Cover art PNGs + platform logos (spotify.png, applemusic.png, amazonmusic.png)
.claude/launch.json → Dev server config
```

## Architecture
- **One shared WebGLRenderer** (alpha:true, antialias:true), fixed canvas at z-index:10, pointer-events:none
- **One PerspectiveCamera** (fov 50, z=5), shared across all sections
- **One scene per section**, only the active section renders each frame
- **Post-process transitions** via WebGLRenderTarget + fullscreen quad with transition ShaderMaterial
- HTML cover images set to opacity:0 (still clickable via pointer-events passthrough)
- Text elements at z-index:20 to appear above canvas

## Performance Detection
```js
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const isLowEnd = navigator.hardwareConcurrency <= 4;
const PERF = { reduced: isMobile || isLowEnd };
```
On PERF.reduced: pixelRatio capped to 1, particle counts reduced 60%, expensive shader passes skipped.

## Sections

### Section 0 — Él y ella
- **Image shader**: Chromatic Dreamscape — RGB channel separation, sine-modulated, mouse-tilted
- **Shapes**: 3 IcosahedronGeometry orbs on Lissajous curves with PointLights
- **Background**: Paint Mist — 200 particles (80 reduced) in Brownian motion, image palette colors
- **Transition out**: Color Shatter — pixelation + hue-rotate + drift

### Section 1 — Residuos de una voz
- **Image shader**: Signal Decay — horizontal noise bands, heartbeat pulse, mouse proximity amplifies
- **Shapes**: 3 triangle meshes with periodic glitch snaps + smooth recovery
- **Background**: Rising Residue — noise-based teal fog shader + red vein pulses
- **Transition out**: VHS Tear — scanline displacement + RGB separation + dropout blocks

### Section 2 — Príncipe turquesa
- **Image shader**: Neon Pulse — turquoise-selective bloom on 3s sine cycle + UV parallax + mesh tilt
- **Shapes**: 3 BoxGeometry cubes (turquoise/gold/silver), rotating on all axes
- **Background**: Digital Grid — perspective grid shader in turquoise + scan pulse
- **Transition out**: Grid Collapse — vertical slices slide down with turquoise afterglow

### Section 3 — Matías Hidalgo
- **Image shader**: Cinema Grain — film grain + vignette + silver ring + UV parallax + circular mask
- **Shapes**: None
- **Background**: Silver Dust — 120 particles (50 reduced) drifting slowly, grey/silver palette
- **Transition out**: None. Idle vignette intensifies over 30s, resets on interaction.

## Shader Uniforms (all sections)
| Uniform | Type | Description |
|---|---|---|
| uTime | float | Elapsed time in seconds |
| uMouse | vec2 | Mouse position, normalized -1 to 1 |
| uTexture | sampler2D | Cover image texture |
| uReduced | float | 1.0 if PERF.reduced, else 0.0 |
| uVignetteStrength | float | Section 3 only — idle vignette intensity |
| uProgress | float | Transition shaders only — 0.0 to 1.0 |
| uResolution | vec2 | Viewport dimensions in pixels |

## Conventions
- Scroll is hijacked: wheel, touch, keyboard all go through `handleScrollIntent(direction)`
- Exit animations play for 700ms before section switch
- Links file parsed at boot, maps album+platform to URLs
- Platform switcher cycles Spotify → Apple Music → Amazon Music
- Cover image clicks open the current platform's URL for that album
- Floating shape clicks logged via Three.js raycasting on window click event
- Visibility API pauses all rendering when tab is hidden
- On resize: renderer, camera, render target, and image planes all update
