// 縦書きで紙に刷る道具の共通部品（はがき・のし袋などで使い回す）

const KD = '〇一二三四五六七八九';
const HYPHENS = /[-‐‑‒–—―−－ｰ]/g;

// 85 → 八十五、100 → 百、2026 → 二千二十六
export function kanjiNumber(n) {
  n = Math.trunc(Number(n));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return '〇';
  if (n >= 10000) return String(n).split('').map(d => KD[d]).join('');
  let s = '';
  let r = n;
  for (const [u, v] of [['千', 1000], ['百', 100], ['十', 10]]) {
    const q = Math.floor(r / v);
    r %= v;
    if (q) s += (q === 1 ? '' : KD[q]) + u;
  }
  if (r) s += KD[r];
  return s;
}

// 縦書き用に整える：数字は一字ずつ漢数字、ハイフンは「ー」、半角英記号は全角
export function verticalText(s) {
  return String(s ?? '')
    .replace(HYPHENS, 'ー')
    .replace(/[0-9０-９]/g, c => KD[(c.charCodeAt(0) & 0xf) % 10])
    .replace(/[!-~]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0))
    .replace(/ /g, '　');
}

// 令和は 2019 年を元年として数える（改元の月はここでは区別しない）
export function wareki(year) {
  const y = Math.trunc(Number(year));
  if (y >= 2019) return '令和' + (y === 2019 ? '元' : kanjiNumber(y - 2018)) + '年';
  if (y >= 1989) return '平成' + (y === 1989 ? '元' : kanjiNumber(y - 1988)) + '年';
  return '昭和' + kanjiNumber(y - 1925) + '年';
}

export function yearLabel(year, calendar) {
  if (calendar === 'seireki') return verticalText(String(year)) + '年';
  return wareki(year);
}

// 文面の中の年：送る年と同じなら「本年」、前の年なら「昨年」
export function relativeYear(year, sendYear, calendar) {
  const d = Number(sendYear) - Number(year);
  if (d === 0) return '本年';
  if (d === 1) return '昨年';
  return yearLabel(year, calendar);
}

export function monthLabel(m) {
  return kanjiNumber(m) + '月';
}

// 字の大きさを、紙からはみ出さない一番大きい値に合わせる（単位は mm）。
// lines を渡すと、その行が途中で折り返さない大きさを優先する（収まらない時だけ折り返しを許す）
export function fitCard(card, inner, { min = 2.2, max = 5.2, lines = [] } = {}) {
  const fits = () => inner.scrollWidth <= inner.clientWidth + 1 && inner.scrollHeight <= inner.clientHeight + 1;
  const oneColumn = () => [...lines].every(el => {
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    return el.offsetWidth <= lh * 1.5;
  });
  const search = ok => {
    let lo = min;
    let hi = max;
    card.style.setProperty('--fs', hi + 'mm');
    if (ok()) return hi;
    card.style.setProperty('--fs', lo + 'mm');
    if (!ok()) return null;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      card.style.setProperty('--fs', mid + 'mm');
      if (ok()) lo = mid; else hi = mid;
    }
    return lo;
  };
  const size = search(() => fits() && oneColumn()) ?? search(fits) ?? min;
  card.style.setProperty('--fs', size + 'mm');
  // 一番小さい字でも収まらない時は印刷の前に止められるよう印を付ける
  card.dataset.overflow = String(!fits());
  return size;
}

// 実寸（mm）で組んだ紙を、画面の幅に合わせて縮めて見せる。
// reserve を渡すと、画面の高さからその px を引いた高さにも収める（横に並べた見本が画面からはみ出さないように）
export function mountPreview(wrap, card, { reserve = null } = {}) {
  const apply = () => {
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    if (!w) return;
    let scale = Math.min(1.6, wrap.clientWidth / w);
    const r = typeof reserve === 'function' ? reserve() : reserve;
    if (r != null) scale = Math.min(scale, Math.max(0.35, (window.innerHeight - r) / h));
    card.style.transform = `scale(${scale})`;
    card.style.left = Math.max(0, (wrap.clientWidth - w * scale) / 2) + 'px';
    wrap.style.height = h * scale + 'px';
  };
  new ResizeObserver(apply).observe(wrap);
  window.addEventListener('resize', apply);
  apply();
  return apply;
}

// 印刷する1枚を用意する。paper は 'hagaki'（はがき実寸）か 'a4'（A4 に試し刷り）
export function preparePrint(card, { paper = 'hagaki', dx = 0, dy = 0, size = ['100mm', '148mm'] } = {}) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.append(root);
  }
  let pageStyle = document.getElementById('print-page-style');
  if (!pageStyle) {
    pageStyle = document.createElement('style');
    pageStyle.id = 'print-page-style';
    document.head.append(pageStyle);
  }
  const clone = card.cloneNode(true);
  clone.removeAttribute('id');
  clone.style.transform = '';
  root.replaceChildren(clone);
  root.dataset.paper = paper;
  root.style.setProperty('--dx', dx + 'mm');
  root.style.setProperty('--dy', dy + 'mm');
  root.style.setProperty('--sheet-w', size[0]);
  root.style.setProperty('--sheet-h', size[1]);
  pageStyle.textContent = paper === 'a4'
    ? '@page { size: A4 portrait; margin: 0; }'
    : `@page { size: ${size[0]} ${size[1]}; margin: 0; }`;
  return root;
}

export async function printSheet(card, options) {
  if (document.fonts) await document.fonts.ready;
  const root = preparePrint(card, options);
  window.addEventListener('afterprint', () => root.replaceChildren(), { once: true });
  window.print();
}

// この端末のブラウザにだけ入力を残す（使えない環境では黙って何もしない）
export const store = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* 保存できない環境 */ }
  },
};

export function toast(message, kind = 'ok') {
  let box = document.getElementById('toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  box.textContent = message;
  box.dataset.kind = kind;
  box.classList.add('toast-show');
  clearTimeout(box._timer);
  box._timer = setTimeout(() => box.classList.remove('toast-show'), kind === 'error' ? 6000 : 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}
