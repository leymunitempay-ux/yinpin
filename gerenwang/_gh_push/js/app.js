/* ============================================================
   app.js —— 「沉浸视界」站点交互主逻辑
   ------------------------------------------------------------
   * 开场「睁眼」仪式
   * 顶部导航 ↔ 3D 镜头飞行联动
   * 关于 / 足迹 / 兴趣 / 联系 四个「全息窗口」
   * 联系表单提交到后端 /api/contact
   * WebAudio 环境音 + 开关（音效 / 安静 / 全屏）
   * 氛围切换（夜色/黄昏/晨光）、陀螺仪视角、星尘特效、罗盘 HUD
   ============================================================ */
import * as S from "./scene.js";
window.__S = S; // 调试/扩展句柄（如浏览器控制台调用 __S.debugMeteor()）

/* ---------- DOM ---------- */
const $ = (s) => document.querySelector(s);
const els = {
  scene: $("#scene"),
  navbar: $("#navbar"),
  hero: $("#hero"),
  boot: $("#boot"),
  btnEnter: $("#btn-enter"),
  btnMood: $("#btn-mood"),
  btnAuto: $("#btn-auto"),
  btnSound: $("#btn-sound"),
  btnGyro: $("#btn-gyro"),
  btnCalm: $("#btn-calm"),
  btnFull: $("#btn-full"),
  btnHall: $("#btn-hall"),
  btnClose: $("#holo-close"),
  holo: $("#holo"),
  holoTitle: $("#holo-title"),
  holoTag: $("#holo-tag"),
  holoBody: $("#holo-body"),
  toast: $("#toast"),
  detail: $("#detail"),
  fallback: $("#fallback"),
  compass: $("#compass"),
  compassItems: $("#compass-items"),
  fx: $("#fx"),
  heroQuote: $("#hero-quote"),
  todayBadge: $("#today-badge"),
  moodDock: $("#mood-dock"),
  lb: $("#lb"),
  lbImg: $("#lb-img"),
  lbCap: $("#lb-cap"),
  lbCount: $("#lb-count"),
  lbPrev: $("#lb-prev"),
  lbNext: $("#lb-next"),
  lbClose: $("#lb-close"),
};

/* ---------- 区域主题 ---------- */
const SEC = {
  hall:    { name: "大厅",   color: "#ffd28a", icon: "✦" },
  about:   { name: "关于我", color: "#ff9e7d", icon: "◈" },
  works:   { name: "足迹",   color: "#8fe3c9", icon: "❖" },
  skills:  { name: "兴趣",   color: "#c9a6ff", icon: "✧" },
  contact: { name: "联系我", color: "#ff9ec4", icon: "✉" },
};
const ORDER = ["hall", "about", "works", "skills", "contact"];
const SKILL_COLORS = ["#ff9e7d", "#8fe3c9", "#c9a6ff", "#ff9ec4", "#ffd28a", "#9ad0ff"];

/* ---------- 氛围（与 scene.js MOODS 键一致） ---------- */
const MOOD_ORDER = ["night", "dusk", "dawn", "day"];
const MOOD_UI = {
  night: { icon: "🌙", label: "夜色" },
  dusk:  { icon: "🌇", label: "黄昏" },
  dawn:  { icon: "🌅", label: "晨光" },
  day:   { icon: "🌤", label: "白昼" },
};

/* ---------- 情绪电台 ---------- */
const EMOTION_UI = {
  calm: { icon: "😌", label: "平静" },
  rain: { icon: "🌧", label: "雨天" },
  hot:  { icon: "🔥", label: "热烈" },
};
const FX_PALETTES = {
  calm: ["#ff9e7d", "#8fe3c9", "#c9a6ff", "#ff9ec4", "#ffd28a", "#9ad0ff"],
  rain: ["#9fc8ff", "#bcd4ff", "#d0e6ff", "#a8c4e8", "#cfe0ff"],
  hot:  ["#ffb36b", "#ff7b6b", "#ffd166", "#ff9e7d", "#ff8fa3", "#ffe0a3"],
};

/* ---------- 罗盘（灯塔方位，与 scene.js BEACONS 一致） ---------- */
const COMPASS = [
  { id: "works",   label: "足迹",   az: 0,          color: "#8fe3c9" },
  { id: "about",   label: "关于我", az: Math.PI / 2,  color: "#ff9e7d" },
  { id: "skills",  label: "兴趣",   az: Math.PI,      color: "#c9a6ff" },
  { id: "contact", label: "联系我", az: -Math.PI / 2, color: "#ff9ec4" },
];

/* ---------- 数据（默认占位 → 尝试读取 profile.json） ---------- */
const DEFAULT_PROFILE = {
  site: { brand: "沉浸视界", motto: "把生活，过成自己喜欢的样子" },
  owner: {
    name: "你的名字", enName: "", avatarText: "你",
    title: "一个认真生活、对世界保持好奇的人",
    headline: "你好，我是「你的名字」",
    subhead: "欢迎来到我的小宇宙",
    bio: "这是我的小宇宙。\n（占位示例，请替换成你自己的故事）",
    location: "", email: "",
  },
  timeline: [],
  moments: [],
  interests: [],
  socials: [],
};
let P = DEFAULT_PROFILE;
let soundOn = localStorage.getItem("dsh.sound") === "1";
let calmOn = localStorage.getItem("dsh.calm") === "1";

/* ---------- 功能开关（可在 /admin 后台直接改，无需动代码） ---------- */
const CFG_DEFAULT = {
  dailyQuote: true, specialDays: true, moodDock: true, starLighting: true,
  meteors: true, compass: true, moodAuto: true, fxSparkles: true,
};
let CFG = { ...CFG_DEFAULT };

/* ---------- 小工具 ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmt = (s, d) => s ?? d ?? "";
let toastTimer = null;
function toast(msg, type = "") {
  els.toast.textContent = msg;
  els.toast.className = type; // "ok" | "err" | ""
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 3400);
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/* ============================================================
   氛围切换：夜色 / 黄昏 / 晨光
   ============================================================ */
let appMoved = false; // 用户是否已经开始探索（决定罗盘是否显示）
function savedMood() {
  const s = localStorage.getItem("dsh.mood");
  return MOOD_ORDER.includes(s) ? s : "night";
}
function applyMoodUI(name) {
  const ui = MOOD_UI[name] || MOOD_UI.night;
  document.body.dataset.mood = name;
  els.btnMood.textContent = ui.icon;
  els.btnMood.title = `氛围：${ui.label} · 点击切换`;
}
function cycleMood() {
  moodAuto = false; // 手动切换 → 退出自动跟随
  localStorage.setItem("dsh.moodauto", "0");
  applyMoodAutoUI();
  const cur = savedMood();
  const next = MOOD_ORDER[(MOOD_ORDER.indexOf(cur) + 1) % MOOD_ORDER.length];
  applyMoodUI(next);
  S.setMood(next); // scene.js 内部同步（天空/雾/星云）
  localStorage.setItem("dsh.mood", next);
  Audio.blip();
  toast(`氛围切换：${MOOD_UI[next].label}`);
}

/* ============================================================
   氛围自动跟随真实时间（晨 / 昼 / 昏 / 夜）
   ============================================================ */
let moodAuto = localStorage.getItem("dsh.moodauto") !== "0"; // 默认自动
function moodForTime() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return "dawn";
  if (h >= 10 && h < 16) return "day";
  if (h >= 16 && h < 19) return "dusk";
  return "night";
}
function applyMoodAutoUI() {
  els.btnAuto.classList.toggle("on", moodAuto);
  els.btnAuto.title = moodAuto ? "氛围已自动跟随当前时间（点击改手动）" : "氛围为手动模式（点击恢复自动）";
}
function applyTimeMood() {
  if (!moodAuto) return;
  const m = moodForTime();
  applyMoodUI(m);
  S.setMood(m);
  localStorage.setItem("dsh.mood", m);
}
function bindMoodAuto() {
  els.btnAuto.addEventListener("click", () => {
    moodAuto = !moodAuto;
    localStorage.setItem("dsh.moodauto", moodAuto ? "1" : "0");
    if (moodAuto) {
      applyTimeMood();
      toast(`氛围已恢复自动跟随时间（当前 ${MOOD_UI[moodForTime()].label}）`);
    } else {
      toast("氛围已切换为手动调节（点 🌙 自由切换）");
    }
    applyMoodAutoUI();
  });
  applyMoodAutoUI();
  applyTimeMood();
  setInterval(applyTimeMood, 60_000); // 每分钟校准一次
}

/* ============================================================
   光标星尘粒子特效（2D 叠加画布，加色混合）
   ============================================================ */
const FX = { ctx: null, parts: [], running: false, dpr: 1, glows: {}, last: 0, palette: FX_PALETTES.calm.slice(), rain: false, drops: [] };
const TAU2 = Math.PI * 2;
function fxResize() {
  if (!els.fx) return;
  FX.dpr = Math.min(window.devicePixelRatio || 1, 2);
  els.fx.width = Math.floor(window.innerWidth * FX.dpr);
  els.fx.height = Math.floor(window.innerHeight * FX.dpr);
  FX.ctx = els.fx.getContext("2d");
  FX.ctx.setTransform(FX.dpr, 0, 0, FX.dpr, 0, 0);
}
function glowSprite(hex) {
  if (FX.glows[hex]) return FX.glows[hex];
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.3, hex + "cc");
  grd.addColorStop(1, hex + "00");
  g.fillStyle = grd;
  g.fillRect(0, 0, 48, 48);
  FX.glows[hex] = c;
  return c;
}
function fxSpawn(x, y, n, opts = {}) {
  if (document.body.classList.contains("calm")) return; // 安静模式不产生特效
  if (!FX.ctx) return;
  const spread = opts.spread ?? TAU2;
  const speed = opts.speed ?? 60;
  const size = opts.size ?? 7;
  const life = opts.life ?? 0.55;
  const grav = opts.grav ?? 0;
  const palette = FX.palette || SKILL_COLORS;
  const col = opts.color || palette[(Math.random() * palette.length) | 0];
  const img = glowSprite(col);
  for (let i = 0; i < n; i++) {
    if (FX.parts.length > 320) FX.parts.shift();
    const a = Math.random() * spread;
    const sp = speed * (0.4 + Math.random() * 0.8);
    FX.parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: life * (0.6 + Math.random() * 0.6), max: life,
      size: size * (0.6 + Math.random() * 0.8), img, grav,
    });
  }
  if (!FX.running) { FX.running = true; requestAnimationFrame(fxLoop); }
}
/** 情绪电台：切换粒子配色 + 雨天氛围 */
function fxSetEmotion(name) {
  FX.palette = FX_PALETTES[name] ? FX_PALETTES[name].slice() : FX_PALETTES.calm.slice();
  FX.rain = name === "rain";
  if (FX.rain) {
    FX.drops = [];
    const n = Math.min(90, Math.floor(window.innerWidth / 14));
    for (let i = 0; i < n; i++) FX.drops.push({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight, s: 14 + Math.random() * 14, a: 0.08 + Math.random() * 0.16 });
  } else FX.drops = [];
}
/** 庆祝（特别日子）：从屏幕上方撒下光点 */
function fxCelebrate() {
  if (document.body.classList.contains("calm")) return;
  const w = window.innerWidth;
  const n = Math.min(130, Math.floor(w / 9));
  const pal = ["#ffd28a", "#ff9ec4", "#8fe3c9", "#c9a6ff", "#9ad0ff", "#ffb36b"];
  for (let i = 0; i < n; i++) {
    fxSpawn(Math.random() * w, -12, 1, {
      size: 7 + Math.random() * 8, life: 2.2 + Math.random() * 1.6,
      speed: 0, color: pal[i % pal.length], grav: 34 + Math.random() * 26,
      spread: 0,
    });
  }
}
function fxLoop() {
  const ctx = FX.ctx;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  const dt = 1 / 60;
  const kept = [];
  for (const p of FX.parts) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy += (p.grav || 0) * dt;
    p.x += p.vx * dt + Math.sin(p.life * 6 + (p.y * 0.01)) * 14 * dt; // 轻微飘摆
    p.y += p.vy * dt;
    if (p.grav) p.vy = Math.min(p.vy, 60);
    p.vx *= 0.98; p.vy *= 0.98;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max)) * 0.85;
    const s = p.size * (0.4 + (p.life / p.max));
    ctx.drawImage(p.img, p.x - s, p.y - s, s * 2, s * 2);
    kept.push(p);
  }
  // 雨天：细斜雨丝
  if (FX.rain && FX.drops.length && !document.body.classList.contains("calm")) {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(180,205,245,0.8)";
    ctx.lineWidth = 1;
    for (const d of FX.drops) {
      d.y += d.s * dt * 3.2;
      if (d.y > window.innerHeight + 20) { d.y = -20; d.x = Math.random() * window.innerWidth; }
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 6, d.y - d.s);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  FX.parts = kept;
  if (FX.parts.length || (FX.rain && FX.drops.length)) requestAnimationFrame(fxLoop);
  else FX.running = false;
}
function fxTrail(e) {
  if (!CFG.fxSparkles) return;
  const now = performance.now();
  if (now - FX.last < 13) return;
  FX.last = now;
  fxSpawn(e.clientX, e.clientY, 1, { size: 6, life: 0.45, speed: 26 });
}
function fxTap(e) {
  if (!CFG.fxSparkles) return;
  fxSpawn(e.clientX, e.clientY, 9, { size: 8, life: 0.6, speed: 90 });
  if (e.type === "pointerup" && FX.running) fxSpawn(e.clientX, e.clientY, 4, { size: 5, life: 0.3, speed: 30 });
}

/* ============================================================
   方向罗盘 HUD：指示四座灯塔的方位
   ============================================================ */
const compassRefs = [];
function initCompass() {
  els.compassItems.innerHTML = "";
  for (const c of COMPASS) {
    const el = document.createElement("button");
    el.className = "cp-item";
    el.style.setProperty("--cc", c.color);
    el.innerHTML = `<span class="cp-dot"></span><span class="cp-label">${c.label}</span>`;
    el.addEventListener("click", () => goSection(c.id));
    els.compassItems.appendChild(el);
    compassRefs.push({ c, el });
  }
}
const appShortest = (a, b) => { let d = (b - a) % TAU2; if (d > Math.PI) d -= TAU2; if (d < -Math.PI) d += TAU2; return d; };
const appNorm = (v) => ((v + Math.PI) % TAU2 + TAU2) % TAU2 - Math.PI;
function updateCompass(v) {
  if (!compassRefs.length) return;
  if (!CFG.compass) { els.compass.classList.add("off"); return; } // 后台可关闭罗盘
  const heroFolded = els.hero.classList.contains("folded");
  const busy = !els.holo.classList.contains("hidden") || !els.detail.classList.contains("hidden");
  const show = !busy && (appMoved || heroFolded);
  els.compass.classList.toggle("off", !show);
  if (!show) return;
  const front = appNorm(v.yaw + Math.PI); // 视线正前方方位角
  for (const r of compassRefs) {
    const s = appShortest(front, r.c.az); // 该灯塔相对前方的偏角
    const pct = 50 - s * 24;              // 右为正方向：前方居中，绕到两侧
    const p = Math.max(6, Math.min(94, pct));
    const fade = Math.abs(s) < 0.85 ? 1 : Math.max(0.16, 1 - (Math.abs(s) - 0.85) / 2.3);
    r.el.style.left = `${p}%`;
    r.el.style.opacity = String(fade);
  }
}

/* ============================================================
   陀螺仪按钮（手机转头视角）
   ============================================================ */
async function toggleGyroUI() {
  if (els.btnGyro.disabled) return;
  els.btnGyro.disabled = true;
  const r = await S.toggleGyro();
  els.btnGyro.disabled = false;
  if (!r.ok) { toast(r.msg || "陀螺仪开启失败", "err"); return; }
  if (r.active) {
    els.btnGyro.classList.add("on");
    toast("🎡 已开启陀螺仪：转动手机 / 设备即可环顾四周");
    setTimeout(() => {
      if (S.isGyroActive() && S.gyroEventCount() === 0) {
        toast("暂时没收到陀螺仪数据：请在手机浏览器中打开并允许传感器", "err");
      }
    }, 2400);
  } else {
    els.btnGyro.classList.remove("on");
    toast("已关闭陀螺仪视角");
  }
}

/* ---------- 环境音（WebAudio 合成，无素材依赖） ---------- */
const Audio = {
  ctx: null,
  master: null,
  on: false,
  emotion: "calm",
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    // 两个低频振荡器（呼吸感 drone）
    const mkOsc = (freq, type, g) => {
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      const gn = this.ctx.createGain(); gn.gain.value = g;
      o.connect(gn); gn.connect(this.master); o.start();
      return o;
    };
    mkOsc(55, "sine", 0.5);
    const o2 = mkOsc(82.4, "sine", 0.3);
    // 缓慢的漂移 LFO
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 6;
    lfo.connect(lfoG); lfoG.connect(o2.detune); lfo.start();
    // 柔和噪声 = 空间风声
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
    const ng = this.ctx.createGain(); ng.gain.value = 0.4;
    src.connect(lp); lp.connect(ng); ng.connect(this.master); src.start();

    // 情绪图层（雨天噪声 / 热烈暖音），默认静音，随情绪启停
    this._rainG = this.ctx.createGain(); this._rainG.gain.value = 0;
    const rn = this.ctx.createBufferSource(); rn.buffer = buf; rn.loop = true;
    const rb = this.ctx.createBiquadFilter(); rb.type = "bandpass"; rb.frequency.value = 1500; rb.Q.value = 0.7;
    rn.connect(rb); rb.connect(this._rainG); this._rainG.connect(this.master); rn.start();

    this._padG = this.ctx.createGain(); this._padG.gain.value = 0;
    const po1 = this.ctx.createOscillator(); po1.type = "sine"; po1.frequency.value = 165;
    const po2 = this.ctx.createOscillator(); po2.type = "sine"; po2.frequency.value = 247;
    const po3 = this.ctx.createOscillator(); po3.type = "triangle"; po3.frequency.value = 82.5;
    po1.connect(this._padG); po2.connect(this._padG); po3.connect(this._padG);
    this._padG.connect(this.master); po1.start(); po2.start(); po3.start();
  },
  toggle() {
    this.ensure();
    if (!this.ctx) { toast("当前浏览器不支持 WebAudio", "err"); return; }
    this.on = !this.on;
    this._apply();
    localStorage.setItem("dsh.sound", this.on ? "1" : "0");
  },
  /** 按当前开关状态应用音量（不翻转开关） */
  sync() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    this._apply();
  },
  _apply() {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.on ? 0.06 : 0, t, 0.4);
    this._applyEmotion();
    els.btnSound.textContent = this.on ? "🔊" : "🔇";
    els.btnSound.classList.toggle("off", !this.on);
  },
  /** 情绪电台：切换音乐性格（雨天=雨声，热烈=暖音，平静=纯环境） */
  setEmotion(name) {
    this.emotion = name || "calm";
    this._applyEmotion();
  },
  _applyEmotion() {
    if (!this.ctx || !this._rainG || !this._padG) return;
    const t = this.ctx.currentTime;
    const k = this.on ? 1 : 0;
    const rg = k * (this.emotion === "rain" ? 0.14 : 0);
    const pg = k * (this.emotion === "hot" ? 0.055 : 0);
    this._rainG.gain.setTargetAtTime(rg, t, 0.6);
    this._padG.gain.setTargetAtTime(pg, t, 0.6);
  },
  /** 交互小音效（导航点击） */
  blip() {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(940, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.18);
  },
};
window.__audio = Audio;

/* ============================================================
   每日一言 & 特别日子彩蛋
   ============================================================ */
function renderDaily() {
  // 每日一言（后台可关闭）
  if (CFG.dailyQuote) {
    const qs = (P.quotes && P.quotes.length) ? P.quotes : null;
    if (qs && els.heroQuote) {
      const idx = Math.floor(Date.now() / 86400000) % qs.length;
      els.heroQuote.textContent = `「${qs[idx]}」`;
    }
  } else if (els.heroQuote) els.heroQuote.textContent = "";
  // 特别日子（后台可关闭）
  const now = new Date();
  const sd = (CFG.specialDays && (P.specialDays || []).find(
    (d) => +d.month === now.getMonth() + 1 && +d.day === now.getDate()
  ));
  if (sd && els.todayBadge) {
    els.todayBadge.classList.remove("hidden");
    els.todayBadge.textContent = `${sd.emoji || "🎉"} ${sd.text || "今天是个特别的日子"}`;
    const key = `dsh.spd-${now.getMonth() + 1}-${now.getDate()}`;
    if (!sessionStorage.getItem(key)) { // 当天只庆祝一次
      sessionStorage.setItem(key, "1");
      setTimeout(fxCelebrate, 1500);
    }
  }
}

/* ============================================================
   情绪电台（平静 / 雨天 / 热烈）
   ============================================================ */
function setEmotion(name) {
  if (!EMOTION_UI[name]) return;
  const u = EMOTION_UI[name];
  els.moodDock.querySelectorAll(".mood-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.em === name));
  S.setEmotion(name);
  fxSetEmotion(name);
  Audio.setEmotion(name);
  document.body.dataset.emotion = name;
  if (name !== "calm") toast(`${u.icon} 已切换到「${u.label}」的心情`);
  Audio.blip();
}
function bindEmotionDock() {
  if (!CFG.moodDock) { els.moodDock.classList.add("hidden"); return; } // 后台可隐藏心情按钮
  els.moodDock.querySelectorAll(".mood-btn").forEach((b) =>
    b.addEventListener("click", () => setEmotion(b.dataset.em)));
  fxSetEmotion("calm");
}

/* ============================================================
   点亮星星 / 拍拍光核（智能点击）
   ============================================================ */
function onPickId(id) {
  if (id === "hall") {
    const atHall = els.holo.classList.contains("hidden") && activeSec === "hall";
    if (atHall) { // 已在大厅：拍拍光核 → 冲击波
      if (S.poke()) {
        Audio.blip();
        fxSpawn(window.innerWidth / 2, window.innerHeight / 2, 12, { size: 9, life: 0.7, speed: 130 });
        toast("💫 嘘，它轻轻颤了一下");
      }
      return;
    }
  }
  goSection(id);
}
function starLitUI(info) {
  if (!info || !info.fresh) return;
  Audio.blip();
  fxSpawn(info.x, info.y, 7, { size: 7, life: 0.55, speed: 80 });
  const today = new Date().toISOString().slice(0, 10);
  const key = "dsh.stars-" + today;
  const n = (parseInt(localStorage.getItem(key) || "0", 10) || 0) + 1;
  localStorage.setItem(key, String(n));
  if (n === 1 || n % 10 === 0) toast(`✨ 你点亮了今天第 ${n} 颗星`);
}

/* ============================================================
   全屏相册灯箱
   ============================================================ */
let lbList = [], lbIdx = 0;
function photosOf(w) {
  const arr = (w && w.photos && w.photos.length) ? w.photos : (w && w.photo ? [w.photo] : []);
  return arr.filter(Boolean);
}
function lbShow() {
  if (!lbList.length) return;
  els.lbImg.src = lbList[lbIdx];
  els.lbImg.alt = "照片";
  els.lb.classList.remove("hidden");
  els.lbCount.textContent = `${lbIdx + 1} / ${lbList.length}`;
}
function lbStep(d) {
  if (!lbList.length) return;
  lbIdx = (lbIdx + d + lbList.length) % lbList.length;
  lbShow();
}
function lbClose() { els.lb.classList.add("hidden"); lbList = []; }
function openLightbox(list, idx = 0) {
  if (!list.length) return;
  lbList = list.slice();
  lbIdx = Math.max(0, Math.min(idx, lbList.length - 1));
  lbShow();
}
function bindLightbox() {
  els.lbClose.addEventListener("click", lbClose);
  els.lbPrev.addEventListener("click", () => lbStep(-1));
  els.lbNext.addEventListener("click", () => lbStep(1));
  els.lb.addEventListener("click", (e) => { if (e.target === els.lb) lbClose(); });
}

/* ---------- 数据加载 ---------- */
async function loadProfile() {
  try {
    const r = await fetch("./data/profile.json", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    P = { ...DEFAULT_PROFILE, ...j, owner: { ...DEFAULT_PROFILE.owner, ...(j.owner || {}) } };
    CFG = { ...CFG_DEFAULT, ...((j.config && typeof j.config === "object") ? j.config : {}) };
    // 容错：moments 的 tags/photos 若写成文本，自动还原为数组
    (P.moments || []).forEach((m) => {
      ["tags", "photos"].forEach((k) => {
        if (m[k] != null && !Array.isArray(m[k])) m[k] = String(m[k]).split(/[，,\n]/).map((s) => s.trim()).filter(Boolean);
      });
    });
  } catch {
    console.warn("profile.json 读取失败，使用内置占位内容");
  }
  applyProfileToUI();
}

function applyProfileToUI() {
  const o = P.owner, s = P.site;
  document.title = `${s.brand} · ${o.name}`;
  $("#brand-text").textContent = s.brand;
  $("#hero-kicker").textContent = `✦ ${s.brand} · 欢迎来到我的小宇宙`;
  $("#hero-name").textContent = o.headline || `你好，我是 ${o.name}`;
  $("#hero-title").textContent = o.title;
  $("#hero-motto").textContent = s.motto;
  $("#boot-name").textContent = s.brand;
  $("#boot-sub").textContent = `${s.brand} —— ${s.motto}。`;
}

/* ---------- 开场仪式 ---------- */
function bindBoot() {
  els.btnEnter.addEventListener("click", () => {
    Audio.sync(); // 用户手势：解锁音频上下文（按记忆的开关状态应用音量）
    els.boot.classList.add("done");
    setTimeout(() => els.boot.classList.add("gone"), 1000);
    els.navbar.classList.remove("hidden");
    S.startAuto();
    Audio.blip();
    setTimeout(renderDaily, 900); // 每日一言 / 特别日子角标与庆祝
    // 带 #/works 等直达链接进入时，自动飞向对应区域
    const dl = secFromHash();
    if (dl && dl !== "hall") setTimeout(() => goSection(dl), 900);
  });
}

/* ---------- 导航与镜头飞行 ---------- */
let activeSec = "hall";
let ctrl = null; // scene 控制器
let navQueue = Promise.resolve(); // 串行化导航动作，避免飞行中重复点击产生竞态
function queued(fn) {
  // 每步加 6s 超时兜底：任何卡死的飞行/等待都不会让导航永久失效
  const step = Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, rej) => setTimeout(() => rej(new Error("操作超时，已自动恢复")), 6000)),
  ]);
  navQueue = navQueue.then(() => step).catch((e) => console.error("nav err:", e));
  return navQueue;
}

function setTheme(sec) {
  const c = SEC[sec]?.color || "#ffd28a";
  const rgb = hexToRgb(c);
  document.documentElement.style.setProperty("--window-glow", c);
  document.documentElement.style.setProperty("--holo-rgb", `${rgb[0]},${rgb[1]},${rgb[2]}`);
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.sec === sec);
  });
}

async function openNow(sec) {
  if (!SEC[sec]) return;
  Audio.blip();
  if (!ctrl) { // 3D 不可用时的兜底：窗口内容照常可用
    if (sec === "hall") return;
    els.hero.classList.add("folded");
    els.holo.classList.remove("hidden");
    setTheme(sec);
    activeSec = sec;
    renderHolo(sec);
    updateHistory(sec);
    return;
  }
  if (sec === "hall") { await closeNow(true); return; }

  // 隐藏大厅主视觉 → 飞行 → 打开全息窗口
  els.hero.classList.add("folded");
  els.holo.classList.remove("hidden");
  if (!els.holoBody.firstChild) {
    els.holoBody.innerHTML = `<p class="skills-note" style="text-align:center;margin:30px 0">正在飞往「${SEC[sec].name}」… ✦</p>`;
  }
  setTheme(sec);
  activeSec = sec;
  ctrl.setWindowOpen(true);
  await ctrl.flyTo(sec);
  // 若在飞行途中窗口被关闭，则不再写入内容
  if (els.holo.classList.contains("hidden")) return;
  renderHolo(sec);
  els.holoBody.scrollTop = 0;
  updateHistory(sec); // 同步 URL（#/works 直达链接）
}

async function closeNow(toHall = true) {
  els.holo.classList.add("hidden");
  els.detail.classList.add("hidden");
  activeSec = "hall";
  setTheme("hall");
  ctrl?.setWindowOpen(false);
  if (toHall) {
    if (ctrl) await ctrl.returnHome();
    els.hero.classList.remove("folded");
  }
  updateHistory("hall");
  Audio.blip();
}

function goSection(sec) { appMoved = true; return queued(() => openNow(sec)); }
function closeWindow(toHall = true) { return queued(() => closeNow(toHall)); }

/* ---------- URL 直达与历史导航（#/works 等） ---------- */
function secFromHash() {
  const m = /^#\/([a-z]+)/.exec(location.hash || "");
  const s = m && m[1];
  return ORDER.includes(s) ? s : null;
}
function updateHistory(sec) {
  if (!window.history || !history.replaceState) return;
  if (sec === "hall") {
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  } else {
    const target = "#/" + sec;
    if (location.hash === target) return;
    history.pushState(null, "", target);
  }
}
function onRoute() {
  const s = secFromHash();
  const open = !els.holo.classList.contains("hidden");
  if (s) {
    if (s === activeSec && open) return;
    goSection(s); // 前进/直达 → 打开对应区域
  } else if (open) {
    closeWindow(true); // 后退 → 回到大厅
  }
}

function bindNav() {
  document.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => goSection(b.dataset.sec)));
  els.btnClose.addEventListener("click", () => closeWindow(true));
  els.btnHall.addEventListener("click", () => closeWindow(true));
  els.hero.querySelector("#hero-cta").addEventListener("click", () => goSection("works"));

  // 键盘：1-5 切换区域，Esc 关闭
  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    // 灯箱打开时：Esc 关闭，←/→ 翻页
    if (!els.lb.classList.contains("hidden")) {
      if (e.key === "Escape") lbClose();
      else if (e.key === "ArrowLeft") lbStep(-1);
      else if (e.key === "ArrowRight") lbStep(1);
      return;
    }
    const n = ORDER.indexOf(String(e.key));
    if (n >= 0) goSection(ORDER[n]); // 数字键 1-5 → 各区域
    else if (e.key === "Escape") {
      if (!els.detail.classList.contains("hidden")) els.detail.classList.add("hidden");
      else closeWindow(true);
    }
  });

  // 浏览器前进 / 后退 / 直达链接（#/works 等）
  window.addEventListener("popstate", onRoute);
  window.addEventListener("hashchange", onRoute);
}

/* ---------- 全息窗口内容 ---------- */
function renderHolo(sec) {
  const o = P.owner;
  const c = SEC[sec]?.color || "#ffd28a";
  els.holoTitle.textContent = SEC[sec].name;
  els.holoTag.textContent = SEC[sec].icon;
  els.holoTag.style.color = c;
  els.holoTag.style.borderColor = `${c}88`;
  els.holoTag.style.boxShadow = `0 0 14px ${c}66`;
  els.holo.style.setProperty("--window-glow", c);
  const body = els.holoBody;

  if (sec === "about") {
    const tl = (P.timeline || []).map((t, i) => `
      <div class="tl-item">
        <div class="tl-year" style="--tl-c:${c}">${esc(t.year)}</div>
        <div class="tl-title">${esc(t.title)}</div>
        <div class="tl-desc">${esc(t.desc)}</div>
      </div>`).join("");
    body.innerHTML = `
      <div class="bio" style="--tl-c:${c}">
        <p>${esc(o.bio)}</p>
      </div>
      ${tl ? `<div class="timeline" style="--tl-c:${c}">${tl}</div>` : ""}
      ${(o.location || o.email) ? `<p class="skills-note" style="margin-top:8px">📍 ${esc(o.location)} · ✉️ ${esc(o.email)}</p>` : ""}`;
  } else if (sec === "works") {
    const cards = (P.moments || []).map((w) => `
      <button class="work-card" style="--wc:${esc(w.color || c)}" data-id="${esc(w.id)}">
        <div class="work-cover" style="--wc:${esc(w.color || c)}">
          <span class="work-emoji">${esc(w.emoji || "✨")}</span>
          ${w.photo ? `<img class="work-img" src="${esc(w.photo)}" alt="${esc(w.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()" />` : ""}
        </div>
        <div class="work-meta">
          <div class="work-title">${esc(w.title)}</div>
          <div class="work-summary">${esc(w.summary)}</div>
          <div class="work-tags">${(w.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        </div>
      </button>`).join("");
    body.innerHTML = cards
      ? `<div class="works-grid">${cards}</div>
         <p class="skills-note" style="margin-top:16px">✦ 点击卡片，看看这些瞬间背后的故事</p>`
      : `<p class="skills-note">更多足迹正在整理中，欢迎之后再回来看看 ✨</p>`;
    body.querySelectorAll(".work-card").forEach((el) =>
      el.addEventListener("click", () => openDetail((P.moments || []).find((w) => w.id === el.dataset.id))));
  } else if (sec === "skills") {
    const rows = (P.interests || []).map((sk, i) => `
      <div class="skill-row" style="--sc:${SKILL_COLORS[i % SKILL_COLORS.length]}">
        <div class="skill-top"><span class="skill-name">${esc(sk.name)}</span><span class="skill-pct">${+sk.level || 0}%</span></div>
        <div class="skill-bar"><div class="skill-fill" data-lv="${Math.max(0, Math.min(100, +sk.level || 0))}"></div></div>
      </div>`).join("");
    body.innerHTML = rows
      ? `<div class="skills">${rows}</div><p class="skills-note" style="margin-top:18px">上面是我平时喜欢做的事，「浓度」仅供参考 😄</p>`
      : `<p class="skills-note">兴趣清单还在填写中 ✨</p>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      body.querySelectorAll(".skill-fill").forEach((f) => { f.style.width = `${f.dataset.lv}%`; });
    }));
  } else if (sec === "contact") {
    const socials = (P.socials || []).map((s) =>
      `<a class="social-link" href="${esc(s.url)}" target="_blank" rel="noopener"><span>${esc(s.icon || "🔗")}</span>${esc(s.name)}</a>`).join("");
    body.innerHTML = `
      <div class="contact-wrap">
        ${socials ? `<div class="social-row">${socials}</div>` : ""}
        <form class="contact-form" id="contact-form" novalidate>
          <div class="cf-row">
            <div class="field"><label>你的名字 *</label><input name="name" maxlength="60" placeholder="怎么称呼你" autocomplete="name" /></div>
            <div class="field"><label>邮箱 *</label><input name="email" type="email" maxlength="120" placeholder="you@example.com" autocomplete="email" /></div>
          </div>
          <div class="field"><label>想说的话 *</label><textarea name="message" maxlength="2000" placeholder="唠嗑 / 提问 / 任何想告诉我的……"></textarea></div>
          <div class="form-actions">
            <button type="submit" class="cta-btn small">发送留言 ✈</button>
            <span class="form-status" id="form-status"></span>
          </div>
        </form>
      </div>`;
    const form = body.querySelector("#contact-form");
    form.addEventListener("submit", (e) => submitContact(e, form));
  }
}

function openDetail(w) {
  if (!w) return;
  const c = w.color || "#ffd28a";
  const el = els.detail;
  el.style.setProperty("--wc", c);
  $("#detail-emoji").textContent = w.emoji || "✨";
  $("#detail-title").textContent = w.title || "";
  $("#detail-tags").innerHTML = (w.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  $("#detail-summary").textContent = w.summary || "";
  // 大图（无图则保持 emoji 背景）
  const hero = $("#detail-hero");
  hero.querySelectorAll(".detail-img").forEach((n) => n.remove());
  if (w.photo) {
    const img = document.createElement("img");
    img.className = "detail-img";
    img.alt = w.title || "";
    img.src = w.photo;
    img.referrerPolicy = "no-referrer";
    img.onerror = () => img.remove();
    hero.appendChild(img);
    img.style.cursor = "zoom-in";
    img.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const list = photosOf(w);
      if (list.length) openLightbox(list, 0);
    });
  }
  const link = $("#detail-link");
  const hasLink = !!(w.link && !w.link.startsWith("#"));
  link.style.display = hasLink ? "" : "none";
  link.href = w.link || "#";
  link.onclick = () => {};
  el.classList.remove("hidden");
  el.querySelector("#detail-close").onclick = () => el.classList.add("hidden");
  el.onclick = (ev) => { if (ev.target === el) el.classList.add("hidden"); };
}

/* ---------- 联系表单 ---------- */
async function submitContact(e, form) {
  e.preventDefault();
  const st = form.querySelector("#form-status");
  const data = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    message: form.message.value.trim(),
  };
  if (!data.name) { st.textContent = "请填写名字"; return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) { st.textContent = "邮箱格式不正确"; return; }
  if (!data.message) { st.textContent = "写点什么再发送吧"; return; }
  st.textContent = "发送中…";
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  // 双模式：profile.json 配置了第三方表单 endpoint 就发给它（纯静态托管），否则走后端 /api/contact
  const endpoint = (P.site && P.site.formEndpoint && P.site.formEndpoint.trim()) || "/api/contact";
  const isExternal = /^https?:\/\//.test(endpoint);
  try {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    let detail = "";
    try { const j = await r.json(); detail = j.detail || j.error || j.message || ""; } catch { /* 部分服务返回非 JSON */ }
    if (r.ok) {
      st.textContent = "";
      toast("✉️ 留言已送达，感谢联系！", "ok");
      form.reset();
      Audio.blip();
    } else {
      st.textContent = "";
      toast(
        isExternal
          ? `发送失败${detail ? "：" + detail : "，请稍后再试"}`
          : "留言功能暂未开启，可以直接发邮件联系我 ✉️", "err"
      );
    }
  } catch {
    st.textContent = "";
    toast(isExternal ? "留言服务暂时连不上，麻烦直接用邮箱联系我 ✉️" : "留言通道暂未连接，可以直接发邮件联系我 ✉️", "err");
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 工具栏 ---------- */
function bindTools() {
  els.btnSound.addEventListener("click", () => Audio.toggle());
  if (soundOn) { Audio.on = true; els.btnSound.textContent = "🔊"; els.btnSound.classList.remove("off"); }

  els.btnCalm.addEventListener("click", () => {
    calmOn = !calmOn;
    document.body.classList.toggle("calm", calmOn);
    els.btnCalm.classList.toggle("off", !calmOn);
    ctrl?.setCalm(calmOn);
    localStorage.setItem("dsh.calm", calmOn ? "1" : "0");
    toast(calmOn ? "🧘 安静模式：已减弱自动运镜与动效" : "✨ 动效已恢复");
  });

  els.btnFull.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  // 系统偏好减少动效 → 默认开启安静模式
  if (matchMedia("(prefers-reduced-motion: reduce)").matches && !localStorage.getItem("dsh.calm")) {
    calmOn = true;
  }
  if (calmOn) {
    document.body.classList.add("calm");
    els.btnCalm.classList.add("off");
  }
}

/* ---------- 新功能：氛围 / 自动时间 / 情绪 / 星尘 / 罗盘 接线 ---------- */
function bindExtras() {
  if (!CFG.moodAuto) moodAuto = false; // 后台关闭"氛围自动"时默认手动
  bindMoodAuto();            // 氛围自动跟随时间（含按钮与启动）
  applyMoodUI(savedMood());
  S.setMood(savedMood());    // 应用记忆的氛围（scene 已就绪）
  els.btnMood.addEventListener("click", cycleMood);
  els.btnGyro.addEventListener("click", toggleGyroUI);
  bindEmotionDock();
  bindLightbox();

  // 星尘特效 + 罗盘显示判定
  fxResize();
  window.addEventListener("resize", fxResize);
  window.addEventListener("pointermove", fxTrail, { passive: true });
  window.addEventListener("pointerdown", fxTap, { passive: true });
  window.addEventListener("pointerup", fxTap, { passive: true });
  const markMoved = () => { appMoved = true; };
  window.addEventListener("pointerdown", markMoved, { passive: true });
  window.addEventListener("wheel", markMoved, { passive: true });
  initCompass();
  window.__fx = { celebrate: fxCelebrate, spawn: fxSpawn }; // 调试/彩蛋句柄
}

/* ---------- 降级（无 WebGL） ---------- */
function showFallback() {
  els.boot.classList.add("gone");
  els.fallback.classList.remove("hidden");
  const o = P.owner;
  const moments = (P.moments || []).map((w) => `• ${esc(w.title)} — ${esc(w.summary)}`).join("<br/>");
  const interests = (P.interests || []).map((s) => `• ${esc(s.name)} ${s.level}%`).join("<br/>");
  $("#fb-text").innerHTML =
    `${esc(o.bio)}<br/><br/><b>我的足迹：</b><br/>${moments || "（整理中）"}<br/><br/><b>我的兴趣：</b><br/>${interests || "（整理中）"}`;
}

/* ---------- 启动 ---------- */
async function main() {
  await loadProfile();
  setTheme("hall");
  bindBoot();
  bindNav();
  bindTools();

  try {
    ctrl = S.init(els.scene, {
      onPick: (id) => onPickId(id),
      onStar: (info) => starLitUI(info),
      onTick: (view) => updateCompass(view),
    });
    els.scene.style.cursor = "grab";
    S.setFeature("meteors", CFG.meteors);      // 后台：流星
    S.setFeature("starLighting", CFG.starLighting); // 后台：点亮星星
    bindExtras(); // 氛围 / 陀螺仪 / 星尘 / 罗盘 / 情绪
  } catch (err) {
    console.error("3D 初始化失败：", err);
    showFallback();
    return;
  }
}

main();
