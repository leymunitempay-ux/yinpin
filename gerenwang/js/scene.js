/* ============================================================
   scene.js —— 「沉浸视界」Three.js 3D 世界
   ------------------------------------------------------------
   内容：
   * 程序化星空 + 星云 + 漂浮尘埃（无需任何外部贴图素材）
   * 中央光核（大厅）与四个区域「光柱灯塔」（关于/作品/技能/联系）
   * 鼠标拖拽环视 / 触屏滑动 / 滚轮缩放 —— 模拟 VR 转头
   * 镜头飞行（camera fly-through）实现空间换场
   ============================================================ */
import * as THREE from "./vendor/three.module.js";

/* ---------- 常量 ---------- */
const ORIGIN = new THREE.Vector3(0, 1.2, 0); // 世界中心（观者环视焦点）

// 四个内容区域在环上的方位角 + 主题色（温暖柔和星云色）
const BEACONS = {
  about:   { angle:  Math.PI / 2, color: 0xff9e7d, label: "关于我" },
  works:   { angle:  0,           color: 0x8fe3c9, label: "足迹" },
  skills:  { angle:  Math.PI,     color: 0xc9a6ff, label: "兴趣" },
  contact: { angle: -Math.PI / 2, color: 0xff9ec4, label: "联系我" },
};

const BEACON_R = 30;       // 灯塔环绕半径
const DEFAULT_YAW = 0.55;  // 回到大厅的默认朝向（避开正对任何灯塔）
const DIST_DEFAULT = 13;   // 默认观察距离
const DIST_SECTION = 15;   // 飞向区域时的观察距离
const DIST_MIN = 5, DIST_MAX = 34;
const PITCH_MIN = -1.05, PITCH_MAX = 1.05;

const TAU = Math.PI * 2;

/* ---------- 工具 ---------- */
function rand(a, b) { return a + Math.random() * (b - a); }

/** 生成径向渐变发光贴图（用于 Sprite / 光斑） */
function glowTexture(inner = "rgba(255,255,255,1)", mid = "rgba(150,180,255,0.5)", outer = "rgba(0,0,0,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** 把中文文字画到贴图上，生成立体空间中的漂浮标签 */
function textTexture(text, color = "#fff6ea", glow = "rgba(255,210,138,0.9)") {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 180;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = "700 78px 'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = glow;
  ctx.shadowBlur = 30;
  ctx.fillStyle = color;
  ctx.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

const shortest = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------- 世界状态 ---------- */
const state = {
  yaw: 0, pitch: 0.05, dist: DIST_DEFAULT, // 目标视角（球坐标，绕 ORIGIN）
  flying: false,
  dragging: false,
  windowOpen: false,   // 内容窗口是否打开（打开时暂停自动旋转）
  calm: false,         // 安静模式
  auto: false,         // 是否允许自动缓转
  hoverId: null,
  dragFrom: null,
  moved: 0,
  lastMove: 0,
  mood: "night",       // 当前氛围
  emotion: "calm",     // 当前情绪（平静/雨天/热烈）
  features: { meteors: true, starLighting: true }, // 功能开关
  gyro: { active: false, events: 0, targetYaw: 0, targetPitch: 0 },
};

/* ---------- 主对象 ---------- */
let renderer, scene, camera, clock;
let coreGroup, beaconGroups = [], pickables = [];
let nebulaGroup, dustPoints;
const pulseList = [];       // 需要脉冲动画的对象 {obj, base, speed, phase, amp, type}
const orbiters = [];        // 绕中心旋转的装饰物

/* ---------- 氛围（夜色 / 黄昏 / 晨光 / 白昼） ---------- */
const MOODS = {
  night: { sky: 0x0e0a1c, fog: 0x0e0a1c, nebTint: 0xffffff, nebMul: 1.0 },
  dusk:  { sky: 0x25102a, fog: 0x25102a, nebTint: 0xffb98a, nebMul: 1.05 },
  dawn:  { sky: 0x0f1b36, fog: 0x0f1b36, nebTint: 0xcfe8ff, nebMul: 0.9 },
  day:   { sky: 0x2e3f6f, fog: 0x2e3f6f, nebTint: 0xbcd8ff, nebMul: 0.75 },
};
const nebulaSprites = []; // 供氛围染色的星云 Sprite

/* ---------- 情绪电台（平静 / 雨天 / 热烈） ---------- */
const EMOTIONS = {
  calm: { tint: 0xffffff, label: "平静" },
  rain: { tint: 0xb9cfe8, label: "雨天" },
  hot:  { tint: 0xffc9a0, label: "热烈" },
};
const mulHex = (a, b) => {
  const f = (s) => (s >> 16 & 255) * (b >> 16 & 255) / 255;
  const g = (s) => (s >> 8 & 255) * (b >> 8 & 255) / 255;
  const h = (s) => (s & 255) * (b & 255) / 255;
  return (Math.round(f(a)) << 16) | (Math.round(g(a)) << 8) | Math.round(h(a));
};

/* ---------- 流星彩蛋 ---------- */
const METEOR_MAX = 2;
const meteors = [];        // 活跃流星 {line, mat, head, dir, speed, life}
let meteorTimer = rand(5, 9);

/* ---------- 可点亮的星星 + 光核冲击波 ---------- */
let starPts = null;          // 主星空 Points
let starPositions = null;    // Float32Array
const litStars = new Set();  // 已点亮下标
let starGlow = null;         // 点亮后的高亮 Points
const waves = [];            // 光核冲击波 {t0, rings:[]}

/* ---------- 陀螺仪 ---------- */
const _GYRO = { listening: false, first: null, offsetYaw: 0, offsetPitch: 0 };
const _gq = new THREE.Quaternion();
const _ge = new THREE.Euler();
const _gv = new THREE.Vector3(0, 0, -1);
const normAng = (v) => ((v + Math.PI) % TAU + TAU) % TAU - Math.PI;

export function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

/* ============================================================
   初始化：创建场景、相机、全部 3D 对象
   ============================================================ */
export function init(canvas, callbacks = {}) {
  const onPick = callbacks.onPick || (() => {});

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0e0a1c, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e0a1c, 0.003);

  camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 600);
  clock = new THREE.Clock();

  buildStars();
  buildNebula();
  buildGround();
  buildDust();
  buildCore();
  buildBeacons();

  /* ---------- 输入控制 ---------- */
  canvas.style.touchAction = "none";

  const pointers = new Map(); // pointerId -> {x,y}
  let pinchDist = 0;

  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      state.dragging = false;
      state.moved = 0;
      state.dragFrom = { x: e.clientX, y: e.clientY };
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* 部分合成/特殊输入不支持捕获，忽略 */ }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && state.dragFrom) {
      const dx = e.clientX - state.dragFrom.x;
      const dy = e.clientY - state.dragFrom.y;
      state.moved = Math.max(state.moved, Math.hypot(dx, dy));
      if (state.moved > 5) state.dragging = true;
      if (state.dragging && !state.flying && !state.gyro.active) {
        state.yaw -= dx * 0.0052;
        state.pitch = clamp(state.pitch + dy * 0.0042, PITCH_MIN, PITCH_MAX);
        state.dragFrom = { x: e.clientX, y: e.clientY };
      }
      state.lastMove = performance.now();
    } else if (pointers.size === 2) {
      // 双指缩放（触屏）
      const p = [...pointers.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDist > 0) zoomBy(pinchDist - d);
      pinchDist = d;
      state.lastMove = performance.now();
    } else if (!state.dragging) {
      // 悬停拾取（改为对指针方向做视差跟随）
      updateHover(e);
    }
  });

  const endPointer = (e) => {
    if (pointers.size === 2 && !pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    pinchDist = 0;
    // 判断是否为「点击」（位移很小）→ 交给拾取逻辑
    if (!state.dragging && state.moved <= 5) {
      if (state.hoverId) {
        onPick(state.hoverId);
      } else if (callbacks.onStar && state.features.starLighting) {
        // 点击夜空：点亮最近的星星
        const r = lightStarAt(e.clientX, e.clientY);
        if (r) callbacks.onStar({ fresh: r === "new", x: e.clientX, y: e.clientY });
      }
    }
    state.dragging = false;
    state.dragFrom = null;
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  window.addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // 保留 Ctrl+滚轮 = 浏览器页面缩放
    // 光标位于内容窗口滚动区时：放行原生滚动（不抢滚轮、不 preventDefault）
    const t = e.target;
    if (t && t.closest && t.closest("#holo-body")) return;
    const body = document.getElementById("holo-body");
    if (body) {
      const r = body.getBoundingClientRect();
      if (r.width > 0 && e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top && e.clientY <= r.bottom) return;
    }
    e.preventDefault();
    zoomBy(e.deltaY);
    state.lastMove = performance.now();
  }, { passive: false });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------- 视差：鼠标空闲时轻微镜头位移 ---------- */
  let parX = 0, parY = 0;
  window.addEventListener("mousemove", (e) => {
    if (state.dragging) return;
    parX = (e.clientX / window.innerWidth - 0.5);
    parY = (e.clientY / window.innerHeight - 0.5);
  });
  window.addEventListener("mouseout", () => { parX = 0; parY = 0; });

  /* ---------- 悬停拾取 ---------- */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function updateHover(e) {
    ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false);
    const id = hits.length ? hits[0].object.userData.id : null;
    if (id !== state.hoverId) {
      state.hoverId = id;
      canvas.style.cursor = id ? "pointer" : "grab";
      canvas.style.cursor = state.dragging ? "grabbing" : (id ? "pointer" : "grab");
    }
  }

  /* ---------- 主循环 ---------- */
  renderer.setAnimationLoop(tick);

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // 陀螺仪平滑跟随（手机转头视角）
    if (state.gyro.active && !state.flying && !state.dragging) {
      const k = Math.min(1, dt * 9);
      state.yaw += shortest(state.yaw, state.gyro.targetYaw) * k;
      state.pitch += (state.gyro.targetPitch - state.pitch) * k * 0.8;
      state.pitch = clamp(state.pitch, PITCH_MIN, PITCH_MAX);
    }

    // 自动缓转（未打开窗口 / 非安静 / 未拖动 / 未飞行 / 未开陀螺仪）
    if (state.auto && !state.windowOpen && !state.calm && !state.dragging && !state.flying && !state.gyro.active) {
      const idle = performance.now() - (state.lastMove || 0);
      if (idle > 2500) state.yaw += dt * 0.02;
    }

    // 流星彩蛋
    updateMeteors(dt);

    // 光核冲击波
    updateWaves();

    // 飞行 / 视角状态更新
    applyCamera(t, parX, parY);

    // 动画对象
    for (const p of pulseList) pulse(p, t);
    for (const o of orbiters) {
      o.obj.position.x = o.cx + Math.cos(t * o.speed + o.phase) * o.r;
      o.obj.position.z = o.cz + Math.sin(t * o.speed + o.phase) * o.r;
      o.obj.rotation.y += dt * 0.8;
    }
    nebulaGroup.rotation.y += dt * 0.0025;
    dustPoints.rotation.y += dt * 0.004;
    coreGroup.rotation.y += dt * (state.calm ? 0.02 : 0.08);

    renderer.render(scene, camera);

    // 每帧回传视角信息（供罗盘 HUD 等使用）
    if (callbacks.onTick) {
      callbacks.onTick({
        yaw: state.yaw, pitch: state.pitch, dist: state.dist,
        flying: state.flying, windowOpen: state.windowOpen,
      });
    }
  }

  return {
    flyTo,
    returnHome,
    setWindowOpen,
    setCalm,
    startAuto,
    stopAuto,
  };
}

function pulse(p, t) {
  const v = p.base + Math.sin(t * p.speed + p.phase) * p.amp;
  if (p.mat) p.mat.opacity = v;
  if (p.obj) { const s = p.baseS * (1 + Math.sin(t * p.speed + p.phase) * p.ampS); p.obj.scale.set(s, s, s); }
}

function zoomBy(delta) {
  if (state.flying) return;
  state.dist = clamp(state.dist * (1 + delta * 0.0011), DIST_MIN, DIST_MAX);
}

/* ---------- 相机 ---------- */
function applyCamera(t, parX, parY) {
  const yaw = state.yaw;
  const pitch = state.pitch;
  const dist = state.dist;

  // 视差：给一个很小的附加转角（相当于轻轻转头跟随光标）
  const k = (state.calm || state.windowOpen) ? 0.25 : 1;
  const yawE = yaw + parX * 0.09 * k;
  const pitchE = pitch + parY * 0.05 * k;

  const cp = Math.cos(pitchE);
  camera.position.set(
    ORIGIN.x + dist * cp * Math.sin(yawE),
    ORIGIN.y + dist * Math.sin(pitchE),
    ORIGIN.z + dist * cp * Math.cos(yawE)
  );
  camera.lookAt(ORIGIN);

  // 极轻微呼吸（镜片感）
  if (!state.calm) {
    const b = Math.sin(t * 0.7) * 0.003;
    camera.position.multiplyScalar(1 + b);
  }
  void ORIGIN;
}

/* ============================================================
   场景元素构建
   ============================================================ */

function buildStars() {
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // 分布在半径 120 ~ 320 的球壳上
    const r = rand(130, 320);
    const th = Math.acos(rand(-1, 1));
    const ph = rand(0, TAU);
    pos[i * 3] = r * Math.sin(th) * Math.cos(ph);
    pos[i * 3 + 1] = Math.abs(r * Math.cos(th)) * 0.5 + 2; // 上下略收拢，更像天空
    pos[i * 3 + 2] = r * Math.sin(th) * Math.sin(ph);
    const w = rand(0.35, 1);
    const warm = Math.random() > 0.75; // 少量暖黄星点缀
    col[i * 3] = w * (warm ? 1.0 : 0.92);
    col[i * 3 + 1] = w * (warm ? 0.85 : 0.9);
    col[i * 3 + 2] = w * (warm ? 0.7 : 1.0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 1.6, vertexColors: true, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(g, m);
  scene.add(pts);
  starPts = pts;
  starPositions = pos;
}

function buildNebula() {
  nebulaGroup = new THREE.Group();
  const defs = [
    { c: "255,190,150", s: 220, x: -260, y: 90, z: -160, o: 0.11 },
    { c: "255,158,196", s: 180, x: 240, y: -60, z: -220, o: 0.08 },
    { c: "150,212,255", s: 200, x: 180, y: 130, z: 240, o: 0.09 },
    { c: "201,166,255", s: 160, x: -180, y: -120, z: 260, o: 0.08 },
  ];
  for (const d of defs) {
    const tex = glowTexture("rgba(255,255,255,0)",
      `rgba(${d.c},${d.o})`, "rgba(0,0,0,0)");
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: d.o,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sp.position.set(d.x, d.y, d.z);
    sp.scale.set(d.s, d.s, 1);
    sp.userData.o = d.o;
    nebulaGroup.add(sp);
    nebulaSprites.push(sp);
  }
  scene.add(nebulaGroup);
  applyMoodTint();
}

function buildGround() {
  // 半透明深色圆盘地面
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(120, 64),
    new THREE.MeshBasicMaterial({ color: 0x0c0a1f, transparent: true, opacity: 0.92, depthWrite: false })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -3.2;
  scene.add(disc);

  // 中心发光平台
  const platTex = glowTexture("rgba(255,222,180,0.85)", "rgba(255,176,120,0.18)", "rgba(0,0,0,0)");
  const plat = new THREE.Mesh(
    new THREE.CircleGeometry(34, 64),
    new THREE.MeshBasicMaterial({ map: platTex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  plat.rotation.x = -Math.PI / 2;
  plat.position.y = -3.05;
  scene.add(plat);

  // 同心指示环
  const ringMat = (r, color, o) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const mkRing = (r, color, o, y) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r + 0.05, 160), ringMat(r, color, o));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    return ring;
  };
  const r1 = mkRing(16, 0xc9a6ff, 0.3, -2.95); scene.add(r1);
  const r2 = mkRing(26, 0xffb36b, 0.16, -2.9); scene.add(r2);
  pulseList.push({ obj: r1, baseS: 1, ampS: 0.012, speed: 1.4, phase: 0 });
}

function buildDust() {
  const N = 900;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rand(0, TAU), r = rand(8, 60), h = rand(-8, 22);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = h;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  dustPoints = new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xcbb6ff, size: 0.5, transparent: true, opacity: 0.32,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dustPoints);
}

function buildCore() {
  coreGroup = new THREE.Group();
  coreGroup.position.copy(ORIGIN);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.05, 1),
    new THREE.MeshBasicMaterial({ color: 0xffdfb0, wireframe: false })
  );
  coreGroup.add(core);

  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.5, 1),
    new THREE.MeshBasicMaterial({ color: 0xffc98f, wireframe: true, transparent: true, opacity: 0.16 })
  );
  coreGroup.add(wire);
  pulseList.push({ obj: wire, baseS: 1, ampS: 0.02, speed: 1.1, phase: 0 });

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture("rgba(255,240,215,1)", "rgba(255,196,140,0.4)", "rgba(0,0,0,0)"),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.scale.set(13, 13, 1);
  glow.position.y = 0.4;
  coreGroup.add(glow);
  pulseList.push({ mat: glow.material, base: 0.5, amp: 0.12, speed: 1.7, phase: 1.2 });

  // 双环轨道
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd28a, transparent: true, opacity: 0.5,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.02, 8, 100), ringMat);
  ringA.rotation.x = Math.PI / 2.6;
  coreGroup.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.015, 8, 100), ringMat.clone());
  ringB.material.color.setHex(0xff9ec4); ringB.material.opacity = 0.35;
  ringB.rotation.x = Math.PI / 1.7; ringB.rotation.y = 0.5;
  coreGroup.add(ringB);

  // 环绕小卫星
  const satMat = new THREE.MeshBasicMaterial({ color: 0xfff0d8 });
  for (let i = 0; i < 3; i++) {
    const sat = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), satMat.clone());
    sat.position.copy(ORIGIN);
    coreGroup.add(sat);
    orbiters.push({ obj: sat, cx: ORIGIN.x, cz: ORIGIN.z, r: 4.4, speed: 0.55, phase: (i * TAU) / 3 });
  }

  const corePick = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 8, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  corePick.userData.id = "hall";
  corePick.position.copy(ORIGIN);
  scene.add(corePick);
  pickables.push(corePick);

  scene.add(coreGroup);
}

function buildBeacons() {
  for (const [id, cfg] of Object.entries(BEACONS)) {
    const bx = Math.sin(cfg.angle) * BEACON_R;
    const bz = Math.cos(cfg.angle) * BEACON_R;
    const group = new THREE.Group();
    group.position.set(bx, 0, bz);
    scene.add(group);

    // 光柱光晕（大范围弥散光）
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(`rgba(${(cfg.color >> 16) & 255},${(cfg.color >> 8) & 255},${cfg.color & 255},0.8)`,
        `rgba(${(cfg.color >> 16) & 255},${(cfg.color >> 8) & 255},${cfg.color & 255},0.16)`, "rgba(0,0,0,0)"),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    halo.position.set(0, 2.4, 0);
    halo.scale.set(15, 15, 1);
    group.add(halo);
    pulseList.push({ mat: halo.material, base: 0.4, amp: 0.15, speed: 1.3, phase: cfg.angle });

    // 核心光球
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture("rgba(255,255,255,1)", "rgba(255,255,255,0.35)", "rgba(0,0,0,0)"),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      color: cfg.color,
    }));
    orb.position.set(0, 2.4, 0);
    orb.scale.set(3.4, 3.4, 1);
    group.add(orb);
    pulseList.push({ mat: orb.material, base: 0.9, amp: 0.1, speed: 2.2, phase: cfg.angle * 2 });

    // 光柱（发光柱体，用拉长的光晕贴图模拟体积光）
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.4, 2.6, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: cfg.color, transparent: true, opacity: 0.25,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    pillar.position.y = 1.2;
    group.add(pillar);

    // 区域名标签
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textTexture(cfg.label, "#eaf2ff", `#${cfg.color.toString(16).padStart(6, "0")}`),
      transparent: true, depthWrite: false,
    }));
    label.position.set(0, 5.5, 0);
    label.scale.set(8, 1.4, 1);
    group.add(label);

    // 可拾取命中体
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(3.4, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(0, 2.4, 0);
    hit.userData.id = id;
    group.add(hit);
    pickables.push(hit);

    beaconGroups.push({ id, group });
  }
}

/* ============================================================
   对外控制 API
   ============================================================ */

/** 镜头飞行到某区域（hall 代表回中心） */
export function flyTo(id, opts = {}) {
  if (state.flying) return Promise.resolve();
  state.flying = true;
  const to = opts.to || {};
  const from = { yaw: state.yaw, pitch: state.pitch, dist: state.dist };
  let tYaw = to.yaw ?? DEFAULT_YAW;
  if (id !== "hall" && BEACONS[id]) tYaw = BEACONS[id].angle + Math.PI; // 站在灯塔正对面，灯塔处于视野中央远处
  tYaw = ((tYaw + Math.PI) % TAU + TAU) % TAU - Math.PI; // 归一化到 [-π, π]
  const tPitch = to.pitch ?? 0.03;
  const tDist = to.dist ?? (id === "hall" ? DIST_DEFAULT : DIST_SECTION);
  const dur = opts.dur || (id === "hall" ? 1400 : 1600);

  const dYaw = shortest(from.yaw, tYaw);
  const dPitch = tPitch - from.pitch;
  const dDist = tDist - from.dist;
  const t0 = performance.now();

  return new Promise((resolve) => {
    let done = false;
    const watchdog = setTimeout(() => {
      // rAF 在标签页后台 / 低功耗等场景可能停摆：用计时器兜底收尾，避免导航队列卡死
      state.yaw = from.yaw + dYaw;
      state.pitch = from.pitch + dPitch;
      state.dist = from.dist + dDist;
      finish();
    }, dur + 900);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      state.flying = false;
      resolve();
    };
    const step = () => {
      const k = easeInOutCubic(Math.min(1, (performance.now() - t0) / dur));
      state.yaw = from.yaw + dYaw * k;
      state.pitch = from.pitch + dPitch * k;
      state.dist = from.dist + dDist * k;
      if (k < 1) requestAnimationFrame(step);
      else finish();
    };
    step();
  });
}

/** 返回大厅（与 flyTo("hall") 等价，便于语义调用） */
export function returnHome(opts = {}) {
  return flyTo("hall", opts);
}

export function setWindowOpen(v) { state.windowOpen = !!v; }
export function setCalm(v) { state.calm = !!v; }
export function startAuto() { state.auto = true; state.lastMove = performance.now(); }
export function stopAuto() { state.auto = false; }

/* ============================================================
   氛围切换：夜色 / 黄昏 / 晨光
   ============================================================ */
function applyMoodTint() {
  const m = MOODS[state.mood] || MOODS.night;
  const em = EMOTIONS[state.emotion] || EMOTIONS.calm;
  if (renderer) renderer.setClearColor(m.sky, 1);
  if (scene && scene.fog) scene.fog.color.setHex(m.fog);
  const tint = mulHex(m.nebTint, em.tint); // 氛围色 × 情绪色
  for (const sp of nebulaSprites) {
    sp.material.color.setHex(tint);
    sp.material.opacity = (sp.userData.o || 0.08) * m.nebMul;
  }
}
export function setMood(name) {
  if (!MOODS[name]) return false;
  state.mood = name;
  applyMoodTint();
  return true;
}
export function getMood() { return state.mood; }
export function getMoodKeys() { return Object.keys(MOODS); }

/* ============================================================
   流星彩蛋：随机划过星空的亮线
   ============================================================ */
function spawnMeteor() {
  if (!scene || meteors.length >= METEOR_MAX) return;
  const dir = new THREE.Vector3(rand(-0.6, 0.6), -rand(0.22, 0.7), rand(-0.6, 0.6)).normalize();
  const head = new THREE.Vector3(rand(-140, 140), rand(60, 175), rand(-140, 140));
  if (head.length() < 90) head.multiplyScalar(2); // 尽量落在远处的天空
  const speed = rand(300, 420);
  const mat = new THREE.LineBasicMaterial({
    color: 0xfff3dc, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([head, head]), mat);
  line.frustumCulled = false;
  scene.add(line);
  meteors.push({ line, mat, head, dir, speed, life: 1.15 });
}
function updateMeteors(dt) {
  meteorTimer -= dt;
  if (!state.calm && !state.windowOpen && state.features.meteors && meteorTimer <= 0 && meteors.length < METEOR_MAX) {
    spawnMeteor();
    meteorTimer = rand(6, 15);
  }
  for (let i = meteors.length - 1; i >= 0; i--) {
    const m = meteors[i];
    m.life -= dt;
    if (m.life <= 0) {
      scene.remove(m.line);
      m.line.geometry.dispose();
      m.mat.dispose();
      meteors.splice(i, 1);
      continue;
    }
    m.head.addScaledVector(m.dir, m.speed * dt);
    const tail = m.head.clone().addScaledVector(m.dir, -(10 + 30 * (m.life / 1.15)));
    m.line.geometry.setFromPoints([tail, m.head]);
    m.mat.opacity = clamp(m.life / 1.15, 0, 1) * 0.9;
  }
}
/** 开发/调试用：立刻放一颗流星 */
export function debugMeteor() { spawnMeteor(); }

/* ============================================================
   手机陀螺仪转头视角
   ============================================================ */
function _deviceHandler(e) {
  const a = (e.alpha != null ? e.alpha : 0) * (Math.PI / 180);
  const b = (e.beta != null ? e.beta : 0) * (Math.PI / 180);
  const g = (e.gamma != null ? e.gamma : 0) * (Math.PI / 180);
  _ge.set(b, a, -g, "YXZ");          // 与 three.js 参考实现一致
  _gq.setFromEuler(_ge);
  _gv.set(0, 0, -1).applyQuaternion(_gq);
  const tY = Math.atan2(-_gv.x, -_gv.z);
  const tP = Math.asin(clamp(-_gv.y, -1, 1));
  if (!_GYRO.first) { // 首次事件：以当前视角为基准做校准，避免画面跳变
    _GYRO.first = true;
    _GYRO.offsetYaw = state.yaw - tY;
    _GYRO.offsetPitch = state.pitch - tP;
  }
  state.gyro.targetYaw = normAng(_GYRO.offsetYaw + tY);
  state.gyro.targetPitch = clamp(_GYRO.offsetPitch + tP, PITCH_MIN, PITCH_MAX);
  state.gyro.events++;
  state.lastMove = performance.now();
}

/** 开/关陀螺仪视角；返回 { ok, msg? }，需要用户手势触发（iOS 还需授权） */
export async function toggleGyro() {
  if (state.gyro.active) { // 关闭
    window.removeEventListener("deviceorientationabsolute", _deviceHandler, true);
    window.removeEventListener("deviceorientation", _deviceHandler, true);
    state.gyro.active = false;
    _GYRO.listening = false;
    _GYRO.first = null;
    return { ok: true, active: false };
  }
  if (!window.DeviceOrientationEvent) return { ok: false, msg: "当前设备不支持陀螺仪" };
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const st = await DeviceOrientationEvent.requestPermission();
      if (st !== "granted") return { ok: false, msg: "未获得传感器权限，请在浏览器设置中允许" };
    }
  } catch { return { ok: false, msg: "陀螺仪权限请求失败" }; }
  window.addEventListener("deviceorientationabsolute", _deviceHandler, true);
  window.addEventListener("deviceorientation", _deviceHandler, true);
  state.gyro.active = true;
  state.gyro.events = 0;
  _GYRO.listening = true;
  _GYRO.first = null; // 待首个事件校准时基
  return { ok: true, active: true };
}
export function isGyroActive() { return state.gyro.active; }
export function gyroEventCount() { return state.gyro.events; }

/* ============================================================
   情绪电台（平静 / 雨天 / 热烈）：氛围叠染色调
   ============================================================ */
export function setEmotion(name) {
  if (!EMOTIONS[name]) return false;
  state.emotion = name;
  applyMoodTint();
  return true;
}
export function getEmotion() { return state.emotion; }
export function getEmotionKeys() { return Object.keys(EMOTIONS); }

/* ============================================================
   点亮星星：点击夜空 → 点亮最近的一颗
   ============================================================ */
function ensureStarGlow() {
  if (starGlow || !scene) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffe9b0, size: 2.6, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  starGlow = new THREE.Points(geo, mat);
  starGlow.frustumCulled = false;
  scene.add(starGlow);
}
function refreshStarGlow() {
  if (!starGlow) return;
  const arr = new Float32Array(litStars.size * 3);
  let k = 0;
  litStars.forEach((i) => {
    arr[k++] = starPositions[i * 3];
    arr[k++] = starPositions[i * 3 + 1];
    arr[k++] = starPositions[i * 3 + 2];
  });
  starGlow.geometry.setAttribute("position", new THREE.BufferAttribute(arr, 3));
}
function lightStarAt(px, py) {
  if (!starPts || !starPositions) return null;
  const inv = camera.matrixWorldInverse;
  const focal = (window.innerHeight / 2) / Math.tan((camera.fov * Math.PI / 180) / 2);
  const hw = window.innerWidth / 2, hh = window.innerHeight / 2;
  const v = new THREE.Vector3();
  let best = -1, bestD = 44; // 命中宽容度（像素）
  const n = starPositions.length / 3;
  for (let i = 0; i < n; i++) {
    v.set(starPositions[i * 3], starPositions[i * 3 + 1], starPositions[i * 3 + 2]).applyMatrix4(inv);
    if (v.z >= -1) continue; // 在相机后方
    const sx = hw + (v.x * focal) / -v.z;
    const sy = hh - (v.y * focal) / -v.z;
    const dx = sx - px, dy = sy - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) return null;
  if (litStars.has(best)) return "again";
  litStars.add(best);
  ensureStarGlow();
  refreshStarGlow();
  return "new";
}
export function litStarsTotal() { return litStars.size; }

/** 功能开关（由后台"功能设置"控制，无需改代码） */
export function setFeature(name, on) {
  if (name in state.features) state.features[name] = !!on;
}

/* ============================================================
   拍拍光核：扩散冲击波
   ============================================================ */
const WAVE_COLORS = [0xffd28a, 0xff9ec4, 0x9ad0ff];
export function poke() {
  if (!scene || state.calm) return false;
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const geo = new THREE.RingGeometry(0.95, 1.0, 96);
    const mat = new THREE.MeshBasicMaterial({
      color: WAVE_COLORS[k], transparent: true, opacity: 0.85,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(ORIGIN.x, ORIGIN.y + 0.7, ORIGIN.z);
    scene.add(mesh);
    rings.push({ mesh, mat });
  }
  waves.push({ t0: performance.now(), rings });
  return true;
}
function updateWaves() {
  const now = performance.now();
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    const p = (now - w.t0) / 1400;
    if (p >= 1) {
      for (const r of w.rings) { scene.remove(r.mesh); r.mesh.geometry.dispose(); r.mat.dispose(); }
      waves.splice(i, 1);
      continue;
    }
    const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
    w.rings.forEach((r, k) => {
      r.mesh.scale.set(e * (7 + k * 11), e * (7 + k * 11), 1);
      r.mat.opacity = (1 - p) * 0.8;
    });
  }
}
