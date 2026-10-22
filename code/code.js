// イジンデン コード帳：GitHub の公開APIから、変更の履歴（PRごとの差分）と今のコードを読んで見せる
'use strict';

const REPO = 'yamada1217/CardGame';
const BRANCH = 'main';
const API = `https://api.github.com/repos/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${REPO}`;
const SHORT_TTL = 3 * 60 * 1000; // 最新のコミットとPR一覧は3分だけ使い回す（APIは1時間60回まで）
const HL_LIMIT = 150 * 1024; // これより大きいファイルは色付けしない（重くなるため）

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $subtitle = document.getElementById('subtitle');
const $back = document.getElementById('back');
const $reload = document.getElementById('reload');

// ---------- 小物 ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtDay = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
};
const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const firstLine = (s) => (s || '').split('\n')[0];
const isImage = (p) => /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(p);
const LANGS = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', css: 'css', html: 'xml', htm: 'xml', svg: 'xml', xml: 'xml', json: 'json', webmanifest: 'json', md: 'markdown', sh: 'bash', yml: 'yaml', yaml: 'yaml', py: 'python' };
const langOf = (p) => LANGS[(p.split('.').pop() || '').toLowerCase()] || null;
const fileIcon = (p) => {
  const ext = (p.split('.').pop() || '').toLowerCase();
  return { js: 'JS', mjs: 'JS', css: 'CSS', html: 'HTML', json: '{ }', md: 'MD', png: 'IMG', svg: 'SVG', webmanifest: '{ }' }[ext] || '・';
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => t.classList.remove('show'), 1800);
}

function store(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* 容量オーバーなどは無視 */ }
}
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
const prefs = Object.assign({ wrap: false, size: 12 }, load('cv:prefs') || {});
const savePrefs = () => store('cv:prefs', prefs);
document.documentElement.style.setProperty('--code-size', `${prefs.size}px`);
document.body.classList.toggle('wrap', prefs.wrap);

// ---------- データ ----------
async function api(path) {
  const res = await fetch(API + path, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) {
    const limited = res.status === 403 || res.status === 429;
    throw new Error(limited ? 'GitHubの読み込み回数の上限（1時間に60回）に達しました。少し待ってから開き直してください。' : `GitHubから読み込めませんでした（${res.status}）`);
  }
  return res.json();
}

// 短時間だけ使い回す。読めない時は古い保存分で表示する
async function cached(key, ttl, fetcher, force) {
  const hit = load(key);
  if (hit && !force && Date.now() - hit.at < ttl) return hit.v;
  try {
    const v = await fetcher();
    store(key, { at: Date.now(), v });
    return v;
  } catch (e) {
    if (hit) { toast('最新が読めないため、前回の内容を表示しています'); return hit.v; }
    throw e;
  }
}

let force = false;
const getHead = () => cached('cv:head', SHORT_TTL, async () => {
  const c = await api(`/commits/${BRANCH}`);
  return { sha: c.sha, tree: c.commit.tree.sha, msg: firstLine(c.commit.message), date: c.commit.committer.date };
}, force);

async function getTree() {
  const head = await getHead();
  const hit = load('cv:tree');
  if (hit && hit.sha === head.tree) return { head, files: hit.files };
  const t = await api(`/git/trees/${head.tree}?recursive=1`);
  const files = t.tree.filter((x) => x.type === 'blob').map((x) => ({ path: x.path, size: x.size }));
  store('cv:tree', { sha: head.tree, files });
  return { head, files };
}

const getPRs = () => cached('cv:prs', SHORT_TTL, async () => {
  const list = await api('/pulls?state=closed&per_page=100&sort=updated&direction=desc');
  return list.filter((p) => p.merged_at)
    .map((p) => ({ n: p.number, title: p.title, body: p.body || '', at: p.merged_at, by: p.user && p.user.login, sha: p.merge_commit_sha, base: p.base && p.base.sha, branch: p.head && p.head.ref }))
    .sort((a, b) => b.at.localeCompare(a.at));
}, force);

// マージ済みのPRの中身は変わらないので、ずっと使い回す
async function getPRFiles(n) {
  const key = `cv:pr:${n}`;
  const hit = load(key);
  if (hit) return hit;
  const files = [];
  for (let page = 1; page <= 5; page++) {
    const part = await api(`/pulls/${n}/files?per_page=100&page=${page}`);
    files.push(...part.map((f) => ({ path: f.filename, prev: f.previous_filename, status: f.status, a: f.additions, d: f.deletions, patch: f.patch })));
    if (part.length < 100) break;
  }
  store(key, files);
  return files;
}

const rawCache = new Map();
async function getRaw(ref, path) {
  const key = `${ref}:${path}`;
  if (!rawCache.has(key)) {
    rawCache.set(key, fetch(`${RAW}/${ref}/${encPath(path)}`).then((r) => {
      if (!r.ok) throw new Error(`ファイルを読み込めませんでした（${r.status}）`);
      return r.text();
    }).catch((e) => { rawCache.delete(key); throw e; }));
  }
  return rawCache.get(key);
}

// ---------- 色付け ----------
// 色付けしたHTMLを行ごとに分ける（複数行にまたがる span を行ごとに閉じて開き直す）
function splitHighlighted(html) {
  const lines = [];
  const stack = [];
  let cur = '';
  const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) { stack.push(m[1]); cur += m[1]; }
    else if (m[2]) { stack.pop(); cur += m[2]; }
    else if (m[3]) { lines.push(cur + '</span>'.repeat(stack.length)); cur = stack.join(''); }
    else cur += m[4];
  }
  lines.push(cur);
  return lines;
}

function highlightLines(text, path) {
  const lang = langOf(path);
  if (window.hljs && lang && hljs.getLanguage(lang) && text.length <= HL_LIMIT) {
    try { return splitHighlighted(hljs.highlight(text, { language: lang, ignoreIllegals: true }).value); } catch { /* 色なしで表示 */ }
  }
  return text.split('\n').map(esc);
}

function highlightLine(line, lang) {
  if (!line || !window.hljs || !lang || !hljs.getLanguage(lang) || line.length > 2000) return esc(line);
  try { return hljs.highlight(line, { language: lang, ignoreIllegals: true }).value; } catch { return esc(line); }
}

function renderDiff(patch, path) {
  const lang = patch.length <= HL_LIMIT ? langOf(path) : null;
  let o = 0;
  let n = 0;
  const rows = patch.split('\n').map((line) => {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/.exec(line);
    if (h) {
      o = +h[1]; n = +h[2];
      return `<div class="l hunk"><span class="n">…</span><span class="t">${esc(h[3].trim() || `${n}行目から`)}</span></div>`;
    }
    const mark = line[0];
    const body = line.slice(1);
    if (mark === '+') return `<div class="l add"><span class="n">${n++}</span><span class="t">+ ${highlightLine(body, lang)}</span></div>`;
    if (mark === '-') return `<div class="l del"><span class="n">${o++}</span><span class="t">- ${highlightLine(body, lang)}</span></div>`;
    if (mark === '\\') return '';
    o++;
    return `<div class="l"><span class="n">${n++}</span><span class="t">  ${highlightLine(body, lang)}</span></div>`;
  });
  return `<div class="code"><div class="lines">${rows.join('')}</div></div>`;
}

// ---------- 画面の枠 ----------
let renderId = 0;
const scrollMemo = new Map();
const visited = [];

function setHeader(title, sub, tab, showBack) {
  $title.textContent = title;
  $subtitle.textContent = sub || '';
  $back.hidden = !showBack;
  document.title = `${title} - イジンデン コード帳`;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}

function showLoading(msg) { $view.innerHTML = `<div class="loading">${esc(msg || '読み込み中…')}</div>`; }
function showError(e) {
  $view.innerHTML = `<div class="err">${esc(e.message || e)}</div><div class="btns" style="justify-content:center"><button class="btn gold" onclick="location.reload()">もう一度</button></div>`;
}

function parseHash() {
  const [rawPath, qs] = (location.hash.slice(1) || '/').split('?');
  const path = decodeURIComponent(rawPath);
  const q = new URLSearchParams(qs || '');
  if (path.startsWith('/pr/')) return { name: 'pr', n: +path.slice(4) };
  if (path.startsWith('/tree/')) return { name: 'tree', path: path.slice(6).replace(/\/$/, '') };
  if (path.startsWith('/file/')) return { name: 'file', path: path.slice(6), ref: q.get('ref'), line: +q.get('L') || 0, from: q.get('pr') };
  if (path.startsWith('/search')) return { name: 'search', q: q.get('q') || '' };
  return { name: 'history' };
}

const link = {
  pr: (n) => `#/pr/${n}`,
  tree: (p) => `#/tree/${encodeURIComponent(p || '')}`,
  file: (p, opt = {}) => {
    const q = new URLSearchParams();
    if (opt.ref) q.set('ref', opt.ref);
    if (opt.line) q.set('L', opt.line);
    if (opt.pr) q.set('pr', opt.pr);
    const s = q.toString();
    return `#/file/${encodeURIComponent(p)}${s ? `?${s}` : ''}`;
  },
};

async function route() {
  const id = ++renderId;
  const hash = location.hash || '#/';
  const back = visited.length > 1 && visited[visited.length - 2] === hash;
  if (back) visited.pop(); else visited.push(hash);
  $view.classList.remove('enter', 'enter-back');
  void $view.offsetWidth;
  $view.classList.add(back ? 'enter-back' : 'enter');

  const r = parseHash();
  try {
    if (r.name === 'history') await viewHistory(id);
    else if (r.name === 'pr') await viewPR(id, r.n);
    else if (r.name === 'tree') await viewTree(id, r.path);
    else if (r.name === 'file') await viewFile(id, r);
    else if (r.name === 'search') await viewSearch(id, r.q);
  } catch (e) {
    if (id === renderId) showError(e);
  }
  if (id !== renderId) return;
  if (r.name === 'file' && r.line) return;
  window.scrollTo(0, back ? scrollMemo.get(hash) || 0 : 0);
}

const current = () => renderId;

// ---------- 履歴（PR一覧） ----------
async function viewHistory(id) {
  setHeader('変更の履歴', 'これまでの追加・修正（新しい順）', 'history', false);
  showLoading();
  const prs = await getPRs();
  if (id !== current()) return;
  if (!prs.length) { $view.innerHTML = '<div class="empty">まだ変更はありません</div>'; return; }
  let html = `<div class="hero">
    <h2>イジンデン オンラインの開発記録</h2>
    <div class="meta"><span>最新：${esc(fmtDate(prs[0].at))}</span><span>最初：${esc(fmtDate(prs[prs.length - 1].at))}</span></div>
    <div class="stats"><div class="stat"><b>${prs.length}</b><span>変更（PR）</span></div><div class="stat"><b>${new Set(prs.map((p) => p.at.slice(0, 10))).size}</b><span>作業した日</span></div></div>
  </div>`;
  let day = '';
  let open = false;
  for (const p of prs) {
    const d = fmtDay(p.at);
    if (d !== day) {
      if (open) html += '</div>';
      html += `<div class="group-h">${esc(d)}</div><div class="group">`;
      day = d; open = true;
    }
    html += `<a class="row" href="${link.pr(p.n)}"><span class="num">#${p.n}</span><span class="main"><div class="name">${esc(p.title)}</div><div class="sub">${esc(fmtDate(p.at).slice(-5))} にマージ</div></span><span class="chev">›</span></a>`;
  }
  if (open) html += '</div>';
  html += '<div class="hint">タップすると、そのPRで変わったファイルと差分（緑＝追加、赤＝削除）が見られます。</div>';
  $view.innerHTML = html;
}

// ---------- PRの中身 ----------
async function viewPR(id, n) {
  setHeader(`#${n}`, '', 'history', true);
  showLoading();
  const prs = await getPRs();
  const p = prs.find((x) => x.n === n);
  const files = await getPRFiles(n);
  if (id !== current()) return;
  const a = files.reduce((s, f) => s + f.a, 0);
  const d = files.reduce((s, f) => s + f.d, 0);
  setHeader(p ? p.title : `#${n}`, `#${n}${p ? ` ・ ${fmtDate(p.at)}` : ''}`, 'history', true);
  const statusLabel = { added: '追加', removed: '削除', modified: '変更', renamed: '名前変更', copied: 'コピー', changed: '変更' };
  const body = p && p.body.replace(/<!--[\s\S]*?-->/g, '').trim();
  let html = `<div class="hero">
    <h2>${esc(p ? p.title : `#${n}`)}</h2>
    <div class="meta"><span>#${n}</span>${p ? `<span>${esc(fmtDate(p.at))} マージ</span>` : ''}</div>
    <div class="stats"><div class="stat"><b>${files.length}</b><span>ファイル</span></div><div class="stat"><b style="color:var(--add)">+${a}</b><span>追加した行</span></div><div class="stat"><b style="color:var(--del)">−${d}</b><span>削除した行</span></div></div>
    ${body ? `<div class="body-text" id="pbody">${esc(body)}</div><button class="more" id="pmore">説明をすべて読む</button>` : ''}
  </div>
  <div class="btns"><button class="btn" id="openall">すべて開く</button><a class="btn" href="https://github.com/${REPO}/pull/${n}" target="_blank" rel="noopener">GitHubで見る</a></div>`;
  files.forEach((f, i) => {
    const st = f.status === 'removed' ? 'removed' : f.status === 'added' ? 'added' : f.status === 'renamed' ? 'renamed' : 'modified';
    html += `<details class="dfile" data-i="${i}">
      <summary><span class="tag ${st}">${statusLabel[f.status] || f.status}</span><span class="path">${esc(f.path)}${f.prev ? `<small>← ${esc(f.prev)}</small>` : ''}</span><span class="pm"><span class="a">+${f.a}</span> <span class="d">−${f.d}</span></span></summary>
    </details>`;
  });
  $view.innerHTML = html;

  const more = document.getElementById('pmore');
  if (more) {
    const pb = document.getElementById('pbody');
    if (pb.scrollHeight <= pb.clientHeight + 2) more.remove();
    else more.onclick = () => { pb.classList.add('open'); more.remove(); };
  }
  const fill = (el) => {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    const f = files[+el.dataset.i];
    const tools = [];
    if (f.status !== 'removed' && p && p.sha) tools.push(`<a class="btn" href="${link.file(f.path, { ref: p.sha, pr: n })}">この時点の全体</a>`);
    tools.push(`<a class="btn" href="${link.file(f.path)}">今のファイル</a>`);
    const diff = f.patch ? renderDiff(f.patch, f.path) : `<div class="hint">${isImage(f.path) ? '画像ファイルです。' : '差分が大きすぎるか、文字ではないため表示できません。'}「この時点の全体」で中身を見られます。</div>`;
    el.insertAdjacentHTML('beforeend', `<div class="tools">${tools.join('')}</div>${diff}`);
  };
  $view.querySelectorAll('.dfile').forEach((el) => el.addEventListener('toggle', () => el.open && fill(el)));
  document.getElementById('openall').onclick = (e) => {
    const els = [...$view.querySelectorAll('.dfile')];
    const openNow = !els.every((el) => el.open);
    els.forEach((el) => { if (openNow) fill(el); el.open = openNow; });
    e.currentTarget.textContent = openNow ? 'すべて閉じる' : 'すべて開く';
  };
}

// ---------- ファイル一覧 ----------
async function viewTree(id, dir) {
  const name = dir ? dir.split('/').pop() : 'すべてのファイル';
  setHeader(name, dir ? `/${dir}` : '今のコード（main）', 'files', !!dir);
  showLoading();
  const { head, files } = await getTree();
  if (id !== current()) return;
  const prefix = dir ? `${dir}/` : '';
  const dirs = new Map();
  const here = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash < 0) here.push(f);
    else {
      const dn = rest.slice(0, slash);
      const s = dirs.get(dn) || { count: 0, size: 0 };
      s.count++; s.size += f.size;
      dirs.set(dn, s);
    }
  }
  let html = '';
  if (!dir) {
    const total = files.reduce((s, f) => s + f.size, 0);
    html += `<div class="hero">
      <h2>今のコード全体</h2>
      <div class="meta"><span>最終更新：${esc(fmtDate(head.date))}</span></div>
      <div class="meta" style="margin-top:4px"><span>${esc(head.msg)}</span></div>
      <div class="stats"><div class="stat"><b>${files.length}</b><span>ファイル</span></div><div class="stat"><b>${fmtSize(total)}</b><span>合計サイズ</span></div></div>
    </div>`;
  } else {
    const parts = dir.split('/');
    html += `<div class="crumbs"><a href="${link.tree('')}">ルート</a>${parts.map((s, i) => ` / ${i === parts.length - 1 ? esc(s) : `<a href="${link.tree(parts.slice(0, i + 1).join('/'))}">${esc(s)}</a>`}`).join('')}</div>`;
  }
  html += '<div class="group" style="margin-top:12px">';
  for (const [dn, s] of [...dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
    html += `<a class="row" href="${link.tree(prefix + dn)}"><span class="ico dir">📁</span><span class="main"><div class="name">${esc(dn)}</div><div class="sub">${s.count}ファイル ・ ${fmtSize(s.size)}</div></span><span class="chev">›</span></a>`;
  }
  for (const f of here.sort((a, b) => a.path.localeCompare(b.path))) {
    const fn = f.path.slice(prefix.length);
    html += `<a class="row" href="${link.file(f.path)}"><span class="ico">${fileIcon(fn)}</span><span class="main"><div class="name">${esc(fn)}</div><div class="sub">${fmtSize(f.size)}</div></span><span class="chev">›</span></a>`;
  }
  html += '</div>';
  $view.innerHTML = html;
}

// ---------- ファイルの中身 ----------
async function viewFile(id, r) {
  const fn = r.path.split('/').pop();
  const atPR = r.ref ? `#${r.from || ''} の時点` : '';
  setHeader(fn, `/${r.path}${atPR ? ` ・ ${atPR}` : ''}`, r.from ? 'history' : 'files', true);
  showLoading();
  const ref = r.ref || (await getHead()).sha;
  const ghUrl = `https://github.com/${REPO}/blob/${r.ref || BRANCH}/${encPath(r.path)}`;
  if (isImage(r.path)) {
    if (id !== current()) return;
    $view.innerHTML = `<div class="img-view"><img src="${RAW}/${ref}/${encPath(r.path)}${/\.svg$/i.test(r.path) ? '?' : ''}" alt="${esc(fn)}"></div><div class="btns" style="justify-content:center"><a class="btn" href="${ghUrl}" target="_blank" rel="noopener">GitHubで見る</a></div>`;
    return;
  }
  const text = await getRaw(ref, r.path);
  if (id !== current()) return;
  const lines = highlightLines(text.replace(/\n$/, ''), r.path);
  $view.innerHTML = `<div class="file-view">
    <div class="file-bar">
      <button class="btn${prefs.wrap ? ' on' : ''}" id="wrap">折り返し</button>
      <button class="btn" id="smaller" aria-label="文字を小さく">A−</button>
      <button class="btn" id="bigger" aria-label="文字を大きく">A＋</button>
      <button class="btn" id="copy">コピー</button>
      <a class="btn" href="${ghUrl}" target="_blank" rel="noopener">GitHub</a>
      <span class="info">${lines.length}行 ・ ${fmtSize(new Blob([text]).size)}</span>
    </div>
    <div class="code"><div class="lines">${lines.map((l, i) => `<div class="l${r.line === i + 1 ? ' hit' : ''}" id="L${i + 1}"><span class="n">${i + 1}</span><span class="t">${l || ' '}</span></div>`).join('')}</div></div>
  </div>`;
  document.getElementById('wrap').onclick = (e) => {
    prefs.wrap = !prefs.wrap; savePrefs();
    document.body.classList.toggle('wrap', prefs.wrap);
    e.currentTarget.classList.toggle('on', prefs.wrap);
  };
  const size = (d) => {
    prefs.size = Math.max(9, Math.min(18, prefs.size + d)); savePrefs();
    document.documentElement.style.setProperty('--code-size', `${prefs.size}px`);
  };
  document.getElementById('smaller').onclick = () => size(-1);
  document.getElementById('bigger').onclick = () => size(1);
  document.getElementById('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('コピーしました'); } catch { toast('コピーできませんでした'); }
  };
  if (r.line) {
    const el = document.getElementById(`L${r.line}`);
    if (el) requestAnimationFrame(() => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3));
  }
}

// ---------- 検索 ----------
let deepIndex = null; // { sha, map: Map(path -> text) }

async function buildIndex(onProgress) {
  const { head, files } = await getTree();
  if (deepIndex && deepIndex.sha === head.sha) return deepIndex;
  const targets = files.filter((f) => !isImage(f.path) && f.size < 600 * 1024);
  const map = new Map();
  let done = 0;
  let i = 0;
  const worker = async () => {
    while (i < targets.length) {
      const f = targets[i++];
      try { map.set(f.path, await getRaw(head.sha, f.path)); } catch { /* 読めないファイルは飛ばす */ }
      onProgress(++done, targets.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  deepIndex = { sha: head.sha, map };
  return deepIndex;
}

async function viewSearch(id, q0) {
  setHeader('検索', 'ファイル名とコードの中身', 'search', false);
  showLoading();
  const { files } = await getTree();
  if (id !== current()) return;
  $view.innerHTML = `<div class="search-box">
    <input id="q" type="search" placeholder="例：ガーディアン、attack、cards.js" value="${esc(q0)}" autocomplete="off" enterkeyhint="search">
    <div class="opts"><button class="btn gold" id="deep">中身も検索</button><span class="info" id="sinfo">ファイル名はすぐに絞り込みます</span></div>
  </div><div id="results"></div>`;
  const $q = document.getElementById('q');
  const $res = document.getElementById('results');
  const $info = document.getElementById('sinfo');
  let deep = false;

  const run = () => {
    const q = $q.value.trim();
    history.replaceState(null, '', `#/search${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    visited[visited.length - 1] = location.hash;
    if (!q) { $res.innerHTML = '<div class="empty">ファイル名やコードの言葉を入れてください。<br>「中身も検索」を押すと、全ファイルの中から探します。</div>'; return; }
    const ql = q.toLowerCase();
    let html = '';
    const byName = files.filter((f) => f.path.toLowerCase().includes(ql)).slice(0, 50);
    if (byName.length) {
      html += `<div class="group-h">ファイル名（${byName.length}件）</div><div class="group">`;
      html += byName.map((f) => `<a class="row" href="${link.file(f.path)}"><span class="ico">${fileIcon(f.path)}</span><span class="main"><div class="name">${esc(f.path)}</div><div class="sub">${fmtSize(f.size)}</div></span><span class="chev">›</span></a>`).join('');
      html += '</div>';
    }
    if (deep && deepIndex) {
      let total = 0;
      let body = '';
      for (const [path, text] of [...deepIndex.map].sort((a, b) => a[0].localeCompare(b[0]))) {
        const lines = text.split('\n');
        const hits = [];
        for (let i = 0; i < lines.length; i++) if (lines[i].toLowerCase().includes(ql)) hits.push(i);
        if (!hits.length) continue;
        total += hits.length;
        body += `<div class="group-h">${esc(path)}（${hits.length}か所）</div><div class="group">`;
        body += hits.slice(0, 5).map((i) => {
          let s = lines[i];
          let pos = s.toLowerCase().indexOf(ql);
          if (s.length > 160) { const st = Math.max(0, pos - 60); s = (st ? '…' : '') + s.slice(st, st + 160); pos = s.toLowerCase().indexOf(ql); }
          const shown = `${esc(s.slice(0, pos))}<b>${esc(s.slice(pos, pos + q.length))}</b>${esc(s.slice(pos + q.length))}`;
          return `<a class="row" href="${link.file(path, { line: i + 1 })}"><span class="main"><div class="hit-line"><i>${i + 1}</i>${shown.trim()}</div></span><span class="chev">›</span></a>`;
        }).join('');
        if (hits.length > 5) body += `<a class="row" href="${link.file(path, { line: hits[5] + 1 })}"><span class="main"><div class="sub">ほか ${hits.length - 5} か所 ― ファイルを開く</div></span><span class="chev">›</span></a>`;
        body += '</div>';
      }
      html += total ? `<div class="hint" style="padding-top:12px">中身で ${total} か所見つかりました</div>${body}` : '<div class="empty">中身には見つかりませんでした</div>';
    } else if (!byName.length) {
      html += '<div class="empty">ファイル名には見つかりませんでした。<br>「中身も検索」でコードの中を探せます。</div>';
    }
    $res.innerHTML = html;
  };

  document.getElementById('deep').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await buildIndex((d, t) => { $info.textContent = `ファイルを読み込み中… ${d}/${t}`; });
      deep = true;
      $info.textContent = `${deepIndex.map.size}ファイルの中身を検索中`;
      btn.textContent = '中身も検索中';
      run();
    } catch (err) {
      $info.textContent = err.message;
      btn.disabled = false;
    }
  };
  let tm;
  $q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 150); });
  $q.addEventListener('keydown', (e) => { if (e.key === 'Enter') $q.blur(); });
  run();
  if (!q0) $q.focus();
}

// ---------- 起動 ----------
window.addEventListener('scroll', () => { scrollMemo.set(location.hash || '#/', window.scrollY); }, { passive: true });
window.addEventListener('hashchange', route);
$back.onclick = () => {
  if (visited.length > 1) { history.back(); return; }
  const r = parseHash();
  if (r.name === 'file') location.hash = r.from ? link.pr(r.from) : link.tree(r.path.split('/').slice(0, -1).join('/'));
  else if (r.name === 'tree') location.hash = link.tree(r.path.split('/').slice(0, -1).join('/'));
  else location.hash = '#/';
};
$reload.onclick = async () => {
  $reload.classList.add('spin');
  force = true;
  rawCache.clear();
  deepIndex = null;
  visited.pop();
  await route();
  force = false;
  $reload.classList.remove('spin');
  toast('最新にしました');
};
// タブをもう一度押したら、そのタブの一番上に戻る
document.querySelectorAll('.tabs a').forEach((a) => a.addEventListener('click', (e) => {
  if (a.classList.contains('on') && location.hash === a.getAttribute('href')) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}));
route();
