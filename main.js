/*
 * ANIMATION CHOICES
 * ─────────────────────────────────────────────────────────────
 * Section 0 — Él y ella (painted, colorful):  [FIX 1]
 *   Three.js constellation — 35 dim star-points scattered around
 *   and beyond the cover image, connected by thin white lines when
 *   within proximity. Stars breathe with a slow sine drift layered
 *   on gentle base velocity, so the whole constellation feels alive,
 *   as if the painting is annotating itself in starlight.
 *   Exit: each node kicks radially outward with accelerating velocity
 *   while both stars and lines fade to opacity 0 over ~700 ms.
 *
 * Section 1 — Residuos de una voz (dark teal, unsettling):
 *   CSS breathing loop (scale 1.0→1.03, 4 s ease-in-out) in style.css.
 *   Exit: CSS glitch-shake (horizontal jitter + hue-rotate + brightness
 *   pulses, 0.65 s).
 *
 * Section 2 — Príncipe turquesa (studio, turquoise lines):  [FIX 2]
 *   Mouse / gyroscope parallax with 0.05 lerp per frame. Cover image
 *   tracks cursor opposite (±12 px X, ±8 px Y) with a slight perspective
 *   tilt (rotateX ±2 °, rotateY ±3 °). Floating squares use CSS `translate`
 *   property at 1.5× parallax speed, creating a layered depth sensation.
 *   CSS scan-line overlay continues beneath.
 *   Exit: cover slides up −40 px + fades to opacity 0, 600 ms ease-in.
 *
 * Section 3 — Matías Hidalgo (dark / silver):
 *   Mouse / gyroscope parallax on circular portrait — image shifts
 *   opposite to cursor (±9 px X, ±6 px Y). No exit animation.
 * ─────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

const SECTION_COUNT = 4;
const EXIT_DURATION = 700;  // ms — matches CSS animation durations
const DEBOUNCE_MS   = 700;  // FIX 4: was 400, now 700

let currentSection  = 0;
let isTransitioning = false; // FIX 4: hard block while any animation runs
let lastScrollTime  = 0;

const wrapper = document.getElementById('sections-wrapper');

// ═══════════════════════════════════════════════════════════
// LINKS PARSER
// ═══════════════════════════════════════════════════════════

/* links[albumKey][platformKey] = URL
   albumKey:    'elyella' | 'residuosdeunavoz' | 'principeturquesa' | 'matiashidalgo'
   platformKey: 'spotify' | 'applemusic' | 'amazon' */
let links = {};

async function parseLinks() {
  try {
    const res  = await fetch('./links');
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
    img.style.transform = 'scale(1.05)';
    setTimeout(() => { img.style.transform = ''; }, 150);
  });
});

// ═══════════════════════════════════════════════════════════
// FLOATING BUTTONS
// ═══════════════════════════════════════════════════════════

document.querySelectorAll('.floating-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sectionEl = btn.closest('.section');
    const sIdx = sectionEl ? parseInt(sectionEl.id.replace('section-', ''), 10) : -1;
    console.log(`[btn] section ${sIdx}, button ${btn.dataset.btn}`);
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION TRANSITIONS
// ═══════════════════════════════════════════════════════════

function goToSection(index) {
  if (index < 0 || index >= SECTION_COUNT) return;
  if (isTransitioning) return;

  const prev = currentSection;
  isTransitioning = true;

  // Per-section teardown
  if (prev === 2) stopSection2Parallax();
  if (prev === 3) cover3.style.transform = '';

  document.getElementById(`section-${prev}`)?.classList.remove('section-active');

  currentSection = index;
  wrapper.style.transform = `translateY(${-index * 100}vh)`;

  const newSection = document.getElementById(`section-${index}`);
  newSection?.classList.remove('section-active');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    newSection?.classList.add('section-active');
    if (index === 2) setTimeout(startSection2Parallax, 320); // start after slide settles
    if (index === 0 && constellationExiting) resetConstellation();
  }));

  updatePlatformUI();
  lastScrollTime = Date.now(); // anchor debounce to transition start

  // FIX 4: release lock after CSS slide transition completes
  setTimeout(() => { isTransitioning = false; }, 400);
}

function playExitThenGo(fromSection, toSection) {
  if (isTransitioning) return;
  isTransitioning = true;

  const el = document.getElementById(`section-${fromSection}`);

  // Per-section exit hooks — run BEFORE adding section-exiting class
  if (fromSection === 0) triggerConstellationExit();
  if (fromSection === 2) clearSection2ParallaxTransform();

  el?.classList.add('section-exiting');

  setTimeout(() => {
    el?.classList.remove('section-exiting');
    isTransitioning = false;
    goToSection(toSection);
  }, EXIT_DURATION);
}

// ═══════════════════════════════════════════════════════════
// SCROLL SYSTEM  — FIX 4
// ═══════════════════════════════════════════════════════════

const sectionExited = new Array(SECTION_COUNT).fill(false);

// Wheel accumulator — FIX 4
let wheelAccum      = 0;
let wheelResetTimer = null;

function handleScrollIntent(direction) {
  if (isTransitioning) return;                    // FIX 4: hard block
  const now = Date.now();
  if (now - lastScrollTime < DEBOUNCE_MS) return; // FIX 4: 700 ms gate
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

// Wheel — FIX 4: accumulate to 80 before firing
window.addEventListener('wheel', e => {
  e.preventDefault();

  wheelAccum += e.deltaY;
  clearTimeout(wheelResetTimer);
  wheelResetTimer = setTimeout(() => { wheelAccum = 0; }, 500); // reset after 500 ms idle

  if (Math.abs(wheelAccum) >= 80) {
    const dir = wheelAccum;
    wheelAccum = 0;
    handleScrollIntent(dir);
  }
}, { passive: false });

// Keyboard
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); handleScrollIntent(1); }
  if (e.key === 'ArrowUp'   || e.key === 'PageUp')   { e.preventDefault(); handleScrollIntent(-1); }
});

// Touch — FIX 4: 65 px minimum swipe (was 50)
let touchStartY = 0;
window.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchend',   e => {
  const delta = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(delta) > 65) handleScrollIntent(delta);
}, { passive: true });

// ═══════════════════════════════════════════════════════════
// SECTION 2 — PARALLAX  (Príncipe turquesa)  [FIX 2]
// ═══════════════════════════════════════════════════════════

const coverWrapper2 = document.getElementById('cover-wrapper-2');
const sec2Buttons   = ['btn-2-a', 'btn-2-b', 'btn-2-c'].map(id => document.getElementById(id));

// Lerp targets + current values
let p2TX = 0, p2TY = 0, p2TRX = 0, p2TRY = 0;
let p2CX = 0, p2CY = 0, p2CRX = 0, p2CRY = 0;
let p2RAF = null;
const P2_LERP = 0.05;

function section2ParallaxLoop() {
  if (currentSection !== 2) return;

  p2CX  += (p2TX  - p2CX)  * P2_LERP;
  p2CY  += (p2TY  - p2CY)  * P2_LERP;
  p2CRX += (p2TRX - p2CRX) * P2_LERP;
  p2CRY += (p2TRY - p2CRY) * P2_LERP;

  // Cover image: translate + perspective tilt
  coverWrapper2.style.transform =
    `translate(${p2CX}px, ${p2CY}px) perspective(700px) rotateX(${p2CRX}deg) rotateY(${p2CRY}deg)`;

  // Squares: 1.5× speed via CSS `translate` property (composites independently of CSS animation transform)
  sec2Buttons.forEach(btn => {
    btn.style.translate = `${p2CX * 1.5}px ${p2CY * 1.5}px`;
  });

  p2RAF = requestAnimationFrame(section2ParallaxLoop);
}

function startSection2Parallax() {
  if (p2RAF) cancelAnimationFrame(p2RAF);
  section2ParallaxLoop();
}

function stopSection2Parallax() {
  if (p2RAF) { cancelAnimationFrame(p2RAF); p2RAF = null; }
}

function clearSection2ParallaxTransform() {
  stopSection2Parallax();
  // Reset inline transforms so the CSS exit animation runs cleanly
  coverWrapper2.style.transform = '';
  sec2Buttons.forEach(btn => { btn.style.translate = ''; });
}

// Mouse input → update targets
window.addEventListener('mousemove', e => {
  if (currentSection === 2) {
    const nx = (e.clientX / window.innerWidth)  - 0.5; // −0.5…0.5
    const ny = (e.clientY / window.innerHeight) - 0.5;
    p2TX  = nx * -24;  // ±12 px, opposite to cursor
    p2TY  = ny * -16;  // ±8 px
    p2TRX = ny * -4;   // ±2 °
    p2TRY = nx * 6;    // ±3 °
  }
});

// ═══════════════════════════════════════════════════════════
// SECTION 3 — MOUSE PARALLAX  (Matías Hidalgo)
// ═══════════════════════════════════════════════════════════

const cover3 = document.getElementById('cover-3');

window.addEventListener('mousemove', e => {
  if (currentSection !== 3) return;
  const xOff = ((e.clientX / window.innerWidth)  - 0.5) * -18;
  const yOff = ((e.clientY / window.innerHeight) - 0.5) * -12;
  cover3.style.transform = `translate(${xOff}px, ${yOff}px)`;
});

// Device orientation handles both section 2 and 3 (mobile)
if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', e => {
    if (currentSection === 3) {
      const xOff = (e.gamma || 0) * 0.4;
      const yOff = (e.beta  || 0) * 0.2;
      cover3.style.transform = `translate(${-xOff}px, ${-yOff}px)`;
    }
    if (currentSection === 2) {
      p2TX  = Math.max(-12, Math.min(12, -(e.gamma || 0) * 0.5));
      p2TY  = Math.max(-8,  Math.min(8,  -(e.beta  || 0) * 0.3));
      p2TRX = Math.max(-2,  Math.min(2,   (e.beta  || 0) * 0.1));
      p2TRY = Math.max(-3,  Math.min(3,   (e.gamma || 0) * 0.15));
    }
  });
}

// ═══════════════════════════════════════════════════════════
// THREE.JS CONSTELLATION — Section 0 (Él y ella)  [FIX 1]
// ═══════════════════════════════════════════════════════════

const threeCanvas = document.getElementById('three-canvas');
let renderer, constellationScene, constellationCamera;
let starGeo, starMat, lineGeo, lineMat;
let nodes = [];
let animFrameId;
let constellationExiting = false;
let exitOpacity = 1.0;

const NODE_COUNT  = 35;
const MAX_SEGS    = 150;
const CONN_DIST   = 1.4;  // Three.js units — proximity threshold for drawing lines
const NODE_COLORS = [0xf1c40f, 0xf39c12, 0x9b59b6, 0x27ae60, 0x3498db, 0xffeaa7, 0xdfe6e9];

function initThreeJS() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0); // fully transparent clear

    buildConstellation();
    animate();
    window.addEventListener('resize', onResize);
  } catch (err) {
    console.warn('[three] WebGL unavailable, skipping constellation:', err);
    threeCanvas.style.display = 'none';
  }
}

function buildConstellation() {
  constellationScene  = new THREE.Scene();
  constellationCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  constellationCamera.position.z = 5;

  nodes = [];
  const starPositions = new Float32Array(NODE_COUNT * 3);
  const starColors    = new Float32Array(NODE_COUNT * 3);
  const aspect = window.innerWidth / window.innerHeight;

  for (let i = 0; i < NODE_COUNT; i++) {
    // Scatter: some nodes close to the cover (r < 1.2), others in the margins
    const radius = 0.5 + Math.random() * 2.5;
    const angle  = Math.random() * Math.PI * 2;
    const x = Math.cos(angle) * radius * aspect;
    const y = Math.sin(angle) * radius * 0.85;

    const speed = 0.0004 + Math.random() * 0.0008;
    const da    = Math.random() * Math.PI * 2;

    const col = new THREE.Color(NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)]);
    col.multiplyScalar(0.75 + Math.random() * 0.25); // vary brightness

    nodes.push({
      x, y, ox: x, oy: y,
      vx: Math.cos(da) * speed,
      vy: Math.sin(da) * speed,
      phase: Math.random() * Math.PI * 2,
    });

    starPositions[i * 3]     = x;
    starPositions[i * 3 + 1] = y;
    starPositions[i * 3 + 2] = 0;
    starColors[i * 3]     = col.r;
    starColors[i * 3 + 1] = col.g;
    starColors[i * 3 + 2] = col.b;
  }

  // Stars (Points)
  starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color',    new THREE.BufferAttribute(starColors, 3));
  starMat = new THREE.PointsMaterial({
    size: 0.07, vertexColors: true, transparent: true, opacity: 0.9, sizeAttenuation: true,
  });
  constellationScene.add(new THREE.Points(starGeo, starMat));

  // Lines (pre-allocated fixed buffer — no GC pressure per frame)
  const linePositions = new Float32Array(MAX_SEGS * 2 * 3);
  lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeo.setDrawRange(0, 0);
  lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
  constellationScene.add(new THREE.LineSegments(lineGeo, lineMat));
}

function triggerConstellationExit() {
  constellationExiting = true;
  exitOpacity = 1.0;
  nodes.forEach(n => {
    const len = Math.sqrt(n.x * n.x + n.y * n.y) || 0.01;
    n.vx = (n.x / len) * 0.04;
    n.vy = (n.y / len) * 0.04;
  });
}

function resetConstellation() {
  constellationExiting = false;
  exitOpacity = 1.0;
  if (starMat) starMat.opacity = 0.9;
  if (lineMat) lineMat.opacity = 0.18;
  const sp = starGeo?.attributes.position?.array;
  if (!sp) return;
  const aspect = window.innerWidth / window.innerHeight;
  nodes.forEach((n, i) => {
    const radius = 0.5 + Math.random() * 2.5;
    const angle  = Math.random() * Math.PI * 2;
    n.x = n.ox = Math.cos(angle) * radius * aspect;
    n.y = n.oy = Math.sin(angle) * radius * 0.85;
    const speed = 0.0004 + Math.random() * 0.0008;
    const da    = Math.random() * Math.PI * 2;
    n.vx = Math.cos(da) * speed;
    n.vy = Math.sin(da) * speed;
    sp[i * 3] = n.x; sp[i * 3 + 1] = n.y;
  });
  starGeo.attributes.position.needsUpdate = true;
}

function animateConstellation() {
  const t  = performance.now() * 0.001;
  const sp = starGeo.attributes.position.array;
  const lp = lineGeo.attributes.position.array;
  let   sc = 0; // active segment count

  if (constellationExiting) {
    exitOpacity = Math.max(0, exitOpacity - 0.02);
    starMat.opacity = exitOpacity * 0.9;
    lineMat.opacity = exitOpacity * 0.18;
  }

  const aspect = window.innerWidth / window.innerHeight;

  nodes.forEach((n, i) => {
    if (!constellationExiting) {
      // Breathing: sine drift on top of slow base wander
      n.x = n.ox + Math.sin(t * 0.28 + n.phase) * 0.09;
      n.y = n.oy + Math.cos(t * 0.35 + n.phase) * 0.07;
      n.ox += n.vx;
      n.oy += n.vy;
      if (Math.abs(n.ox) > 3.8 * aspect) n.vx *= -1;
      if (Math.abs(n.oy) > 2.8) n.vy *= -1;
    } else {
      // Exit: accelerate radially
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= 1.05;
      n.vy *= 1.05;
    }

    sp[i * 3]     = n.x;
    sp[i * 3 + 1] = n.y;

    // Build line segments between nearby nodes
    for (let j = i + 1; j < NODE_COUNT && sc < MAX_SEGS; j++) {
      const m = nodes[j];
      const dx = n.x - m.x, dy = n.y - m.y;
      if (dx * dx + dy * dy < CONN_DIST * CONN_DIST) {
        const b = sc * 6;
        lp[b]     = n.x; lp[b + 1] = n.y; lp[b + 2] = 0;
        lp[b + 3] = m.x; lp[b + 4] = m.y; lp[b + 5] = 0;
        sc++;
      }
    }
  });

  starGeo.attributes.position.needsUpdate = true;
  lineGeo.attributes.position.needsUpdate = true;
  lineGeo.setDrawRange(0, sc * 2);
}

function animate() {
  animFrameId = requestAnimationFrame(animate);
  if (currentSection === 0 && renderer) {
    animateConstellation();
    renderer.render(constellationScene, constellationCamera);
  } else if (renderer) {
    renderer.clear(); // transparent clear for other sections
  }
}

function onResize() {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (constellationCamera) {
    constellationCamera.aspect = window.innerWidth / window.innerHeight;
    constellationCamera.updateProjectionMatrix();
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
