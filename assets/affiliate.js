// 印刷サービスへの紹介リンク（PR）。仲介サービスで提携が通ったものだけをここに足す。
// 1件も無い間は、紹介の枠そのものを出さない。
//   name   : サービス名（正式名のまま）
//   url    : 仲介サービスが出すリンクの URL
//   pixel  : 表示を数えるための画像の URL（仲介サービスが出す時だけ）
//   note   : 一言（値段の特徴など。公式の表記に合わせる）
export const PRINT_SERVICES = [];

export function renderAffiliate(root, services = PRINT_SERVICES) {
  const list = root.querySelector('[data-affiliate-list]');
  if (!list || !services.length) return false;
  list.replaceChildren(...services.map(s => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.rel = 'sponsored noopener';
    a.target = '_blank';
    a.textContent = s.name;
    li.append(a);
    if (s.note) li.append('：' + s.note);
    if (s.pixel) {
      const img = document.createElement('img');
      img.src = s.pixel;
      img.width = 1;
      img.height = 1;
      img.alt = '';
      img.className = 'affiliate-pixel';
      li.append(img);
    }
    return li;
  }));
  for (const el of document.querySelectorAll('[data-affiliate]')) el.hidden = false;
  return true;
}
