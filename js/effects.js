// effects.js — canvas particle backgrounds driven by weather + time of day

let canvas, ctx, raf, particles = [], mode = 'clear', isDay = true, flashT = 0;
let W = 0, H = 0, dpr = 1, lastW = 0, lastH = 0, resizeTimer = 0, paused = false;

export function initEffects(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');
  resize(true);
  // IMPORTANT (mobile): on a phone the browser's address bar hides/shows while
  // you scroll. That fires `resize` constantly and only changes the HEIGHT.
  // Rebuilding this full-screen canvas on every one of those events churned GPU
  // memory hard enough that the mobile browser reloaded the tab (scroll jumped
  // back to the top every few seconds). So we debounce, and only truly re-init
  // on a WIDTH change or a big height jump (orientation) — the address-bar
  // wiggle is ignored (the fixed canvas just stretches its bitmap, unnoticeable).
  window.addEventListener('resize', () => {
    if (resizeTimer) return;
    resizeTimer = setTimeout(() => { resizeTimer = 0; resize(false); }, 200);
  }, { passive: true });
  // Don't animate a hidden tab — saves battery and memory.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; paused = true; } }
    else if (paused) { paused = false; loop(); }
  });
}

function resize(force) {
  if (!canvas) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // Skip the address-bar's height-only wiggle; keep the existing bitmap.
  if (!force && w === lastW && Math.abs(h - lastH) < 150) return;
  lastW = w; lastH = h;
  dpr = Math.min(window.devicePixelRatio || 1, 1.5); // decorative bg — 1.5 is plenty
  W = w; H = h;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildParticles();
}

// group: clear|partly|cloudy|fog|drizzle|rain|snow|thunder
export function setScene(group, day) {
  mode = group; isDay = day;
  applySky(group, day);
  buildParticles();
  if (!raf) loop();
}

function applySky(group, day) {
  const body = document.body;
  body.classList.remove('sky-clear', 'sky-partly', 'sky-cloudy', 'sky-fog',
    'sky-rain', 'sky-snow', 'sky-thunder', 'sky-night');
  const g = ['drizzle'].includes(group) ? 'rain' : group;
  body.classList.add(`sky-${g}`);
  if (!day) body.classList.add('sky-night');
}

function buildParticles() {
  particles = [];
  if (!W) return;
  const area = W * H;
  if (mode === 'rain' || mode === 'drizzle' || mode === 'thunder') {
    const n = Math.round(area / (mode === 'drizzle' ? 4200 : 2400));
    for (let i = 0; i < n; i++) particles.push(rainDrop());
  } else if (mode === 'snow') {
    const n = Math.round(area / 5000);
    for (let i = 0; i < n; i++) particles.push(snowFlake());
  } else if ((mode === 'clear' || mode === 'partly') && !isDay) {
    const n = Math.round(area / 4500);
    for (let i = 0; i < n; i++) particles.push(star());
  }
}

function rainDrop() {
  return { x: Math.random() * W, y: Math.random() * H,
    len: 8 + Math.random() * 14, v: 6 + Math.random() * 6, w: Math.random() * 1.2 + 0.4 };
}
function snowFlake() {
  return { x: Math.random() * W, y: Math.random() * H,
    r: 1 + Math.random() * 2.6, v: 0.5 + Math.random() * 1.2,
    drift: Math.random() * 0.8 - 0.4, phase: Math.random() * Math.PI * 2 };
}
function star() {
  return { x: Math.random() * W, y: Math.random() * H * 0.7,
    r: Math.random() * 1.3 + 0.3, tw: Math.random() * Math.PI * 2, sp: 0.02 + Math.random() * 0.04 };
}

function loop() {
  raf = requestAnimationFrame(loop);
  ctx.clearRect(0, 0, W, H);

  if (mode === 'rain' || mode === 'drizzle' || mode === 'thunder') drawRain();
  else if (mode === 'snow') drawSnow();
  else if ((mode === 'clear' || mode === 'partly') && !isDay) drawStars();
  else if ((mode === 'clear' || mode === 'partly') && isDay) drawSun();

  if (mode === 'thunder') drawLightning();
}

function drawRain() {
  ctx.strokeStyle = 'rgba(174,194,224,0.55)';
  ctx.lineCap = 'round';
  for (const p of particles) {
    ctx.lineWidth = p.w;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - 1.5, p.y + p.len);
    ctx.stroke();
    p.y += p.v; p.x -= 0.4;
    if (p.y > H) { p.y = -p.len; p.x = Math.random() * W; }
  }
}
function drawSnow() {
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    p.phase += 0.02;
    p.y += p.v; p.x += Math.sin(p.phase) * 0.6 + p.drift;
    if (p.y > H) { p.y = -4; p.x = Math.random() * W; }
  }
}
function drawStars() {
  for (const s of particles) {
    s.tw += s.sp;
    const a = 0.4 + Math.abs(Math.sin(s.tw)) * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}
let sunT = 0;
function drawSun() {
  sunT += 0.005;
  const cx = W * 0.82, cy = H * 0.16, r = Math.min(W, H) * 0.12;
  const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 3);
  grad.addColorStop(0, 'rgba(255,236,170,0.45)');
  grad.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r * (2.6 + Math.sin(sunT) * 0.15), 0, Math.PI * 2);
  ctx.fill();
}
function drawLightning() {
  flashT -= 1;
  if (flashT <= 0 && Math.random() < 0.006) flashT = 6 + Math.random() * 6;
  if (flashT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, flashT / 14)})`;
    ctx.fillRect(0, 0, W, H);
  }
}
