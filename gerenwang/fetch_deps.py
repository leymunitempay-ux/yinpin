import json, os, re, urllib.request, zipfile
TARGET = os.path.abspath('.deps')
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.wheel-cache')
os.makedirs(TARGET, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)
def get_json(url):
    return json.load(urllib.request.urlopen(url, timeout=30))
def best_url(pkg):
    d = get_json('https://pypi.org/pypi/%s/json' % pkg)
    files = d['urls']
    def score(fn):
        if not fn.endswith('.whl'): return -1
        if 'cp314-cp314-win_amd64' in fn: return 5
        if 'cp314-abi3-win_amd64' in fn: return 4
        if 'py3-none-any' in fn: return 3
        if 'py3-none-win_amd64' in fn: return 2
        if '-win_amd64' in fn: return 1
        return 0
    best = max(files, key=lambda f: score(f['filename']))
    return best['url'], best['filename']
queue, visited, plan = ['fastapi', 'uvicorn'], set(), []
while queue:
    p = queue.pop(0)
    if p in visited: continue
    visited.add(p)
    try:
        d = get_json('https://pypi.org/pypi/%s/json' % p)
    except Exception as e:
        print('SKIP json err', p, repr(e)); continue
    for req in (d['info'].get('requires_dist') or []):
        m = re.match(r'^([A-Za-z0-9_.-]+)', req)
        if not m: continue
        name = m.group(1).lower().replace('_', '-')
        parts = req.split(';')
        if len(parts) > 1 and parts[1].strip().startswith('extra'): continue
        if name not in visited and name not in queue: queue.append(name)
    url, fn = best_url(p)
    plan.append((url, fn))
print('PLAN', len(plan))
for url, fn in plan:
    out = os.path.join(CACHE, fn)
    if not os.path.exists(out):
        urllib.request.urlretrieve(url, out)
    with zipfile.ZipFile(out) as z: z.extractall(TARGET)
    print('OK', fn)
print('FETCH_DONE')
