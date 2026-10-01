// Накладывает файл нового меню (tools/menu-*.json) на текущие данные { categories, items, pairs }.
// Ничего не удаляет: позиции из menu.hide скрываются (hidden: true), всё, что не упомянуто, остаётся как есть.
// У обновляемых позиций сохраняются фото, метки, стоп-лист, скрытие и переводы — меняются только название, состав, цена, категория.
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"()\s]+/g, ' ').trim();

export function applyMenu(data, menu) {
  const categories = structuredClone(data.categories || []);
  const items = structuredClone(data.items || []);
  const pairs = structuredClone(data.pairs || {});
  const log = { price: [], renamed: [], desc: [], added: [], hidden: [], addedCats: [], warn: [] };

  // --- категории ---
  for (const c of menu.categories || []) {
    if (categories.some(x => x.id === c.id)) continue;
    const twin = categories.find(x => norm(x.name) === norm(c.name));
    if (twin) log.warn.push(`категория «${c.name}» уже есть под id ${twin.id} — будет вторая такая же`);
    categories.push({ ...c });
    log.addedCats.push(c.name);
  }
  const order = menu.categoryOrder || [];
  const rank = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  categories.sort((a, b) => rank(a.id) - rank(b.id)); // sort стабильный: неупомянутые остаются в своём порядке в конце

  // --- позиции ---
  const byId = new Map(items.map(x => [x.id, x]));
  const touched = new Set();
  for (const m of menu.items) {
    if (!categories.some(c => c.id === m.cat)) throw new Error(`${m.id}: нет категории ${m.cat}`);
    const cur = byId.get(m.id);
    if (!cur) {
      const twin = items.find(x => !x.hidden && norm(x.name) === norm(m.name));
      if (twin) log.warn.push(`«${m.name}» уже есть под id ${twin.id} — будет дубль`);
      const it = { id: m.id, cat: m.cat, name: m.name, desc: m.desc || '', price: m.price, tags: m.tags || [], photo: '', thumb: '', stop: false };
      items.push(it); byId.set(it.id, it); touched.add(it.id);
      log.added.push(`${it.name} — ${it.price}`);
      continue;
    }
    touched.add(cur.id);
    if (cur.hidden) log.warn.push(`«${cur.name}» (${cur.id}) есть в новом меню, но скрыт в админке — оставляю скрытым`);
    if (m.name !== undefined && m.name !== cur.name) {
      log.renamed.push(`${cur.name} → ${m.name}`);
      if (cur.nameKk) log.warn.push(`«${m.name}»: проверьте казахское название «${cur.nameKk}»`);
      cur.name = m.name;
    }
    if (m.desc !== undefined && (m.desc || '') !== (cur.desc || '')) {
      log.desc.push(`${cur.name}: ${m.desc || '(пусто)'}`);
      if (cur.descKk) log.warn.push(`«${cur.name}»: проверьте казахский состав`);
      cur.desc = m.desc || '';
    }
    if (m.price !== undefined && m.price !== cur.price) {
      log.price.push(`${cur.name}: ${cur.price} → ${m.price}`);
      cur.price = m.price;
      if (cur.oldPrice && cur.oldPrice <= cur.price) delete cur.oldPrice; // «акция» без скидки не показываем
    }
    cur.cat = m.cat;
    for (const t of m.tags || []) if (!(cur.tags ||= []).includes(t)) cur.tags.push(t);
  }
  for (const id of menu.hide || []) {
    const it = byId.get(id);
    if (!it) { log.warn.push(`скрыть ${id}: такой позиции нет`); continue; }
    if (touched.has(id)) throw new Error(`${id} одновременно в items и hide`);
    if (!it.hidden) { it.hidden = true; log.hidden.push(it.name); }
  }

  // Порядок: по категориям; внутри категории — как в новом меню, остальные (скрытые, добавленные в админке) — после.
  const pos = new Map(menu.items.map((m, i) => [m.id, i]));
  const catRank = new Map(categories.map((c, i) => [c.id, i]));
  const orig = new Map(items.map((x, i) => [x.id, i]));
  items.sort((a, b) => (catRank.get(a.cat) ?? 1e9) - (catRank.get(b.cat) ?? 1e9)
    || (pos.get(a.id) ?? 1e6 + orig.get(a.id)) - (pos.get(b.id) ?? 1e6 + orig.get(b.id)));

  // --- «С этим часто берут» ---
  Object.assign(pairs, structuredClone(menu.pairs || {}));
  for (const [k, ids] of Object.entries(pairs)) {
    for (const id of ids) if (!byId.has(id)) log.warn.push(`pairs.${k}: нет позиции ${id}`);
  }

  return { data: { categories, items, pairs }, log };
}

export function printLog({ log, data }) {
  const sec = (t, a) => a.length && console.log(`\n${t} (${a.length}):\n` + a.map(x => '  ' + x).join('\n'));
  sec('Новые категории', log.addedCats);
  sec('Цены', log.price);
  sec('Названия', log.renamed);
  sec('Состав', log.desc);
  sec('Новые позиции', log.added);
  sec('Скрыты (не удалены)', log.hidden);
  sec('⚠ Проверьте', log.warn);
  const vis = data.items.filter(i => !i.hidden && !data.categories.find(c => c.id === i.cat)?.hidden).length;
  console.log(`\nИтого: ${data.items.length} позиций, видно гостям ${vis}, категорий ${data.categories.length}.`);
}
