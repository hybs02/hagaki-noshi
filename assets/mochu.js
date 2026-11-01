// 喪中はがき・寒中見舞いの文面を入力から組み立てる（画面に依存しない）

import { kanjiNumber, verticalText, relativeYear, yearLabel, monthLabel } from './tategaki.js';

export const KINDS = {
  mochu: '喪中はがき',
  kanchu_late: '寒中見舞い（喪中を知らせる前に年賀状が届いた）',
  kanchu_reply: '寒中見舞い（喪中はがきを出した方から年賀状が届いた）',
  kanchu_to: '寒中見舞い（喪中の方へ出す）',
};

export const RELATIONS = [
  '父', '母', '夫', '妻', '義父', '義母', '祖父', '祖母',
  '兄', '姉', '弟', '妹', '義兄', '義姉', '義弟', '義妹',
  '長男', '長女', '次男', '次女', '三男', '三女', '息子', '娘', '孫',
  '伯父', '叔父', '伯母', '叔母', '曾祖父', '曾祖母',
];

export const GREETINGS = [
  ['喪中につき　年末年始のご挨拶を謹んでご遠慮申し上げます'],
  ['喪中につき　新年のご挨拶を失礼させていただきます'],
  ['喪中につき　年頭のご挨拶をご遠慮申し上げます'],
];

export const CLOSINGS = [
  ['本年中に賜りましたご厚情に深く感謝いたしますとともに', '明年も変わらぬご厚誼のほどよろしくお願い申し上げます'],
  ['生前に賜りましたご厚情に心より御礼申し上げます', '皆様が健やかな新年を迎えられますようお祈り申し上げます'],
  ['寒さに向かう折から　皆様どうぞご自愛ください', '明年も変わらぬお付き合いのほどよろしくお願いいたします'],
];

export const VERBS = ['永眠', '他界'];

const KANCHU_HEADING = '寒中お見舞い申し上げます';
const NAME_MAX = 30;

function clean(s, max = NAME_MAX) {
  return String(s ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function intOr(v, lo, hi) {
  if (v === '' || v == null) return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

// 亡くなった方1人分の言い回し
// 寒中見舞い（返事）では続柄と年だけを使うので、名前と月は求めない
function personParts(p, sendYear, calendar, omitYear, missing, label, full = true) {
  const rel = clean(p.rel, 12);
  const name = clean(p.name);
  const year = intOr(p.year, 1900, 2200);
  const month = intOr(p.month, 1, 12);
  let day = intOr(p.day, 1, 31);
  // 年齢0は「〇歳」になるので書かない
  const age = intOr(p.age, 1, 130);
  if (!rel) missing.push(`${label}の続柄`);
  if (!name && full) missing.push(`${label}のお名前`);
  if (year == null) missing.push(`${label}の亡くなった年`);
  if (month == null && full) missing.push(`${label}の亡くなった月`);
  if (day != null && year != null && month != null && day > new Date(year, month, 0).getDate()) {
    missing.push(`${label}の日（${month}月${day}日はありません）`);
    day = null;
  }
  const yearText = year == null ? '〇〇' : relativeYear(year, sendYear, calendar);
  const when = (omitYear ? '' : yearText)
    + (month == null ? '〇月' : monthLabel(month))
    + (day == null ? '' : kanjiNumber(day) + '日')
    + 'に';
  const who = `${verticalText(rel) || '〇〇'}　${verticalText(name) || '〇〇'}`;
  const ageText = age == null ? '' : kanjiNumber(age) + '歳にて';
  return { when, who, ageText, rel: verticalText(rel) || '〇〇', yearText };
}

function deathLines(persons, input, missing) {
  const verb = VERBS.includes(input.verb) ? input.verb : VERBS[0];
  const sendYear = Number(input.sendYear);
  const parts = persons.map((p, i) => personParts(
    p, sendYear, input.calendar,
    i > 0 && intOr(p.year, 1900, 2200) != null && intOr(p.year, 1900, 2200) === intOr(persons[0].year, 1900, 2200),
    missing, inputLabel(p, persons.length),
  ));
  if (parts.length === 1) {
    const [a] = parts;
    return [`${a.when}　${a.who}が${a.ageText}${verb}いたしました`];
  }
  const last = parts.length - 1;
  return parts.map((a, i) => `${a.when}　${a.who}が${a.ageText}${i === last ? verb + 'いたしました' : ''}`);
}

// 亡くなった順に並べる（年の分からない方は後ろ）
function dateKey(p) {
  const y = intOr(p.year, 1900, 2200);
  if (y == null) return Infinity;
  return y * 10000 + (intOr(p.month, 1, 12) ?? 0) * 100 + (intOr(p.day, 1, 31) ?? 0);
}

// 並べ替えた後も、足りない入力の知らせは入力欄の並び（1人目・2人目）で呼ぶ
function normalizedPersons(input) {
  const list = Array.isArray(input.persons) ? input.persons.slice(0, 2).filter(p => p && typeof p === 'object') : [];
  if (!list.length) return [{ inputIndex: 0 }];
  return list.map((p, i) => ({ ...p, inputIndex: i }))
    .sort((a, b) => dateKey(a) - dateKey(b) || a.inputIndex - b.inputIndex);
}

function inputLabel(p, count) {
  return count > 1 ? `${p.inputIndex + 1}人目` : '亡くなった方';
}

export function buildDoc(input) {
  const missing = [];
  const kind = KINDS[input.kind] ? input.kind : 'mochu';
  const sendYear = intOr(input.sendYear, 1900, 2200) ?? new Date().getFullYear();
  const sendMonth = intOr(input.sendMonth, 1, 12) ?? 11;
  const calendar = input.calendar === 'seireki' ? 'seireki' : 'wareki';
  const verb = VERBS.includes(input.verb) ? input.verb : VERBS[0];
  const persons = normalizedPersons(input);
  const ctx = { ...input, sendYear, calendar, verb };
  let heading = null;
  let body;

  if (kind === 'mochu') {
    const g = GREETINGS[intOr(input.greeting, 0, GREETINGS.length - 1) ?? 0];
    const c = CLOSINGS[intOr(input.closing, 0, CLOSINGS.length - 1) ?? 0];
    body = [...g, ...deathLines(persons, ctx, missing), ...c];
  } else if (kind === 'kanchu_late') {
    heading = KANCHU_HEADING;
    // 年が明けてから亡くなった時は、旧年中に知らせようがないのでおわびの行を入れない
    const diedLastYearOrBefore = persons.some(p => {
      const y = intOr(p.year, 1900, 2200);
      return y != null && y < sendYear;
    });
    body = [
      'ご丁寧なお年始状をいただき　ありがとうございました',
      ...deathLines(persons, ctx, missing),
      '服喪中のため　年頭のご挨拶を控えさせていただきました',
      ...(diedLastYearOrBefore ? ['旧年中にお知らせすべきところ　行き届かず失礼いたしました'] : []),
      '寒さ厳しき折　どうぞご自愛ください',
    ];
  } else if (kind === 'kanchu_reply') {
    heading = KANCHU_HEADING;
    const parts = persons.map(p => personParts(p, sendYear, calendar, false, missing, inputLabel(p, persons.length), false));
    const rels = parts.map(a => a.rel).join('と');
    // 2人の年が違う時は、どちらかの年に寄せず年を書かない
    const years = new Set(parts.map(a => a.yearText));
    const yearPart = years.size === 1 ? parts[0].yearText + '　' : '';
    body = [
      'ご丁寧なお年始状をいただき　ありがとうございました',
      `${yearPart}${rels}が${verb}いたしましたため`, '年頭のご挨拶を控えさせていただきました',
      '寒さ厳しき折　皆様のご健康を心よりお祈り申し上げます',
      '本年も変わらぬお付き合いのほど　よろしくお願いいたします',
    ];
  } else {
    heading = KANCHU_HEADING;
    body = [
      'ご服喪中と伺い　年始のご挨拶は控えさせていただきました',
      '遅ればせながら　謹んでお悔やみ申し上げます',
      '寒さ厳しき折　くれぐれもご自愛ください',
      '本年も変わらぬお付き合いのほど　よろしくお願い申し上げます',
    ];
  }

  const s = input.sender || {};
  const sender = {
    zip: clean(s.zip, 10),
    addr1: clean(s.addr1, 60),
    addr2: clean(s.addr2, 60),
    family: clean(s.family, 12),
    given1: clean(s.given1, 12),
    given2: clean(s.given2, 12),
  };

  return {
    kind,
    heading,
    body,
    date: yearLabel(sendYear, calendar) + monthLabel(sendMonth),
    sender: {
      zip: sender.zip ? '〒' + verticalText(sender.zip.replace(/^〒/, '')) : '',
      addr1: verticalText(sender.addr1),
      addr2: verticalText(sender.addr2),
      family: verticalText(sender.family),
      given: [sender.given1, sender.given2].filter(Boolean).map(verticalText),
    },
    missing,
  };
}

// 出す時期から外れていたら知らせる一言（外れていなければ空）
export function timingNote(kind, sendMonth) {
  const m = Number(sendMonth);
  if (kind === 'mochu') {
    return m === 11 || m === 12 ? '' : '喪中はがきは、相手が年賀状を用意する前の11月中旬〜12月上旬に届くように出します。';
  }
  return m === 1 || m === 2 ? '' : '寒中見舞いは、松の内が明けてから立春の前日（2月3日ごろ）までに出します。';
}

// 文面をふつうの文字列にする（コピー用）
export function docToText(doc, body) {
  const s = doc.sender;
  const names = s.given.map((g, i) => (i === 0 ? s.family + '　' : '') + g);
  if (!names.length && s.family) names.push(s.family);
  const blocks = [
    doc.heading ? [doc.heading] : [],
    body,
    [doc.date],
    [s.zip, s.addr1, s.addr2, ...names].filter(Boolean),
  ];
  return blocks.filter(b => b.length).map(b => b.join('\n')).join('\n\n');
}
