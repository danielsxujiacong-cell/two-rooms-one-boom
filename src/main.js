import { createClient } from '@supabase/supabase-js';
import './styles.css';

const GAME_START = new Date('2026-10-05T00:00:00+08:00').getTime();
const CONNECTION_RETRY_MS = 4500;
const COUNTER_POLL_MS = 18000;
const MAX_FEEDBACKS = 12;
const EMOJIS = ['💥', '💣', '🔥', '✨', '⚡️', '🎉'];
const elements = {
  button: document.querySelector('#boom-button'),
  buttonStage: document.querySelector('#button-stage'),
  connection: document.querySelector('#connection-note'),
  countdownValue: document.querySelector('#countdown-value'),
  counter: document.querySelector('#counter-value'),
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
const feedbackAnimations = new Map();

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

function removeFeedback(element) {
  feedbackAnimations.get(element)?.cancel();
  feedbackAnimations.delete(element);
  element.remove();
}

function showTapFeedback() {
  while (feedbackAnimations.size >= MAX_FEEDBACKS) {
    removeFeedback(feedbackAnimations.keys().next().value);
  }

  const feedback = document.createElement('span');
  feedback.className = 'tap-feedback';
  feedback.setAttribute('aria-hidden', 'true');

  const emoji = document.createElement('span');
  emoji.className = 'feedback-emoji';
  emoji.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const plusOne = document.createElement('span');
  plusOne.className = 'feedback-plus';
  plusOne.textContent = '+1';
  feedback.append(emoji, plusOne);
  elements.buttonStage.append(feedback);

  const reducedMotion = prefersReducedMotion();
  const angle = Math.random() * Math.PI * 2;
  const distance = 44 + Math.random() * 46;
  const dx = Math.round(Math.cos(angle) * distance);
  const dy = Math.round(Math.sin(angle) * distance - 9);
  const rotation = Math.round((Math.random() - 0.5) * 34);
  const startRotation = Math.round((Math.random() - 0.5) * 14);
  const animation = feedback.animate(
    reducedMotion
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: `translate(-50%,-50%) translate(0,5px) scale(.68) rotate(${startRotation}deg)` },
          { opacity: 1, transform: `translate(-50%,-50%) translate(${Math.round(dx * 0.28)}px,${Math.round(dy * 0.28)}px) scale(1.14) rotate(${Math.round(rotation * 0.4)}deg)`, offset: 0.24 },
          { opacity: 1, transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(1) rotate(${rotation}deg)`, offset: 0.5 },
          { opacity: 0, transform: `translate(-50%,-50%) translate(${Math.round(dx * 1.2)}px,${dy - 22}px) scale(.96) rotate(${rotation + startRotation}deg)` },
        ],
    { duration: reducedMotion ? 180 : 760, easing: 'cubic-bezier(.18,.7,.25,1)', fill: 'both' },
  );
  feedbackAnimations.set(feedback, animation);
  animation.onfinish = () => removeFeedback(feedback);
  animation.oncancel = () => {
    feedbackAnimations.delete(feedback);
    feedback.remove();
  };
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
  showTapFeedback();
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
