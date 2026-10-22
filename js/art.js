// カードの絵をSVGで作る（外部の画像は使わない）。カードIDごとに形が少しずつ変わる
// イジン = 水墨画の人影、マホウ = 魔法陣、ハイケイ = 風景、マリョク = 結晶

const HUE = { red: '#d9503f', blue: '#3f7fd9', green: '#3fa866', yellow: '#d9b23f', purple: '#9a5fd9', none: '#c9a35a' };
const cache = new Map();

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const f = (n) => Math.round(n * 10) / 10;

function ink(r, c, c2) {
  const lean = f((r() - .5) * 8);
  const head = pick(r, ['knot', 'eboshi', 'kabuto', 'tophat', 'long', 'crown', 'hood']);
  const prop = pick(r, ['sword', 'fan', 'staff', 'scroll', 'none', 'sword']);
  const wide = 30 + r() * 12;
  const hx = 50, hy = 50;
  const hats = {
    knot: `<ellipse cx="${hx + 2}" cy="${hy - 12}" rx="4" ry="3"/>`,
    eboshi: `<path d="M${hx - 7} ${hy - 7} Q${hx - 4} ${hy - 30} ${hx + 6} ${hy - 32} Q${hx + 4} ${hy - 18} ${hx + 8} ${hy - 7}Z"/>`,
    kabuto: `<path d="M${hx - 15} ${hy - 2} Q${hx} ${hy - 22} ${hx + 15} ${hy - 2}Z"/><path d="M${hx - 12} ${hy - 14} Q${hx - 16} ${hy - 32} ${hx - 4} ${hy - 26} M${hx + 12} ${hy - 14} Q${hx + 16} ${hy - 32} ${hx + 4} ${hy - 26}" fill="none" stroke="#120d0a" stroke-width="2.4"/>`,
    tophat: `<rect x="${hx - 8}" y="${hy - 28}" width="16" height="18" rx="1"/><rect x="${hx - 14}" y="${hy - 11}" width="28" height="3" rx="1.5"/>`,
    long: `<path d="M${hx - 10} ${hy - 4} Q${hx - 14} ${hy + 20} ${hx - 6} ${hy + 30} L${hx + 6} ${hy + 30} Q${hx + 14} ${hy + 20} ${hx + 10} ${hy - 4}Z"/>`,
    crown: `<path d="M${hx - 9} ${hy - 8} L${hx - 10} ${hy - 20} L${hx - 4} ${hy - 13} L${hx} ${hy - 22} L${hx + 4} ${hy - 13} L${hx + 10} ${hy - 20} L${hx + 9} ${hy - 8}Z"/>`,
    hood: `<path d="M${hx - 12} ${hy + 6} Q${hx - 14} ${hy - 16} ${hx} ${hy - 17} Q${hx + 14} ${hy - 16} ${hx + 12} ${hy + 6}Z"/>`,
  };
  const props = {
    sword: `<path d="M${hx + 14} ${hy + 40} L${hx + 40} ${hy - 20}" stroke="#120d0a" stroke-width="2.2" stroke-linecap="round"/><path d="M${hx + 12} ${hy + 34} l8 4" stroke="#120d0a" stroke-width="3"/>`,
    fan: `<path d="M${hx + 18} ${hy + 30} l18 -22 a22 22 0 0 1 8 18Z" opacity=".8"/>`,
    staff: `<path d="M${hx - 26} ${hy + 80} L${hx - 20} ${hy - 22}" stroke="#120d0a" stroke-width="2.4" stroke-linecap="round"/><circle cx="${hx - 20}" cy="${hy - 25}" r="4"/>`,
    scroll: `<rect x="${hx + 16}" y="${hy + 26}" width="18" height="6" rx="3" transform="rotate(-25 ${hx + 25} ${hy + 29})"/>`,
    none: '',
  };
  const dots = Array.from({ length: 7 }, () => `<circle cx="${f(r() * 100)}" cy="${f(20 + r() * 100)}" r="${f(.4 + r() * 1.6)}"/>`).join('');
  const sun = r() < .5;
  return `
  <defs>
    <linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efe6d4"/><stop offset=".7" stop-color="#d9ccb2"/><stop offset="1" stop-color="#b9a989"/></linearGradient>
    <radialGradient id="w" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#120d0a" stop-opacity=".55"/><stop offset="1" stop-color="#120d0a" stop-opacity="0"/></radialGradient>
    <filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="${Math.floor(r() * 99)}"/><feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>
  </defs>
  <rect width="100" height="140" fill="url(#p)"/>
  <path d="M0 ${f(78 + r() * 8)} Q20 ${f(60 + r() * 10)} 38 ${f(76 + r() * 6)} T70 ${f(64 + r() * 8)} T100 ${f(74 + r() * 6)} V140 H0Z" fill="#7d7364" opacity=".35"/>
  ${sun ? `<circle cx="${f(30 + r() * 40)}" cy="30" r="17" fill="none" stroke="#120d0a" stroke-width="3.2" stroke-dasharray="80 30" opacity=".5" filter="url(#b)"/>` : `<circle cx="${f(22 + r() * 56)}" cy="26" r="9" fill="${c}" opacity=".75"/>`}
  <g fill="#120d0a" filter="url(#b)" transform="rotate(${lean} 50 120)">
    <ellipse cx="50" cy="110" rx="${f(wide + 6)}" ry="38" fill="url(#w)"/>
    <path d="M50 58 C${f(50 - wide * .6)} 64 ${f(50 - wide)} 90 ${f(50 - wide * 1.1)} 142 L${f(50 + wide * 1.1)} 142 C${f(50 + wide)} 90 ${f(50 + wide * .6)} 64 50 58Z" opacity=".88"/>
    <path d="M${f(50 - wide * .7)} 82 Q50 96 ${f(50 + wide * .7)} 82" fill="none" stroke="#efe6d4" stroke-width="1" opacity=".35"/>
    <circle cx="${hx}" cy="${hy}" r="9.5"/>
    ${hats[head]}
    ${props[prop]}
  </g>
  <g fill="#120d0a" opacity=".55">${dots}</g>
  <rect x="80" y="8" width="11" height="11" rx="1.5" fill="${c}" opacity=".85"/>${c2 ? `<rect x="80" y="21" width="11" height="11" rx="1.5" fill="${c2}" opacity=".85"/>` : ''}`;
}

function magic(r, c, c2) {
  const n = pick(r, [5, 6, 7, 8]);
  const k = n === 6 ? 2 : Math.floor(n / 2);
  const rot = r() * 360;
  const star = Array.from({ length: n }, (_, i) => {
    const a = ((i * k * 360) / n + rot) * Math.PI / 180;
    return `${f(50 + Math.cos(a) * 30)},${f(66 + Math.sin(a) * 30)}`;
  }).join(' ');
  const runes = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return `<rect x="${f(50 + Math.cos(a) * 37 - 1.2)}" y="${f(66 + Math.sin(a) * 37 - 2.5)}" width="2.4" height="5" rx=".6" transform="rotate(${f(a * 180 / Math.PI + 90)} ${f(50 + Math.cos(a) * 37)} ${f(66 + Math.sin(a) * 37)})"/>`;
  }).join('');
  const stars = Array.from({ length: 22 }, () => `<circle cx="${f(r() * 100)}" cy="${f(r() * 140)}" r="${f(.3 + r() * .9)}" opacity="${f(.4 + r() * .6)}"/>`).join('');
  const ring = (rad, w, o) => `<circle cx="50" cy="66" r="${rad}" fill="none" stroke-width="${w}" opacity="${o}"/>`;
  return `
  <defs>
    <radialGradient id="g" cx=".5" cy=".47" r=".6"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset=".45" stop-color="#2a1d52"/><stop offset="1" stop-color="#0b0816"/></radialGradient>
    <radialGradient id="h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${c}" stop-opacity=".8"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100" height="140" fill="url(#g)"/>
  <g fill="#fff">${stars}</g>
  <g stroke="${c}" stroke-linejoin="round">
    ${ring(41, 4, .25)}${ring(41, 1.2, .9)}${ring(33, .8, .8)}${ring(24, .6, .6)}
    ${c2 ? `<g stroke="${c2}">${ring(41, 4, .35)}${ring(37, 1.4, .95)}${ring(24, 1, .8)}</g>` : ''}
    <polygon points="${star}" fill="none" stroke-width="3.5" opacity=".25"/>
    <polygon points="${star}" fill="none" stroke="#fff" stroke-width=".9" opacity=".9"/>
  </g>
  <g fill="#fff" opacity=".85">${runes}</g>
  <circle cx="50" cy="66" r="16" fill="url(#h)"/>
  <circle cx="50" cy="66" r="3" fill="#fff"/>`;
}

function scene(r, c, c2) {
  const sky = pick(r, [['#f7c98b', '#e9876a', '#5a3f6e'], ['#bfe0f0', '#86b6d8', '#3e5f86'], ['#20264a', '#3a3a6e', '#0d0f22'], ['#f2e4c4', '#d8b98a', '#7d6248']]);
  const night = sky[0] === '#20264a';
  const thing = pick(r, ['castle', 'torii', 'pagoda', 'pine', 'gate']);
  const g = '#1a1410';
  const things = {
    castle: `<path d="M32 98 h36 v-10 h-6 v-8 h-24 v8 h-6Z M40 80 l10 -12 l10 12Z M44 68 h12 l-6 -8Z" fill="${g}"/>`,
    torii: `<path d="M30 70 h40 v4 h-40Z M34 77 h32 v3 h-32Z M38 74 h4 v26 h-4Z M58 74 h4 v26 h-4Z" fill="${g}"/>`,
    pagoda: `<path d="M44 100 v-8 h12 v8Z M38 92 h24 l-4 -5 h-16Z M42 87 v-6 h16 v6Z M38 81 h24 l-4 -5 h-16Z M43 76 v-6 h14 v6Z M40 70 h20 l-4 -5 h-12Z M49 65 v-10 h2 v10Z" fill="${g}"/>`,
    pine: `<path d="M48 100 q2 -20 -4 -36 q8 6 6 36Z M30 70 q16 -12 34 -6 q-16 2 -34 6Z M38 60 q14 -10 28 -4 q-14 0 -28 4Z M34 80 q14 -8 30 -4 q-14 1 -30 4Z" fill="${g}"/>`,
    gate: `<path d="M30 100 v-22 h40 v22 h-12 v-12 a8 8 0 0 0 -16 0 v12Z M26 78 h48 l-6 -8 h-36Z" fill="${g}"/>`,
  };
  const ridge = (y, amp, col, o) => {
    let d = `M0 ${y}`;
    for (let x = 0; x <= 100; x += 20) d += ` Q${x + 10} ${f(y - amp * (.4 + r()))} ${x + 20} ${f(y + (r() - .5) * 6)}`;
    return `<path d="${d} V140 H0Z" fill="${col}" opacity="${o}"/>`;
  };
  return `
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[2]}"/><stop offset=".5" stop-color="${sky[1]}"/><stop offset=".85" stop-color="${sky[0]}"/></linearGradient></defs>
  <rect width="100" height="140" fill="url(#s)"/>
  <circle cx="${f(25 + r() * 50)}" cy="${f(28 + r() * 14)}" r="${night ? 8 : 12}" fill="${night ? '#f4efd8' : '#fff4d6'}" opacity=".9"/>
  ${night ? Array.from({ length: 14 }, () => `<circle cx="${f(r() * 100)}" cy="${f(r() * 60)}" r=".6" fill="#fff"/>`).join('') : ''}
  ${ridge(72, 22, c, .35)}
  ${ridge(86, 16, c2 || '#3a2e26', c2 ? .45 : .55)}
  ${things[thing]}
  ${ridge(104, 8, g, .9)}
  <rect y="88" width="100" height="6" fill="#fff" opacity=".12"/>`;
}

function crystal(r, c, c2) {
  return `
  <defs><radialGradient id="g" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="${c}" stop-opacity=".8"/><stop offset="1" stop-color="#0d0a08"/></radialGradient>
  <radialGradient id="g2" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="${c2 || c}" stop-opacity=".8"/><stop offset="1" stop-color="#0d0a08"/></radialGradient></defs>
  <rect width="100" height="140" fill="url(#g)"/>
  ${c2 ? '<path d="M100 0 V140 H0Z" fill="url(#g2)"/>' : ''}
  <g stroke="#fff" stroke-opacity=".5" stroke-width=".6">
    <path d="M50 22 L72 52 L50 104 L28 52Z" fill="${c}" opacity=".55"/>
    ${c2 ? `<path d="M50 22 L72 52 L50 104Z" fill="${c2}" opacity=".7"/>` : ''}
    <path d="M50 22 L58 52 L50 104 L42 52Z M28 52 H72" fill="#fff" fill-opacity=".18"/>
  </g>`;
}

// 背景に使う data URI（なければ空文字）
export function artFor(d) {
  const key = `${d.id}|${(d.colors || [d.color]).join('+')}|${d.type}`;
  if (cache.has(key)) return cache.get(key);
  const r = rng(String(d.id) + d.name);
  const c = HUE[d.color] || HUE.none;
  const c2 = d.colors?.length > 1 ? HUE[d.colors[1]] : null;
  const body = d.type === 'ijin' ? ink(r, c, c2) : d.type === 'mahou' ? magic(r, c, c2) : d.type === 'haikei' ? scene(r, c, c2) : d.type === 'maryoku' ? crystal(r, c, c2) : '';
  const url = body ? `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice">${body}</svg>`)}")` : '';
  cache.set(key, url);
  return url;
}

// 一覧のように多くの絵を並べる所では、SVGを毎回描くと重いので、小さな画像に焼いて使い回す
// 焼き上がったら cb(url) を呼ぶ（焼き済みならすぐ呼ぶ）
const baked = new Map(), waiting = new Map();
let baking = false;
export function bakedArt(d, cb) {
  const svg = artFor(d);
  if (!svg) return;
  if (baked.has(svg)) return cb(baked.get(svg));
  if (waiting.has(svg)) return waiting.get(svg).cbs.push(cb);
  waiting.set(svg, { cbs: [cb] });
  if (!baking) bakeNext();
}
async function bakeNext() {
  baking = true;
  const next = waiting.keys().next();
  if (next.done) { baking = false; return; }
  const svg = next.value, job = waiting.get(svg);
  waiting.delete(svg);
  let url = svg;
  try {
    const img = new Image();
    img.src = svg.slice(5, -2); // url("...") の中身
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 150; cv.height = 210;
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/webp', .85));
    if (blob) url = `url("${URL.createObjectURL(blob)}")`;
  } catch { /* 焼けなければSVGのまま使う */ }
  baked.set(svg, url);
  job.cbs.forEach((f) => f(url));
  setTimeout(bakeNext, 0);
}
