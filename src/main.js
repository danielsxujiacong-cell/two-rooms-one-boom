import { createClient } from '@supabase/supabase-js';
import './styles.css';

const GAME_START = new Date('2026-10-05T00:00:00+08:00').getTime();
const CONNECTION_RETRY_MS = 4500;
const COUNTER_POLL_MS = 18000;
const MAX_STICKERS = 8;
const MAX_SHOCKWAVES = 3;
const EMOJIS = ['💥', '💣', '🔥', '✨', '⚡️', '🎉'];
const STICKER_WORD_PROBABILITY = 0.12;
const STICKER_PLUS_PROBABILITY = 0.22;
const STICKER_FLIGHT_MS = 1600;
const STICKER_ARC_MS = 1200;
const STICKER_LIFETIME_MS = 5000;
const STICKER_FADE_START_MS = 4500;
const STICKER_FADE_MS = 500;
const FULL_TURN = Math.PI * 2;
const elements = {
  button: document.querySelector('#boom-button'),
  buttonStage: document.querySelector('#button-stage'),
  connection: document.querySelector('#connection-note'),
  countdownValue: document.querySelector('#countdown-value'),
  counter: document.querySelector('#counter-value'),
  stickerLayer: document.querySelector('#sticker-layer'),
};

let supabase = null;
let hasCloudCount = false;
let retryTimer = null;
let pollTimer = null;
let confirmedCount = null;
let channel = null;
let buttonMotion = null;
let counterMotion = null;
let haloTimer = null;
const activeStickers = new Map();
const shockwaveAnimations = new Map();
const recentDirections = [];
let stickerFrameId = 0;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function safeAnonymousKey(key) {
  if (!key || key.startsWith('sb_secret_')) return false;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role && payload.role !== 'anon') return false;
    } catch {
      return false;
    }
  }
  return key.startsWith('sb_publishable_') || parts.length === 3;
}

function createSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || !safeAnonymousKey(key)) return null;
  try {
    return createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  } catch {
    return null;
  }
}

function parseCount(value) {
  try {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
    if (!/^\d+$/.test(String(value))) return null;
    return BigInt(value);
  } catch {
    return null;
  }
}

function showConnectionNote(visible) {
  elements.connection.textContent = visible ? '全球计数暂时无法连接，正在重试。' : '';
}

function animateCounter() {
  if (prefersReducedMotion()) return;
  const currentTransform = getComputedStyle(elements.counter).transform;
  counterMotion?.cancel();
  counterMotion = elements.counter.animate(
    [
      { transform: currentTransform === 'none' ? 'scale(1)' : currentTransform },
      { transform: 'scale(1.12)', offset: 0.42 },
      { transform: 'scale(.98)', offset: 0.7 },
      { transform: 'scale(1)' },
    ],
    { duration: 390, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}

function renderCount(value) {
  const parsed = parseCount(value);
  if (parsed === null) return false;
  const changed = confirmedCount !== null && parsed > confirmedCount;
  confirmedCount = confirmedCount === null || parsed > confirmedCount ? parsed : confirmedCount;
  elements.counter.textContent = new Intl.NumberFormat('zh-CN').format(confirmedCount);
  elements.counter.classList.remove('is-loading');
  elements.counter.removeAttribute('aria-busy');
  elements.counter.setAttribute('aria-label', '全球共按下 ' + elements.counter.textContent + ' 次');
  hasCloudCount = true;
  elements.button.disabled = false;
  if (changed) animateCounter();
  return true;
}

function updateCountdown() {
  const remainingSeconds = Math.max(0, Math.floor((GAME_START - Date.now()) / 1000));
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  elements.countdownValue.textContent = days + '天 ' + String(hours).padStart(2, '0') + '小时 ' + String(minutes).padStart(2, '0') + '分 ' + String(seconds).padStart(2, '0') + '秒';
}

function discardAnimatedElement(element, animations) {
  const animation = animations.get(element);
  animations.delete(element);
  if (animation && typeof animation.cancel === 'function') {
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
  }
  element.remove();
}

function makeRoom(animations, capacity, reserved = 1) {
  while (animations.size + reserved > capacity) {
    discardAnimatedElement(animations.keys().next().value, animations);
  }
}

function trackAnimatedElement(element, animations, animation) {
  animations.set(element, animation);
  const remove = () => {
    if (animations.get(element) !== animation) return;
    animations.delete(element);
    element.remove();
  };
  animation.onfinish = remove;
  animation.oncancel = remove;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function spawnShockwave() {
  makeRoom(shockwaveAnimations, MAX_SHOCKWAVES);
  const wave = document.createElement('span');
  wave.className = 'shockwave';
  wave.setAttribute('aria-hidden', 'true');
  wave.style.width = elements.button.offsetWidth + 'px';
  wave.style.height = elements.button.offsetHeight + 'px';
  elements.buttonStage.append(wave);
  const reducedMotion = prefersReducedMotion();
  const animation = wave.animate(
    reducedMotion
      ? [{ opacity: 0.12 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: 'translate(-50%,-50%) scale(.88)' },
          { opacity: 0.28, offset: 0.18 },
          { opacity: 0, transform: 'translate(-50%,-50%) scale(1.2)' },
        ],
    { duration: reducedMotion ? 160 : 370, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'both' },
  );
  trackAnimatedElement(wave, shockwaveAnimations, animation);
}

function angularDistance(left, right) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function randomLaunchDirection() {
  let angle = Math.random() * FULL_TURN;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    if (!recentDirections.some((recent) => angularDistance(angle, recent) < 0.52)) break;
    angle = Math.random() * FULL_TURN;
  }
  recentDirections.push(angle);
  if (recentDirections.length > MAX_STICKERS) recentDirections.shift();
  return angle;
}

function chooseStickerLabel() {
  const roll = Math.random();
  if (roll < STICKER_PLUS_PROBABILITY) return '+1';
  if (roll < STICKER_PLUS_PROBABILITY + STICKER_WORD_PROBABILITY) return '啪！';
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function getStickerBounds(sticker, scale, centerX, centerY, stageRect) {
  const halfWidth = sticker.offsetWidth * scale / 2;
  const halfHeight = sticker.offsetHeight * scale / 2;
  const horizontalLimit = Math.max(0, Math.min(
    stageRect.width / 2 + 56,
    centerX - halfWidth - 10,
    window.innerWidth - centerX - halfWidth - 10,
  ));
  const verticalLimit = stageRect.height / 2 + 56;
  let minY = Math.max(
    -verticalLimit,
    elements.countdownValue.getBoundingClientRect().bottom + halfHeight + 8 - centerY,
  );
  let maxY = Math.min(
    verticalLimit,
    elements.counter.getBoundingClientRect().top - halfHeight - 10 - centerY,
  );
  if (minY >= maxY) {
    minY = -verticalLimit;
    maxY = verticalLimit;
  }
  return { minX: -horizontalLimit, maxX: horizontalLimit, minY, maxY };
}

function resolveStickerBoundary(state) {
  let hitX = false;
  let hitY = false;
  if (state.x < state.bounds.minX) { state.x = state.bounds.minX; hitX = true; }
  if (state.x > state.bounds.maxX) { state.x = state.bounds.maxX; hitX = true; }
  if (state.y < state.bounds.minY) { state.y = state.bounds.minY; hitY = true; }
  if (state.y > state.bounds.maxY) { state.y = state.bounds.maxY; hitY = true; }
  if (!hitX && !hitY) return;

  if (state.bounces < state.maxBounces) {
    const restitution = randomBetween(0.28, 0.42);
    if (hitX) state.vx = -state.vx * restitution;
    else state.vx *= 0.86;
    if (hitY) state.vy = -state.vy * restitution;
    else state.vy *= 0.86;
    state.angularVelocity *= 0.68;
    state.bounces += 1;
  } else {
    if (hitX) state.vx = 0;
    if (hitY) state.vy = 0;
    state.angularVelocity *= 0.72;
  }
}

function stickerPopScale(elapsed) {
  if (elapsed < 200) {
    const progress = elapsed / 200;
    return 0.68 + 0.44 * (1 - (1 - progress) ** 2);
  }
  if (elapsed < 360) return 1.12 - 0.12 * ((elapsed - 200) / 160);
  return 1;
}

function updateStickerFrames(timestamp) {
  stickerFrameId = 0;
  for (const [sticker, state] of activeStickers) {
    const elapsed = timestamp - state.startedAt;
    if (elapsed >= STICKER_LIFETIME_MS) {
      discardAnimatedElement(sticker, activeStickers);
      continue;
    }

    const deltaTime = Math.min((timestamp - state.lastUpdate) / 1000, 0.032);
    state.lastUpdate = timestamp;
    if (!state.reducedMotion && elapsed < STICKER_FLIGHT_MS && !state.settled) {
      const settling = elapsed >= STICKER_ARC_MS;
      const drag = Math.exp(-(settling ? 4.8 : 1.15) * deltaTime);
      state.vx *= drag;
      state.vy = state.vy * drag + state.gravity * (settling ? 0.22 : 1) * deltaTime;
      state.x += state.vx * deltaTime;
      state.y += state.vy * deltaTime;

      if (settling) {
        const angularForce = (state.restRotation - state.rotation) * 24 - state.angularVelocity * 8;
        state.angularVelocity += angularForce * deltaTime;
      } else {
        state.angularVelocity *= Math.exp(-1.8 * deltaTime);
      }
      state.rotation += state.angularVelocity * deltaTime;
      resolveStickerBoundary(state);
    } else if (!state.settled) {
      state.vx = 0;
      state.vy = 0;
      state.angularVelocity = 0;
      state.rotation = state.restRotation;
      state.settled = true;
    }

    const fadeProgress = Math.max(0, (elapsed - STICKER_FADE_START_MS) / STICKER_FADE_MS);
    sticker.style.opacity = String(1 - fadeProgress);
    sticker.style.transform = `translate(-50%,-50%) translate3d(${state.x}px,${state.y}px,0) rotate(${state.rotation}deg) scale(${state.scale * stickerPopScale(elapsed)})`;
  }
  if (activeStickers.size) stickerFrameId = window.requestAnimationFrame(updateStickerFrames);
}

function spawnPhysicalSticker() {
  makeRoom(activeStickers, MAX_STICKERS);
  const label = chooseStickerLabel();
  const sticker = document.createElement('span');
  sticker.className = 'sticker-chip' + (label === '+1' ? ' sticker-plus' : '') + (label === '啪！' ? ' sticker-word' : '');
  sticker.textContent = label;
  sticker.setAttribute('aria-hidden', 'true');
  sticker.style.zIndex = String(3 + Math.floor(Math.random() * 3));
  elements.stickerLayer.append(sticker);

  const stageRect = elements.buttonStage.getBoundingClientRect();
  const buttonRect = elements.button.getBoundingClientRect();
  const centerX = stageRect.left + stageRect.width / 2;
  const centerY = stageRect.top + stageRect.height / 2;
  const direction = randomLaunchDirection();
  const scale = randomBetween(0.88, 1.1);
  const bounds = getStickerBounds(sticker, scale, centerX, centerY, stageRect);
  const radius = Math.max(0, buttonRect.width / 2 - randomBetween(2, 8));
  const x = Math.max(bounds.minX, Math.min(bounds.maxX, Math.cos(direction) * radius));
  const y = Math.max(bounds.minY, Math.min(bounds.maxY, Math.sin(direction) * radius));
  const speed = randomBetween(270, 360);
  const now = performance.now();
  const rotation = randomBetween(-14, 14);
  const state = {
    bounds,
    bounces: 0,
    gravity: randomBetween(380, 520),
    lastUpdate: now,
    maxBounces: 1 + Math.floor(Math.random() * 2),
    reducedMotion: prefersReducedMotion(),
    restRotation: rotation + randomBetween(-24, 24),
    rotation,
    scale,
    settled: false,
    startedAt: now,
    angularVelocity: randomBetween(-320, 320),
    vx: Math.cos(direction) * speed,
    vy: Math.sin(direction) * speed,
    x,
    y,
  };
  activeStickers.set(sticker, state);
  if (!stickerFrameId) stickerFrameId = window.requestAnimationFrame(updateStickerFrames);
}

function playFeedback() {
  const currentTransform = getComputedStyle(elements.button).transform;
  buttonMotion?.cancel();
  const reducedMotion = prefersReducedMotion();
  buttonMotion = elements.button.animate(
    reducedMotion
      ? [
          { transform: currentTransform === 'none' ? 'translateY(0) scale(1)' : currentTransform },
          { transform: 'translateY(2px) scale(.99)', offset: 0.45 },
          { transform: 'translateY(0) scale(1)' },
        ]
      : [
          { transform: currentTransform === 'none' ? 'translateY(0) scale(1)' : currentTransform },
          { transform: 'translateY(7px) scale(.965)', offset: 0.34 },
          { transform: 'translateY(-1px) scale(1.012)', offset: 0.68 },
          { transform: 'translateY(0) scale(1)' },
        ],
    { duration: reducedMotion ? 160 : 440, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );

  elements.buttonStage.classList.add('is-energized');
  window.clearTimeout(haloTimer);
  haloTimer = window.setTimeout(() => elements.buttonStage.classList.remove('is-energized'), 250);
  spawnShockwave();
  spawnPhysicalSticker();
  if (!reducedMotion && typeof navigator.vibrate === 'function') navigator.vibrate(12);
}

function scheduleReconnect() {
  window.clearTimeout(retryTimer);
  retryTimer = window.setTimeout(connectAndRead, CONNECTION_RETRY_MS);
}

async function readCount() {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('two_rooms_boom_counter')
    .select('total_count')
    .eq('id', 1)
    .single();
  if (error || !data || !renderCount(data.total_count)) return false;
  return true;
}

function watchRealtime() {
  if (!supabase || channel) return;
  channel = supabase
    .channel('two-rooms-shared-boom-counter')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'two_rooms_boom_counter', filter: 'id=eq.1' },
      (payload) => renderCount(payload.new.total_count),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        showConnectionNote(false);
        void readCount();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        showConnectionNote(true);
      }
    });
}

async function connectAndRead() {
  if (!supabase) {
    showConnectionNote(true);
    scheduleReconnect();
    return;
  }
  if (await readCount()) {
    showConnectionNote(false);
    watchRealtime();
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(async () => {
      if (!await readCount()) showConnectionNote(true);
    }, COUNTER_POLL_MS);
  } else {
    showConnectionNote(true);
    scheduleReconnect();
  }
}

async function submitClick() {
  if (!hasCloudCount || !supabase) return;
  playFeedback();
  try {
    const { data, error } = await supabase.rpc('increment_two_rooms_boom');
    if (error || !renderCount(data)) throw error || new Error('云端没有返回计数');
    showConnectionNote(false);
  } catch {
    showConnectionNote(true);
    if (await readCount()) showConnectionNote(false);
  }
}

elements.button.addEventListener('click', submitClick);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && supabase) void readCount();
});

updateCountdown();
window.setInterval(updateCountdown, 1000);
supabase = createSupabaseClient();
void connectAndRead();
