# CLAUDE.md — Landing Page

## Overview
Artist landing page for Matías Hidalgo. Lichtenstein minimalism: flat CSS backgrounds, CSS-animated
floating shapes, surgical Three.js for image effects only. Static site — no build step.

## File Map
```
index.html          → 4 sections: Él y ella, Residuos de una voz, Príncipe turquesa, Matías Hidalgo
main.js             → All JS: Three.js scenes, shaders, scroll system, platform switcher, links
style.css           → Layout, fonts, text styles, floating shapes, moon surface
links               → Plain-text file with streaming platform URLs per album
icons/              → Cover art PNGs + platform logos (spotify.png, applemusic.png, amazonmusic.png)
.claude/launch.json → Dev server config
```

## Architecture
- **One shared WebGLRenderer** (alpha:true, pixelRatio always 1), fixed canvas at z-index:10
- **One PerspectiveCamera** (fov 50, z=5), shared across all sections
- **One scene per section**, only active section renders each frame — no post-process
- **Body background-color** = current section's flat color (JS sets it, CSS transitions it)
- HTML cover images opacity:0 for sections 0-2 (Three.js renders them on canvas)
- Section 3 portrait: opacity:1, CSS circular crop (no Three.js image plane)
- Text and shapes at z-index:20-25, above canvas (z-10)
- Platform switcher z-index:1000

## Backgrounds (CSS only, no shaders)
```
Section 0 — #c0392b  (red)
Section 1 — #1a6b5a  (dark teal)
Section 2 — #0d1b2a  (deep navy)
Section 3 — #000000  (black)
```
Body background transitions: `500ms ease` via JS on each navigation.

## Sections

### Section 0 — Él y ella
- **Three.js**: PlaneGeometry + MeshBasicMaterial (no shader). Bob: `sin(t*0.6)*0.08`, tilt: `sin(t*0.4)*0.03`
- **CSS shapes**: 3 circles (56px, border-radius:50%, border:3px solid #000) — amber, green, violet
- **Shadow**: `#shadow-0` fixed element, z-index:12, radial-gradient ellipse, scales with bob via JS

### Section 1 — Residuos de una voz
- **Three.js**: Glitch shader (`FS_GLITCH`) — idle: plain texture; glitch (300ms every 4-7s): scanline shift + RGB split + dropout bands
- **CSS shapes**: 3 triangles (clip-path polygon, drop-shadow border simulation) — red, teal, near-white

### Section 2 — Príncipe turquesa
- **Three.js**: Neon pulse shader (`FS_NEON`) — turquoise color detection + sine pulse. Mouse parallax on imgMesh rotation. Bounce (scale 1→1.04→1) every 5s via setInterval
- **CSS shapes**: 3 squares (52px, border-radius:4px, border:3px solid #000) — turquoise, gold, silver

### Section 3 — Matías Hidalgo
- **Three.js**: 40 star Points in elliptical halo (rx≈1.8, ry≈1.2), rotating 0.002 rad/frame
- **CSS**: Circular portrait (220px/38vh, border-radius:50%), moon-surface ellipse below it
- **Mouse parallax**: portrait moves ±6px via CSS transform (JS mousemove handler)

## Transitions
CSS Star Wars tilt (no Three.js):
1. Current inner: `rotateX(±25deg) translateZ(-60px)`, opacity→0 (450ms ease-in)
2. At 225ms: snap wrapper translateY, swap section, body bg crossfades
3. New inner: tilts in from opposite angle to 0 (450ms ease-out)

## Shader Uniforms
| Shader | Uniforms |
|---|---|
| FS_GLITCH (s1) | uTime, uTexture, uGlitch (0/1) |
| FS_NEON (s2)   | uTime, uTexture |

## Floating Shapes
- CSS `position:absolute` inside `.section-inner`, z-index:25
- Keyframe animations: `float-a` (12-23s), `float-b`, `float-c` — translate only
- Hover: CSS `--s: 1.1` variable used inside keyframes for composable scale
- Click: `console.log('button', sectionIndex, buttonIndex)` via JS event listener

## Conventions
- Scroll hijacked: wheel, touch, keyboard → `handleScrollIntent(direction)`
- `playTiltTransition(from, to, direction)` handles all navigation
- Debounce: `isTransitioning` flag + `DEBOUNCE_MS=750`
- Links file parsed at boot, maps album+platform to URLs
- Platform switcher cycles Spotify → Apple Music → Amazon Music
- Cover image clicks open current platform URL for that album
- Visibility API pauses rAF when tab hidden
- Resize: renderer, camera, image plane geometries updated
