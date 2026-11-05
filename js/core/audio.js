// 生成式音效：全部用 WebAudio 实时合成，项目里没有一个音频文件。
// 每次播放都会随机微调音高、泛音与包络，所以同一个动效不会听起来完全一样。
//
// 设计原则：
// - 所有入口都容错，Node 环境（测试）或没有 AudioContext 的浏览器会自动静默降级。
// - AudioContext 必须在用户手势后创建，否则 Chrome 会挂起；这里用 ensure() 懒初始化。
// - 音量与开关持久化到 localStorage，刷新后保持。

const STORE_KEY = 'mm_audio_pref';

const state = {
  ctx: null,
  master: null,
  comp: null,
  enabled: true,
  volume: 0.55,
  ambient: null,
  lastPlay: 0,
};

// ---------- 偏好读写 ----------
function loadPref() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (typeof p.enabled === 'boolean') state.enabled = p.enabled;
    if (Number.isFinite(p.volume)) state.volume = Math.max(0, Math.min(1, p.volume));
  } catch (e) { /* 忽略损坏的偏好 */ }
}

function savePref() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORE_KEY, JSON.stringify({ enabled: state.enabled, volume: state.volume }));
  } catch (e) { /* 隐私模式下写入会失败，忽略 */ }
}

loadPref();

// ---------- 基础设施 ----------
function ensure() {
  if (state.ctx) return state.ctx;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try {
    state.ctx = new AC();
    const comp = state.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.18;
    const master = state.ctx.createGain();
    master.gain.value = state.volume;
    comp.connect(master);
    master.connect(state.ctx.destination);
    state.comp = comp;
    state.master = master;
  } catch (e) {
    state.ctx = null;
  }
  return state.ctx;
}

// 浏览器要求在用户手势里 resume
export function unlockAudio() {
  const ctx = ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return !!ctx;
}

export function audioEnabled() { return state.enabled; }
export function audioVolume() { return state.volume; }

export function setAudioEnabled(on) {
  state.enabled = !!on;
  savePref();
  if (state.master) {
    state.master.gain.setTargetAtTime(state.enabled ? state.volume : 0, state.ctx.currentTime, 0.03);
  }
  if (!state.enabled) stopAmbient();
  return state.enabled;
}

export function setAudioVolume(v) {
  state.volume = Math.max(0, Math.min(1, Number(v) || 0));
  savePref();
  if (state.master) state.master.gain.setTargetAtTime(state.enabled ? state.volume : 0, state.ctx.currentTime, 0.03);
  return state.volume;
}

// 通用振荡器音符
function note(t0, { freq, freq2, type = 'sine', dur = 0.18, gain = 0.2, attack = 0.008, curve = 'exp' }) {
  const ctx = state.ctx;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freq2 && freq2 !== freq) {
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t0 + dur);
    else osc.frequency.linearRampToValueAtTime(Math.max(20, freq2), t0 + dur);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(state.comp);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 噪声脉冲（打击感、施工、翻页）
function noise(t0, { dur = 0.16, gain = 0.16, hp = 400, lp = 6000 }) {
  const ctx = state.ctx;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = (hp + lp) / 2;
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(bp); bp.connect(g); g.connect(state.comp);
  src.start(t0);
}

const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- 音色库 ----------
// 每个音色返回一个"演奏"函数，播放时带随机化
const VOICES = {
  // 界面点击
  click(t) {
    const f = rnd(760, 980);
    note(t, { freq: f, freq2: f * 0.82, type: 'triangle', dur: 0.06, gain: 0.1, attack: 0.003 });
  },
  // 悬停 / 轻触
  hover(t) {
    note(t, { freq: rnd(1180, 1320), type: 'sine', dur: 0.035, gain: 0.045, attack: 0.002 });
  },
  // 成功
  good(t) {
    const base = rnd(496, 540);
    note(t, { freq: base, type: 'triangle', dur: 0.13, gain: 0.13 });
    note(t + 0.075, { freq: base * 1.5, type: 'triangle', dur: 0.2, gain: 0.12 });
    note(t + 0.075, { freq: base * 3, type: 'sine', dur: 0.16, gain: 0.05 });
  },
  // 失败
  bad(t) {
    note(t, { freq: rnd(190, 220), freq2: 96, type: 'sawtooth', dur: 0.28, gain: 0.13, attack: 0.006 });
    noise(t, { dur: 0.12, gain: 0.06, hp: 200, lp: 900 });
  },
  // 提醒
  warn(t) {
    note(t, { freq: 660, type: 'square', dur: 0.075, gain: 0.075 });
    note(t + 0.1, { freq: 588, type: 'square', dur: 0.11, gain: 0.065 });
  },
  // 月度推进：低频心跳 + 翻页
  month(t) {
    note(t, { freq: rnd(88, 104), freq2: 58, type: 'sine', dur: 0.34, gain: 0.24, attack: 0.01 });
    noise(t + 0.02, { dur: 0.2, gain: 0.05, hp: 900, lp: 4200 });
  },
  // 现金变动
  money(t) {
    const arp = [0, 4, 7, 12];
    arp.forEach((semi, i) => {
      note(t + i * 0.045, { freq: 523.25 * Math.pow(2, semi / 12), type: 'triangle', dur: 0.14, gain: 0.075 });
    });
  },
  // 施工开工
  build(t) {
    noise(t, { dur: 0.24, gain: 0.14, hp: 120, lp: 1400 });
    note(t + 0.06, { freq: 150, freq2: 92, type: 'square', dur: 0.22, gain: 0.1 });
  },
  // 竣工
  built(t) {
    [0, 5, 9, 12, 17].forEach((semi, i) => {
      note(t + i * 0.085, { freq: 392 * Math.pow(2, semi / 12), type: 'triangle', dur: 0.26, gain: 0.085 });
    });
    noise(t + 0.02, { dur: 0.3, gain: 0.07, hp: 600, lp: 5200 });
  },
  // 发布会：低频轰鸣 + 上行扫频 + 和弦
  launch(t) {
    note(t, { freq: 60, freq2: 40, type: 'sine', dur: 1.1, gain: 0.26, attack: 0.06 });
    noise(t, { dur: 0.9, gain: 0.1, hp: 300, lp: 3000 });
    [0, 7, 12, 16, 19].forEach((semi, i) => {
      note(t + 0.12 + i * 0.055, { freq: 261.63 * Math.pow(2, semi / 12), type: 'sawtooth', dur: 0.9, gain: 0.055, attack: 0.05 });
    });
  },
  // 里程碑
  milestone(t) {
    const seq = [523.25, 659.25, 783.99, 1046.5];
    seq.forEach((f, i) => {
      note(t + i * 0.11, { freq: f, type: 'triangle', dur: 0.42, gain: 0.1 });
      note(t + i * 0.11, { freq: f * 2, type: 'sine', dur: 0.3, gain: 0.035 });
    });
    note(t + 0.44, { freq: 1568, type: 'sine', dur: 0.7, gain: 0.06 });
  },
  // 研发完成
  research(t) {
    note(t, { freq: 440, freq2: 880, type: 'sine', dur: 0.35, gain: 0.1 });
    note(t + 0.16, { freq: 1320, type: 'triangle', dur: 0.24, gain: 0.055 });
  },
  // 设计器：参数微调
  tweak(t) {
    note(t, { freq: rnd(1500, 2100), type: 'sine', dur: 0.04, gain: 0.035, attack: 0.002 });
  },
  // 拆解 / 视角切换
  whoosh(t) {
    noise(t, { dur: 0.34, gain: 0.075, hp: 200, lp: 5200 });
    note(t, { freq: 320, freq2: 780, type: 'sine', dur: 0.3, gain: 0.04, attack: 0.05 });
  },
};

const ALIAS = { ok: 'good', success: 'good', error: 'bad', danger: 'bad', info: 'click' };

/**
 * 播放一个音效。
 * @param {string} name 音色名，见 VOICES；未知名称静默忽略。
 */
export function sfx(name) {
  if (!state.enabled) return false;
  const voice = VOICES[ALIAS[name] || name];
  if (!voice) return false;
  const ctx = ensure();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  // 同一帧内不要叠加同一种音效，避免连点炸音
  const now = ctx.currentTime;
  if (now - state.lastPlay < 0.008) return false;
  state.lastPlay = now;
  try {
    voice(now + 0.001);
  } catch (e) {
    return false;
  }
  return true;
}

// ---------- 环境底噪（可选）：极轻的办公室氛围 ----------
export function startAmbient() {
  const ctx = ensure();
  if (!ctx || !state.enabled || state.ambient) return;
  try {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // 布朗噪声：比白噪声更接近空调/机房
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.035, ctx.currentTime, 1.2);
    src.connect(lp); lp.connect(g); g.connect(state.comp);
    src.start();
    state.ambient = { src, g };
  } catch (e) { /* 忽略 */ }
}

export function stopAmbient() {
  if (!state.ambient || !state.ctx) return;
  const { src, g } = state.ambient;
  try {
    g.gain.setTargetAtTime(0.0001, state.ctx.currentTime, 0.25);
    setTimeout(() => { try { src.stop(); } catch (e) { /* 已停止 */ } }, 700);
  } catch (e) { /* 忽略 */ }
  state.ambient = null;
}

// 供测试用：不依赖真实 AudioContext 也能验证映射是否存在
export const VOICE_NAMES = Object.keys(VOICES);
