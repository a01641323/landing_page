/*
 * Three.js Visual Effects System — Matías Hidalgo Landing Page
 * 4 sections with GLSL shaders, particles, floating shapes, post-process transitions
 */

// ═══════════════════════════════════════════════════════════
// PERFORMANCE DETECTION
// ═══════════════════════════════════════════════════════════

const isMobile = /Mobi|Android/i.test(navigator.userAgent);
const isLowEnd = navigator.hardwareConcurrency <= 4;
const PERF = { reduced: isMobile || isLowEnd };

// ═══════════════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════════

const SECTION_COUNT = 4;
const EXIT_DURATION = 700;
const DEBOUNCE_MS   = 700;

let currentSection  = 0;
let isTransitioning = false;
let lastScrollTime  = 0;

const wrapper = document.getElementById('sections-wrapper');

// ═══════════════════════════════════════════════════════════
// MOUSE TRACKING
// ═══════════════════════════════════════════════════════════

const mouse = { x: 0, y: 0 };
let lastInteraction = Date.now();

window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  lastInteraction = Date.now();
});

window.addEventListener('touchstart', () => { lastInteraction = Date.now(); }, { passive: true });

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', e => {
    mouse.x = Math.max(-1, Math.min(1, (e.gamma || 0) / 30));
    mouse.y = Math.max(-1, Math.min(1, -(e.beta || 0) / 30));
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
    console.warn('[links] Could not parse links file:', err);
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
// LINK HANDLER
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
// SHADER SOURCES
// ═══════════════════════════════════════════════════════════

const VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Section 0 — Chromatic Dreamscape
const FS_CHROMATIC = `
uniform float uTime;
uniform vec2 uMouse;
uniform sampler2D uTexture;
uniform float uReduced;
varying vec2 vUv;
void main() {
  if (uReduced > 0.5) {
    gl_FragColor = texture2D(uTexture, vUv);
    return;
  }
  vec2 offset = (vUv - 0.5 + uMouse * 0.1) * sin(uTime * 0.8) * 0.008;
  float r = texture2D(uTexture, vUv + offset).r;
  float g = texture2D(uTexture, vUv).g;
  float b = texture2D(uTexture, vUv - offset).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}`;

// Section 1 — Signal Decay
const FS_SIGNAL_DECAY = `
uniform float uTime;
uniform vec2 uMouse;
uniform sampler2D uTexture;
uniform float uReduced;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float pulse = 0.5 + 0.5 * sin(uTime * 6.283 / 0.8);
  if (uReduced > 0.5) pulse = 0.5;
  float h = hash(vec2(vUv.x, floor(vUv.y * 200.0)));
  float displacement = h * 0.02 * pulse;
  float dist = length(uMouse - (vUv * 2.0 - 1.0));
  if (dist < 0.3) displacement *= 3.0;
  gl_FragColor = texture2D(uTexture, vUv + vec2(displacement, 0.0));
}`;

// Section 2 — Neon Pulse
const FS_NEON_PULSE = `
uniform float uTime;
uniform vec2 uMouse;
uniform sampler2D uTexture;
uniform float uReduced;
varying vec2 vUv;
void main() {
  vec2 uv = vUv + uMouse * 0.02;
  vec4 color = texture2D(uTexture, uv);
  if (uReduced < 0.5) {
    float isNeon = step(0.6, color.g) * step(0.6, color.b) * (1.0 - step(0.3, color.r));
    float pulse = 0.5 + 0.5 * sin(uTime * 6.283 / 3.0);
    color.rgb += vec3(0.0, 0.4, 0.4) * pulse * isNeon;
  }
  gl_FragColor = color;
}`;

// Section 3 — Cinema Grain
const FS_CINEMA_GRAIN = `
uniform float uTime;
uniform vec2 uMouse;
uniform sampler2D uTexture;
uniform float uReduced;
uniform float uVignetteStrength;
varying vec2 vUv;
void main() {
  vec2 uv = vUv + uMouse * 0.015;
  float dist = length(uv - 0.5);
  if (dist > 0.5) discard;
  vec4 color = texture2D(uTexture, uv);
  if (uReduced < 0.5) {
    float grain = fract(sin(dot(uv * 500.0, vec2(uTime * 30.0, uTime * 17.3))) * 43758.5453) * 0.06;
    color.rgb += grain - 0.03;
  }
  float v = smoothstep(0.35, 0.5, dist);
  color.rgb *= (1.0 - v * uVignetteStrength);
  float ring = smoothstep(0.48, 0.50, dist) - smoothstep(0.50, 0.52, dist);
  float ringPulse = sin(uTime * 1.5) * 0.3 + 0.5;
  color.rgb += vec3(0.75, 0.8, 0.85) * ring * ringPulse;
  gl_FragColor = color;
}`;

// Section 1 background — Rising Residue
const FS_RISING_RESIDUE = `
uniform float uTime;
uniform float uReduced;
varying vec2 vUv;
float noise(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float fog = noise(vec2(vUv.x * 8.0, vUv.y * 4.0 - uTime * 0.15));
  vec3 color = mix(vec3(0.102, 0.42, 0.353), vec3(0.282, 0.788, 0.69), fog);
  if (uReduced < 0.5) {
    float veinX = fract(sin(floor(uTime * 0.2) * 127.1) * 43758.5453);
    float veinAlpha = smoothstep(0.003, 0.0, abs(vUv.x - veinX));
    color += vec3(0.906, 0.298, 0.235) * veinAlpha * 0.5;
  }
  gl_FragColor = vec4(color, 1.0);
}`;

// Section 2 background — Digital Grid
const FS_DIGITAL_GRID = `
uniform float uTime;
uniform vec2 uMouse;
varying vec2 vUv;
void main() {
  vec2 gridUV;
  gridUV.x = (vUv.x - 0.5 + uMouse.x * 0.05) / (vUv.y + 0.01);
  gridUV.y = 1.0 / (vUv.y + 0.01) - uTime * 0.1;
  vec2 line = step(0.95, fract(gridUV * 5.0));
  float lineVal = max(line.x, line.y);
  float opacity = vUv.y;
  vec3 base = vec3(0.102, 0.165, 0.227);
  vec3 gridColor = vec3(0.0, 0.831, 0.831);
  vec3 color = base + gridColor * lineVal * opacity;
  float sweepY = fract(uTime / 4.0);
  float pulse = smoothstep(0.005, 0.0, abs(vUv.y - sweepY));
  color += gridColor * pulse * 2.0;
  gl_FragColor = vec4(color, 1.0);
}`;

// Transition — Color Shatter (Section 0)
const FS_COLOR_SHATTER = `
uniform float uProgress;
uniform sampler2D uTexture;
uniform vec2 uResolution;
varying vec2 vUv;
vec3 hueRotate(vec3 c, float a) {
  float s = sin(a), co = cos(a);
  mat3 m = mat3(
    0.299+0.701*co+0.168*s, 0.587-0.587*co+0.330*s, 0.114-0.114*co-0.497*s,
    0.299-0.299*co-0.328*s, 0.587+0.413*co+0.035*s, 0.114-0.114*co+0.292*s,
    0.299-0.3*co+1.25*s,    0.587-0.588*co-1.05*s,  0.114+0.886*co-0.203*s
  );
  return m * c;
}
void main() {
  float blockSize = 4.0 + uProgress * 28.0;
  vec2 blockUV = floor(vUv * uResolution / blockSize) * blockSize / uResolution;
  float h = fract(sin(dot(blockUV, vec2(127.1, 311.7))) * 43758.5453);
  float hueShift = h * 6.28 * uProgress;
  vec2 drift = (blockUV - 0.5) * uProgress * h * 0.3;
  vec4 color = texture2D(uTexture, blockUV + drift);
  color.rgb = hueRotate(color.rgb, hueShift);
  gl_FragColor = color;
}`;

// Transition — VHS Tear (Section 1)
const FS_VHS_TEAR = `
uniform float uProgress;
uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;
float noise(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  float scanlineShift = noise(vUv.y * 200.0 + uTime) * 40.0 / uResolution.x * uProgress;
  float r = texture2D(uTexture, vUv + vec2(scanlineShift + 8.0/uResolution.x, 0.0)).r;
  float g = texture2D(uTexture, vUv + vec2(scanlineShift, 0.0)).g;
  float b = texture2D(uTexture, vUv + vec2(scanlineShift - 8.0/uResolution.x, 0.0)).b;
  vec3 color = vec3(r, g, b);
  if (uProgress > 0.5) {
    float blockX = floor(vUv.x * 8.0);
    float blockY = floor(vUv.y * 12.0);
    float dropout = step(0.7, noise(blockX * 13.0 + blockY * 7.0 + uTime * 3.0));
    float flash = step(0.5, fract(uTime * 8.0));
    color = mix(color, vec3(flash), dropout * (uProgress - 0.5) * 2.0);
  }
  gl_FragColor = vec4(color, 1.0);
}`;

// Transition — Grid Collapse (Section 2)
const FS_GRID_COLLAPSE = `
uniform float uProgress;
uniform sampler2D uTexture;
varying vec2 vUv;
void main() {
  float sliceCount = 8.0;
  float sliceIndex = floor(vUv.x * sliceCount);
  float sliceOffset = uProgress * (1.0 + sliceIndex * 0.15);
  vec2 uv = vUv;
  uv.y *= 1.0 + uProgress * 0.5;
  uv.y += sliceOffset;
  if (uv.y > 1.0) {
    float afterglow = (uv.y - 1.0) * 2.0;
    gl_FragColor = vec4(0.0, 0.831, 0.831, 1.0) * afterglow * (1.0 - uProgress);
  } else {
    gl_FragColor = texture2D(uTexture, uv);
  }
}`;

// ═══════════════════════════════════════════════════════════
// THREE.JS GLOBALS
// ═══════════════════════════════════════════════════════════

const canvas = document.getElementById('three-canvas');
let renderer, camera;
let renderTarget;
let postScene, postCamera, postQuad;
let rafId;

const sections = {};
const textureLoader = new THREE.TextureLoader();
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();

let transition = { active: false, from: -1, progress: 0, startTime: 0, duration: 600 };

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function worldDims() {
  const vFov = camera.fov * Math.PI / 180;
  const h = 2 * Math.tan(vFov / 2) * camera.position.z;
  return { w: h * camera.aspect, h };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function imgSize(idx) {
  const d = worldDims();
  const mob = window.innerWidth < 768;
  if (idx === 3) return mob ? 0.62 * d.w : 0.38 * d.h;
  return mob ? 0.72 * d.w : Math.min(0.55 * d.h, 0.55 * d.w);
}

function createBgQuad(fragmentShader, extraUniforms) {
  const d = worldDims();
  const uniforms = { uTime: { value: 0 }, ...extraUniforms };
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader, uniforms, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w * 1.2, d.h * 1.2), mat);
  mesh.position.z = -2;
  return { mesh, uniforms };
}

// ═══════════════════════════════════════════════════════════
// SECTION 0 — ÉL Y ELLA
// ═══════════════════════════════════════════════════════════

function buildSection0(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(0);

  // Image plane
  const imgUniforms = {
    uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() },
    uTexture: { value: texture }, uReduced: { value: PERF.reduced ? 1.0 : 0.0 },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_CHROMATIC, uniforms: imgUniforms, transparent: true })
  );
  imgMesh.position.set(0, 0.15, 0);
  scene.add(imgMesh);

  // Lighting
  scene.add(new THREE.AmbientLight(0x404040, 0.5));

  // Floating orbs
  const orbColors = [0xf39c12, 0x27ae60, 0x8e44ad];
  const orbParams = [{ a: 3, b: 2, d: 0 }, { a: 5, b: 4, d: 1.2 }, { a: 7, b: 6, d: 2.4 }];
  const shapes = orbColors.map((color, i) => {
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.6, metalness: 0.2 });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), mat);
    const light = new THREE.PointLight(color, 0.4, 3);
    mesh.add(light);
    scene.add(mesh);
    return { mesh, mat, light, params: orbParams[i], hovered: false, hInt: 0.8, hScale: 1.0, hAmp: 1.0 };
  });

  // Paint Mist particles
  const pCount = PERF.reduced ? 80 : 200;
  const pPos = new Float32Array(pCount * 3);
  const pCol = new Float32Array(pCount * 3);
  const palette = ['#f1c40f', '#27ae60', '#8e44ad', '#3498db', '#e74c3c'].map(c => new THREE.Color(c));
  for (let i = 0; i < pCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.random() * 3.5; // gaussian-ish
    pPos[i * 3] = Math.cos(angle) * r;
    pPos[i * 3 + 1] = Math.sin(angle) * r;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 2 - 1;
    const c = palette[Math.floor(Math.random() * palette.length)];
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.04, transparent: true, opacity: 0.6, vertexColors: true, sizeAttenuation: true,
  }));
  scene.add(particles);

  // Transition material
  const transMat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS_COLOR_SHATTER,
    uniforms: {
      uProgress: { value: 0 }, uTexture: { value: null },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
  });

  sections[0] = {
    scene, imgMesh, shapes, particles, transitionMaterial: transMat,
    update(t) {
      imgUniforms.uTime.value = t;
      imgUniforms.uMouse.value.set(mouse.x, mouse.y);
      // Orbs
      shapes.forEach(s => {
        const { a, b, d } = s.params;
        s.mesh.position.set(
          1.8 * Math.sin(a * t * 0.5 + d) * s.hAmp,
          1.2 * Math.sin(b * t * 0.5) * s.hAmp + 0.15,
          0.5 * Math.sin(t * 0.3 + d)
        );
        const tI = s.hovered ? 2.0 : 0.8;
        const tS = s.hovered ? 1.2 : 1.0;
        const tA = s.hovered ? 1.5 : 1.0;
        s.hInt = lerp(s.hInt, tI, 0.05);
        s.hScale = lerp(s.hScale, tS, 0.05);
        s.hAmp = lerp(s.hAmp, tA, 0.02);
        s.mat.emissiveIntensity = s.hInt;
        s.mesh.scale.setScalar(s.hScale);
      });
      // Particles brownian
      const pos = particles.geometry.attributes.position.array;
      for (let i = 0; i < pCount; i++) {
        pos[i * 3] += (Math.random() - 0.5) * 0.003;
        pos[i * 3 + 1] += (Math.random() - 0.5) * 0.003 + 0.001;
        const dist = Math.sqrt(pos[i * 3] ** 2 + pos[i * 3 + 1] ** 2);
        if (dist > 4) { pos[i * 3] *= 0.3; pos[i * 3 + 1] *= 0.3; }
      }
      particles.geometry.attributes.position.needsUpdate = true;
    },
  };
}

// ═══════════════════════════════════════════════════════════
// SECTION 1 — RESIDUOS DE UNA VOZ
// ═══════════════════════════════════════════════════════════

function buildSection1(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(1);

  // Background — Rising Residue
  const bg = createBgQuad(FS_RISING_RESIDUE, { uReduced: { value: PERF.reduced ? 1.0 : 0.0 } });
  scene.add(bg.mesh);

  // Image plane
  const imgUniforms = {
    uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() },
    uTexture: { value: texture }, uReduced: { value: PERF.reduced ? 1.0 : 0.0 },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_SIGNAL_DECAY, uniforms: imgUniforms, transparent: true })
  );
  imgMesh.position.set(0, 0.15, 0);
  scene.add(imgMesh);

  // Lighting
  scene.add(new THREE.AmbientLight(0x404040, 0.6));

  // Floating triangles
  const triColors = [0xe74c3c, 0x48c9b0, 0xf0f3f4];
  const triVerts = new Float32Array([0, 0.25, 0, -0.22, -0.13, 0, 0.22, -0.13, 0]);
  const shapes = triColors.map((color, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(triVerts.slice(), 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    return {
      mesh, mat, hovered: false,
      baseAngle: (i / 3) * Math.PI * 2,
      rotSpeed: 0.3 + Math.random() * 0.5,
      glitchX: 0, glitchY: 0,
      glitchTimer: 3 + Math.random() * 2,
    };
  });

  // Transition material
  const transMat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS_VHS_TEAR,
    uniforms: {
      uProgress: { value: 0 }, uTexture: { value: null }, uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    },
  });

  let prevTime = 0;

  sections[1] = {
    scene, imgMesh, shapes, transitionMaterial: transMat,
    update(t) {
      const dt = prevTime ? t - prevTime : 0.016;
      prevTime = t;
      imgUniforms.uTime.value = t;
      imgUniforms.uMouse.value.set(mouse.x, mouse.y);
      bg.uniforms.uTime.value = t;
      // Triangles
      shapes.forEach((s, i) => {
        const angle = s.baseAngle + t * 0.3;
        const baseX = Math.cos(angle) * 1.8;
        const baseY = Math.sin(angle) * 1.2 + 0.15;
        // Glitch
        s.glitchTimer -= dt;
        if (s.glitchTimer <= 0) {
          s.glitchX = (Math.random() * 0.2 + 0.1) * (Math.random() < 0.5 ? -1 : 1);
          s.glitchY = (Math.random() * 0.2 + 0.1) * (Math.random() < 0.5 ? -1 : 1);
          s.glitchTimer = 3 + Math.random() * 2;
        }
        s.glitchX *= Math.exp(-dt * 5);
        s.glitchY *= Math.exp(-dt * 5);
        s.mesh.position.set(baseX + s.glitchX, baseY + s.glitchY, 0.3 * Math.sin(t * 0.5 + i));
        s.mesh.rotation.z += s.rotSpeed * dt;
      });
    },
  };
}

// ═══════════════════════════════════════════════════════════
// SECTION 2 — PRÍNCIPE TURQUESA
// ═══════════════════════════════════════════════════════════

function buildSection2(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(2);

  // Background — Digital Grid
  const bg = createBgQuad(FS_DIGITAL_GRID, { uMouse: { value: new THREE.Vector2() } });
  scene.add(bg.mesh);

  // Image plane
  const imgUniforms = {
    uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() },
    uTexture: { value: texture }, uReduced: { value: PERF.reduced ? 1.0 : 0.0 },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_NEON_PULSE, uniforms: imgUniforms, transparent: true })
  );
  imgMesh.position.set(0, 0.15, 0);
  scene.add(imgMesh);

  // Lighting
  scene.add(new THREE.AmbientLight(0x2a4a5a, 0.5));
  const dirLight = new THREE.DirectionalLight(0x00d4d4, 0.3);
  dirLight.position.set(-2, 3, 2);
  scene.add(dirLight);

  // Floating cubes
  const cubeConfigs = [
    { color: 0x00d4d4, roughness: 0.3, metalness: 0.6 },
    { color: 0xd4a017, roughness: 0.4, metalness: 0.8 },
    { color: 0xe0e0e0, roughness: 0.2, metalness: 0.9 },
  ];
  const cubeRotSpeeds = [0.4, 0.7, 0.5];
  const cubeOrbitParams = [{ a: 3, b: 2, d: 0 }, { a: 5, b: 4, d: 1.5 }, { a: 4, b: 3, d: 3.0 }];
  const shapes = cubeConfigs.map((cfg, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color, roughness: cfg.roughness, metalness: cfg.metalness,
      emissive: cfg.color, emissiveIntensity: 0.2,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat);
    scene.add(mesh);
    return { mesh, mat, rotSpeed: cubeRotSpeeds[i], params: cubeOrbitParams[i], hovered: false, hInt: 0.2, hRot: 1.0 };
  });

  // Transition material
  const transMat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS_GRID_COLLAPSE,
    uniforms: { uProgress: { value: 0 }, uTexture: { value: null } },
  });

  let prevTime = 0;

  sections[2] = {
    scene, imgMesh, shapes, transitionMaterial: transMat,
    update(t) {
      const dt = prevTime ? t - prevTime : 0.016;
      prevTime = t;
      imgUniforms.uTime.value = t;
      imgUniforms.uMouse.value.set(mouse.x, mouse.y);
      bg.uniforms.uTime.value = t;
      bg.uniforms.uMouse.value.set(mouse.x, mouse.y);
      // Image tilt
      imgMesh.rotation.x = lerp(imgMesh.rotation.x, mouse.y * 0.052, 0.04);
      imgMesh.rotation.y = lerp(imgMesh.rotation.y, mouse.x * 0.087, 0.04);
      // Cubes
      shapes.forEach(s => {
        const { a, b, d } = s.params;
        s.mesh.position.set(
          1.6 * Math.sin(a * t * 0.4 + d) + mouse.x * 0.3,
          1.0 * Math.sin(b * t * 0.4) + mouse.y * 0.3 + 0.15,
          0.5 * Math.cos(t * 0.3 + d)
        );
        const rs = s.rotSpeed * s.hRot * dt;
        s.mesh.rotation.x += rs * 0.8;
        s.mesh.rotation.y += rs;
        s.mesh.rotation.z += rs * 0.6;
        const tI = s.hovered ? 0.8 : 0.2;
        const tR = s.hovered ? 2.0 : 1.0;
        s.hInt = lerp(s.hInt, tI, 0.08);
        s.hRot = lerp(s.hRot, tR, 0.08);
        s.mat.emissiveIntensity = s.hInt;
      });
    },
  };
}

// ═══════════════════════════════════════════════════════════
// SECTION 3 — MATÍAS HIDALGO
// ═══════════════════════════════════════════════════════════

function buildSection3(texture) {
  const scene = new THREE.Scene();
  const sz = imgSize(3);

  // Image plane
  const imgUniforms = {
    uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() },
    uTexture: { value: texture }, uReduced: { value: PERF.reduced ? 1.0 : 0.0 },
    uVignetteStrength: { value: 0.3 },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_CINEMA_GRAIN, uniforms: imgUniforms, transparent: true })
  );
  imgMesh.position.set(0, 0.6, 0);
  scene.add(imgMesh);

  // Directional light (upper-left, matches photo key light)
  const dirLight = new THREE.DirectionalLight(0xe8eaed, 0.3);
  dirLight.position.set(-3, 3, 2);
  scene.add(dirLight);

  // Silver Dust particles
  const pCount = PERF.reduced ? 50 : 120;
  const pPos = new Float32Array(pCount * 3);
  const pCol = new Float32Array(pCount * 3);
  const d = worldDims();
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * d.w * 1.2;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * d.h * 1.2;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    const grey = 0.44 + Math.random() * 0.47; // #707880 to #e8eaed
    pCol[i * 3] = grey; pCol[i * 3 + 1] = grey + 0.02; pCol[i * 3 + 2] = grey + 0.04;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.03, transparent: true, opacity: 0.7, vertexColors: true, sizeAttenuation: true,
  }));
  scene.add(particles);

  sections[3] = {
    scene, imgMesh, shapes: [], transitionMaterial: null,
    update(t) {
      imgUniforms.uTime.value = t;
      imgUniforms.uMouse.value.set(mouse.x, mouse.y);
      // Idle vignette
      const idleSec = (Date.now() - lastInteraction) / 1000;
      imgUniforms.uVignetteStrength.value = 0.3 + Math.min(idleSec / 30.0, 1.0) * 0.5;
      // Particle drift
      const pos = particles.geometry.attributes.position.array;
      for (let i = 0; i < pCount; i++) {
        pos[i * 3] += (Math.random() - 0.5) * 0.0004;
        pos[i * 3 + 1] += (Math.random() - 0.5) * 0.0004;
        pos[i * 3 + 2] += (Math.random() - 0.5) * 0.0002;
      }
      particles.geometry.attributes.position.needsUpdate = true;
    },
  };
}

// ═══════════════════════════════════════════════════════════
// INIT THREE.JS
// ═══════════════════════════════════════════════════════════

function initThreeJS() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(PERF.reduced ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = false;

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 5;

    renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);

    postScene = new THREE.Scene();
    postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    postScene.add(postQuad);

    // Load textures and build sections
    const images = ['icons/elyella.png', 'icons/residuosdeunavoz.png', 'icons/principeturquesa.png', 'icons/matiashidalgo.png'];
    const builders = [buildSection0, buildSection1, buildSection2, buildSection3];
    images.forEach((src, i) => {
      textureLoader.load(src, tex => { builders[i](tex); });
    });

    window.addEventListener('resize', onResize);
    animate(0);
  } catch (err) {
    console.warn('[three] WebGL unavailable:', err);
    canvas.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════
// RAYCASTING — hover + click on floating shapes
// ═══════════════════════════════════════════════════════════

function checkHovers() {
  const s = sections[currentSection];
  if (!s?.shapes?.length) return;
  mouseVec.set(mouse.x, mouse.y);
  raycaster.setFromCamera(mouseVec, camera);
  const meshes = s.shapes.map(sh => sh.mesh);
  const intersects = raycaster.intersectObjects(meshes);
  s.shapes.forEach(sh => { sh.hovered = false; });
  if (intersects.length > 0) {
    const hit = s.shapes.find(sh => sh.mesh === intersects[0].object);
    if (hit) hit.hovered = true;
  }
}

window.addEventListener('click', e => {
  const s = sections[currentSection];
  if (!s?.shapes?.length) return;
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = -(e.clientY / window.innerHeight) * 2 + 1;
  mouseVec.set(x, y);
  raycaster.setFromCamera(mouseVec, camera);
  const meshes = s.shapes.map(sh => sh.mesh);
  const intersects = raycaster.intersectObjects(meshes);
  if (intersects.length > 0) {
    const idx = s.shapes.findIndex(sh => sh.mesh === intersects[0].object);
    if (idx >= 0) console.log(`S${currentSection} button`, idx);
  }
});

// ═══════════════════════════════════════════════════════════
// SECTION TRANSITIONS
// ═══════════════════════════════════════════════════════════

function startTransition(fromSection) {
  if (!sections[fromSection]?.transitionMaterial) return;
  transition.active = true;
  transition.from = fromSection;
  transition.progress = 0;
  transition.startTime = performance.now();
}

function endTransition() {
  transition.active = false;
  transition.from = -1;
  transition.progress = 0;
}

function goToSection(index) {
  if (index < 0 || index >= SECTION_COUNT) return;
  if (isTransitioning) return;
  isTransitioning = true;

  document.getElementById(`section-${currentSection}`)?.classList.remove('section-active');
  currentSection = index;
  wrapper.style.transform = `translateY(${-index * 100}vh)`;

  const newSection = document.getElementById(`section-${index}`);
  newSection?.classList.remove('section-active');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    newSection?.classList.add('section-active');
  }));

  updatePlatformUI();
  lastScrollTime = Date.now();
  setTimeout(() => { isTransitioning = false; }, 400);
}

function playExitThenGo(fromSection, toSection) {
  if (isTransitioning) return;
  isTransitioning = true;

  // Start Three.js transition
  startTransition(fromSection);

  const el = document.getElementById(`section-${fromSection}`);
  el?.classList.add('section-exiting');

  setTimeout(() => {
    el?.classList.remove('section-exiting');
    endTransition();
    isTransitioning = false;
    goToSection(toSection);
  }, EXIT_DURATION);
}

// ═══════════════════════════════════════════════════════════
// SCROLL SYSTEM
// ═══════════════════════════════════════════════════════════

const sectionExited = new Array(SECTION_COUNT).fill(false);
let wheelAccum      = 0;
let wheelResetTimer = null;

function handleScrollIntent(direction) {
  if (isTransitioning) return;
  const now = Date.now();
  if (now - lastScrollTime < DEBOUNCE_MS) return;
  lastScrollTime = now;

  if (direction > 0) {
    if (currentSection >= SECTION_COUNT - 1) return;
    const next = currentSection + 1;
    if (!sectionExited[currentSection]) {
      sectionExited[currentSection] = true;
      playExitThenGo(currentSection, next);
    } else {
      goToSection(next);
    }
  } else {
    if (currentSection <= 0) return;
    sectionExited[currentSection] = false;
    goToSection(currentSection - 1);
  }
}

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
window.addEventListener('touchend', e => {
  const delta = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(delta) > 65) handleScrollIntent(delta);
}, { passive: true });

// ═══════════════════════════════════════════════════════════
// VISIBILITY API
// ═══════════════════════════════════════════════════════════

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  } else {
    if (!rafId) animate(performance.now());
  }
});

// ═══════════════════════════════════════════════════════════
// RESIZE
// ═══════════════════════════════════════════════════════════

function onResize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderTarget.setSize(w, h);

  // Update image mesh sizes
  [0, 1, 2, 3].forEach(i => {
    if (!sections[i]) return;
    const sz = imgSize(i);
    sections[i].imgMesh.geometry.dispose();
    sections[i].imgMesh.geometry = new THREE.PlaneGeometry(sz, sz);
    // Update transition resolution uniforms
    if (sections[i].transitionMaterial?.uniforms?.uResolution) {
      sections[i].transitionMaterial.uniforms.uResolution.value.set(w, h);
    }
  });

  // Update background quad sizes
  const d = worldDims();
  [1, 2].forEach(i => {
    if (!sections[i]) return;
    sections[i].scene.children.forEach(child => {
      if (child.position.z <= -1.5) {
        child.geometry.dispose();
        child.geometry = new THREE.PlaneGeometry(d.w * 1.2, d.h * 1.2);
      }
    });
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

  if (transition.active && sections[transition.from]) {
    const elapsed = (now - transition.startTime) / transition.duration;
    transition.progress = Math.min(1, elapsed);

    const exitSec = sections[transition.from];
    exitSec.update(t);

    // Render exit scene to render target
    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    renderer.render(exitSec.scene, camera);
    renderer.setRenderTarget(null);

    // Post-process with transition shader
    postQuad.material = exitSec.transitionMaterial;
    exitSec.transitionMaterial.uniforms.uProgress.value = transition.progress;
    exitSec.transitionMaterial.uniforms.uTexture.value = renderTarget.texture;
    if (exitSec.transitionMaterial.uniforms.uTime) {
      exitSec.transitionMaterial.uniforms.uTime.value = t;
    }
    renderer.render(postScene, postCamera);
  } else {
    const s = sections[currentSection];
    if (s) {
      s.update(t);
      checkHovers();
      renderer.render(s.scene, camera);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════

async function boot() {
  await parseLinks();
  updatePlatformUI();
  initThreeJS();
  document.getElementById('section-0').classList.add('section-active');
}

boot();
