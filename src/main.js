import { createClient } from '@supabase/supabase-js';
import './styles.css';

const GAME_START = new Date('2026-10-05T00:00:00+08:00').getTime();
const MIN_CLICK_INTERVAL = 350;
const CONNECTION_RETRY_MS = 4500;
const COUNTER_POLL_MS = 18000;
const elements = {
  card: document.querySelector('.game-card'),
  button: document.querySelector('#boom-button'),
  buttonStage: document.querySelector('#button-stage'),
  connection: document.querySelector('#connection-note'),
  countdownLabel: document.querySelector('#countdown-label'),
  countdownPanel: document.querySelector('#countdown-panel'),
  countdownValue: document.querySelector('#countdown-value'),
  counter: document.querySelector('#counter-value'),
  particles: document.querySelector('#particle-field'),
  plusOne: document.querySelector('#plus-one'),
  impact: document.querySelector('#impact-burst'),
};

let supabase = null;
let hasCloudCount = false;
let lastClickAt = Number.NEGATIVE_INFINITY;
let retryTimer = null;
let pollTimer = null;
let confirmedCount = null;
let channel = null;

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
  elements.connection.hidden = !visible;
}

function renderCount(value) {
  const parsed = parseCount(value);
  if (parsed === null) return false;
  confirmedCount = confirmedCount === null || parsed > confirmedCount ? parsed : confirmedCount;
  elements.counter.textContent = new Intl.NumberFormat('zh-CN').format(confirmedCount);
  elements.counter.classList.remove('is-loading');
  elements.counter.removeAttribute('aria-busy');
  elements.counter.setAttribute('aria-label', '全球共按下 ' + elements.counter.textContent + ' 次');
  hasCloudCount = true;
  elements.button.disabled = false;
  return true;
}

function updateCountdown() {
  const remaining = GAME_START - Date.now();
  if (remaining <= 0) {
    elements.countdownLabel.textContent = '💥 游戏开始！';
    elements.countdownValue.textContent = '总统与炸弹客，准备见面。';
    elements.countdownPanel.classList.add('is-started');
    return;
  }
  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  elements.countdownValue.textContent = days + '天 ' + String(hours).padStart(2, '0') + '小时 ' + String(minutes).padStart(2, '0') + '分';
}

function makeParticles() {
  const colors = ['#283f7d', '#c53b34', '#dfb952', '#191a1b', '#8e3330', '#4368ab', '#f3efe5'];
  for (let index = 0; index < colors.length; index += 1) {
    const particle = document.createElement('span');
    const angle = ((index / colors.length) * Math.PI * 2) - Math.PI / 2;
    const distance = 47 + ((index % 3) * 12);
    particle.className = 'particle';
    particle.style.setProperty('--dx', (Math.cos(angle) * distance) + 'px');
    particle.style.setProperty('--dy', (Math.sin(angle) * distance) + 'px');
    particle.style.setProperty('--particle-color', colors[index]);
    particle.style.setProperty('--particle-delay', ((index % 3) * 12) + 'ms');
    elements.particles.append(particle);
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
  }
}

function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

function playFeedback() {
  replayAnimation(elements.card, 'is-tapped');
  replayAnimation(elements.buttonStage, 'is-impacting');
  replayAnimation(elements.plusOne, 'is-rising');
  replayAnimation(elements.impact, 'is-bursting');
  replayAnimation(elements.button, 'is-pressed');
  makeParticles();
  if (typeof navigator.vibrate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    navigator.vibrate(16);
  }
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
  const now = performance.now();
  if (now - lastClickAt < MIN_CLICK_INTERVAL) return;
  lastClickAt = now;
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
