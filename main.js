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

// Section 1 — Glitch Signal
const FS_GLITCH = `
uniform float uTime;
uniform sampler2D uTexture;
uniform float uGlitch;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  if (uGlitch > 0.5) {
    float shift = sin(uv.y * 50.0 + uTime * 20.0) * 0.015;
    uv.x += shift;
    float b1 = step(0.996, fract(sin(uTime * 7.3 + floor(uv.y * 100.0)) * 43758.5));
    float b2 = step(0.994, fract(sin(uTime * 13.1 + floor(uv.y * 80.0)) * 17231.0));
    if (b1 + b2 > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    float r = texture2D(uTexture, uv + vec2(0.008, 0.0)).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - vec2(0.008, 0.0)).b;
    gl_FragColor = vec4(r, g, b, 1.0);
  } else {
    gl_FragColor = texture2D(uTexture, uv);
  }
}`;

// Section 2 — Neon Pulse (turquoise selective)
const FS_NEON = `
uniform float uTime;
uniform sampler2D uTexture;
varying vec2 vUv;
void main() {
  vec4 color = texture2D(uTexture, vUv);
  float isT = step(0.65, color.g) * step(0.65, color.b) * (1.0 - step(0.25, color.r));
  float pulse = 0.5 + 0.5 * sin(uTime * 3.0 + vUv.x * 8.0);
  color.rgb += vec3(0.0, 0.5, 0.5) * pulse * isT;
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
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.MeshBasicMaterial({ map: texture })
  );
  scene.add(imgMesh);

  sections[0] = {
    scene, imgMesh,
    update(t) {
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
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_GLITCH, uniforms: imgUniforms })
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
    uTime:    { value: 0 },
    uTexture: { value: texture },
  };
  const imgMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sz, sz),
    new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_NEON, uniforms: imgUniforms })
  );
  scene.add(imgMesh);

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

function buildSection3() {
  const scene = new THREE.Scene();

  // 40 points in loose elliptical halo, centered at y=0 (screen center)
  const count = 40;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
    const rx = 1.8 + (Math.random() - 0.5) * 0.5;
    const ry = 1.2 + (Math.random() - 0.5) * 0.3;
    pos[i * 3]     = Math.cos(angle) * rx;
    pos[i * 3 + 1] = Math.sin(angle) * ry;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starPoints = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.045, transparent: true, opacity: 0.6, sizeAttenuation: true,
  }));
  scene.add(starPoints);

  const portrait = document.getElementById('cover-3');

  sections[3] = {
    scene, imgMesh: null,
    update(t) {
      starPoints.rotation.y += 0.002;
      // Portrait bob + parallax combined — same formula as section 0
      if (portrait) {
        const bobVal = Math.sin(t * 0.6);
        const pxBob  = bobVal * 5;  // ±5px vertical bob
        portrait.style.transform =
          `translate(${s3Parallax.x.toFixed(1)}px, ${(s3Parallax.y + pxBob).toFixed(1)}px)`;
        // Shadow breathes with bob
        const blur    = 40 + bobVal * 15;
        const opacity = 0.65 - bobVal * 0.1;
        const offY    = 20 + bobVal * 8;
        portrait.style.boxShadow =
          `0 ${offY.toFixed(0)}px ${blur.toFixed(0)}px rgba(0,0,0,${opacity.toFixed(2)}),` +
          ` 0 8px 20px rgba(0,0,0,0.45),` +
          ` 0 0 40px rgba(180,180,180,0.15)`;
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
    renderer.setPixelRatio(1); // cap at 1 on all devices
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

    // Reset portrait parallax/bob state when leaving section 3
    if (fromIdx === 3) {
      s3Parallax.x = 0;
      s3Parallax.y = 0;
      const portrait = document.getElementById('cover-3');
      if (portrait) { portrait.style.transform = ''; portrait.style.boxShadow = ''; }
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
