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
const DB_FILE = path.join(DATA, 'db.json');
const PORT = +process.env.PORT || 4326;
const SECRET = process.env.SECRET || 'dev-secret';
const PASS = { admin: process.env.ADMIN_PASS || 'admin', staff: process.env.STAFF_PASS || '1234' };

fs.mkdirSync(UPL, { recursive: true });

// ---------- DB ----------
let db = JSON.parse(fs.readFileSync(fs.existsSync(DB_FILE) ? DB_FILE : path.join(ROOT, 'seed.json'), 'utf8'));
for (const k of ['orders', 'calls', 'bookings', 'reviews', 'feedback']) db[k] ||= [];
// Миграции: добавляем новые поля из seed, не трогая то, что уже отредактировано
(function migrate() {
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed.json'), 'utf8'));
  db.settings ||= {};
  for (const [k, v] of Object.entries(seed.settings)) if (db.settings[k] === undefined) db.settings[k] = v;
  db.pairs ||= seed.pairs || {};
  for (const it of db.items || []) if (it.photo && !it.thumb && it.photo.startsWith('/img/gis/')) it.thumb = it.photo.replace(/\.jpg$/, '.sm.jpg');
})();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 150);
}
function backup() {
  const dir = path.join(DATA, 'backups'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `db-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify(db));
}
backup(); setInterval(backup, 6 * 3600e3);
save();

const id = (p = '') => p + crypto.randomBytes(5).toString('hex');
const now = () => new Date().toISOString();
const PUBLIC_KEYS = ['settings', 'halls', 'categories', 'items', 'pairs', 'gallery'];

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

// ---------- rate limit (публичные POST) ----------
const hits = new Map();
function limited(req, max = 20) {
  const ip = req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const t = Date.now(), arr = (hits.get(ip) || []).filter(x => t - x < 60e3);
  arr.push(t); hits.set(ip, arr);
  return arr.length > max;
}
setInterval(() => hits.clear(), 10 * 60e3);

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

function publicData() {
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = db[k];
  out.reviews = db.reviews.filter(r => r.approved).slice(-40).reverse();
  return out;
}
function orderTotal(items) { return items.reduce((s, x) => s + x.price * x.qty, 0); }

// ---------- routes ----------
async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  const role = roleOf(req);
  let mm;

  // --- public ---
  if (p === '/api/data' && m === 'GET') return send(res, 200, publicData());

  if (p === '/api/orders' && m === 'POST') {
    if (limited(req, 10)) return send(res, 429, { error: 'Слишком много запросов, подождите минуту' });
    const b = await json(req);
    const type = ['table', 'pickup', 'delivery'].includes(b.type) ? b.type : 'table';
    const items = [];
    for (const it of (b.items || []).slice(0, 60)) {
      const d = db.items.find(x => x.id === it.id);
      const qty = Math.max(1, Math.min(50, +it.qty | 0));
      if (!d || d.hidden) continue;
      if (d.stop) return send(res, 409, { error: `«${d.name}» сейчас нет в наличии` });
      items.push({ id: d.id, name: d.name, price: d.price, qty, note: str(it.note, 120) });
    }
    if (!items.length) return send(res, 400, { error: 'Корзина пуста' });
    const table = type === 'table' ? str(b.table, 10) : '';
    if (type === 'table' && !table) return send(res, 400, { error: 'Не указан стол' });
    const phone = str(b.phone, 30);
    if (type !== 'table' && !phoneOk(phone)) return send(res, 400, { error: 'Укажите телефон' });
    if (type === 'delivery' && !str(b.address)) return send(res, 400, { error: 'Укажите адрес доставки' });
    const o = { id: id('o'), no: (db.orderNo = (db.orderNo || 100) + 1), token: id(), type, table, name: str(b.name, 60), phone,
      address: str(b.address), comment: str(b.comment, 400), items,
      deliveryFee: type === 'delivery' ? +db.settings.delivery?.fee || 0 : 0,
      total: orderTotal(items) + (type === 'delivery' ? +db.settings.delivery?.fee || 0 : 0), status: 'new', pay: 'unpaid',
      created: now(), updated: now() };
    db.orders.push(o); save(); broadcast('order', o);
    return send(res, 200, { id: o.id, no: o.no, token: o.token, total: o.total });
  }
    if ((mm = /^\/api\/orders\/(\w+)$/.exec(p)) && m === 'GET') {
    const o = db.orders.find(x => x.id === mm[1]);
    if (!o || (o.token !== url.searchParams.get('t') && !role)) return send(res, 404, { error: 'not found' });
    const { token, phone, ...safe } = o;
    return send(res, 200, safe);
  }

  if ((mm = /^\/api\/table\/([\w-]{1,10})\/bill$/.exec(p)) && m === 'GET') {
    const orders = db.orders.filter(o => o.type === 'table' && o.table === mm[1] && o.pay === 'unpaid' && !['closed', 'cancelled'].includes(o.status));
    const items = [];
    for (const o of orders) for (const it of o.items) {
      const x = items.find(y => y.id === it.id);
      if (x) x.qty += it.qty; else items.push({ id: it.id, name: it.name, price: it.price, qty: it.qty });
    }
    const sum = orderTotal(items), fee = Math.round(sum * (db.settings.serviceFee || 0) / 100);
    return send(res, 200, { table: mm[1], orders: orders.map(o => o.no), items, sum, fee, total: sum + fee });
  }

  if (p === '/api/calls' && m === 'POST') {
    if (limited(req, 12)) return send(res, 429, { error: 'Подождите минуту' });
    const b = await json(req);
    const kind = ['waiter', 'bill', 'paid', 'kaspi'].includes(b.kind) ? b.kind : 'waiter';
    const table = str(b.table, 10);
    if (!table) return send(res, 400, { error: 'Не указан стол' });
    const dup = db.calls.find(c => c.table === table && c.kind === kind && c.status === 'open');
    if (dup) return send(res, 200, { id: dup.id, dup: true });
    const c = { id: id('c'), table, kind, note: str(b.note, 200), amount: +b.amount || 0, status: 'open', created: now() };
    db.calls.push(c); save(); broadcast('call', c);
    return send(res, 200, { id: c.id });
  }

  if (p === '/api/bookings' && m === 'POST') {
    if (limited(req, 6)) return send(res, 429, { error: 'Подождите минуту' });
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
    if (limited(req, 4)) return send(res, 429, { error: 'Подождите минуту' });
    const b = await json(req);
    const rating = Math.max(1, Math.min(5, +b.rating | 0));
    const r = { id: id('r'), name: str(b.name, 40) || 'Гость', rating, text: str(b.text, 1000), table: str(b.table, 10),
      phone: str(b.phone, 30), approved: false, created: now() };
    if (!r.text && rating >= 4) r.text = '';
    db.reviews.push(r); save(); broadcast('review', r);
    return send(res, 200, { ok: true });
  }

  // --- staff auth ---
  if (p === '/api/login' && m === 'POST') {
    if (limited(req, 8)) return send(res, 429, { error: 'Подождите минуту' });
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
    const since = Date.now() - 36 * 3600e3;
    return send(res, 200, {
      role, ...publicData(),
      reviews: db.reviews.slice(-200).reverse(),
      orders: db.orders.filter(o => o.status !== 'closed' || Date.parse(o.updated) > since),
      calls: db.calls.filter(c => c.status === 'open' || Date.parse(c.created) > since),
      bookings: db.bookings.filter(b => b.date >= new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10)),
    });
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
  if ((mm = /^\/api\/staff\/table\/([\w-]{1,10})\/pay$/.exec(p)) && m === 'POST') {
    const b = await json(req);
    const pay = ['kaspi', 'cash', 'card'].includes(b.pay) ? b.pay : 'cash';
    const list = db.orders.filter(o => o.type === 'table' && o.table === mm[1] && o.pay === 'unpaid' && o.status !== 'cancelled');
    for (const o of list) { o.pay = pay; o.status = 'closed'; o.updated = now(); broadcast('order', o); }
    for (const c of db.calls) if (c.table === mm[1] && c.status === 'open' && ['bill', 'paid', 'kaspi'].includes(c.kind)) { c.status = 'done'; c.done = now(); broadcast('call', c); }
    save(); return send(res, 200, { closed: list.length });
  }
  if ((mm = /^\/api\/staff\/items\/(\w+)\/stop$/.exec(p)) && m === 'POST') {
    const it = db.items.find(x => x.id === mm[1]); if (!it) return send(res, 404, {});
    it.stop = !it.stop; save(); broadcast('menu', { id: it.id, stop: it.stop });
    return send(res, 200, it);
  }

  // --- admin only ---
  if (!admin) return send(res, 403, { error: 'Только для администратора' });
  if (p === '/api/admin/content' && m === 'PUT') {
    const b = await json(req);
    backup();
    for (const k of PUBLIC_KEYS) if (b[k] !== undefined) db[k] = b[k];
    save(); broadcast('content', {});
    return send(res, 200, { ok: 1 });
  }
  if ((mm = /^\/api\/admin\/reviews\/(\w+)$/.exec(p))) {
    const i = db.reviews.findIndex(x => x.id === mm[1]); if (i < 0) return send(res, 404, {});
    if (m === 'DELETE') db.reviews.splice(i, 1);
    else { const b = await json(req); if (b.approved !== undefined) db.reviews[i].approved = !!b.approved; if (b.reply !== undefined) db.reviews[i].reply = str(b.reply, 600); }
    save(); return send(res, 200, { ok: 1 });
  }
  if (p === '/api/admin/upload' && m === 'POST') {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4' }[req.headers['content-type']];
    if (!ext) return send(res, 400, { error: 'Только jpg/png/webp/mp4' });
    const buf = await body(req, 40e6);
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
  try {
    if (url.pathname === '/healthz') return send(res, 200, { ok: 1 });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/uploads/')) return serveFile(res, path.join(UPL, path.basename(url.pathname)));
    // SPA-маршруты: /t/12 (стол), /menu, /book …
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/staff' || rel === '/staff/') return serveFile(res, path.join(PUB, 'staff/index.html'));
    if (/^\/(t\/[\w-]+|menu|book|halls|gallery|reviews|order)\/?$/.test(rel) || rel === '/') return serveFile(res, path.join(PUB, 'index.html'));
    const file = path.normalize(path.join(PUB, rel));
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    return serveFile(res, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'bad json' : 'server error' });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log('ALTYN on :' + PORT));
