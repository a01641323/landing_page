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
const DEBOUNCE_MS   = 750;

let currentSection  = 0;
let isTransitioning = false;
let lastScrollTime  = 0;

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
      if (line.startsWith('Spotify:'))           links[currentKey].spotify    = line.slice(8).trim();
      else if (line.startsWith('Apple Music:'))  links[currentKey].applemusic = line.slice(12).trim();
      else if (line.startsWith('Amazon Music:')) links[currentKey].amazon     = line.slice(13).trim();
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
  { id: 'spotify',    icon: 'icons/spotify.png',     label: 'Spotify' },
  { id: 'applemusic', icon: 'icons/applemusic.png',  label: 'Apple Music' },
  { id: 'amazon',     icon: 'icons/amazonmusic.png', label: 'Amazon Music' },
];

const sectionAccents = ['#f39c12', '#48c9b0', '#00d4d4', '#b0b8c1'];

let activePlatformIndex = 0;
let activePlatform      = platforms[0].id;

const switcher    = document.getElementById('platform-switcher');
const platformImg = document.getElementById('platform-logo');

function updatePlatformUI() {
  const p = platforms[activePlatformIndex];
  platformImg.src = p.icon;
  platformImg.alt = p.label;
  platformImg.dataset.platform = p.id;
  const accent = sectionAccents[currentSection];
  switcher.style.boxShadow = `0 0 14px 4px ${accent}55, 0 0 4px 1px ${accent}99`;
}

switcher.addEventListener('click', () => {
  activePlatformIndex = (activePlatformIndex + 1) % platforms.length;
  activePlatform      = platforms[activePlatformIndex].id;
  platformImg.style.opacity = '0';
  setTimeout(() => { updatePlatformUI(); platformImg.style.opacity = '1'; }, 120);
});

switcher.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switcher.click(); }
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
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const sectionId = btn.closest('.section').id;
    const section   = parseInt(sectionId.split('-')[1], 10);
    const btnIdx    = parseInt(btn.dataset.btn, 10);
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
varying vec2 vUv;
${GLSL_ROUND}
void main() {
  float alpha = roundCornersAlpha(vUv, 0.015);
  vec2 uv = vUv;
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
  } else {
    gl_FragColor = texture2D(uTexture, uv);
    gl_FragColor.a *= alpha;
  }
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

// Section 2 — Pixel Breathe: idle neon pulse, triggered: pixelation breathes in/out
const FS_PIXEL_BREATHE = `
uniform float uTime;
uniform sampler2D uTexture;
uniform float uPixelBreathe;
varying vec2 vUv;
${GLSL_ROUND}
void main() {
  float alpha = roundCornersAlpha(vUv, 0.015);
  vec2 uv = vUv;
  if (uPixelBreathe > 0.5) {
    float breathe = 0.5 + 0.5 * sin(uTime * 5.0);
    float pixCount = mix(180.0, 80.0, breathe);
    uv = floor(uv * pixCount) / pixCount;
  }
  vec4 color = texture2D(uTexture, uv);
  float isT = step(0.65, color.g) * step(0.65, color.b) * (1.0 - step(0.25, color.r));
  float pulse = 0.5 + 0.5 * sin(uTime * 3.0 + vUv.x * 8.0);
  color.rgb += vec3(0.0, 0.5, 0.5) * pulse * isT;
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

function imgSize(idx) {
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

  const imgUniforms = {
    uTime:     { value: 0 },
    uTexture:  { value: texture },
    uInkBleed: { value: 0.0 },
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

  function scheduleInkBleed() {
    setTimeout(() => {
      imgUniforms.uInkBleed.value = 1.0;
      setTimeout(() => {
        imgUniforms.uInkBleed.value = 0.0;
        scheduleInkBleed();
      }, 600);
    }, 6000 + Math.random() * 4000);
  }
  scheduleInkBleed();

  sections[0] = {
    scene, imgMesh,
    update(t) {
      imgUniforms.uTime.value = t;
      imgMesh.position.y = Math.sin(t * 0.6) * 0.08;
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
        // Follow the image's vertical bob
        const pxPerUnit = window.innerHeight / worldDims().h;
        const bobPx  = Math.sin(t * 0.6) * 0.08 * pxPerUnit;
        const tiltDeg = Math.sin(t * 0.4) * 0.03 * (180 / Math.PI);
        shadowEl.style.transform = `translate(-50%, calc(-50% - ${bobPx.toFixed(1)}px)) rotate(${(-tiltDeg).toFixed(3)}deg)`;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════
// SECTION 1 — RESIDUOS DE UNA VOZ: glitch shader
// ═══════════════════════════════════════════════════════════

function buildSection1(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(1);

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
      imgUniforms.uTime.value = t;
      imgMesh.position.y = Math.sin(t * 0.6) * 0.08;
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
        const bobPx      = Math.sin(t * 0.6) * 0.08 * pxPerUnit;
        const tiltDeg    = Math.sin(t * 0.4) * 0.03 * (180 / Math.PI);
        shadowEl.style.transform = `translate(-50%, calc(-50% - ${bobPx.toFixed(1)}px)) rotate(${(-tiltDeg).toFixed(3)}deg)`;
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

  function schedulePixelBreathe() {
    setTimeout(() => {
      imgUniforms.uPixelBreathe.value = 1.0;
      setTimeout(() => {
        imgUniforms.uPixelBreathe.value = 0.0;
        schedulePixelBreathe();
      }, 700);
    }, 5000 + Math.random() * 4000);
  }
  schedulePixelBreathe();

  sections[2] = {
    scene, imgMesh,
    update(t) {
      imgUniforms.uTime.value = t;
      imgMesh.position.y = Math.sin(t * 0.6) * 0.08;
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
        const bobPx      = Math.sin(t * 0.6) * 0.08 * pxPerUnit;
        const tiltDeg    = Math.sin(t * 0.4) * 0.03 * (180 / Math.PI);
        shadowEl.style.transform = `translate(-50%, calc(-50% - ${bobPx.toFixed(1)}px)) rotate(${(-tiltDeg).toFixed(3)}deg)`;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════
// SECTION 3 — MATÍAS HIDALGO: star ring only (portrait is CSS)
// ═══════════════════════════════════════════════════════════

// Bat-Signal beam — full-screen quad, mathematical beam shape in shader
const FS_BEAM = `
uniform float uTime;
uniform float uBeamAngle;
uniform vec2  uOrigin;    // beam origin in UV space (bottom-center)
uniform float uAspect;    // viewport aspect ratio
varying vec2 vUv;

void main() {
  // Correct for aspect ratio so beam looks circular, not stretched
  vec2 uv = vUv;
  vec2 toPixel = uv - uOrigin;
  toPixel.x *= uAspect;

  // Rotate coordinate space by beam angle
  float cosA = cos(-uBeamAngle);
  float sinA = sin(-uBeamAngle);
  vec2 rotated = vec2(
    toPixel.x * cosA - toPixel.y * sinA,
    toPixel.x * sinA + toPixel.y * cosA
  );

  // Distance from beam center axis
  float distFromAxis = abs(rotated.x);

  // Beam width grows with distance from origin
  float distFromOrigin = length(toPixel);
  float beamWidth = distFromOrigin * 0.28 + 0.02;

  // Only render in forward direction (above origin)
  if (rotated.y < 0.0) discard;

  // Soft falloff from axis — Gaussian-like
  float axisAlpha = exp(-pow(distFromAxis / beamWidth, 2.5) * 3.0);

  // Fade near origin (invisible at source) and at far edge — wide zone ensures
  // origin is always off-screen on any device including mobile
  float originFade = smoothstep(0.0, 0.28, distFromOrigin);
  float farFade = smoothstep(1.2, 0.6, distFromOrigin);

  // Volumetric dust: faint noise variation
  float noise = fract(sin(dot(vUv * 80.0 + uTime * 0.2,
                vec2(12.9898, 78.233))) * 43758.5);
  float dustAlpha = noise * 0.04 * originFade;

  float finalAlpha = (axisAlpha * originFade * farFade * 0.5) + dustAlpha;

  vec3 color = vec3(0.80, 0.88, 0.96); // cold silver-blue
  gl_FragColor = vec4(color, finalAlpha);
}`;

const VS_BEAM = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function buildSection3() {
  const scene = new THREE.Scene();

  // ── Bat-Signal Beam — full-screen quad ────────────────────
  const d = worldDims();
  const beamGeo = new THREE.PlaneGeometry(d.w * 1.2, d.h * 1.2);
  const beamUniforms = {
    uTime:      { value: 0 },
    uBeamAngle: { value: 0 },
    uOrigin:    { value: new THREE.Vector2(0.65, -0.25) }, // bottom-right, well below screen
    uAspect:    { value: window.innerWidth / window.innerHeight },
  };
  const beamMesh = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    vertexShader: VS_BEAM,
    fragmentShader: FS_BEAM,
    uniforms: beamUniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  beamMesh.position.z = -0.5;
  scene.add(beamMesh);

  // ── Atmospheric drift state ──────────────────────────────
  let beamAngle     = 0;
  let driftToX      = 0;
  let driftTimer    = 0;
  let driftDuration = 3000 + Math.random() * 3000;
  let lastT         = 0;

  // ── Stars (reduced) ──────────────────────────────────────
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

  const count = 28;
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
    color: 0xffffff, size: 0.055, transparent: true, opacity: 0.4,
    sizeAttenuation: true, map: starTex, alphaTest: 0.05,
  }));
  scene.add(starPoints);

  // ── Portrait + text references ────────────────────────────
  const portrait   = document.getElementById('portrait-frame');
  const radialGlow = document.getElementById('portrait-radial-glow');
  const artistText = document.getElementById('text-3');

  sections[3] = {
    scene, imgMesh: null, beamMesh,
    update(t) {
      // Delta time in ms
      const deltaMs = (t - lastT) * 1000;
      lastT = t;

      // ── Atmospheric drift ──────────────────────────────
      driftTimer += Math.abs(deltaMs);
      if (driftTimer >= driftDuration) {
        driftToX      = (Math.random() - 0.5) * 0.32; // max ±0.16 rad (~9°) — event searchlight feel
        driftDuration = 3000 + Math.random() * 3000;
        driftTimer    = 0;
      }
      beamAngle += (driftToX - beamAngle) * 0.012; // slightly faster lerp for wider range

      // ── Diagonal base angle — makes beam point from right origin toward center ──
      // Origin in UV: (0.65, -0.25). Target portrait in UV: (0.50, 0.35).
      // In aspect-corrected UV space the required angle satisfies tan(θ) = 0.25*aspect.
      const aspect    = window.innerWidth / window.innerHeight;
      const baseAngle = Math.atan(0.25 * aspect);
      const totalAngle = baseAngle + beamAngle; // beamAngle is the atmospheric drift

      // ── Beam uniforms ──────────────────────────────────
      beamUniforms.uTime.value      = t;
      beamUniforms.uBeamAngle.value = totalAngle;
      beamUniforms.uAspect.value    = aspect;

      // Scale quad to cover viewport (avoid creating new geometry each frame)
      const dims = worldDims();
      beamMesh.scale.set(dims.w * 1.2 / (d.w * 1.2), dims.h * 1.2 / (d.h * 1.2), 1);

      // ── Stars drift ────────────────────────────────────
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        arr[i * 3]     = base[i * 3]     + Math.sin(t * 0.08 + phase[i * 2])     * 0.10;
        arr[i * 3 + 1] = base[i * 3 + 1] + Math.cos(t * 0.06 + phase[i * 2 + 1]) * 0.08;
      }
      geo.attributes.position.needsUpdate = true;

      // ── Portrait tracks beam tip using same aspect-corrected geometry as shader ──
      // In aspect-corrected UV, beam direction is (-sin θ, cos θ).
      // Converting to pixels: Δx_px = -sin(θ)*H, Δy_px = cos(θ)*H  (since W/aspect = H).
      if (portrait) {
        const H  = window.innerHeight;
        const W  = window.innerWidth;
        const dUV = 0.50; // distance along beam in aspect-corrected UV space

        const portraitX = 0.65*W - Math.sin(totalAngle) * dUV * H;
        const bobVal    = Math.sin(t * 0.5) * 4;
        const portraitY = -0.25*H + Math.cos(totalAngle) * dUV * H + bobVal;

        portrait.style.position = 'fixed';
        portrait.style.left     = '0';
        portrait.style.top      = '0';
        portrait.style.transform =
          `translate(calc(${portraitX.toFixed(1)}px - 50%), calc(${portraitY.toFixed(1)}px - 50%))`;

        // Radial glow follows portrait
        if (radialGlow) {
          radialGlow.style.position = 'fixed';
          radialGlow.style.left     = '0';
          radialGlow.style.top      = '0';
          radialGlow.style.transform =
            `translate(calc(${portraitX.toFixed(1)}px - 50%), calc(${(portraitY + 120).toFixed(1)}px - 50%))`;
        }

        // Artist text: centered horizontally, tracks portrait vertically
        if (artistText) {
          artistText.style.position = 'fixed';
          artistText.style.left     = '50%';
          artistText.style.top      = '0';
          artistText.style.transform =
            `translate(-50%, ${(portraitY + 140).toFixed(1)}px)`;
        }
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

    const srcs     = ['icons/elyella.png', 'icons/residuosdeunavoz.png', 'icons/principeturquesa.png'];
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
}

// ═══════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════

function animate(now) {
  rafId = requestAnimationFrame(animate);
  if (!renderer) return;
  const t = now * 0.001;
  renderer.clear();
  const s = sections[currentSection];
  if (s) {
    s.update(t);
    renderer.render(s.scene, camera);
  }
}

// ═══════════════════════════════════════════════════════════
// CSS TILT TRANSITION — Star Wars style
// ═══════════════════════════════════════════════════════════

function playTiltTransition(fromIdx, toIdx, direction) {
  if (isTransitioning) return;
  isTransitioning = true;
  lastScrollTime  = Date.now();

  const fromInner = document.querySelector(`#section-${fromIdx} .section-inner`);
  const toInner   = document.querySelector(`#section-${toIdx} .section-inner`);
  const rotX      = direction > 0 ? 25 : -25;

  // Tilt current section out
  fromInner.style.transition = 'transform 450ms ease-in, opacity 450ms ease-in';
  fromInner.style.transform  = `perspective(800px) rotateX(${rotX}deg) translateZ(-60px)`;
  fromInner.style.opacity    = '0';

  // Crossfade body background
  document.body.style.backgroundColor = sectionBg[toIdx];

  setTimeout(() => {
    // Snap wrapper to new section (instant)
    wrapper.style.transform = `translateY(${-toIdx * 100}vh)`;
    currentSection = toIdx;
    updatePlatformUI();

    // Swap active shadow
    const fromShadow = document.getElementById(`cover-${fromIdx}-shadow`);
    const toShadow   = document.getElementById(`cover-${toIdx}-shadow`);
    if (fromShadow) fromShadow.style.display = 'none';
    if (toShadow)   toShadow.style.display   = 'block';

    // Reset portrait/text fixed positioning when leaving section 3
    if (fromIdx === 3) {
      s3Parallax.x = 0;
      s3Parallax.y = 0;
      const portrait = document.getElementById('portrait-frame');
      if (portrait) {
        portrait.style.position  = '';
        portrait.style.left      = '';
        portrait.style.top       = '';
        portrait.style.transform = '';
      }
      const radialGlow = document.getElementById('portrait-radial-glow');
      if (radialGlow) {
        radialGlow.style.position  = '';
        radialGlow.style.left      = '';
        radialGlow.style.top       = '';
        radialGlow.style.transform = '';
      }
      const artistText = document.getElementById('text-3');
      if (artistText) {
        artistText.style.position  = '';
        artistText.style.left      = '';
        artistText.style.top       = '';
        artistText.style.transform = '';
      }
    }

    // Reset from section (now off-screen)
    fromInner.style.transition = 'none';
    fromInner.style.transform  = '';
    fromInner.style.opacity    = '';

    // Set new section to start state
    toInner.style.transition = 'none';
    toInner.style.transform  = `perspective(800px) rotateX(${-rotX}deg) translateZ(-60px)`;
    toInner.style.opacity    = '0';

    // Tilt new section into place
    requestAnimationFrame(() => requestAnimationFrame(() => {
      toInner.style.transition = 'transform 450ms ease-out, opacity 450ms ease-out';
      toInner.style.transform  = 'perspective(800px) rotateX(0deg) translateZ(0px)';
      toInner.style.opacity    = '1';
    }));

    setTimeout(() => {
      toInner.style.transition = '';
      toInner.style.transform  = '';
      toInner.style.opacity    = '';
      isTransitioning = false;
    }, 460);
  }, 225);
}

// ═══════════════════════════════════════════════════════════
// SCROLL SYSTEM
// ═══════════════════════════════════════════════════════════

function handleScrollIntent(direction) {
  if (isTransitioning) return;
  const now = Date.now();
  if (now - lastScrollTime < DEBOUNCE_MS) return;

  const next = currentSection + (direction > 0 ? 1 : -1);
  if (next < 0 || next >= SECTION_COUNT) return;
  playTiltTransition(currentSection, next, direction);
}

let wheelAccum = 0, wheelResetTimer = null;
window.addEventListener('wheel', e => {
  e.preventDefault();
  wheelAccum += e.deltaY;
  clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => { wheelAccum = 0; }, 500);
  if (Math.abs(wheelAccum) >= 80) {
    const dir = wheelAccum;
    wheelAccum = 0;
    handleScrollIntent(dir);
  }
}, { passive: false });

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); handleScrollIntent(1); }
  if (e.key === 'ArrowUp'   || e.key === 'PageUp')   { e.preventDefault(); handleScrollIntent(-1); }
});

let touchStartY = 0;
window.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchend',   e => {
  const delta = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(delta) > 65) handleScrollIntent(delta);
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

async function boot() {
  await parseLinks();
  document.body.style.backgroundColor = sectionBg[0];
  updatePlatformUI();
  initThreeJS();
}

boot();
