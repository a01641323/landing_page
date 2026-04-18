/*
 * Matías Hidalgo — Landing Page
 * Lichtenstein Minimalism: flat colors, CSS shapes, surgical Three.js
 */

// ═══════════════════════════════════════════════════════════
// PERFORMANCE
// ═══════════════════════════════════════════════════════════

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const PERF = { reduced: isMobile || (navigator.hardwareConcurrency || 8) <= 4 };

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

const SECTION_COUNT = 4;

// Spring physics — hybrid snappy + breathing (settle ~570ms, ~2% overshoot)
const SPRING_STIFF    = 280;
const SPRING_DAMP     = 26;
const BG_SPRING_STIFF = 180;   // background color trails the slide (~800ms)
const BG_SPRING_DAMP  = 28;

// Commit thresholds
const COMMIT_DRAG_RATIO  = 0.30;
const COMMIT_VEL_PX_MS   = 0.6;

// Anti-skip
const POST_COMMIT_LOCKOUT_MS = 400;
const WHEEL_IDLE_GATE_MS     = 80;
const WHEEL_RELEASE_IDLE_MS  = 120;

let currentSection = 0;

// Active slide — null when idle
let interSlide = null;
/*
  interSlide = {
    fromIdx, toIdx, direction,    // direction: +1 fwd / -1 back
    dragPx,                       // 0..vh, screen px toward destination
    velocity,                     // px/ms, smoothed (for release decision)
    state,                        // 'dragging' | 'releasing'
    springTarget,                 // 0 (cancel) | vh (commit)
    swapped,                      // bool: currentSection already toIdx
    bgLerp, bgVel,                // 0..1, background color crossfade spring
    lastFrameTime, lastInputTime,
  }
*/

let lockoutUntil       = 0;        // performance.now() until which wheel is ignored
let wheelLastEventTime = 0;        // for idle gate after lockout
let wheelIdleTimer     = null;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}
function lerpColor(a, b, t) {
  return `rgb(${Math.round((a[0] + (b[0]-a[0])*t)*255)},` +
             `${Math.round((a[1] + (b[1]-a[1])*t)*255)},` +
             `${Math.round((a[2] + (b[2]-a[2])*t)*255)})`;
}
const _bgRgb = {};
function getBgRgb(idx) {
  if (!_bgRgb[idx]) _bgRgb[idx] = hexRgb(sectionBg[idx]);
  return _bgRgb[idx];
}

const wrapper = document.getElementById('sections-wrapper');

// Flat section background colors
const sectionBg = ['#c0392b', '#1a6b5a', '#0d1b2a', '#000000'];

// ═══════════════════════════════════════════════════════════
// MOUSE
// ═══════════════════════════════════════════════════════════

const mouse = { x: 0, y: 0 };
let lastInteraction = Date.now();

// Section 3: parallax stored here, combined with bob in update()
const s3Parallax = { x: 0, y: 0 };

window.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  lastInteraction = Date.now();
  if (currentSection === 3) {
    s3Parallax.x = -mouse.x * 6;
    s3Parallax.y = -mouse.y * 6;
  }
});

window.addEventListener('touchstart', () => { lastInteraction = Date.now(); }, { passive: true });

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', e => {
    mouse.x = Math.max(-1, Math.min(1, (e.gamma || 0) / 30));
    mouse.y = Math.max(-1, Math.min(1, -(e.beta  || 0) / 30));
    lastInteraction = Date.now();
  });
}

// ═══════════════════════════════════════════════════════════
// LINKS PARSER
// ═══════════════════════════════════════════════════════════

let links = {};

async function parseLinks() {
  try {
    const res = await fetch('./links');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    let currentKey = null;
    text.split('\n').forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;
      if (!line.startsWith('Spotify') && !line.startsWith('Apple') && !line.startsWith('Amazon') && line.endsWith(':')) {
        currentKey = line.slice(0, -1).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '');
        links[currentKey] = {};
        return;
      }
      if (!currentKey) return;
      if (line.startsWith('Spotify:'))              links[currentKey].spotify      = line.slice(8).trim();
      else if (line.startsWith('Apple Music:'))     links[currentKey].applemusic   = line.slice(12).trim();
      else if (line.startsWith('Amazon Music:'))    links[currentKey].amazon       = line.slice(13).trim();
      else if (line.startsWith('YouTube Music:'))   links[currentKey].youtubemusic = line.slice(15).trim();
    });
  } catch (err) {
    console.warn('[links]', err);
  }
}

const sectionAlbums = ['elyella', 'residuosdeunavoz', 'principeturquesa', 'matiashidalgo'];

// ═══════════════════════════════════════════════════════════
// PLATFORM SWITCHER
// ═══════════════════════════════════════════════════════════

const platforms = [
  { id: 'spotify',      icon: 'icons/spotify.webp',      label: 'Spotify' },
  { id: 'applemusic',   icon: 'icons/applemusic.webp',   label: 'Apple Music' },
  { id: 'amazon',       icon: 'icons/amazonmusic.webp',  label: 'Amazon Music' },
  { id: 'youtubemusic', icon: 'icons/youtubemusic.webp', label: 'YouTube Music' },
];

const sectionAccents = ['#f39c12', '#48c9b0', '#00d4d4', '#b0b8c1'];

let activePlatformIndex = 0;
let activePlatform      = platforms[0].id;
let menuOpen            = false;

const switcher    = document.getElementById('platform-switcher');
const platformImg = document.getElementById('platform-logo');
const satellites  = document.querySelectorAll('.platform-satellite');

// Arco de satélites: radio = botón + 28px, ángulos 10°/46°/82°/90°
// x = -r·cos(θ) + off,  y = r·sin(θ) + off
// off = (btnSize - satSize) / 2  → centra el arco en el botón
function getSatPositions() {
  const btnSize = window.innerWidth >= 768 ? 56 : 48;
  const satSize = 40;
  const off = (btnSize - satSize) / 2;
  const r   = btnSize + 28;
  return [10, 46, 82, 90].map(deg => ({
    x: -(r * Math.cos(deg * Math.PI / 180)) + off,
    y:   r * Math.sin(deg * Math.PI / 180)  + off,
  }));
}

function updatePlatformUI() {
  const p = platforms[activePlatformIndex];
  platformImg.src = p.icon;
  platformImg.alt = p.label;
  platformImg.dataset.platform = p.id;
  switcher.style.boxShadow = '';
}

function updateSatelliteIcons() {
  const others = platforms
    .map((p, i) => ({ ...p, index: i }))
    .filter(p => p.index !== activePlatformIndex);

  satellites.forEach((sat, i) => {
    const platform = others[i];
    if (!platform) { sat.style.display = 'none'; return; }
    sat.style.display = '';
    const img = sat.querySelector('img');
    img.src = platform.icon;
    img.alt = platform.label;
    img.dataset.platform = platform.id;
    sat.dataset.index = platform.index;
  });
}

function openMenu() {
  if (menuOpen) return;
  // One-time peek: satellites start already open, then retract after a moment
  updateSatelliteIcons();
  menuOpen = true;
  const peekPositions = getSatPositions();
  satellites.forEach((sat, i) => {
    const pos = peekPositions[i];
    setTimeout(() => {
      sat.style.transform = `translate(${pos.x}px, ${pos.y}px) scale(1)`;
      sat.classList.add('visible');
    }, i * 40);
  });
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  switcher.style.boxShadow = '';
  satellites.forEach((sat, i) => {
    setTimeout(() => {
      sat.style.transform = `translate(0px, 0px) scale(0.5)`;
      sat.classList.remove('visible');
    }, i * 30);
  });
}

function selectPlatform(index) {
  activePlatformIndex = index;
  activePlatform      = platforms[index].id;
  platformImg.style.opacity = '0';
  setTimeout(() => { updatePlatformUI(); platformImg.style.opacity = '1'; }, 120);
  closeMenu();
}

switcher.addEventListener('click', e => {
  e.stopPropagation();
  menuOpen ? closeMenu() : openMenu();
});

satellites.forEach(sat => {
  sat.addEventListener('click', e => {
    e.stopPropagation();
    const index = parseInt(sat.dataset.index, 10);
    selectPlatform(index);
  });
});

document.addEventListener('click', e => {
  if (menuOpen && !e.target.closest('#platform-switcher-group')) closeMenu();
});

switcher.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switcher.click(); }
  if (e.key === 'Escape') closeMenu();
});

// ═══════════════════════════════════════════════════════════
// IMAGE CLICK → OPEN LINK
// ═══════════════════════════════════════════════════════════

document.querySelectorAll('.cover-image').forEach(img => {
  img.addEventListener('click', () => {
    const sIdx  = parseInt(img.dataset.section, 10);
    const album = sectionAlbums[sIdx];
    const url   = links[album]?.[activePlatform];
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else console.warn(`[links] No URL for album="${album}" platform="${activePlatform}"`);
  });
});

// ═══════════════════════════════════════════════════════════
// CSS FLOATING SHAPES — CLICK HANDLERS
// ═══════════════════════════════════════════════════════════

document.querySelectorAll('.floating-btn').forEach(btn => {
  const sectionId = btn.closest('.section').id;
  const section   = parseInt(sectionId.split('-')[1], 10);
  if (section === 0 || section === 2) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const btnIdx = parseInt(btn.dataset.btn, 10);
    console.log('button', section, btnIdx);
  });
});

// ═══════════════════════════════════════════════════════════
// THREE.JS SHADERS
// ═══════════════════════════════════════════════════════════

const VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Rounded rectangle mask — smooth alpha via fwidth() for anti-aliased edges
const GLSL_ROUND = `
float roundCornersAlpha(vec2 uv, float r) {
  vec2 d = abs(uv - 0.5) - (0.5 - r);
  float dist = length(max(d, 0.0)) - r;
  float fw = fwidth(dist);
  return 1.0 - smoothstep(-fw, fw, dist);
}`;

// Section 0 — Ink bleed: idle plain, triggered: organic UV warp + soft color bleed
const FS_INK_BLEED = `
uniform float uTime;
uniform sampler2D uTexture;
uniform float uInkBleed;
uniform vec3  uHighlight;
uniform float uHighlightStrength;
varying vec2 vUv;
${GLSL_ROUND}

// Detecta qué tan parecido es un píxel al color objetivo.
// Compara en espacio RGB normalizado — tolerancia de 0.0 a 1.0.
float colorMatch(vec3 pixel, vec3 target, float tolerance) {
  // Normalizar ambos para comparar tono independientemente del brillo
  float pLen = length(pixel);
  float tLen = length(target);
  if (pLen < 0.05 || tLen < 0.05) return 0.0;  // negro → no matchea
  vec3 pNorm = pixel / pLen;
  vec3 tNorm = target / tLen;
  float dotPT = dot(pNorm, tNorm);
  // dotPT va de -1 (opuesto) a 1 (idéntico)
  // Convertir a match [0,1] con suavizado
  return smoothstep(1.0 - tolerance, 1.0, dotPT);
}

void main() {
  float alpha = roundCornersAlpha(vUv, 0.015);
  vec2 uv = vUv;

  // Ink bleed: UV warp orgánico (sin cambios)
  if (uInkBleed > 0.5) {
    float w1 = sin(uv.y * 9.0  + uTime * 2.3) * 0.006;
    float w2 = sin(uv.x * 7.0  + uTime * 1.8) * 0.004;
    float w3 = cos(uv.y * 13.0 - uv.x * 5.0 + uTime * 3.1) * 0.003;
    uv.x += w1 + w3;
    uv.y += w2 - w3 * 0.5;
    float r = texture2D(uTexture, uv + vec2( 0.003,  0.001)).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv + vec2(-0.002, -0.001)).b;
    gl_FragColor = vec4(r, g, b, alpha);
    return;
  }

  // Color base de la imagen
  vec4 base = texture2D(uTexture, uv);

  // Si no hay highlight activo, renderizar normal
  if (uHighlightStrength < 0.01) {
    gl_FragColor = vec4(base.rgb, base.a * alpha);
    return;
  }

  // Detectar píxeles que pertenecen al color objetivo
  // tolerance: 0.22 = solo coincidencias claras, sin falsos positivos
  float match = colorMatch(base.rgb, uHighlight, 0.22);

  // Boost del color objetivo: mezcla hacia versión más brillante/saturada
  vec3 boosted = mix(base.rgb, uHighlight * 1.6, match * 0.55);

  // El resto de la imagen se oscurece ligeramente para que resalte el color
  vec3 dimmed = mix(base.rgb, base.rgb * 0.82, (1.0 - match) * 0.35);

  // Combinar según match
  vec3 highlighted = mix(dimmed, boosted, match);

  // Transición suave entre normal y highlight según uHighlightStrength
  vec3 finalColor = mix(base.rgb, highlighted, uHighlightStrength);

  gl_FragColor = vec4(finalColor, base.a * alpha);
}`;

// Section 1 — Glitch Signal
const FS_GLITCH = `
uniform float uTime;
uniform sampler2D uTexture;
uniform float uGlitch;
varying vec2 vUv;
${GLSL_ROUND}
void main() {
  float alpha = roundCornersAlpha(vUv, 0.015);
  vec2 uv = vUv;
  if (uGlitch > 0.5) {
    float shift = sin(uv.y * 50.0 + uTime * 20.0) * 0.015;
    uv.x += shift;
    float b1 = step(0.996, fract(sin(uTime * 7.3 + floor(uv.y * 100.0)) * 43758.5));
    float b2 = step(0.994, fract(sin(uTime * 13.1 + floor(uv.y * 80.0)) * 17231.0));
    if (b1 + b2 > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, alpha); return; }
    float r = texture2D(uTexture, uv + vec2(0.008, 0.0)).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - vec2(0.008, 0.0)).b;
    gl_FragColor = vec4(r, g, b, alpha);
  } else {
    gl_FragColor = texture2D(uTexture, uv);
    gl_FragColor.a *= alpha;
  }
}`;

// Section 2 — Pixel Breathe: idle neon flicker, triggered: pixelation breathes in/out
const FS_PIXEL_BREATHE = `
uniform float uTime;
uniform sampler2D uTexture;
uniform float uPixelBreathe;
varying vec2 vUv;
${GLSL_ROUND}

void main() {
  float alpha = roundCornersAlpha(vUv, 0.015);
  vec2 uv = vUv;

  // Pixel breathe trigger — sin cambios
  if (uPixelBreathe > 0.5) {
    float breathe = 0.5 + 0.5 * sin(uTime * 5.0);
    float pixCount = mix(180.0, 80.0, breathe);
    uv = floor(uv * pixCount) / pixCount;
  }

  vec4 color = texture2D(uTexture, uv);

  // Detector de píxeles turquesa/cyan:
  // alto en G y B, bajo en R — igual que antes
  float isT = step(0.55, color.g)
            * step(0.55, color.b)
            * (1.0 - step(0.30, color.r));

  // ── Señal de foco fundiéndose ─────────────────────────────
  // Combinación de senos con frecuencias primas → cadencia impredecible
  // s1: oscilación lenta de fondo (el "respiro" base del foco)
  float s1 = sin(uTime * 1.3);
  // s2: temblor medio (inestabilidad eléctrica)
  float s2 = sin(uTime * 3.7) * 0.6;
  // s3: micro-parpadeo rápido (contacto flojo)
  float s3 = sin(uTime * 11.0) * 0.25;
  // s4: spike ocasional de alta frecuencia (descarga)
  float s4 = sin(uTime * 23.0) * 0.15;

  // Señal combinada: suma en [-1, 1], luego normalizar a [0, 1]
  float flicker = (s1 + s2 + s3 + s4) / (1.0 + 0.6 + 0.25 + 0.15);
  flicker = flicker * 0.5 + 0.5;

  // Apagón: cuando la señal baja mucho, el foco se apaga casi del todo
  // pow() hace que los valles sean más profundos (más tiempo apagado)
  // y los picos más cortos (destellos breves)
  flicker = pow(flicker, 2.2);

  // Clamp para seguridad
  flicker = clamp(flicker, 0.0, 1.0);

  // Aplicar parpadeo solo a los píxeles turquesa
  // En los picos: el color turquesa se amplifica hacia blanco brillante
  // En los valles: el color turquesa se oscurece casi a negro
  vec3 tColor = vec3(0.0, 0.83, 0.83); // #00d4d4 — el turquesa base
  vec3 bright = mix(tColor * 0.05, tColor * 3.2, flicker); // oscuro → sobre-expuesto

  // Mezclar: los píxeles turquesa reciben el parpadeo,
  // el resto de la imagen queda intacto
  color.rgb = mix(color.rgb, bright, isT * 1.0);

  color.a *= alpha;
  gl_FragColor = color;
}`;

// ═══════════════════════════════════════════════════════════
// THREE.JS GLOBALS
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('three-canvas');
let renderer, camera, rafId;
const sections = {};
const textureLoader = new THREE.TextureLoader();

function lerp(a, b, t) { return a + (b - a) * t; }

function worldDims() {
  const vFov = camera.fov * Math.PI / 180;
  const h = 2 * Math.tan(vFov / 2) * camera.position.z;
  return { w: h * camera.aspect, h };
}

function imgSize(_idx) {
  const d = worldDims();
  const mob = window.innerWidth < 768;
  return mob ? 0.72 * d.w : Math.min(0.55 * d.h, 0.55 * d.w);
}

// ═══════════════════════════════════════════════════════════
// SECTION 0 — ÉL Y ELLA: floating bob, no shader
// ═══════════════════════════════════════════════════════════

function buildSection0(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(0);

  // Colores a resaltar por turno — extraídos de la imagen
  const HIGHLIGHT_COLORS = [
    [0.85, 0.82, 0.08],   // amarillo — sol, corona
    [0.85, 0.12, 0.10],   // rojo     — círculo, vestidos
    [0.10, 0.72, 0.18],   // verde    — pasto, corona
    [0.55, 0.10, 0.75],   // morado   — tonos violeta
    [0.90, 0.45, 0.08],   // naranja  — pétalos del sol
  ];

  const HIGHLIGHT_DURATION = 2.2;
  const HIGHLIGHT_FADE     = 0.5;

  const imgUniforms = {
    uTime:              { value: 0 },
    uTexture:           { value: texture },
    uInkBleed:          { value: 0.0 },
    uHighlight:         { value: new THREE.Vector3(0.85, 0.82, 0.08) },
    uHighlightStrength: { value: 0.0 },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS_INK_BLEED,
      uniforms: imgUniforms,
      transparent: true,
      extensions: { derivatives: true },
    })
  );
  scene.add(imgMesh);
  imgMesh.position.y = 0.18;


  sections[0] = {
    scene, imgMesh,
    update(t) {
      // ── Color highlight rotation ──────────────────────────
      const cycleDuration = HIGHLIGHT_DURATION + HIGHLIGHT_FADE * 2;
      const totalCycle    = cycleDuration * HIGHLIGHT_COLORS.length;
      const tMod          = t % totalCycle;
      const colorIdx      = Math.floor(tMod / cycleDuration);
      const tInCycle      = tMod % cycleDuration;

      let strength = 0.0;
      if (tInCycle < HIGHLIGHT_FADE) {
        strength = tInCycle / HIGHLIGHT_FADE;
      } else if (tInCycle < HIGHLIGHT_FADE + HIGHLIGHT_DURATION) {
        strength = 1.0;
      } else {
        strength = 1.0 - (tInCycle - HIGHLIGHT_FADE - HIGHLIGHT_DURATION) / HIGHLIGHT_FADE;
      }

      const c = HIGHLIGHT_COLORS[colorIdx % HIGHLIGHT_COLORS.length];
      imgUniforms.uHighlight.value.set(c[0], c[1], c[2]);
      imgUniforms.uHighlightStrength.value = Math.max(0.0, Math.min(1.0, strength));

      imgUniforms.uTime.value = t;
      imgMesh.position.y = 0.18 + Math.sin(t * 0.6) * 0.08;
      imgMesh.rotation.z = Math.sin(t * 0.4) * 0.03;
      // Sync depth shadow with bob — blur/opacity breathe with vertical position
      const shadowEl = document.getElementById('cover-0-shadow');
      if (shadowEl) {
        const bobVal  = Math.sin(t * 0.6);        // -1 to 1
        const blur    = 40 + bobVal * 15;          // 25px → 55px
        const opacity = 0.55 - bobVal * 0.1;       // 0.45 → 0.65
        const offY    = 20 + bobVal * 8;           // 12px → 28px
        shadowEl.style.boxShadow =
          `0 ${offY.toFixed(0)}px ${blur.toFixed(0)}px rgba(0,0,0,${opacity.toFixed(2)}),` +
          ` 0 8px 20px rgba(0,0,0,0.3)`;
        // Follow the image's vertical bob + static Y offset
        const pxPerUnit = window.innerHeight / worldDims().h;
        const totalOffsetPx = (0.18 + Math.sin(t * 0.6) * 0.08) * pxPerUnit;
        const tiltDeg = Math.sin(t * 0.4) * 0.03 * (180 / Math.PI);
        shadowEl.style.transform = `translate(-50%, calc(-50% - ${totalOffsetPx.toFixed(1)}px)) rotate(${(-tiltDeg).toFixed(3)}deg)`;
      }
    },
  };
}

// ── Section 1 ripple — tuning parameters ─────────────────────
const RIPPLE_SPEED    = 0.08;
const RIPPLE_FREQ     = 9.0;
const RIPPLE_DAMP     = 1.2;
const RIPPLE_DECAY    = 0.18;
const RIPPLE_INTERVAL = 2.2;
const RIPPLE_COUNT    = 3;

// ── Water color palette ───────────────────────────────────────
const COLOR_DEEP      = [0.082, 0.380, 0.318];
const COLOR_CREST     = [0.28,  0.79,  0.69];
const SPEC_COLOR      = [0.55,  0.95,  0.85];
const SPEC_STRENGTH   = 0.55;

// Grosor de cada línea de onda — 0.02 muy fina, 0.06 gruesa
const RIPPLE_LINE_WIDTH = 0.035;

const VS_RIPPLE = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FS_RIPPLE = `
uniform float uTime;
uniform vec2  uAspect;
uniform vec2  uImpacts[${RIPPLE_COUNT}];
uniform float uBirths[${RIPPLE_COUNT}];
uniform float uSpeed;
uniform float uFreq;
uniform float uDamp;
uniform float uDecay;
uniform float uLineWidth;
uniform vec3  uColorDeep;
uniform vec3  uColorCrest;
uniform vec3  uSpecColor;
uniform float uSpecStrength;

varying vec2 vUv;

void main() {
  // Corregir UV por aspect ratio para que los anillos sean circulares
  vec2 uv = vUv;
  float aspect = uAspect.x / uAspect.y;
  uv.x *= aspect;

  float totalLine  = 0.0;
  float totalWeight = 0.0;

  for (int i = 0; i < ${RIPPLE_COUNT}; i++) {
    float age = uTime - uBirths[i];
    if (age < 0.0) continue;

    vec2 impact = uImpacts[i];
    impact.x *= aspect;

    float dist = length(uv - impact);

    // Frente de onda: la onda no existe más allá de donde ha llegado
    float waveFront = age * uSpeed;
    if (dist > waveFront + 0.5) continue;

    // Amortiguación espacial y temporal
    float spatialDamp = exp(-dist * uDamp);
    float timeDamp    = exp(-age  * uDecay);
    float envelope    = spatialDamp * timeDamp;

    // Fase de la onda en este punto
    float phase = dist * uFreq - age * uSpeed * uFreq;

    // fract() produce dientes de sierra [0,1]
    // Centramos en 0.5 para tener el pico en el centro del diente
    float f = fract(phase);

    // smoothstep estrecho alrededor de 0.5 → línea nítida
    float line = 1.0 - smoothstep(0.0, uLineWidth, abs(f - 0.5));

    // Aplicar envelope para que las líneas se desvanezcan con distancia/edad
    line *= envelope;

    totalLine   += line;
    totalWeight += envelope;
  }

  // Normalizar y saturar
  float w = totalWeight > 0.0 ? totalLine / max(totalWeight, 0.001) : 0.0;
  w = clamp(w, 0.0, 1.0);

  // Color: fondo oscuro → crest en las líneas
  vec3 color = mix(uColorDeep, uColorCrest, w);

  // Specular: destello brillante en el pico de cada línea
  float spec = pow(w, 3.0) * uSpecStrength;
  color = mix(color, uSpecColor, spec);

  // Máscara radial circular: corrige aspect ratio para que sea círculo perfecto
  // maxSafeDist = distancia al borde más cercano desde el centro (top/bottom en landscape, left/right en portrait)
  vec2 centerAspect = vec2(0.5 * aspect, 0.5);
  float distFromCenter = length(uv - centerAspect);
  float maxSafeDist = min(aspect * 0.5, 0.5);
  float fadeRadius = maxSafeDist * 0.75;
  float fade = 1.0 - smoothstep(fadeRadius * 0.55, fadeRadius, distFromCenter);

  gl_FragColor = vec4(color, fade);
}`;

// ═══════════════════════════════════════════════════════════
// SECTION 1 — RESIDUOS DE UNA VOZ: glitch shader
// ═══════════════════════════════════════════════════════════

function buildSection1(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(1);

  // ── Water ripple background ───────────────────────────────
  const impactPositions = [];
  const impactBirths    = [];
  for (let i = 0; i < RIPPLE_COUNT; i++) {
    impactPositions.push(0.5, 0.5);
    impactBirths.push(-(i * RIPPLE_INTERVAL));
  }

  const rippleUniforms = {
    uTime:         { value: 0 },
    uAspect:       { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uImpacts:      { value: impactPositions },
    uBirths:       { value: impactBirths },
    uSpeed:        { value: RIPPLE_SPEED },
    uFreq:         { value: RIPPLE_FREQ },
    uDamp:         { value: RIPPLE_DAMP },
    uDecay:        { value: RIPPLE_DECAY },
    uLineWidth:    { value: RIPPLE_LINE_WIDTH },
    uColorDeep:    { value: new THREE.Vector3(...COLOR_DEEP) },
    uColorCrest:   { value: new THREE.Vector3(...COLOR_CREST) },
    uSpecColor:    { value: new THREE.Vector3(...SPEC_COLOR) },
    uSpecStrength: { value: SPEC_STRENGTH },
  };

  const wd = worldDims();
  const rippleMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(wd.w * 2.2, wd.h * 2.2),
    new THREE.ShaderMaterial({
      vertexShader:   VS_RIPPLE,
      fragmentShader: FS_RIPPLE,
      uniforms:       rippleUniforms,
      transparent:    true,
    })
  );
  rippleMesh.position.z = -1;
  scene.add(rippleMesh);

  let nextImpactIdx  = 0;
  let lastImpactTime = 0;

  const imgUniforms = {
    uTime:    { value: 0 },
    uTexture: { value: texture },
    uGlitch:  { value: 0.0 },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_GLITCH, uniforms: imgUniforms, transparent: true, extensions: { derivatives: true } })
  );
  scene.add(imgMesh);
  imgMesh.position.y = 0.18;

  function scheduleGlitch() {
    setTimeout(() => {
      imgUniforms.uGlitch.value = 1.0;
      setTimeout(() => {
        imgUniforms.uGlitch.value = 0.0;
        scheduleGlitch();
      }, 300);
    }, 4000 + Math.random() * 3000);
  }
  scheduleGlitch();

  sections[1] = {
    scene, imgMesh,
    update(t) {
      // ── Water ripple update ───────────────────────────────
      rippleUniforms.uTime.value = t;

      const wdims = worldDims();
      rippleMesh.scale.set(
        wdims.w * 2.2 / (wd.w * 2.2),
        wdims.h * 2.2 / (wd.h * 2.2),
        1
      );

      rippleUniforms.uAspect.value.set(window.innerWidth, window.innerHeight);

      if (t - lastImpactTime > RIPPLE_INTERVAL) {
        impactPositions[nextImpactIdx * 2]     = 0.5;
        impactPositions[nextImpactIdx * 2 + 1] = 0.5;
        impactBirths[nextImpactIdx]             = t;
        rippleUniforms.uImpacts.value = impactPositions;
        rippleUniforms.uBirths.value  = impactBirths;
        nextImpactIdx  = (nextImpactIdx + 1) % RIPPLE_COUNT;
        lastImpactTime = t;
      }

      imgUniforms.uTime.value = t;
      imgMesh.position.y = 0.18 + Math.sin(t * 0.6) * 0.08;
      imgMesh.rotation.z = Math.sin(t * 0.4) * 0.03;
      const shadowEl = document.getElementById('cover-1-shadow');
      if (shadowEl) {
        const bobVal  = Math.sin(t * 0.6);
        const blur    = 40 + bobVal * 15;
        const opacity = 0.55 - bobVal * 0.1;
        const offY    = 20 + bobVal * 8;
        shadowEl.style.boxShadow =
          `0 ${offY.toFixed(0)}px ${blur.toFixed(0)}px rgba(0,0,0,${opacity.toFixed(2)}),` +
          ` 0 8px 20px rgba(0,0,0,0.3)`;
        const pxPerUnit  = window.innerHeight / worldDims().h;
        const totalOffsetPx = (0.18 + Math.sin(t * 0.6) * 0.08) * pxPerUnit;
        const tiltDeg    = Math.sin(t * 0.4) * 0.03 * (180 / Math.PI);
        shadowEl.style.transform = `translate(-50%, calc(-50% - ${totalOffsetPx.toFixed(1)}px)) rotate(${(-tiltDeg).toFixed(3)}deg)`;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════
// SECTION 2 — PRÍNCIPE TURQUESA: neon pulse + mouse parallax
// ═══════════════════════════════════════════════════════════

function buildSection2(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(2);

  const imgUniforms = {
    uTime:         { value: 0 },
    uTexture:      { value: texture },
    uPixelBreathe: { value: 0.0 },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_PIXEL_BREATHE, uniforms: imgUniforms, transparent: true, extensions: { derivatives: true } })
  );
  scene.add(imgMesh);
  imgMesh.position.y = 0.18;


  sections[2] = {
    scene, imgMesh,
    update(t) {
      // ── Sincronizar brillo de coronas con parpadeo del shader ──
      // Mismas frecuencias que s1-s4 en FS_PIXEL_BREATHE
      const s1 = Math.sin(t * 1.3);
      const s2 = Math.sin(t * 3.7) * 0.6;
      const s3 = Math.sin(t * 11.0) * 0.25;
      const s4 = Math.sin(t * 23.0) * 0.15;
      let flicker = (s1 + s2 + s3 + s4) / (1.0 + 0.6 + 0.25 + 0.15);
      flicker = flicker * 0.5 + 0.5;
      flicker = Math.pow(flicker, 2.2);
      flicker = Math.max(0, Math.min(1, flicker));

      // Interpolar brillo de los drop-shadows entre apagado y encendido
      const crowns = document.querySelectorAll('#section-2 .floating-btn');
      crowns.forEach(el => {
        const o1 = (0.05 + flicker * 1.0).toFixed(2);  // 0.05 → 1.05
        const o2 = (0.0  + flicker * 0.9).toFixed(2);  // 0.0  → 0.9
        const o3 = (0.0  + flicker * 0.55).toFixed(2); // 0.0  → 0.55
        el.style.filter =
          `drop-shadow(0 0 4px rgba(176,184,193,${o1}))` +
          ` drop-shadow(0 0 12px rgba(176,184,193,${o2}))` +
          ` drop-shadow(0 0 26px rgba(176,184,193,${o3}))`;
      });
      imgUniforms.uTime.value = t;
      imgMesh.position.y = 0.18 + Math.sin(t * 0.6) * 0.08;
      imgMesh.rotation.z = Math.sin(t * 0.4) * 0.03;
      const shadowEl = document.getElementById('cover-2-shadow');
      if (shadowEl) {
        const bobVal  = Math.sin(t * 0.6);
        const blur    = 40 + bobVal * 15;
        const opacity = 0.55 - bobVal * 0.1;
        const offY    = 20 + bobVal * 8;
        shadowEl.style.boxShadow =
          `0 ${offY.toFixed(0)}px ${blur.toFixed(0)}px rgba(0,0,0,${opacity.toFixed(2)}),` +
          ` 0 8px 20px rgba(0,0,0,0.3)`;
        const pxPerUnit  = window.innerHeight / worldDims().h;
        const totalOffsetPx = (0.18 + Math.sin(t * 0.6) * 0.08) * pxPerUnit;
        const tiltDeg    = Math.sin(t * 0.4) * 0.03 * (180 / Math.PI);
        shadowEl.style.transform = `translate(-50%, calc(-50% - ${totalOffsetPx.toFixed(1)}px)) rotate(${(-tiltDeg).toFixed(3)}deg)`;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════
// SECTION 3 — MATÍAS HIDALGO: waveform + stars (portrait is CSS)
// ═══════════════════════════════════════════════════════════

function buildSection3() {
  const scene = new THREE.Scene();

  // ── Stars (60, small, slow) ──────────────────────────────
  const starCanvas = document.createElement('canvas');
  starCanvas.width = 64; starCanvas.height = 64;
  const ctx = starCanvas.getContext('2d');
  const cxS = 32, cyS = 32, r1 = 28, r2 = 8;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI / 4) - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    ctx.lineTo(cxS + r * Math.cos(a), cyS + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = 'white';
  ctx.fill();
  const starTex = new THREE.CanvasTexture(starCanvas);

  const count = 60;
  const base  = new Float32Array(count * 3);
  const phase = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    base[i * 3]     = (Math.random() - 0.5) * 5.6;
    base[i * 3 + 1] = (Math.random() - 0.5) * 4.8;
    base[i * 3 + 2] = 0;
    phase[i * 2]     = Math.random() * Math.PI * 2;
    phase[i * 2 + 1] = Math.random() * Math.PI * 2;
  }
  const pos = base.slice();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starPoints = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.035, transparent: true, opacity: 0.25,
    sizeAttenuation: true, map: starTex, alphaTest: 0.05,
  }));
  scene.add(starPoints);

  // ── Background starfield — many small dim points ──────────
  const bgCount = 180;
  const bgBase  = new Float32Array(bgCount * 3);
  const bgGeo   = new THREE.BufferGeometry();
  for (let i = 0; i < bgCount; i++) {
    bgBase[i * 3]     = (Math.random() - 0.5) * 7.0;
    bgBase[i * 3 + 1] = (Math.random() - 0.5) * 6.0;
    bgBase[i * 3 + 2] = -0.3;
  }
  bgGeo.setAttribute('position', new THREE.BufferAttribute(bgBase.slice(), 3));
  const bgStarPoints = new THREE.Points(bgGeo, new THREE.PointsMaterial({
    color: 0xaabbcc,
    size: 0.018,
    transparent: true,
    opacity: 0.35,
    sizeAttenuation: true,
  }));
  scene.add(bgStarPoints);

  // ── Mid-layer stars — medium, slightly brighter ────────────
  const midCount = 55;
  const midBase  = new Float32Array(midCount * 3);
  const midPhase = new Float32Array(midCount);
  const midGeo   = new THREE.BufferGeometry();
  for (let i = 0; i < midCount; i++) {
    midBase[i * 3]     = (Math.random() - 0.5) * 6.0;
    midBase[i * 3 + 1] = (Math.random() - 0.5) * 5.5;
    midBase[i * 3 + 2] = -0.1;
    midPhase[i] = Math.random() * Math.PI * 2;
  }
  midGeo.setAttribute('position', new THREE.BufferAttribute(midBase.slice(), 3));
  const midStarPoints = new THREE.Points(midGeo, new THREE.PointsMaterial({
    color: 0xddeeff,
    size: 0.028,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
  }));
  scene.add(midStarPoints);

  // ── Portrait reference ────────────────────────────────────
  const portrait = document.getElementById('portrait-frame');

  sections[3] = {
    scene, imgMesh: null,
    onEnter() {},
    update(t) {
      // Stars drift — very slowly (0.5× multiplier)
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        arr[i * 3]     = base[i * 3]     + Math.sin(t * 0.04 + phase[i * 2])     * 0.10;
        arr[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 0.03 + phase[i * 2 + 1]) * 0.08;
      }
      geo.attributes.position.needsUpdate = true;

      // Mid-layer stars twinkle — opacity breathes slowly
      const midArr = midGeo.attributes.position.array;
      for (let i = 0; i < midCount; i++) {
        midArr[i * 3]     = midBase[i * 3]     + Math.sin(t * 0.04 + midPhase[i]) * 0.06;
        midArr[i * 3 + 1] = midBase[i * 3 + 1] + Math.cos(t * 0.03 + midPhase[i]) * 0.05;
      }
      midGeo.attributes.position.needsUpdate = true;
      // Twinkle via opacity
      midStarPoints.material.opacity = 0.4 + Math.sin(t * 0.7) * 0.15;

      // Portrait parallax
      if (portrait && currentSection === 3) {
        const px = -mouse.x * 5;
        const py = -mouse.y * 5;
        portrait.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════
// INIT THREE.JS
// ═══════════════════════════════════════════════════════════

function initThreeJS() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isMobile });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 5;
    scaleTextBlocks();

    const srcs     = ['icons/elyella.webp', 'icons/residuosdeunavoz.webp', 'icons/principeturquesa.webp'];
    const builders = [buildSection0, buildSection1, buildSection2];
    srcs.forEach((src, i) => textureLoader.load(src, tex => builders[i](tex)));
    buildSection3();

    window.addEventListener('resize', onResize);
    animate(0);
  } catch (err) {
    console.warn('[three] WebGL unavailable:', err);
    canvas.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
// TEXT SCALE — fixed reference layout, JS-driven scale()
// ═══════════════════════════════════════════════════════════

const TEXT_REF_WIDTH = 500;

function scaleTextBlocks() {
  if (!camera) return;
  const d = worldDims();
  const mob = window.innerWidth < 768;
  const szWorld = mob ? 0.72 * d.w : Math.min(0.55 * d.h, 0.55 * d.w);
  // Convert Three.js world-unit photo width → CSS pixels
  const photoPx = szWorld * (window.innerHeight / d.h);
  const scale = photoPx / TEXT_REF_WIDTH;
  [0, 1, 2].forEach(i => {
    const el = document.getElementById(`text-${i}`);
    if (el) el.style.transform = `scale(${scale})`;
  });
}

// ═══════════════════════════════════════════════════════════
// RESIZE
// ═══════════════════════════════════════════════════════════

function onResize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  [0, 1, 2].forEach(i => {
    if (!sections[i]?.imgMesh) return;
    const sz = imgSize(i);
    sections[i].imgMesh.geometry.dispose();
    sections[i].imgMesh.geometry = new THREE.PlaneGeometry(sz, sz);
  });
  scaleTextBlocks();
}

// ═══════════════════════════════════════════════════════════
// INTERACTIVE SLIDE SYSTEM — vertical spring physics
// ═══════════════════════════════════════════════════════════

function slideSetup(fromIdx, toIdx, direction) {
  interSlide = {
    fromIdx, toIdx, direction,
    dragPx: 0, velocity: 0,
    state: 'dragging',           // 'dragging' | 'releasing'
    springTarget: 0,
    swapped: false,
    bgLerp: 0, bgVel: 0,
    lastFrameTime: performance.now(),
    lastInputTime: performance.now(),
  };
  const fromInner = document.querySelector(`#section-${fromIdx} .section-inner`);
  const toInner   = document.querySelector(`#section-${toIdx} .section-inner`);
  if (fromInner) { fromInner.style.transition = 'none'; fromInner.style.opacity = '1'; }
  if (toInner)   { toInner.style.transition   = 'none'; toInner.style.opacity   = '0'; }
  // Make to-shadow visible during transit (only sections 0-2 have shadows)
  if (toIdx <= 2) {
    const toShadow = document.getElementById(`cover-${toIdx}-shadow`);
    if (toShadow) toShadow.style.display = 'block';
  }
}

function slideAddInput(deltaPx) {
  if (!interSlide || interSlide.state !== 'dragging') return;
  const s = interSlide;
  const vh = window.innerHeight;
  const prev = s.dragPx;
  s.dragPx = Math.max(-vh * 0.05, Math.min(vh, s.dragPx + deltaPx));
  const now = performance.now();
  const dt  = Math.max(1, now - s.lastInputTime);
  const instVel = (s.dragPx - prev) / dt;
  s.velocity = s.velocity * 0.55 + instVel * 0.45;
  s.lastInputTime = now;
}

function slideRelease() {
  if (!interSlide || interSlide.state !== 'dragging') return;
  const s = interSlide;
  const vh = window.innerHeight;
  const ratioMet = s.dragPx >= vh * COMMIT_DRAG_RATIO;
  const velMet   = s.velocity >= COMMIT_VEL_PX_MS;
  s.state = 'releasing';
  s.springTarget = (ratioMet || velMet) ? vh : 0;
  s.lastFrameTime = performance.now();
}

function slideDoSwap() {
  if (!interSlide || interSlide.swapped) return;
  interSlide.swapped = true;
  const { fromIdx, toIdx } = interSlide;
  currentSection = toIdx;
  updatePlatformUI();
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === toIdx));
  document.getElementById('section-dots').style.setProperty('--accent', sectionAccents[toIdx]);
  if (fromIdx === 3) {
    s3Parallax.x = 0; s3Parallax.y = 0;
    const p = document.getElementById('portrait-frame');
    if (p) { p.style.transform = ''; p.classList.remove('portrait-entering'); }
  }
  if (toIdx === 3) {
    const p = document.getElementById('portrait-frame');
    if (p) { p.classList.remove('portrait-entering'); void p.offsetWidth; p.classList.add('portrait-entering'); }
    sections[3]?.onEnter();
    runTaglineReveal();
  }
}

function slideUndoSwap() {
  if (!interSlide || !interSlide.swapped) return;
  interSlide.swapped = false;
  const { fromIdx } = interSlide;
  currentSection = fromIdx;
  updatePlatformUI();
  document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === fromIdx));
  document.getElementById('section-dots').style.setProperty('--accent', sectionAccents[fromIdx]);
}

function slideCleanup(finalIdx) {
  if (!interSlide) return;
  const { fromIdx, toIdx } = interSlide;
  // Reset image meshes
  [fromIdx, toIdx].forEach(idx => {
    const m = sections[idx]?.imgMesh;
    if (m) { m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); }
  });
  // Reset shadows: only the final section's shadow stays visible (if 0-2)
  // Don't clear transform — leave it at the last applyShadow value so the next
  // idle update() can take over smoothly without a one-frame snap.
  [0, 1, 2].forEach(idx => {
    const sh = document.getElementById(`cover-${idx}-shadow`);
    if (!sh) return;
    sh.style.display = (idx === finalIdx) ? 'block' : 'none';
  });
  // Reset section opacities
  document.querySelectorAll('.section-inner').forEach(el => {
    el.style.transition = '';
    el.style.opacity = '';
  });
  // Snap wrapper to final position
  wrapper.style.transform = `translateY(${-finalIdx * 100}vh)`;
  document.body.style.backgroundColor = sectionBg[finalIdx];
  interSlide = null;
}

function slideFinalize() {
  if (!interSlide) return;
  if (!interSlide.swapped) slideDoSwap();
  slideCleanup(interSlide.toIdx);
  lockoutUntil = performance.now() + POST_COMMIT_LOCKOUT_MS;
  navigator.vibrate?.(15);
}

function slideCancelDone() {
  if (!interSlide) return;
  if (interSlide.swapped) slideUndoSwap();
  slideCleanup(interSlide.fromIdx);
}

function updateSlideFrame(t, now) {
  const s  = interSlide;
  const vh = window.innerHeight;
  const dtMs = Math.min(40, now - s.lastFrameTime);
  s.lastFrameTime = now;
  const dt = dtMs / 1000;

  // Spring integration during release
  if (s.state === 'releasing') {
    // velocity is in px/ms; convert to px/s for spring math, then back
    let vPxS = s.velocity * 1000;
    const accel = -SPRING_STIFF * (s.dragPx - s.springTarget) - SPRING_DAMP * vPxS;
    vPxS += accel * dt;
    s.velocity = vPxS / 1000;
    s.dragPx  += vPxS * dt;
    if (Math.abs(s.dragPx - s.springTarget) < 0.5 && Math.abs(vPxS) < 8) {
      s.dragPx = s.springTarget;
      if (s.springTarget > 0) { slideFinalize();   return; }
      else                     { slideCancelDone(); return; }
    }
  }

  // Mid-point logical swap (dots, platform UI, portrait)
  if (!s.swapped && s.dragPx >= vh / 2) slideDoSwap();
  if ( s.swapped && s.dragPx <  vh / 2) slideUndoSwap();

  // Wrapper translate — slides whole HTML stack
  const offsetVh = (s.fromIdx + (s.dragPx / vh) * s.direction) * 100;
  wrapper.style.transform = `translateY(${-offsetVh}vh)`;

  // Background color spring (independent, gentler)
  const bgTarget = Math.max(0, Math.min(1, s.dragPx / vh));
  const bgAccel  = -BG_SPRING_STIFF * (s.bgLerp - bgTarget) - BG_SPRING_DAMP * s.bgVel;
  s.bgVel  += bgAccel * dt;
  s.bgLerp += s.bgVel * dt;
  document.body.style.backgroundColor =
    lerpColor(getBgRgb(s.fromIdx), getBgRgb(s.toIdx), Math.max(0, Math.min(1, s.bgLerp)));

  // Text opacity stagger — from fades out faster than to fades in (subtle layering)
  const p = Math.max(0, Math.min(1, s.dragPx / vh));
  const fromInner = document.querySelector(`#section-${s.fromIdx} .section-inner`);
  const toInner   = document.querySelector(`#section-${s.toIdx} .section-inner`);
  const fromOp = 1 - Math.max(0, Math.min(1, (p - 0.05) / 0.45));
  const toOp   = Math.max(0, Math.min(1, (p - 0.45) / 0.45));
  if (fromInner) fromInner.style.opacity = fromOp.toFixed(3);
  if (toInner)   toInner.style.opacity   = toOp.toFixed(3);

  // Bob attenuation — both images calm down during slide, full again at endpoints
  const fromAtten = Math.max(0, 1 - p);
  const toAtten   = Math.max(0, p);

  const fromScreenOffset = -s.dragPx * s.direction;
  const toScreenOffset   = (vh - s.dragPx) * s.direction;

  // Three.js: render both scenes with camera y-offset.
  // Camera convention: camera.y -= worldOffset shifts mesh DOWN visually.
  // Mesh should appear shifted by `screenOffsetPx` (CSS +y down).
  // → camera.y_world = -screenOffsetPx * (worldPerPx) ? Verified: camera up makes mesh go down.
  // To shift mesh DOWN by Δpx (screenOffset positive), camera.y goes UP by Δworld.
  // worldPerPx = d.h / vh. So camera.y = screenOffsetPx * (d.h / vh).
  const d = worldDims();
  const pxPerWorld = window.innerHeight / d.h;
  const worldPerPx = d.h / window.innerHeight;
  const camOrigY = camera.position.y;

  renderer.autoClear = true;
  renderer.clear();

  const sFrom = sections[s.fromIdx];
  if (sFrom) {
    sFrom.update(t);
    if (sFrom.imgMesh) {
      sFrom.imgMesh.position.y *= fromAtten;
      sFrom.imgMesh.rotation.z *= fromAtten;
    }
    camera.position.y = camOrigY + fromScreenOffset * worldPerPx;
    camera.updateMatrixWorld();
    renderer.render(sFrom.scene, camera);
  }

  renderer.autoClear = false;
  const sTo = sections[s.toIdx];
  if (sTo) {
    sTo.update(t);
    if (sTo.imgMesh) {
      sTo.imgMesh.position.y *= toAtten;
      sTo.imgMesh.rotation.z *= toAtten;
    }
    camera.position.y = camOrigY + toScreenOffset * worldPerPx;
    camera.updateMatrixWorld();
    renderer.render(sTo.scene, camera);
  }

  // Restore camera + autoClear for next frame
  camera.position.y = camOrigY;
  camera.updateMatrixWorld();
  renderer.autoClear = true;

  // Shadows: applied AFTER update() calls so we overwrite the idle transform.
  // Include attenuated tilt so the shadow stays visually locked to the image.
  function applyShadow(idx, screenOffsetPx, atten) {
    if (idx > 2) return;
    const sh = document.getElementById(`cover-${idx}-shadow`);
    if (!sh) return;
    const bobPx   = (0.18 + Math.sin(t * 0.6) * 0.08) * pxPerWorld * atten;
    const tiltDeg = Math.sin(t * 0.4) * 0.03 * (180 / Math.PI) * atten;
    sh.style.transform =
      `translate(-50%, calc(-50% + ${(screenOffsetPx - bobPx).toFixed(1)}px)) rotate(${(-tiltDeg).toFixed(3)}deg)`;
  }
  applyShadow(s.fromIdx, fromScreenOffset, fromAtten);
  applyShadow(s.toIdx,   toScreenOffset,   toAtten);
}

// ═══════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════

function animate(now) {
  rafId = requestAnimationFrame(animate);
  if (!renderer) return;
  const t = now * 0.001;

  if (interSlide) {
    updateSlideFrame(t, now);
  } else {
    renderer.clear();
    const s = sections[currentSection];
    if (s) { s.update(t); renderer.render(s.scene, camera); }
  }
}

// ═══════════════════════════════════════════════════════════
// TAGLINE REVEAL
// ═══════════════════════════════════════════════════════════

function runTaglineReveal() {
  const tagline = document.getElementById('text-3')?.querySelector('.artist-tagline');
  if (!tagline || !tagline.dataset.text) return;
  const words = tagline.dataset.text.split(' ');
  tagline.innerHTML = words.map((w, i) =>
    `<span class="word-reveal" style="animation-delay:${0.3 + i * 0.08}s">${w}</span>`
  ).join(' ');
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION (discrete: dots, keyboard)
// ═══════════════════════════════════════════════════════════

function navigateTo(fromIdx, toIdx, direction) {
  if (interSlide) return;
  slideSetup(fromIdx, toIdx, direction);
  // Programmatic: skip drag, animate spring straight to commit
  interSlide.state = 'releasing';
  interSlide.springTarget = window.innerHeight;
  // Give it a small initial velocity so the spring "kicks off" instead of starting at rest
  interSlide.velocity = 1.2; // px/ms ≈ momentum of a deliberate flick
  interSlide.lastFrameTime = performance.now();
}

// ═══════════════════════════════════════════════════════════
// INPUT SYSTEM — interactive slide
// ═══════════════════════════════════════════════════════════

window.addEventListener('wheel', e => {
  e.preventDefault();
  const now = performance.now();

  // Anti-skip: post-commit lockout (ignores trackpad inertia tail)
  if (now < lockoutUntil) { wheelLastEventTime = now; return; }

  // Anti-skip: idle gate — after lockout ends, require a brief silence
  // before accepting fresh input (tail momentum has stopped).
  if (wheelLastEventTime && (now - wheelLastEventTime) < WHEEL_IDLE_GATE_MS && !interSlide) {
    wheelLastEventTime = now;
    return;
  }
  wheelLastEventTime = now;

  let dy = e.deltaY;
  if      (e.deltaMode === 1) dy *= 20;
  else if (e.deltaMode === 2) dy *= window.innerHeight;
  const direction = dy > 0 ? 1 : -1;

  if (!interSlide) {
    const next = currentSection + direction;
    if (next < 0 || next >= SECTION_COUNT) return;
    slideSetup(currentSection, next, direction);
  }

  if (interSlide && interSlide.state === 'dragging') {
    // Movement toward destination is positive
    const deltaPx = dy * interSlide.direction;
    slideAddInput(deltaPx);
    if (interSlide.dragPx <= 0 && interSlide.velocity <= 0) {
      // Reversed past origin — cancel immediately
      slideCancelDone();
      return;
    }
  }

  // After input idles, release the spring
  clearTimeout(wheelIdleTimer);
  wheelIdleTimer = setTimeout(() => {
    if (interSlide && interSlide.state === 'dragging') slideRelease();
  }, WHEEL_RELEASE_IDLE_MS);
}, { passive: false });

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    if (!interSlide) {
      const next = currentSection + 1;
      if (next < SECTION_COUNT) navigateTo(currentSection, next, 1);
    }
  }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    if (!interSlide) {
      const next = currentSection - 1;
      if (next >= 0) navigateTo(currentSection, next, -1);
    }
  }
});

let touchLastY = 0;
window.addEventListener('touchstart', e => {
  touchLastY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', e => {
  e.preventDefault();
  const y     = e.touches[0].clientY;
  const delta = touchLastY - y; // positive = swipe up = forward
  touchLastY  = y;
  if (Math.abs(delta) < 1) return;

  if (!interSlide) {
    const direction = delta > 0 ? 1 : -1;
    const next = currentSection + direction;
    if (next < 0 || next >= SECTION_COUNT) return;
    slideSetup(currentSection, next, direction);
  }

  if (interSlide && interSlide.state === 'dragging') {
    const deltaPx = delta * interSlide.direction;
    slideAddInput(deltaPx);
    if (interSlide.dragPx <= 0 && interSlide.velocity <= 0) {
      slideCancelDone();
      return;
    }
  }
}, { passive: false });

window.addEventListener('touchend', () => {
  if (interSlide && interSlide.state === 'dragging') slideRelease();
}, { passive: true });

// ═══════════════════════════════════════════════════════════
// VISIBILITY API
// ═══════════════════════════════════════════════════════════

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
    rafId = null;
  } else if (!rafId) {
    animate(performance.now());
  }
});

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════

function initDots() {
  const dotsEl = document.getElementById('section-dots');
  dotsEl.style.setProperty('--accent', sectionAccents[0]);
  document.querySelectorAll('.dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.idx, 10);
      if (idx !== currentSection && !interSlide) {
        navigateTo(currentSection, idx, idx > currentSection ? 1 : -1);
      }
    });
  });
}

async function boot() {
  await parseLinks();
  document.body.style.backgroundColor = sectionBg[0];
  updatePlatformUI();
  initDots();
  initThreeJS();
  if (currentSection === 3) runTaglineReveal();

  // One-time peek: satellites start already open, then retract after 0.3s
  updateSatelliteIcons();
  menuOpen = true;
  const peekPos = getSatPositions();
  satellites.forEach((sat, i) => {
    const pos = peekPos[i];
    sat.style.transition = 'none';
    sat.style.transform  = `translate(${pos.x}px, ${pos.y}px) scale(1)`;
    sat.classList.add('visible');
  });
  // Restore transitions after first paint, then close
  requestAnimationFrame(() => requestAnimationFrame(() => {
    satellites.forEach(sat => { sat.style.transition = ''; });
    setTimeout(() => closeMenu(), 300);
  }));
}

boot();
