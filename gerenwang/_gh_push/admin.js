/* ============================================================
   admin.js —— 可视化内容管理后台逻辑（不依赖任何框架）
   保存到 profile.json 后，主站刷新即生效。
   ============================================================ */
"use strict";

const $ = (s, root) => (root || document).querySelector(s);
const $$ = (s, root) => [...(root || document).querySelectorAll(s)];

let PROFILE = null;
let token = sessionStorage.getItem("dsh.admin.token") || "";

const statusEl = $("#status");
let statusTimer = null;
function toast(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = type ? `show ${type}` : "show";
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.className = ""), 3200);
}

/* ---------- 登录与会话 ---------- */
const loginEl = $("#login");
const loginErr = $("#login-err");
const passEl = $("#pass");
function showLogin(msg) {
  loginEl.classList.remove("hide");
  loginErr.textContent = msg || "";
  loginErr.classList.toggle("hide", !msg);
  $("#btn-save").disabled = true;
  $("#btn-preview").disabled = true;
  if (!msg) setTimeout(() => passEl.focus(), 60);
}
function hideLogin() {
  loginEl.classList.add("hide");
  $("#btn-save").disabled = false;
  $("#btn-preview").disabled = false;
}
function logout() {
  token = "";
  sessionStorage.removeItem("dsh.admin.token");
  showLogin("会话已过期，请重新登录");
}
async function doLogin(password) {
  loginErr.classList.add("hide");
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { loginErr.textContent = json.detail || "登录失败"; loginErr.classList.remove("hide"); return; }
    token = json.token;
    sessionStorage.setItem("dsh.admin.token", token);
    hideLogin();
    await load();
  } catch (e) {
    loginErr.textContent = "网络错误：" + e.message;
    loginErr.classList.remove("hide");
  }
}

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (token) headers["Authorization"] = "Bearer " + token;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(path, Object.assign({}, opts, { headers }));
  if (res.status === 401 || res.status === 403) {
    if (path !== "/api/admin/login") logout();
    const json = await res.json().catch(() => ({}));
    throw new Error(json.detail || `请求被拒绝(${res.status})`);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || `请求失败(${res.status})`);
  return json;
}

/* ---------- 构建界面 ---------- */
function card(title, hint, inner) {
  const el = document.createElement("section");
  el.className = "card";
  el.innerHTML = `<h2>${title}</h2><p class="hint">${hint}</p>`;
  const box = document.createElement("div");
  box.innerHTML = inner;
  el.appendChild(box);
  return el;
}

const t = (id, val, ph) => `<label>${val}</label><input data-f="${id}" value="${escAttr(ph ?? "")}" />`;
function escAttr(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

const toArr = (v) => (Array.isArray(v) ? v : []);

function momentRow(m, i) {
  return `
  <div class="row" data-i="${i}">
    <div class="rowhead"><b>🌊 足迹 ${i + 1}</b><button class="del" data-del>删除</button></div>
    <div class="grid2">
      <div>${t("title", "标题", m.title)}</div>
      <div>${t("emoji", "封面图案（emoji）", m.emoji)}</div>
    </div>
    <div><label>一句话简介</label><textarea data-f="summary">${escAttr(m.summary)}</textarea></div>
    <div class="grid2">
      <div>${t("color", "主题色（可选，如 #ffd28a）", m.color)}</div>
      <div>${t("link", "链接（可选，留空不显示）", m.link)}</div>
    </div>
    <div class="grid2">
      <div><label>小标签（逗号分隔）</label><input data-f="tags" value="${escAttr(toArr(m.tags).join("，"))}" /></div>
      <div><label>照片地址（封面）</label><div class="grid2"><input data-f="photo" value="${escAttr(m.photo)}" /><button class="up" data-upload="photo">📤 上传</button></div>
      ${m.photo ? `<img class="cover-preview" src="${escAttr(m.photo)}" alt="" onerror="this.remove()" />` : ""}</div>
    </div>
    <div><label>更多照片（相册用，每行一条链接）</label>
      <textarea data-f="photos">${escAttr(toArr(m.photos).join("\n"))}</textarea>
      <button class="up" data-upload="photos">📤 上传并追加到此列表</button>
    </div>
  </div>`;
}

function tlRow(x, i) {
  return `
  <div class="row" data-i="${i}">
    <div class="rowhead"><b>⏳ ${i + 1}</b><button class="del" data-del>删除</button></div>
    <div class="grid3">
      <div>${t("year", "年份", x.year)}</div>
      <div>${t("title", "标题", x.title)}</div>
    </div>
    <div><label>描述</label><textarea data-f="desc">${escAttr(x.desc)}</textarea></div>
  </div>`;
}

function interestRow(x, i) {
  return `
  <div class="row" data-i="${i}">
    <div class="rowhead"><b>🧡 ${i + 1}</b><button class="del" data-del>删除</button></div>
    <div class="grid2">
      <div>${t("name", "名称", x.name)}</div>
      <div><label>浓度 0-100</label><input type="number" min="0" max="100" data-f="level" value="${x.level ?? 0}" /></div>
    </div>
  </div>`;
}

function socialRow(x, i) {
  return `
  <div class="row" data-i="${i}">
    <div class="rowhead"><b>🔗 ${i + 1}</b><button class="del" data-del>删除</button></div>
    <div class="grid3">
      <div>${t("name", "名称", x.name)}</div>
      <div>${t("icon", "图标(emoji)", x.icon)}</div>
      <div><label>网址</label><input data-f="url" value="${escAttr(x.url)}" /></div>
    </div>
  </div>`;
}

function specialRow(x, i) {
  const opts = ["birthday", "anniversary", "other"].map(
    (o) => `<option value="${o}" ${x.type === o ? "selected" : ""}>${
      o === "birthday" ? "🎂 生日" : o === "anniversary" ? "💞 纪念日" : "🎉 其它"}</option>`).join("");
  return `
  <div class="row" data-i="${i}">
    <div class="rowhead"><b>🎂 ${i + 1}</b><button class="del" data-del>删除</button></div>
    <div class="grid3">
      <div><label>月</label><input type="number" min="1" max="12" data-f="month" value="${x.month ?? 1}" /></div>
      <div><label>日</label><input type="number" min="1" max="31" data-f="day" value="${x.day ?? 1}" /></div>
      <div><label>类型</label><select data-f="type">${opts}</select></div>
    </div>
    <div class="grid2">
      <div>${t("emoji", "图案", x.emoji)}</div>
      <div><label>贺语</label><input data-f="text" value="${escAttr(x.text || "")}" /></div>
    </div>
  </div>`;
}

function build() {
  const main = $("#main");
  main.innerHTML = "";
  const o = PROFILE.owner || {};
  const s = PROFILE.site || {};

  // 1 基本信息
  main.appendChild(card("🧑 基本信息", "首页大标题、介绍、邮箱等", `
    <div class="grid2">
      <div>${t("name", "你的名字", o.name)}</div>
      <div>${t("title", "一句话头衔", o.title)}</div>
    </div>
    <div><label>首页大标题（问候语）</label><input data-f="headline" value="${escAttr(o.headline)}" /></div>
    <div><label>开场小字（subhead）</label><input data-f="subhead" value="${escAttr(o.subhead)}" /></div>
    <div><label>关于我（整段介绍）</label><textarea data-f="bio" style="min-height:110px">${escAttr(o.bio)}</textarea></div>
    <div class="grid3">
      <div>${t("location", "所在城市", o.location)}</div>
      <div>${t("email", "邮箱", o.email)}</div>
      <div>${t("enName", "英文名(可选)", o.enName)}</div>
    </div>
    <div class="grid2" style="margin-top:10px">
      <div>${t("brand", "站点名(顶栏)", s.brand)}</div>
      <div>${t("motto", "副标语", s.motto)}</div>
    </div>
  `));

  // 2 足迹
  const mBox = document.createElement("div");
  const mWrap = card("🌊 足迹相册", "一条条生活片段；「照片地址」可粘贴图床链接，或点 📤 从电脑上传（自动存到站点 img 目录）", "");
  const mList = document.createElement("div");
  (PROFILE.moments || []).forEach((m, i) => { mList.insertAdjacentHTML("beforeend", momentRow(m, i)); });
  mWrap.querySelector(".hint").after(mList);
  const addM = document.createElement("button");
  addM.className = "addbtn"; addM.textContent = "＋ 新增一条足迹";
  addM.addEventListener("click", () => {
    mList.insertAdjacentHTML("beforeend", momentRow({ tags: [], photos: [] }, (PROFILE.moments || []).length));
    PROFILE.moments.push({});
    rebind();
  });
  mWrap.appendChild(addM);
  main.appendChild(mWrap);

  // 3 时间线
  const tWrap = card("⏳ 时间线", "关于页里的人生节点", "");
  const tList = document.createElement("div");
  (PROFILE.timeline || []).forEach((x, i) => tList.insertAdjacentHTML("beforeend", tlRow(x, i)));
  tWrap.querySelector(".hint").after(tList);
  const addT = mkAdd(tWrap, "＋ 新增时间线节点", () => tList.insertAdjacentHTML("beforeend", tlRow({}, (PROFILE.timeline || []).length)) && PROFILE.timeline.push({}));
  main.appendChild(tWrap);

  // 4 兴趣
  const iWrap = card("🧡 兴趣", "兴趣与浓度", "");
  const iList = document.createElement("div");
  (PROFILE.interests || []).forEach((x, n) => iList.insertAdjacentHTML("beforeend", interestRow(x, n)));
  iWrap.querySelector(".hint").after(iList);
  main.appendChild(iWrap);
  mkAdd(iWrap, "＋ 新增兴趣", () => { iList.insertAdjacentHTML("beforeend", interestRow({}, (PROFILE.interests || []).length)); PROFILE.interests.push({}); });

  // 5 社交
  const soWrap = card("🔗 社交链接", "联系页展示", "");
  const soList = document.createElement("div");
  (PROFILE.socials || []).forEach((x, n) => soList.insertAdjacentHTML("beforeend", socialRow(x, n)));
  soWrap.querySelector(".hint").after(soList);
  main.appendChild(soWrap);
  mkAdd(soWrap, "＋ 新增链接", () => { soList.insertAdjacentHTML("beforeend", socialRow({}, (PROFILE.socials || []).length)); PROFILE.socials.push({}); });

  // 6 语录
  const qWrap = card("🌤 每日一言", "每行一句，每天自动换一句", `
    <textarea id="quotes-ta" style="min-height:150px">${escAttr((PROFILE.quotes || []).join("\n"))}</textarea>`);
  main.appendChild(qWrap);

  // 7 特别日子
  const dWrap = card("🎂 特别日子", "生日 / 纪念日：当天网站会自动庆祝", "");
  const dList = document.createElement("div");
  (PROFILE.specialDays || []).forEach((x, n) => dList.insertAdjacentHTML("beforeend", specialRow(x, n)));
  dWrap.querySelector(".hint").after(dList);
  main.appendChild(dWrap);
  mkAdd(dWrap, "＋ 新增特别日子", () => { dList.insertAdjacentHTML("beforeend", specialRow({ type: "birthday" }, (PROFILE.specialDays || []).length)); PROFILE.specialDays.push({ type: "birthday" }); });

  // 8 功能设置（不用改代码，想关什么关什么）
  const cfgDefs = [
    ["dailyQuote", "🌤 每日一言"],
    ["specialDays", "🎂 特别日子庆祝"],
    ["moodDock", "🎧 心情按钮（情绪电台）"],
    ["starLighting", "✨ 点亮星星"],
    ["meteors", "☄️ 流星划过"],
    ["compass", "🧭 底部方向罗盘"],
    ["moodAuto", "🕐 氛围自动跟随时间"],
    ["fxSparkles", "🌟 光标星尘特效"],
  ];
  const cfgCard = card("🎛 功能设置", "想停用某个功能，取消勾选后保存即可（不用改代码）", "");
  const cfgBox = document.createElement("div");
  cfgBox.id = "cfg-box";
  cfgBox.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;";
  const cfg = PROFILE.config || {};
  cfgDefs.forEach(([key, label]) => {
    const l = document.createElement("label");
    l.style.cssText = "display:flex;align-items:center;gap:8px;font-size:13px;color:var(--txt);cursor:pointer;";
    l.innerHTML = `<input type="checkbox" data-cfg="${key}" style="width:auto" ${cfg[key] !== false ? "checked" : ""}/> ${label}`;
    cfgBox.appendChild(l);
  });
  cfgCard.querySelector(".hint").after(cfgBox);
  main.appendChild(cfgCard);

  void mBox; void addT;
  rebind();
}

function mkAdd(wrap, label, fn) {
  const b = document.createElement("button");
  b.className = "addbtn"; b.textContent = label;
  b.addEventListener("click", () => { fn(); rebind(); });
  wrap.appendChild(b);
  return b;
}

/* ---------- 事件绑定（删除 / 上传） ---------- */
function rebind() {
  $$(".del").forEach((b) => (b.onclick = () => {
    const row = b.closest(".row");
    row.remove();
  }));
  $$("[data-upload]").forEach((b) => (b.onclick = () => {
    const kind = b.dataset.upload;
    const row = b.closest(".row");
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*"; input.multiple = kind === "photos";
    input.onchange = async () => {
      for (const f of input.files) {
        if (f.size > 8 * 1024 * 1024) { toast("图片超过 8MB", "err"); continue; }
        const dataUrl = await readAsDataURL(f);
        b.disabled = true; b.textContent = "上传中…";
        try {
          const r = await api("/api/editor/upload", {
            method: "POST",
            body: JSON.stringify({ name: f.name, data: dataUrl }),
          });
          if (kind === "photo") {
            const fld = row.querySelector('[data-f="photo"]');
            if (fld) fld.value = r.path;
            const img = row.querySelector(".cover-preview");
            if (img) img.src = r.path;
            else { const pr = row.querySelector('[data-f="photo"]').closest("div"); const im = document.createElement("img"); im.className = "cover-preview"; im.src = r.path; pr.after(im); }
          } else {
            const ta = row.querySelector('[data-f="photos"]');
            ta.value = (ta.value ? ta.value.replace(/\s+$/, "") + "\n" : "") + r.path;
          }
          toast("图片已上传 ✔");
        } catch (e) { toast("上传失败：" + e.message, "err"); }
        b.disabled = false; b.textContent = kind === "photo" ? "📤 上传" : "📤 上传并追加到此列表";
      }
    };
    input.click();
  }));
}

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(new Error("读取文件失败"));
    fr.readAsDataURL(file);
  });
}

/* ---------- 收集并保存 ---------- */
function collect() {
  const SITE_KEYS = new Set(["brand", "motto"]);
  $$("#main .card:first-of-type [data-f]").forEach((el) => {
    const key = el.dataset.f;
    const val = el.value.trim();
    if (SITE_KEYS.has(key)) PROFILE.site[key] = val;
    else PROFILE.owner[key] = val;
  });
  // 足迹（含新建）
  const rows = $$("#main .card:nth-of-type(2) .row");
  const moments = rows.map((row) => ({
    id: (row.querySelector('[data-f="title"]').value || "m").replace(/\s+/g, "-"),
    title: row.querySelector('[data-f="title"]').value.trim(),
    emoji: row.querySelector('[data-f="emoji"]').value.trim() || "✨",
    color: row.querySelector('[data-f="color"]').value.trim(),
    summary: row.querySelector('[data-f="summary"]').value.trim(),
    tags: row.querySelector('[data-f="tags"]').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    photo: row.querySelector('[data-f="photo"]').value.trim(),
    photos: row.querySelector('[data-f="photos"]').value.split(/\n/).map((s) => s.trim()).filter(Boolean),
    link: row.querySelector('[data-f="link"]').value.trim(),
  }));
  PROFILE.moments = moments;

  // timeline
  const tls = $$("#main .card:nth-of-type(3) .row").map((row) => ({
    year: row.querySelector('[data-f="year"]').value.trim(),
    title: row.querySelector('[data-f="title"]').value.trim(),
    desc: row.querySelector('[data-f="desc"]').value.trim(),
  }));
  PROFILE.timeline = tls;
  // interests
  const its = $$("#main .card:nth-of-type(4) .row").map((row) => ({
    name: row.querySelector('[data-f="name"]').value.trim(),
    level: Math.max(0, Math.min(100, parseInt(row.querySelector('[data-f="level"]').value, 10) || 0)),
  }));
  PROFILE.interests = its;
  // socials
  const sos = $$("#main .card:nth-of-type(5) .row").map((row) => ({
    name: row.querySelector('[data-f="name"]').value.trim(),
    icon: row.querySelector('[data-f="icon"]').value.trim(),
    url: row.querySelector('[data-f="url"]').value.trim(),
  }));
  PROFILE.socials = sos;
  // quotes
  PROFILE.quotes = $("#quotes-ta").value.split(/\n/).map((s) => s.trim()).filter(Boolean);
  // specialDays
  const sds = $$("#main .card:nth-of-type(7) .row").map((row) => ({
    month: Math.max(1, Math.min(12, parseInt(row.querySelector('[data-f="month"]').value, 10) || 1)),
    day: Math.max(1, Math.min(31, parseInt(row.querySelector('[data-f="day"]').value, 10) || 1)),
    type: row.querySelector('[data-f="type"]').value || "other",
    emoji: row.querySelector('[data-f="emoji"]').value.trim() || "🎉",
    text: row.querySelector('[data-f="text"]').value.trim(),
  }));
  PROFILE.specialDays = sds;
  // site（品牌/标语等，在基本信息卡片内）
  const siteCard = $("#main .card:first-of-type");
  PROFILE.site.brand = siteCard.querySelector('[data-f="brand"]').value.trim();
  PROFILE.site.motto = siteCard.querySelector('[data-f="motto"]').value.trim();
  // config 功能开关
  PROFILE.config = {};
  $$("#cfg-box input[data-cfg]").forEach((el) => { PROFILE.config[el.dataset.cfg] = el.checked; });
  return { profile: PROFILE };
}

async function save() {
  const btn = $("#btn-save");
  btn.disabled = true;
  try {
    const r = await api("/api/editor/save", {
      method: "POST",
      body: JSON.stringify(collect()),
    });
    toast(`✅ 已保存：${(r.saved || []).join("、")} —— 刷新网站即可看到`, "ok");
  } catch (e) {
    toast("保存失败：" + e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

async function load() {
  try {
    const r = await api("/api/editor");
    PROFILE = r.profile;
    if (!PROFILE.site) PROFILE.site = {};
    if (!PROFILE.owner) PROFILE.owner = {};
    ["moments", "timeline", "interests", "socials", "quotes", "specialDays"].forEach((k) => {
      if (!Array.isArray(PROFILE[k])) PROFILE[k] = [];
    });
    build();
  } catch (e) {
    // 未登录/会话失效：api() 内部已调 logout() 显示登录页
    if (e.message !== "请先登录后台") $("#main").innerHTML = `<p class="note">加载失败：${escAttr(e.message)}</p>`;
  }
}

/* ---------- 启动 ---------- */
(async function init() {
  $("#btn-save").addEventListener("click", save);
  $("#btn-preview").addEventListener("click", () => window.open("/", "_blank"));
  $("#btn-login").addEventListener("click", () => doLogin(passEl.value));
  $("#btn-local").addEventListener("click", () => doLogin(""));
  passEl.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(passEl.value); });
  if (token) await load(); // 会话有效则直接进入
  if (!token || loginEl.classList.contains("hide") === false) showLogin();
})();
