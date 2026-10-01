// Загрузка нового меню на работающий сайт через API админки (без перезапуска сервиса).
//   ADMIN_PASS=... node tools/apply-menu.mjs tools/menu-2026-10.json            — пробный прогон: только показать изменения
//   ADMIN_PASS=... node tools/apply-menu.mjs tools/menu-2026-10.json --write    — применить
//   ADMIN_PASS=... node tools/apply-menu.mjs --restore menu-before-….json       — вернуть меню как было
// Адрес: ALTYN_URL (по умолчанию http://127.0.0.1:4326 — запуск на самом сервере).
// Перед --write текущее меню сохраняется в menu-before-<время>.json, а сервер дополнительно делает свой бэкап db.json.
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
  if (!r.ok) throw new Error(`${path}: ${r.status} ${j.error || ''}`);
  return { j, r };
}
const { r: lr } = await call('/api/login', { method: 'POST', body: JSON.stringify({ password: PASS }) });
const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
const { j: state } = await call('/api/staff/state', {}, cookie);
if (state.role !== 'admin') { console.error('Пароль не администраторский'); process.exit(1); }
const put = data => call('/api/admin/content', { method: 'PUT', body: JSON.stringify(data) }, cookie);

if (flag('--restore')) {
  const file = args[args.indexOf('--restore') + 1];
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  await put({ categories: snap.categories, items: snap.items, pairs: snap.pairs });
  console.log(`Меню восстановлено из ${file}: ${snap.items.length} позиций.`);
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
await put(res.data);
console.log(`\n✓ Новое меню загружено. Копия прежнего: ${snapFile} (откат: --restore ${snapFile}).`);
