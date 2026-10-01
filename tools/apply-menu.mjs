// Загрузка нового меню на работающий сайт через API админки (без перезапуска сервиса).
//   ADMIN_PASS=... node tools/apply-menu.mjs tools/menu-2026-10.json            — пробный прогон: только показать изменения
//   ADMIN_PASS=... node tools/apply-menu.mjs tools/menu-2026-10.json --write    — применить
//   ADMIN_PASS=... node tools/apply-menu.mjs --restore menu-before-….json       — вернуть меню как было
// Адрес: ALTYN_URL (по умолчанию http://127.0.0.1:4326 — запуск на самом сервере).
// Перед --write текущее меню сохраняется в menu-before-<время>.json (в текущей папке), сервер дополнительно делает свой бэкап db.json.
//
// Как пишет: категории и «что советовать» — PUT /api/admin/content с версией (если кто-то правил их в админке — 409, ничего не пишем);
// блюда — по одному: POST (новые, с заданным id), PATCH (изменённые поля, стоп-лист НЕ трогаем), DELETE (только при откате);
// порядок — POST /api/admin/items/order. В конце перечитываем сайт и сверяем каждое поле.
import fs from 'node:fs';
import { applyMenu, printLog } from './menu-merge.mjs';

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const BASE = (process.env.ALTYN_URL || 'http://127.0.0.1:4326').replace(/\/$/, '');
const PASS = process.env.ADMIN_PASS;
if (!PASS) { console.error('Нужен ADMIN_PASS (пароль администратора), например: ADMIN_PASS=… node tools/apply-menu.mjs …'); process.exit(1); }

async function call(path, opts = {}, cookie) {
  const r = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path}: ${r.status} ${j.error || ''}`);
  return { j, r };
}
const { r: lr } = await call('/api/login', { method: 'POST', body: JSON.stringify({ password: PASS }) });
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
const getState = async () => (await call('/api/staff/state', {}, cookie)).j;
const state = await getState();
if (state.role !== 'admin') { console.error('Пароль не администраторский'); process.exit(1); }
const api = (path, method, body) => call(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }, cookie).then(x => x.j);

// Поля блюда, которые синхронизируем. stop (стоп-лист официантов) не трогаем никогда.
const MENU_FIELDS = ['name', 'desc', 'price', 'oldPrice', 'cat', 'tags', 'hidden'];
const ALL_FIELDS = [...MENU_FIELDS, 'nameKk', 'descKk', 'photo', 'thumb'];
const norm = (k, v) => k === 'tags' ? JSON.stringify(v || []) : k === 'hidden' ? !!v : k === 'oldPrice' || k === 'price' ? +v || 0 : (v ?? '');
const same = (a, b, k) => norm(k, a[k]) === norm(k, b[k]);

// Приводит сайт к target = { categories, items, pairs }. fields — какие поля блюд сверять. allowDelete — удалять лишние (только откат).
async function sync(target, fields, allowDelete) {
  const done = [];
  try {
    let cur = await getState(), ver = cur.ver || {};
    const curById = new Map(cur.items.map(x => [x.id, x]));
    const tgtIds = new Set(target.items.map(x => x.id));

    // 1. лишние блюда (только при откате) — удаляем до смены категорий
    const extra = cur.items.filter(x => !tgtIds.has(x.id));
    if (extra.length && !allowDelete) throw new Error(`на сайте есть блюда, которых нет в итоговом меню: ${extra.map(x => x.id).join(', ')}`);
    for (const x of extra) { await api(`/api/admin/items/${x.id}`, 'DELETE'); done.push(`удалено ${x.id}`); }

    // 2. категории
    if (JSON.stringify(cur.categories) !== JSON.stringify(target.categories)) {
      ver = (await api('/api/admin/content', 'PUT', { categories: target.categories, ver })).ver; done.push('категории');
    }
    // 3. новые блюда
    for (const it of target.items) if (!curById.has(it.id)) {
      const body = { id: it.id, stop: !!it.stop }; for (const k of fields) if (it[k] !== undefined) body[k] = it[k];
      await api('/api/admin/items', 'POST', body); done.push(`создано ${it.id}`);
    }
    // 4. изменённые блюда — только отличающиеся поля
    for (const it of target.items) {
      const c = curById.get(it.id); if (!c) continue;
      const patch = {}; for (const k of fields) if (!same(c, it, k)) patch[k] = k === 'oldPrice' ? (it.oldPrice || 0) : k === 'hidden' ? !!it.hidden : (it[k] ?? '');
      if (Object.keys(patch).length) { await api(`/api/admin/items/${it.id}`, 'PATCH', patch); done.push(`изменено ${it.id}`); }
    }
    // 5. порядок
    cur = await getState();
    if (cur.items.map(x => x.id).join() !== target.items.map(x => x.id).join()) { await api('/api/admin/items/order', 'POST', { ids: target.items.map(x => x.id) }); done.push('порядок'); }
    // 6. «что советовать»
    if (JSON.stringify(cur.pairs || {}) !== JSON.stringify(target.pairs || {})) { await api('/api/admin/content', 'PUT', { pairs: target.pairs, ver: cur.ver || {} }); done.push('pairs'); }
  } catch (e) {
    console.error(`\n✗ Ошибка: ${e.message}\nУспело выполниться (${done.length}): ${done.slice(-10).join('; ')}`);
    throw e;
  }
  // 7. сверка
  const after = await getState(), bad = [];
  if (after.items.map(x => x.id).join() !== target.items.map(x => x.id).join()) bad.push('порядок/состав блюд');
  if (JSON.stringify(after.categories) !== JSON.stringify(target.categories)) bad.push('категории');
  if (JSON.stringify(after.pairs || {}) !== JSON.stringify(target.pairs || {})) bad.push('pairs');
  const aById = new Map(after.items.map(x => [x.id, x]));
  for (const it of target.items) { const a = aById.get(it.id); if (a) for (const k of fields) if (!same(a, it, k)) bad.push(`${it.id}.${k}`); }
  return { done, bad, after };
}

if (flag('--restore')) {
  const file = args[args.indexOf('--restore') + 1];
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { done, bad, after } = await sync(snap, ALL_FIELDS, true);
  console.log(`Откат из ${file}: операций ${done.length}. Сейчас ${after.items.length} позиций.`);
  if (bad.length) { console.error('⚠ Не совпало после отката: ' + bad.join(', ')); process.exit(1); }
  console.log('✓ Меню совпадает со снимком.');
  process.exit(0);
}

const file = args.find(a => !a.startsWith('--'));
if (!file) { console.error('Укажите файл меню, например tools/menu-2026-10.json'); process.exit(1); }
const menu = JSON.parse(fs.readFileSync(file, 'utf8'));
const res = applyMenu(state, menu);
console.log(`Сайт: ${BASE}. Сейчас ${state.items.length} позиций.`);
printLog(res);

if (!flag('--write')) { console.log('\nПробный прогон — ничего не изменено. Для применения добавьте --write.'); process.exit(0); }
if (res.log.warn.some(w => w.includes('дубль') || w.includes('вторая такая же')) && !flag('--force')) {
  console.error('\nЕсть возможные дубли (см. «Проверьте»). Разберитесь или запустите с --force.'); process.exit(1);
}
const snapFile = `menu-before-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
fs.writeFileSync(snapFile, JSON.stringify({ categories: state.categories, items: state.items, pairs: state.pairs }, null, 1));
console.log(`\nСнимок текущего меню: ${fs.realpathSync(snapFile)}`);
try {
  const { done, bad } = await sync(res.data, MENU_FIELDS, false);
  console.log(`Операций: ${done.length}.`);
  if (bad.length) { console.error(`⚠ После загрузки не совпало: ${bad.join(', ')}\nОткат: --restore ${snapFile}`); process.exit(1); }
  console.log(`✓ Новое меню загружено и проверено. Откат: --restore ${snapFile}`);
} catch {
  console.error(`Откат: node tools/apply-menu.mjs --restore ${fs.realpathSync(snapFile)}`); process.exit(1);
}
