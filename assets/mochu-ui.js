// 喪中はがきの画面：入力 → 文面 → はがきの見本 → 印刷

import { buildDoc, docToText, timingNote, KINDS, RELATIONS, GREETINGS, CLOSINGS } from './mochu.js';
import { mountPreview, printSheet, store, toast, copyText } from './tategaki.js';
import { renderHagaki } from './hagaki.js';
import { renderAffiliate } from './affiliate.js';

const KEY = 'mochu-hagaki-form';
const $ = sel => document.querySelector(sel);
const form = $('#mochu-form');
const card = $('#hagaki');
const bodyEdit = $('#body-edit');
const editNote = $('#edit-note');
let manualBody = null;
let sendTouched = false;
let rescale = () => {};

function defaultsFor(kind, today = new Date()) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  if (kind === 'mochu') {
    if (m <= 2) return { sendYear: y, sendMonth: 11, deathYear: y };
    return { sendYear: y, sendMonth: m >= 11 ? m : 11, deathYear: y };
  }
  if (m <= 2) return { sendYear: y, sendMonth: m, deathYear: y - 1 };
  return { sendYear: y + 1, sendMonth: 1, deathYear: y };
}

function fillSelect(sel, items, selected) {
  sel.replaceChildren(...items.map(([value, label]) => {
    const o = document.createElement('option');
    o.value = String(value);
    o.textContent = label;
    if (String(value) === String(selected)) o.selected = true;
    return o;
  }));
}

function fillYearSelects(sendYear) {
  const now = new Date().getFullYear();
  const sendYears = [now - 1, now, now + 1].map(y => [y, `${y}年`]);
  const sendSel = form.elements.sendYear;
  fillSelect(sendSel, sendYears, sendYear);
  for (const sel of form.querySelectorAll('select[data-death-year]')) {
    const cur = sel.value || '';
    const years = [];
    for (let y = sendYear; y >= sendYear - 4; y--) years.push([y, `${y}年`]);
    fillSelect(sel, years, cur && years.some(([v]) => String(v) === cur) ? cur : sel.dataset.defaultYear || sendYear);
  }
}

function setup() {
  fillSelect(form.elements.kind, Object.entries(KINDS), 'mochu');
  fillSelect(form.elements.greeting, GREETINGS.map((g, i) => [i, g.join('')]), 0);
  fillSelect(form.elements.closing, CLOSINGS.map((c, i) => [i, c.join('')]), 0);
  const months = Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}月`]);
  fillSelect(form.elements.sendMonth, months, 11);
  for (const sel of form.querySelectorAll('select[data-death-month]')) fillSelect(sel, [['', '選ぶ'], ...months], '');
  const dl = $('#relations');
  dl.replaceChildren(...RELATIONS.map(r => Object.assign(document.createElement('option'), { value: r })));

  const saved = store.get(KEY);
  const kind = saved?.kind && KINDS[saved.kind] ? saved.kind : (new Date().getMonth() + 1 <= 2 ? 'kanchu_late' : 'mochu');
  const d = defaultsFor(kind);
  form.elements.kind.value = kind;
  for (const sel of form.querySelectorAll('select[data-death-year]')) sel.dataset.defaultYear = d.deathYear;
  // 出す年月は、利用者が自分で選んだ時だけ前回の値を使う（翌年に開いて去年の日付にならないように）
  const keepSend = Boolean(saved?.sendTouched);
  fillYearSelects(keepSend ? Number(saved.sendYear) : d.sendYear);
  form.elements.sendMonth.value = String(keepSend ? saved.sendMonth : d.sendMonth);
  if (saved) restore(saved);
  if (!keepSend) {
    form.elements.sendYear.value = String(d.sendYear);
    form.elements.sendMonth.value = String(d.sendMonth);
  }
  sendTouched = keepSend;
  manualBody = Array.isArray(saved?.manualBody) ? saved.manualBody : null;
  if (manualBody) bodyEdit.value = manualBody.join('\n');
}

function restore(saved) {
  for (const [name, value] of Object.entries(saved.fields || {})) {
    const el = form.elements[name];
    if (!el || el instanceof RadioNodeList) {
      if (el instanceof RadioNodeList) el.value = value;
      continue;
    }
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
    // 保存に無い選択肢が入っていたら、最初の選択肢に戻す
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
  }
  $('#person2').hidden = !saved.twoPersons;
}

function readForm() {
  const f = form.elements;
  const person = i => ({
    rel: f[`p${i}rel`].value,
    name: f[`p${i}name`].value,
    year: f[`p${i}year`].value,
    month: f[`p${i}month`].value,
    day: f[`p${i}day`].value,
    age: f[`p${i}age`].value,
  });
  const twoPersons = !$('#person2').hidden;
  return {
    kind: f.kind.value,
    persons: twoPersons ? [person(1), person(2)] : [person(1)],
    verb: f.verb.value,
    greeting: f.greeting.value,
    closing: f.closing.value,
    sendYear: f.sendYear.value,
    sendMonth: f.sendMonth.value,
    calendar: f.calendar.value,
    sender: {
      zip: f.zip.value, addr1: f.addr1.value, addr2: f.addr2.value,
      family: f.family.value, given1: f.given1.value, given2: f.given2.value,
    },
    twoPersons,
  };
}

function save(input) {
  const fields = {};
  for (const el of form.elements) {
    if (!el.name || el.type === 'button') continue;
    fields[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  store.set(KEY, {
    kind: input.kind, sendYear: input.sendYear, sendMonth: input.sendMonth,
    twoPersons: input.twoPersons, sendTouched, manualBody, fields,
  });
}

function renderCard(doc, body) {
  renderHagaki(card, doc, body, { ink: form.elements.ink.value });
  rescale();
}

// 同じ瞬間に続けて来た変更は1回にまとめる（requestAnimationFrame は裏のタブで止まるので使わない）
let pending = false;
function update() {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    pending = false;
    const input = readForm();
    const doc = buildDoc(input);
    const isMochu = doc.kind === 'mochu';
    const needsPersons = doc.kind !== 'kanchu_to';
    $('#persons-block').hidden = !needsPersons;
    for (const e of form.querySelectorAll('[data-needs-person]')) e.hidden = !needsPersons;
    $('#person1-head').hidden = !input.twoPersons;
    for (const e of form.querySelectorAll('[data-mochu-only]')) e.hidden = !isMochu;
    for (const e of form.querySelectorAll('[data-name-optional]')) e.hidden = doc.kind !== 'kanchu_reply';
    const body = manualBody ?? doc.body;
    if (manualBody == null && document.activeElement !== bodyEdit) bodyEdit.value = doc.body.join('\n');
    editNote.hidden = manualBody == null;
    const note = timingNote(doc.kind, input.sendMonth);
    $('#timing-note').textContent = note;
    $('#timing-note').hidden = !note;
    renderCard(doc, body);
    $('#overflow-note').hidden = card.dataset.overflow !== 'true';
    save(input);
  });
}

// 入力が足りない時に文面へ入る仮の字（〇〇・〇月）
const PLACEHOLDER = /〇〇|(^|本年|昨年|年)〇月/m;

function missingFor(doc) {
  if (manualBody != null) {
    return PLACEHOLDER.test(manualBody.join('\n')) ? ['文面に「〇〇」か「〇月」が残っています'] : [];
  }
  return doc.missing;
}

const clampOffset = v => Math.max(-10, Math.min(10, Number(v) || 0));

let printing = false;
async function onPrint() {
  if (printing) return;
  const doc = buildDoc(readForm());
  const missing = missingFor(doc);
  if (missing.length) {
    toast('まだ入っていない所があります：' + missing.join('・'), 'error');
    return;
  }
  if (card.dataset.overflow === 'true') {
    toast('文面が長すぎて、はがきに収まりません。文面の行を減らしてください', 'error');
    return;
  }
  const f = form.elements;
  const dx = clampOffset(f.offsetX.value);
  const dy = clampOffset(f.offsetY.value);
  f.offsetX.value = String(dx);
  f.offsetY.value = String(dy);
  const s = doc.sender;
  toast(s.family || s.given.length || s.addr1
    ? '印刷の画面を開きます'
    : '差出人を入れずに刷ります（宛名の面に書く時はこのままで構いません）');
  printing = true;
  try {
    await printSheet(card, { paper: f.paper.value, dx, dy });
  } finally {
    printing = false;
  }
}

async function onCopy() {
  const doc = buildDoc(readForm());
  const ok = await copyText(docToText(doc, manualBody ?? doc.body));
  toast(ok ? '文面をコピーしました' : 'コピーできませんでした。文面の欄から選んでコピーしてください', ok ? 'ok' : 'error');
}

function onClear() {
  if (!confirm('入力した内容をすべて消します。よろしいですか？')) return;
  store.remove(KEY);
  form.reset();
  manualBody = null;
  sendTouched = false;
  $('#person2').hidden = true;
  $('#add-person').hidden = false;
  setup();
  update();
  toast('入力を消しました');
}

function bind() {
  form.addEventListener('input', e => {
    if (e.target === bodyEdit) {
      manualBody = bodyEdit.value.split('\n').slice(0, 40).map(l => l.slice(0, 100));
    }
    if (e.target.name === 'sendYear') fillYearSelects(Number(e.target.value));
    if (e.target.name === 'sendYear' || e.target.name === 'sendMonth') sendTouched = true;
    update();
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'kind' && manualBody != null) {
      manualBody = null;
      bodyEdit.value = '';
      toast('種類を変えたので、文面を入力から作り直しました');
    }
    if (e.target.name === 'kind' && !sendTouched) {
      const d = defaultsFor(e.target.value);
      for (const sel of form.querySelectorAll('select[data-death-year]')) sel.dataset.defaultYear = d.deathYear;
      fillYearSelects(d.sendYear);
      form.elements.sendMonth.value = String(d.sendMonth);
    }
    update();
  });
  form.addEventListener('submit', e => { e.preventDefault(); onPrint(); });
  $('#add-person').addEventListener('click', () => {
    $('#person2').hidden = false;
    $('#add-person').hidden = true;
    form.elements.p2rel.focus();
    update();
  });
  $('#remove-person').addEventListener('click', () => {
    $('#person2').hidden = true;
    $('#add-person').hidden = false;
    update();
  });
  $('#regen').addEventListener('click', () => {
    manualBody = null;
    bodyEdit.value = '';
    bodyEdit.blur();
    update();
    toast('入力から文面を作り直しました');
  });
  $('#print-btn').addEventListener('click', onPrint);
  $('#copy-btn').addEventListener('click', onCopy);
  $('#clear-btn').addEventListener('click', onClear);
  bodyEdit.addEventListener('blur', update);
}

// 見本が画面に入っている間は「見本へ」の帯を隠す（狭い画面だけ出る帯）
function watchJumpBar() {
  const bar = $('.jump-preview');
  if (!bar || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([entry]) => { bar.hidden = entry.isIntersecting; })
    .observe($('#preview-area'));
}

setup();
watchJumpBar();
renderAffiliate($('#order'));
$('#add-person').hidden = !$('#person2').hidden;
bind();
// 横に並べた時は、見本と印刷のボタンが一度に画面へ収まるように縮める
rescale = mountPreview($('#preview'), card, { reserve: () => (window.innerWidth > 860 ? 200 : null) });
update();
// 明朝の字が届くと字幅が変わるので、そのたびに大きさを合わせ直す
if (document.fonts) {
  document.fonts.ready.then(update);
  document.fonts.addEventListener('loadingdone', update);
}
