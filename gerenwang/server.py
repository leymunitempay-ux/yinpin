# -*- coding: utf-8 -*-
"""
「沉浸视界」个人网站 —— FastAPI 后端入口
=========================================
运行：  python server.py
访问：  http://127.0.0.1:8090

说明：
  * 前端为 Three.js 沉浸式 3D 单页（static/），本服务负责托管静态资源并提供 API。
  * 无外网环境：依赖已被 fetch_deps.py 装入项目内 .deps/（本文件会自动加入 sys.path）。
  * 标准环境：pip install -r requirements.txt 后同样运行 python server.py。
"""
import base64
import os
import re
import sys
import json
import time
import uuid
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DEPS_DIR = BASE_DIR / ".deps"
if DEPS_DIR.is_dir() and str(DEPS_DIR) not in sys.path:
    sys.path.insert(0, str(DEPS_DIR))

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

STATIC_DIR = BASE_DIR / "static"
PROFILE_FILE = STATIC_DIR / "data" / "profile.json"
MESSAGES_DIR = BASE_DIR / "messages"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = FastAPI(
    title="沉浸视界 · 个人网站",
    description="VR 眼镜式沉浸个人空间（Three.js + FastAPI）",
    version="0.1.0",
)

# 开发期允许跨域（本机调试）；部署时可按需收紧
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ContactMessage(BaseModel):
    """联系表单提交体"""
    name: str = ""
    email: str = ""
    message: str = ""


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "time": datetime.now().isoformat(timespec="seconds")}


@app.get("/api/profile")
def get_profile() -> dict:
    """读取个人资料（前端同时支持直接静态读取 data/profile.json）"""
    if not PROFILE_FILE.exists():
        raise HTTPException(status_code=500, detail="profile.json 不存在")
    try:
        return json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"profile.json 解析失败: {exc}") from exc


@app.post("/api/contact")
def submit_contact(m: ContactMessage) -> dict:
    """保存联系表单留言到 messages/ 目录（含时间戳的 JSON 文件）"""
    name = (m.name or "").strip()
    email = (m.email or "").strip()
    message = (m.message or "").strip()

    if not name or len(name) > 60:
        raise HTTPException(status_code=422, detail="请填写姓名（60 字符以内）")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="邮箱格式不正确")
    if not message or len(message) > 2000:
        raise HTTPException(status_code=422, detail="留言不能为空且不超过 2000 字符")

    MESSAGES_DIR.mkdir(exist_ok=True)
    now = datetime.now()
    record = {
        "id": uuid.uuid4().hex[:12],
        "name": name,
        "email": email,
        "message": message,
        "time": now.isoformat(timespec="seconds"),
    }
    filename = now.strftime("msg_%Y%m%d_%H%M%S_") + record["id"] + ".json"
    (MESSAGES_DIR / filename).write_text(
        json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "id": record["id"]}


# 管理后台页面（显式路由，确保 /admin 可直接访问）
@app.get("/admin", include_in_schema=False)
@app.get("/admin/", include_in_schema=False)
def admin_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "admin.html")

# ============================================================
# 可视化内容管理后台接口（/admin → static/admin.html）
# 本机(127.0.0.1)默认开放；非本机访问需要 ADMIN_KEY 口令。
# 设置口令：启动前 export ADMIN_KEY=你的密码（Windows: $env:ADMIN_KEY=...）
# ============================================================
ADMIN_KEY = os.environ.get("ADMIN_KEY", "").strip()
AUTO_SECRET_FILE = BASE_DIR / "data" / ".admin_secret"
AUTO_MODE = not ADMIN_KEY  # 未显式设置口令时，自动生成本地密钥文件

def _get_secret() -> str:
    if ADMIN_KEY:
        return ADMIN_KEY
    if AUTO_SECRET_FILE.exists():
        return AUTO_SECRET_FILE.read_text(encoding="utf-8").strip()
    secret = uuid.uuid4().hex + uuid.uuid4().hex
    try:
        AUTO_SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
        AUTO_SECRET_FILE.write_text(secret, encoding="utf-8")
    except Exception:
        pass
    return secret

EDIT_TOP_KEYS = {"site", "owner", "config", "timeline", "moments", "interests", "socials", "quotes", "specialDays"}
SUB_SAFE = {
    "site": {"brand", "motto", "formEndpoint"},
    "owner": {"name", "enName", "avatarText", "title", "headline", "subhead", "bio", "location", "email"},
    "config": {"dailyQuote", "specialDays", "moodDock", "starLighting", "meteors", "compass", "moodAuto", "fxSparkles"},
}
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
SESSION_TTL = 12 * 3600  # 会话 12 小时
_sessions = {}           # token -> 过期时间戳（内存，重启即失效）


def _is_local(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in ("127.0.0.1", "::1", "localhost")


def _check_origin(request: Request) -> bool:
    """跨站防护：若请求带 Origin（浏览器跨域），必须与本站同源"""
    origin = request.headers.get("origin")
    if not origin:
        return True
    try:
        from urllib.parse import urlparse
        return urlparse(origin).netloc == (request.headers.get("host") or "")
    except Exception:
        return False


def _new_session() -> str:
    token = uuid.uuid4().hex
    _sessions[token] = time.time() + SESSION_TTL
    return token


def _auth_ok(request: Request) -> bool:
    if not _check_origin(request):
        return False
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    exp = _sessions.get(token)
    if not exp:
        return False
    if exp < time.time():
        _sessions.pop(token, None)
        return False
    return True


def _require_auth(request: Request) -> None:
    if not _auth_ok(request):
        raise HTTPException(status_code=401, detail="请先登录后台")


@app.post("/api/admin/login")
def admin_login(payload: dict, request: Request) -> dict:
    """登录：env 口令或本地密钥；本机(auto 模式)可用空密码免密进入"""
    if not _check_origin(request):
        raise HTTPException(status_code=403, detail="非法来源")
    password = str(payload.get("password") or "")
    secret = _get_secret()
    local_ok = AUTO_MODE and _is_local(request) and password == ""
    if password == secret or local_ok:
        return {"ok": True, "token": _new_session(), "local": _is_local(request), "mode": "auto" if AUTO_MODE else "env"}
    raise HTTPException(status_code=401, detail="口令不正确")


def _clean_scalar(v) -> str:
    """把条目里的值规整为安全的标量"""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v
    return str(v)[:2000]


def _fix_text_list(v):
    """无论 tags/photos 被写成数组还是含杂质的文本，都还原成干净数组"""
    if isinstance(v, list):
        s = ",".join(str(x) for x in v)
    else:
        s = str(v)
    s = s.replace("[", "").replace("]", "")
    out = []
    for x in s.split(","):
        x = x.strip().strip('"').strip("'")
        if x:
            out.append(x)
    return out


def _clean_list(items, cap=200):
    out = []
    if not isinstance(items, list):
        return out
    for it in items[:cap]:
        if not isinstance(it, dict):
            continue
        clean = {k: _clean_scalar(v) for k, v in it.items()}
        # 容错：moments 的 tags/photos 无论数组还是带杂质文本都自动还原
        for split_key in ("tags", "photos"):
            if split_key in clean:
                clean[split_key] = _fix_text_list(clean[split_key])
        out.append(clean)
    return out


@app.get("/api/editor")
def editor_state(request: Request) -> dict:
    _require_auth(request)
    if not PROFILE_FILE.exists():
        raise HTTPException(status_code=500, detail="profile.json 不存在")
    return {
        "ok": True,
        "profile": json.loads(PROFILE_FILE.read_text(encoding="utf-8")),
        "login": "required",
        "mode": "auto" if AUTO_MODE else "env",
        "local": _is_local(request),
    }


@app.post("/api/editor/save")
def editor_save(payload: dict, request: Request) -> dict:
    _require_auth(request)
    incoming = payload.get("profile")
    if not isinstance(incoming, dict):
        raise HTTPException(status_code=422, detail="profile 必须是一个 JSON 对象")
    cur = {}
    if PROFILE_FILE.exists():
        try:
            cur = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
        except Exception:
            cur = {}
    new = {}
    for key, val in incoming.items():
        if key not in EDIT_TOP_KEYS:
            continue
        if key in SUB_SAFE:
            if not isinstance(val, dict):
                continue
            merged = dict(cur.get(key) or {})
            merged.update({k: _clean_scalar(v) for k, v in val.items() if k in SUB_SAFE[key]})
            new[key] = merged
        else:
            new[key] = _clean_list(val)
    merged = dict(cur)
    merged.update(new)
    tmp = PROFILE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(PROFILE_FILE)
    return {"ok": True, "saved": sorted(new.keys())}


@app.post("/api/editor/upload")
def editor_upload(payload: dict, request: Request) -> dict:
    """前端把图片读成 dataURL(base64) 传上来，落盘到 static/img/"""
    _require_auth(request)
    name = str(payload.get("name") or "").strip()
    data = str(payload.get("data") or "")
    if not name or "/" in name or "\\" in name or name.startswith("."):
        raise HTTPException(status_code=422, detail="文件名不合法")
    ext = Path(name).suffix.lower()
    if ext not in IMG_EXT:
        raise HTTPException(status_code=422, detail="仅支持 png/jpg/jpeg/webp/gif")
    if not data.startswith("data:image"):
        raise HTTPException(status_code=422, detail="图片数据格式不正确")
    try:
        raw = base64.b64decode(data.split(",", 1)[1])
    except Exception:
        raise HTTPException(status_code=422, detail="图片解码失败") from None
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="图片不能超过 8MB")
    folder = STATIC_DIR / "img"
    folder.mkdir(exist_ok=True)
    final = f"{int(time.time())}_{uuid.uuid4().hex[:4]}{ext}"  # 防重名
    (folder / final).write_bytes(raw)
    return {"ok": True, "path": f"img/{final}"}


# 静态站点挂载 —— 必须放在所有 /api 与 /admin 路由之后（否则会吞掉上面的路由）
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8090"))
    print("=" * 58)
    print("  沉浸视界 · 个人网站已启动")
    print(f"  请在浏览器打开:  http://127.0.0.1:{port}")
    print("  Ctrl+C 停止服务")
    print("=" * 58)
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
