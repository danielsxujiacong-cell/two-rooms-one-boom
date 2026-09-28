import { createClient } from '@supabase/supabase-js';
import './styles.css';

const GAME_START = new Date('2026-10-05T00:00:00+08:00').getTime();
const CONNECTION_RETRY_MS = 4500;
const COUNTER_POLL_MS = 18000;
const MAX_STICKERS = 6;
const MAX_SHOCKWAVES = 3;
const EMOJIS = ['💥', '💣', '🔥', '✨', '⚡️', '🎉'];
const STICKER_WORD_PROBABILITY = 0.12;
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
const stickerAnimations = new Map();
const shockwaveAnimations = new Map();

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
  if (animation) {
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

function createSticker(label, options = {}) {
  const sticker = document.createElement('span');
  sticker.className = 'sticker-chip' + (options.isPlus ? ' sticker-plus' : '') + (options.isWord ? ' sticker-word' : '');
  sticker.textContent = label;
  sticker.setAttribute('aria-hidden', 'true');
  sticker.style.zIndex = String(3 + Math.floor(Math.random() * 3));
  elements.stickerLayer.append(sticker);

  const animation = sticker.animate(
    options.reducedMotion
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: `translate(-50%,-50%) translate(${options.startX}px,${options.startY + 8}px) scale(${options.scale * 0.66}) rotate(${options.rotation - 8}deg)` },
          { opacity: 1, transform: `translate(-50%,-50%) translate(${options.startX}px,${options.startY}px) scale(${options.scale * 1.13}) rotate(${options.rotation}deg)`, offset: 0.2, easing: 'cubic-bezier(.08,.78,.2,1)' },
          { opacity: 1, transform: `translate(-50%,-50%) translate(${options.endX}px,${options.endY}px) scale(${options.scale}) rotate(${options.rotation + options.driftRotation}deg)`, offset: 0.65 },
          { opacity: 0, transform: `translate(-50%,-50%) translate(${options.endX + options.side * 10}px,${options.endY - 12}px) scale(${options.scale * 0.96}) rotate(${options.rotation + options.driftRotation + 4}deg)` },
        ],
    { duration: options.reducedMotion ? 160 : options.duration, delay: options.delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' },
  );
  trackAnimatedElement(sticker, stickerAnimations, animation);
}

function spawnStickerBurst() {
  const reducedMotion = prefersReducedMotion();
  const stickerCount = 2 + Math.floor(Math.random() * 2);
  makeRoom(stickerAnimations, MAX_STICKERS, stickerCount);

  const radius = elements.button.offsetWidth / 2;
  createSticker('+1', {
    isPlus: true,
    reducedMotion,
    startX: randomBetween(-radius * 0.08, radius * 0.08),
    startY: -radius * 0.66,
    endX: randomBetween(-15, 15),
    endY: -radius * randomBetween(1.28, 1.42),
    side: 0,
    rotation: randomBetween(-9, 9),
    driftRotation: randomBetween(-5, 5),
    scale: randomBetween(0.88, 1.04),
    duration: randomBetween(620, 800),
    delay: 0,
  });

  const paths = [
    { side: -1, startX: -radius * 0.36, startY: -radius * 0.55, endX: -radius * randomBetween(0.72, 0.82), endY: -radius * randomBetween(1.1, 1.22) },
    { side: 0, startX: randomBetween(-radius * 0.16, radius * 0.16), startY: -radius * 0.72, endX: randomBetween(-radius * 0.16, radius * 0.16), endY: -radius * randomBetween(1.34, 1.46) },
    { side: 1, startX: radius * 0.36, startY: -radius * 0.55, endX: radius * randomBetween(0.72, 0.82), endY: -radius * randomBetween(1.1, 1.22) },
  ];
  const extraCount = stickerCount - 1;
  for (let index = 0; index < extraCount; index += 1) {
    const pathIndex = Math.floor(Math.random() * paths.length);
    const path = paths.splice(pathIndex, 1)[0];
    const isWord = Math.random() < STICKER_WORD_PROBABILITY;
    createSticker(isWord ? '啪！' : EMOJIS[Math.floor(Math.random() * EMOJIS.length)], {
      ...path,
      isWord,
      reducedMotion,
      rotation: randomBetween(-14, 14),
      driftRotation: randomBetween(-9, 9),
      scale: randomBetween(0.82, 1.12),
      duration: randomBetween(600, 900),
      delay: randomBetween(12, 46),
    });
  }
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
  spawnStickerBurst();
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
