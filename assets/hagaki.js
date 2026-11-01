// はがきの通信面に文面を組む（文面は mochu.js の buildDoc の形）

import { fitCard } from './tategaki.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function renderHagaki(card, doc, body, { ink = 'black' } = {}) {
  const inner = card.querySelector('.sheet-inner');
  const nodes = [];
  if (doc.heading) nodes.push(el('p', 'hagaki-heading', doc.heading));
  const main = el('div', 'hagaki-body');
  for (const line of body) main.append(el('p', 'hagaki-line', line || '　'));
  nodes.push(main);
  nodes.push(el('p', 'hagaki-date', doc.date));

  const s = doc.sender;
  const sender = el('div', 'hagaki-sender');
  const addr = el('div', 'hagaki-addr');
  for (const line of [s.zip, s.addr1, s.addr2]) if (line) addr.append(el('p', 'hagaki-addr-line', line));
  sender.append(addr);
  const names = el('div', 'hagaki-names');
  if (s.given.length) {
    s.given.forEach((g, i) => {
      const p = el('p', 'hagaki-name');
      // 連名の2人目は姓を見えなくして、名の位置を1人目に揃える
      p.append(el('span', i === 0 ? '' : 'hagaki-ghost', s.family), s.family ? '　' : '', g);
      names.append(p);
    });
  } else if (s.family) {
    names.append(el('p', 'hagaki-name', s.family));
  }
  sender.append(names);
  nodes.push(sender);
  inner.replaceChildren(...nodes);
  card.dataset.ink = ink;
  return fitCard(card, inner, { lines: inner.querySelectorAll('.hagaki-line, .hagaki-heading, .hagaki-date, .hagaki-name') });
}
