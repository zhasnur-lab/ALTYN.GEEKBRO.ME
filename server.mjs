// ALTYN — сайт ресторана + QR-меню в зале + панель персонала.
// Zero-dep Node. Данные: data/db.json (атомарная запись), фото: data/uploads.
// Запуск: node server.mjs (env: PORT, ADMIN_PASS, STAFF_PASS, SECRET)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const UPL = path.join(DATA, 'uploads');
const BAK = path.join(DATA, 'backups');
const ARCH = path.join(DATA, 'archive');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = +process.env.PORT || 4326;
const SECRET = process.env.SECRET || 'dev-secret';
const PASS = { admin: process.env.ADMIN_PASS || 'admin', staff: process.env.STAFF_PASS || '1234' };
const INBOX_TOKEN = process.env.INBOX_TOKEN || ''; // ссылка для загрузки фото/видео с телефона: /inbox?k=…
const INBOX = path.join(DATA, 'media-inbox');

for (const d of [UPL, BAK, ARCH]) fs.mkdirSync(d, { recursive: true });

// ---------- DB ----------
function loadDb() {
  if (!fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(path.join(ROOT, 'seed.json'), 'utf8'));
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) {
    // Повреждённый db.json — поднимаемся с последней резервной копии, битый файл сохраняем рядом
    console.error('db.json повреждён:', e.message);
    fs.copyFileSync(DB_FILE, DB_FILE + '.broken-' + Date.now());
    const last = fs.readdirSync(BAK).filter(f => f.endsWith('.json')).sort().pop();
    if (!last) throw e;
    console.error('восстановлено из', last);
    return JSON.parse(fs.readFileSync(path.join(BAK, last), 'utf8'));
  }
}
let db = loadDb();
for (const k of ['orders', 'calls', 'bookings', 'reviews']) db[k] ||= [];
// Миграции: добавляем новые поля из seed, не трогая то, что уже отредактировано
(function migrate() {
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed.json'), 'utf8'));
  db.settings ||= {};
  for (const [k, v] of Object.entries(seed.settings)) if (db.settings[k] === undefined) db.settings[k] = v;
  db.pairs ||= seed.pairs || {};
  db.ver ||= {};
  const kk = Object.fromEntries(seed.items.filter(i => i.nameKk).map(i => [i.id, i.nameKk]));
  for (const it of db.items || []) {
    if (it.photo && !it.thumb && it.photo.startsWith('/img/gis/')) it.thumb = it.photo.replace(/\.jpg$/, '.sm.jpg');
    if (!it.nameKk && kk[it.id] && seed.items.find(s => s.id === it.id)?.name === it.name) it.nameKk = kk[it.id];
  }
})();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, JSON.stringify(db)); fs.fsyncSync(fd); fs.closeSync(fd);
    fs.renameSync(tmp, DB_FILE);
  }, 150);
}
// Резервные копии: с датой и временем, храним 60 последних (≈ 2 недели при копии каждые 6 ч + копии перед правками)
function backup(reason = 'auto') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.writeFileSync(path.join(BAK, `db-${stamp}-${reason}.json`), JSON.stringify(db));
  const files = fs.readdirSync(BAK).filter(f => f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 60))) fs.unlinkSync(path.join(BAK, f));
}
let lastEditBackup = 0;
function backupBeforeEdit() { if (Date.now() - lastEditBackup > 10 * 60e3) { lastEditBackup = Date.now(); backup('edit'); } }

// Архив: закрытые заказы старше 30 дней → data/archive/orders-YYYY-MM.json; выполненные вызовы старше 7 дней удаляем
function housekeeping() {
  const cut = Date.now() - 30 * 864e5, keep = [], byMonth = {};
  for (const o of db.orders) {
    if (['closed', 'cancelled'].includes(o.status) && Date.parse(o.updated) < cut) (byMonth[o.created.slice(0, 7)] ||= []).push(o);
    else keep.push(o);
  }
  for (const [mo, list] of Object.entries(byMonth)) {
    const f = path.join(ARCH, `orders-${mo}.json`);
    const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
    fs.writeFileSync(f, JSON.stringify(prev.concat(list)));
  }
  db.orders = keep;
  db.calls = db.calls.filter(c => c.status === 'open' || Date.parse(c.created) > Date.now() - 7 * 864e5);
  db.bookings = db.bookings.filter(b => b.date >= new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10));
  // Фото, на которые больше ничего не ссылается (заменённые/удалённые), удаляем через 2 дня
  const refs = JSON.stringify([db.settings, db.halls, db.items, db.gallery, db.categories]);
  for (const f of fs.readdirSync(UPL)) {
    const st = fs.statSync(path.join(UPL, f));
    if (!refs.includes('/uploads/' + f) && Date.now() - st.mtimeMs > 2 * 864e5) fs.unlinkSync(path.join(UPL, f));
  }
  save();
}
backup('start'); housekeeping();
setInterval(() => { backup('auto'); housekeeping(); }, 6 * 3600e3);

const id = (p = '') => p + crypto.randomBytes(5).toString('hex');
const now = () => new Date().toISOString();
const PUBLIC_KEYS = ['settings', 'halls', 'categories', 'items', 'pairs', 'gallery'];
const bump = k => { db.ver[k] = (db.ver[k] || 0) + 1; };

// ---------- ключи столов: QR ведёт на /t/5?k=…, без ключа заказать/позвать нельзя ----------
const tableKey = t => crypto.createHmac('sha256', SECRET).update('table:' + t).digest('base64url').slice(0, 6);
function tableOk(t, k) {
  const n = +t;
  return /^\d{1,3}$/.test(String(t)) && n >= 1 && n <= (+db.settings.tables || 20) && k === tableKey(String(n));
}

// ---------- SSE для персонала ----------
const clients = new Set();
function broadcast(type, payload) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(msg);
}
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25e3);

// ---------- auth ----------
function sign(role) {
  const exp = Date.now() + 30 * 864e5;
  const body = `${role}.${exp}`;
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function roleOf(req) {
  const m = /(?:^|;\s*)altyn_s=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [role, exp, sig] = decodeURIComponent(m[1]).split('.');
  const good = crypto.createHmac('sha256', SECRET).update(`${role}.${exp}`).digest('base64url');
  if (!sig || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (+exp < Date.now()) return null;
  return role;
}

// ---------- лимиты: отдельно по каждому действию (весь Wi-Fi ресторана — это один IP) ----------
const hits = new Map();
const ipOf = req => req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
function limited(key, max, windowMs = 60e3) {
  const t = Date.now(), arr = (hits.get(key) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => { const t = Date.now(); for (const [k, a] of hits) if (!a.some(x => t - x < 15 * 60e3)) hits.delete(k); }, 10 * 60e3);

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function body(req, limit = 1e6) {
  return new Promise((ok, fail) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { fail(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}
async function json(req) { const b = await body(req); return b.length ? JSON.parse(b.toString('utf8')) : {}; }
const str = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const phoneOk = p => /^[+\d][\d\s()-]{7,20}$/.test(p);

function serveFile(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size,
      'Cache-Control': cache || (ext === '.html' ? 'no-cache' : /\.(jpe?g|png|webp|mp4|woff2)$/.test(ext) ? 'public, max-age=604800' : 'public, max-age=3600, must-revalidate') });
    fs.createReadStream(file).pipe(res);
  });
}

const pubReview = r => ({ id: r.id, name: r.name, rating: r.rating, text: r.text, created: r.created, source: r.source, reply: r.reply });
function publicData() {
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = db[k];
  out.reviews = db.reviews.filter(r => r.approved && r.text).slice(-40).reverse().map(pubReview);
  return out;
}
const orderTotal = items => items.reduce((s, x) => s + x.price * x.qty, 0);
const catHidden = catId => !!db.categories.find(c => c.id === catId)?.hidden;

// Поля блюда, которые можно менять из админки
const ITEM_FIELDS = { name: v => str(v, 120), nameKk: v => str(v, 120), desc: v => str(v, 600), descKk: v => str(v, 600),
  price: v => Math.max(0, Math.round(+v || 0)), cat: v => str(v, 40), photo: v => str(v, 300), thumb: v => str(v, 300),
  tags: v => Array.isArray(v) ? v.map(x => str(x, 20)).slice(0, 8) : [], hidden: v => !!v, stop: v => !!v };
function applyItem(it, b) {
  for (const [k, f] of Object.entries(ITEM_FIELDS)) if (b[k] !== undefined) it[k] = f(b[k]);
  if (b.oldPrice !== undefined) { const o = Math.round(+b.oldPrice || 0); if (o > it.price) it.oldPrice = o; else delete it.oldPrice; }
  if (!db.categories.some(c => c.id === it.cat)) it.cat = db.categories[0]?.id;
}

// ---------- routes ----------
async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  const role = roleOf(req), ip = ipOf(req);
  let mm;

  // Запросы, меняющие данные, принимаем только со своего сайта (защита от CSRF с соседних *.geekbro.me)
  if (m !== 'GET' && req.headers.origin) {
    let host = ''; try { host = new URL(req.headers.origin).host; } catch {}
    if (host !== req.headers.host) return send(res, 403, { error: 'forbidden origin' });
  }

  // --- public ---
  if (p === '/api/data' && m === 'GET') return send(res, 200, publicData());

  if (p === '/api/orders' && m === 'POST') {
    const b = await json(req);
    const type = ['table', 'pickup', 'delivery'].includes(b.type) ? b.type : 'table';
    const table = type === 'table' ? String(+b.table || '') : '';
    if (type === 'table' && !tableOk(table, b.k)) return send(res, 403, { error: 'Отсканируйте QR-код на вашем столе, чтобы заказать', code: 'table' });
    if (limited('ord:' + ip, 60) || (table && limited('ordt:' + table, 8))) return send(res, 429, { error: 'Слишком много заказов подряд, подождите минуту' });
    if (type === 'pickup' && db.settings.pickup?.enabled === false) return send(res, 400, { error: 'Самовывоз сейчас недоступен' });
    if (type === 'delivery' && !db.settings.delivery?.enabled) return send(res, 400, { error: 'Доставка сейчас недоступна' });
    const items = [], gone = [];
    for (const it of (b.items || []).slice(0, 60)) {
      const d = db.items.find(x => x.id === it.id);
      const qty = Math.max(1, Math.min(50, +it.qty | 0));
      if (!d || d.hidden || catHidden(d.cat)) { gone.push(d?.name || 'позиция'); continue; }
      if (d.stop) return send(res, 409, { error: `«${d.name}» сейчас нет в наличии — уберите из корзины`, stop: d.id });
      items.push({ id: d.id, name: d.name, nameKk: d.nameKk || '', price: d.price, qty, note: str(it.note, 120) });
    }
    if (gone.length) return send(res, 409, { error: `Больше нет в меню: ${gone.join(', ')}. Обновите корзину.`, gone: true });
    if (!items.length) return send(res, 400, { error: 'Корзина пуста' });
    const phone = str(b.phone, 30);
    if (type !== 'table' && !phoneOk(phone)) return send(res, 400, { error: 'Укажите телефон' });
    if (type === 'delivery' && !str(b.address)) return send(res, 400, { error: 'Укажите адрес доставки' });
    const sum = orderTotal(items), minOrder = +db.settings.delivery?.minOrder || 0;
    if (type === 'delivery' && minOrder && sum < minOrder) return send(res, 400, { error: `Минимальная сумма доставки — ${minOrder} ₸` });
    const fee = type === 'delivery' ? +db.settings.delivery?.fee || 0 : 0;
    const o = { id: id('o'), no: (db.orderNo = (db.orderNo || 100) + 1), token: id(), type, table, name: str(b.name, 60), phone,
      address: str(b.address), comment: str(b.comment, 400), items, deliveryFee: fee, total: sum + fee, status: 'new', pay: 'unpaid',
      created: now(), updated: now() };
    db.orders.push(o); save(); broadcast('order', o);
    return send(res, 200, { id: o.id, no: o.no, token: o.token, total: o.total });
  }
  if ((mm = /^\/api\/orders\/(\w+)$/.exec(p)) && m === 'GET') {
    const o = db.orders.find(x => x.id === mm[1]);
    if (!o || (o.token !== url.searchParams.get('t') && !role)) return send(res, 404, { error: 'not found' });
    const { token, phone, address, ...safe } = o;
    return send(res, 200, safe);
  }

  if ((mm = /^\/api\/table\/(\d{1,3})\/bill$/.exec(p)) && m === 'GET') {
    if (!tableOk(mm[1], url.searchParams.get('k'))) return send(res, 403, { error: 'Отсканируйте QR-код на вашем столе', code: 'table' });
    const orders = db.orders.filter(o => o.type === 'table' && o.table === mm[1] && o.pay === 'unpaid' && !['closed', 'cancelled'].includes(o.status));
    const items = [];
    for (const o of orders) for (const it of o.items) {
      const x = items.find(y => y.id === it.id);
      if (x) x.qty += it.qty; else items.push({ id: it.id, name: it.name, nameKk: it.nameKk, price: it.price, qty: it.qty });
    }
    const sum = orderTotal(items), fee = Math.round(sum * (db.settings.serviceFee || 0) / 100);
    return send(res, 200, { table: mm[1], orders: orders.map(o => o.no), items, sum, fee, total: sum + fee });
  }

  if (p === '/api/calls' && m === 'POST') {
    const b = await json(req);
    const kind = ['waiter', 'bill', 'paid', 'kaspi'].includes(b.kind) ? b.kind : 'waiter';
    const table = String(+b.table || '');
    if (!tableOk(table, b.k)) return send(res, 403, { error: 'Отсканируйте QR-код на вашем столе', code: 'table' });
    if (limited('call:' + ip, 60) || limited('callt:' + table, 6)) return send(res, 429, { error: 'Официант уже получил вызов, подождите минуту' });
    const dup = db.calls.find(c => c.table === table && c.kind === kind && c.status === 'open');
    if (dup) return send(res, 200, { id: dup.id, dup: true });
    const c = { id: id('c'), table, kind, note: str(b.note, 200), amount: +b.amount || 0, status: 'open', created: now() };
    db.calls.push(c); save(); broadcast('call', c);
    return send(res, 200, { id: c.id });
  }

  if (p === '/api/bookings' && m === 'POST') {
    if (limited('book:' + ip, 8)) return send(res, 429, { error: 'Подождите минуту' });
    const b = await json(req);
    const phone = str(b.phone, 30);
    if (!str(b.name) || !phoneOk(phone)) return send(res, 400, { error: 'Укажите имя и телефон' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !/^\d{2}:\d{2}$/.test(b.time || '')) return send(res, 400, { error: 'Укажите дату и время' });
    if (new Date(b.date + 'T23:59') < new Date()) return send(res, 400, { error: 'Дата уже прошла' });
    const hall = db.halls.find(h => h.id === b.hall);
    const bk = { id: id('b'), kind: b.kind === 'event' ? 'event' : 'table', hall: hall?.id || '', hallName: hall?.name || '',
      date: b.date, time: b.time, guests: Math.max(1, Math.min(500, +b.guests | 0)), event: str(b.event, 60),
      name: str(b.name, 60), phone, comment: str(b.comment, 600), preorder: str(b.preorder, 600), status: 'new', created: now() };
    db.bookings.push(bk); save(); broadcast('booking', bk);
    return send(res, 200, { id: bk.id });
  }

  if (p === '/api/reviews' && m === 'POST') {
    if (limited('rev:' + ip, 20)) return send(res, 429, { error: 'Подождите минуту' });
    const b = await json(req);
    const rating = Math.max(1, Math.min(5, +b.rating | 0));
    const r = { id: id('r'), name: str(b.name, 40) || 'Гость', rating, text: str(b.text, 1000), table: str(b.table, 10),
      phone: str(b.phone, 30), private: rating <= 3 || !!b.private, approved: false, source: 'site', created: now() };
    db.reviews.push(r); save(); broadcast('review', r);
    return send(res, 200, { ok: true });
  }

  // --- приём фото/видео по секретной ссылке (оригиналы для роликов и сайта) ---
  if (p === '/api/inbox' && m === 'POST') {
    if (!INBOX_TOKEN || url.searchParams.get('k') !== INBOX_TOKEN) return send(res, 404, { error: 'not found' });
    const raw = path.basename(str(url.searchParams.get('name'), 120)).replace(/[^\w.\-а-яё ]/gi, '_') || 'file';
    if (!/\.(jpe?g|png|heic|heif|webp|mp4|mov|m4v)$/i.test(raw)) return send(res, 400, { error: 'Нужны фото или видео' });
    fs.mkdirSync(INBOX, { recursive: true });
    const file = path.join(INBOX, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-${raw}`);
    let n = 0; const out = fs.createWriteStream(file);
    await new Promise((ok, fail) => {
      req.on('data', c => { n += c.length; if (n > 600e6) { req.destroy(); fail(new Error('too big')); } });
      req.pipe(out); out.on('finish', ok); req.on('error', fail);
    });
    return send(res, 200, { ok: 1, size: n });
  }

  // --- staff auth ---
  if (p === '/api/login' && m === 'POST') {
    if (limited('login:' + ip, 8)) return send(res, 429, { error: 'Слишком много попыток, подождите минуту' });
    const b = await json(req);
    const pw = str(b.password, 100);
    const r = pw && pw === PASS.admin ? 'admin' : pw && pw === PASS.staff ? 'staff' : null;
    if (!r) return send(res, 401, { error: 'Неверный пароль' });
    return send(res, 200, { role: r }, { 'Set-Cookie': `altyn_s=${encodeURIComponent(sign(r))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}` });
  }
  if (p === '/api/logout') return send(res, 200, { ok: 1 }, { 'Set-Cookie': 'altyn_s=; Path=/; Max-Age=0' });

  if (!role) return send(res, 401, { error: 'auth' });
  const admin = role === 'admin';

  if (p === '/api/staff/me') return send(res, 200, { role });
  if (p === '/api/staff/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n'); clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/staff/state' && m === 'GET') {
    const t = Date.now();
    return send(res, 200, {
      role, ...publicData(), ver: db.ver,
      reviews: db.reviews.slice(-200).reverse(),
      orders: db.orders.filter(o => ['closed', 'cancelled'].includes(o.status) ? Date.parse(o.updated) > t - 24 * 3600e3 : Date.parse(o.created) > t - 48 * 3600e3),
      calls: db.calls.filter(c => (c.status === 'open' && Date.parse(c.created) > t - 12 * 3600e3) || Date.parse(c.created) > t - 12 * 3600e3),
      bookings: db.bookings.filter(b => b.date >= new Date(t - 2 * 864e5).toISOString().slice(0, 10)),
    });
  }
  if (p === '/api/staff/qr-keys' && m === 'GET') {
    const n = +db.settings.tables || 20;
    return send(res, 200, Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, tableKey(String(i + 1))])));
  }
  if ((mm = /^\/api\/staff\/orders\/(\w+)$/.exec(p)) && m === 'PATCH') {
    const o = db.orders.find(x => x.id === mm[1]); if (!o) return send(res, 404, {});
    const b = await json(req);
    if (['new', 'accepted', 'cooking', 'served', 'closed', 'cancelled'].includes(b.status)) o.status = b.status;
    if (['unpaid', 'kaspi', 'cash', 'card'].includes(b.pay)) o.pay = b.pay;
    o.updated = now(); save(); broadcast('order', o);
    return send(res, 200, o);
  }
  if ((mm = /^\/api\/staff\/calls\/(\w+)$/.exec(p)) && m === 'PATCH') {
    const c = db.calls.find(x => x.id === mm[1]); if (!c) return send(res, 404, {});
    c.status = 'done'; c.done = now(); save(); broadcast('call', c);
    return send(res, 200, c);
  }
  if ((mm = /^\/api\/staff\/bookings\/(\w+)$/.exec(p)) && m === 'PATCH') {
    const bk = db.bookings.find(x => x.id === mm[1]); if (!bk) return send(res, 404, {});
    const b = await json(req);
    if (['new', 'confirmed', 'declined', 'done'].includes(b.status)) bk.status = b.status;
    if (b.staffNote !== undefined) bk.staffNote = str(b.staffNote, 300);
    save(); broadcast('booking', bk);
    return send(res, 200, bk);
  }
  if ((mm = /^\/api\/staff\/table\/(\d{1,3})\/pay$/.exec(p)) && m === 'POST') {
    // Закрываем только ПОДАННЫЕ заказы: свежий дозаказ (новый/готовится) остаётся на доске
    const b = await json(req);
    const pay = ['kaspi', 'cash', 'card'].includes(b.pay) ? b.pay : 'cash';
    const list = db.orders.filter(o => o.type === 'table' && o.table === mm[1] && o.pay === 'unpaid' && o.status === 'served');
    const pending = db.orders.filter(o => o.type === 'table' && o.table === mm[1] && ['new', 'accepted', 'cooking'].includes(o.status)).length;
    for (const o of list) { o.pay = pay; o.status = 'closed'; o.updated = now(); broadcast('order', o); }
    for (const c of db.calls) if (c.table === mm[1] && c.status === 'open' && ['bill', 'paid', 'kaspi'].includes(c.kind)) { c.status = 'done'; c.done = now(); broadcast('call', c); }
    save(); return send(res, 200, { closed: list.length, total: orderTotal(list.flatMap(o => o.items)), pending });
  }
  if ((mm = /^\/api\/staff\/items\/(\w+)\/stop$/.exec(p)) && m === 'POST') {
    const it = db.items.find(x => x.id === mm[1]); if (!it) return send(res, 404, {});
    it.stop = !it.stop; save(); broadcast('item', it);
    return send(res, 200, it);
  }

  // --- admin only ---
  if (!admin) return send(res, 403, { error: 'Только для администратора' });

  // Блюда — по одному (никто не затирает чужие правки и стоп-лист)
  if (p === '/api/admin/items' && m === 'POST') {
    const b = await json(req);
    // id можно задать (файлы меню ссылаются на постоянные id), иначе генерируем
    const want = typeof b.id === 'string' && /^[a-z][a-z0-9_]{1,40}$/i.test(b.id) ? b.id : '';
    if (want && db.items.some(x => x.id === want)) return send(res, 409, { error: `Позиция ${want} уже есть` });
    const it = { id: want || str(b.cat, 20).replace(/\W/g, '') + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), name: '', price: 0, tags: [], photo: '', thumb: '', stop: false, hidden: false };
    applyItem(it, b);
    if (!it.name || !it.price) return send(res, 400, { error: 'Нужны название и цена' });
    backupBeforeEdit();
    const after = db.items.findIndex(x => x.id === b.after);
    let pos = after >= 0 ? after + 1 : -1;
    if (pos < 0) { const lastInCat = db.items.map(x => x.cat).lastIndexOf(it.cat); pos = lastInCat >= 0 ? lastInCat + 1 : db.items.length; }
    db.items.splice(pos, 0, it); save(); broadcast('item', it); broadcast('items-order', db.items.map(x => x.id));
    return send(res, 200, it);
  }
  if ((mm = /^\/api\/admin\/items\/(\w+)$/.exec(p)) && (m === 'PATCH' || m === 'DELETE')) {
    const i = db.items.findIndex(x => x.id === mm[1]); if (i < 0) return send(res, 404, { error: 'Блюдо уже удалено' });
    backupBeforeEdit();
    if (m === 'DELETE') {
      const [it] = db.items.splice(i, 1);
      for (const k in db.pairs) db.pairs[k] = db.pairs[k].filter(x => x !== it.id);
      save(); broadcast('item-del', { id: it.id }); return send(res, 200, { ok: 1 });
    }
    applyItem(db.items[i], await json(req)); save(); broadcast('item', db.items[i]);
    return send(res, 200, db.items[i]);
  }
  if (p === '/api/admin/items/order' && m === 'POST') {
    // Полный порядок блюд (для загрузки меню из файла): только перестановка существующих id
    const b = await json(req), ids = Array.isArray(b.ids) ? b.ids : [];
    const cur = new Set(db.items.map(x => x.id));
    if (ids.length !== cur.size || new Set(ids).size !== ids.length || !ids.every(x => cur.has(x))) return send(res, 409, { error: 'Список блюд изменился, порядок не применён' });
    const rank = new Map(ids.map((x, i) => [x, i]));
    db.items.sort((x, y) => rank.get(x.id) - rank.get(y.id)); save(); broadcast('items-order', db.items.map(x => x.id));
    return send(res, 200, { ok: 1 });
  }
  if ((mm = /^\/api\/admin\/items\/(\w+)\/move$/.exec(p)) && m === 'POST') {
    const b = await json(req), i = db.items.findIndex(x => x.id === mm[1]); if (i < 0) return send(res, 404, {});
    const dir = b.dir < 0 ? -1 : 1, cat = db.items[i].cat;
    let j = i + dir; while (j >= 0 && j < db.items.length && db.items[j].cat !== cat) j += dir;
    if (j >= 0 && j < db.items.length) { [db.items[i], db.items[j]] = [db.items[j], db.items[i]]; save(); broadcast('items-order', db.items.map(x => x.id)); }
    return send(res, 200, { order: db.items.map(x => x.id) });
  }

  // Остальное содержимое — целиком, но с проверкой версии: если кто-то успел сохранить раньше — 409
  if (p === '/api/admin/content' && m === 'PUT') {
    const b = await json(req);
    const keys = ['settings', 'halls', 'categories', 'pairs', 'gallery'].filter(k => b[k] !== undefined);
    for (const k of keys) {
      if ((b.ver?.[k] ?? 0) !== (db.ver[k] || 0)) return send(res, 409, { error: 'Эти данные только что изменил другой администратор. Страница обновится — повторите правку.', stale: k });
      const okType = k === 'settings' || k === 'pairs' ? b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) : Array.isArray(b[k]);
      if (!okType) return send(res, 400, { error: 'Неверные данные: ' + k });
    }
    if (b.categories && !b.categories.length) return send(res, 400, { error: 'Нужна хотя бы одна категория' });
    backupBeforeEdit();
    for (const k of keys) { db[k] = b[k]; bump(k); }
    // перенос блюд из удалённых категорий
    if (b.moves && typeof b.moves === 'object') for (const it of db.items) if (b.moves[it.cat]) it.cat = b.moves[it.cat];
    if (b.categories) for (const it of db.items) if (!db.categories.some(c => c.id === it.cat)) it.cat = db.categories[0].id;
    save(); broadcast('content', { ver: db.ver });
    return send(res, 200, { ok: 1, ver: db.ver });
  }
  if ((mm = /^\/api\/admin\/reviews\/(\w+)$/.exec(p))) {
    const i = db.reviews.findIndex(x => x.id === mm[1]); if (i < 0) return send(res, 404, {});
    if (m === 'DELETE') db.reviews.splice(i, 1);
    else { const b = await json(req); if (b.approved !== undefined) db.reviews[i].approved = !!b.approved; if (b.reply !== undefined) db.reviews[i].reply = str(b.reply, 600); }
    save(); return send(res, 200, { ok: 1 });
  }
  if (p === '/api/admin/upload' && m === 'POST') {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.headers['content-type']];
    if (!ext) return send(res, 400, { error: 'Нужна картинка JPG, PNG или WEBP' });
    const buf = await body(req, 15e6);
    const name = id() + ext;
    fs.writeFileSync(path.join(UPL, name), buf);
    return send(res, 200, { url: '/uploads/' + name });
  }
  if (p === '/api/admin/reel' && m === 'POST') {
    // Добавить видео Instagram по ссылке: вытаскиваем код и обложку (og:image)
    const b = await json(req);
    const code = /instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]{5,40})/.exec(str(b.url, 500))?.[1];
    if (!code) return send(res, 400, { error: 'Не похоже на ссылку Instagram (нужна ссылка на Reels или пост)' });
    let cover = '', caption = '';
    try {
      const r = await fetch(`https://www.instagram.com/reel/${code}/`, { headers: { 'User-Agent': 'facebookexternalhit/1.1' }, signal: AbortSignal.timeout(12000) });
      const html = await r.text();
      const unesc = x => x.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
      const img = /property="og:image" content="([^"]+)/.exec(html)?.[1];
      const t = /property="og:title" content="([^"]+)/.exec(html)?.[1];
      if (t) caption = (unesc(t).split(':').slice(1).join(':').replace(/^\s*"|"\s*$/g, '').split('\n')[0] || '').trim().slice(0, 80);
      if (img) {
        const ir = await fetch(unesc(img), { signal: AbortSignal.timeout(12000) });
        if (ir.ok) { const name = id() + '.jpg'; fs.writeFileSync(path.join(UPL, name), Buffer.from(await ir.arrayBuffer())); cover = '/uploads/' + name; }
      }
    } catch (e) { console.error('reel fetch', e.message); }
    return send(res, 200, { type: 'reel', code, cover, caption });
  }
  if (p === '/api/admin/reviews' && m === 'POST') {
    const b = await json(req);
    const r = { id: id('r'), name: str(b.name, 40) || 'Гость', rating: Math.max(1, Math.min(5, +b.rating | 0)), text: str(b.text, 1000),
      source: b.source === '2gis' ? '2gis' : 'site', approved: true, created: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : now().slice(0, 10) };
    db.reviews.push(r); save(); return send(res, 200, r);
  }
  if (p === '/api/admin/export' && m === 'GET') return send(res, 200, db, { 'Content-Disposition': 'attachment; filename="altyn-db.json"' });
  return send(res, 404, { error: 'not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: 1 });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/uploads/')) return serveFile(res, path.join(UPL, path.basename(url.pathname)));
    // SPA-маршруты: /t/12 (стол), /menu, /book …
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/staff' || rel === '/staff/') return serveFile(res, path.join(PUB, 'staff/index.html'));
    if (rel === '/inbox' && INBOX_TOKEN && url.searchParams.get('k') === INBOX_TOKEN) return serveFile(res, path.join(PUB, 'inbox.html'));
    if (/^\/(t\/[\w-]+|menu|book|halls|gallery|reviews|order)\/?$/.test(rel) || rel === '/') return serveFile(res, path.join(PUB, 'index.html'));
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    return serveFile(res, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'bad json' : 'Ошибка сервера' });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log('ALTYN on :' + PORT));
