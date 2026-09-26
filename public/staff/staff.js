/* ALTYN — панель персонала и администратора.
   Официант: Зал, Брони, Стоп-лист, QR.  Администратор: + Меню, Главная, Залы, Галерея, Отзывы, Настройки. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (Math.round(n) || 0).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
const mins = iso => Math.floor((Date.now() - Date.parse(iso)) / 60000);
const fmtT = iso => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const isoDay = d => { const x = new Date(Date.now() + d * 864e5); return new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

let S = null, tab = localStorage.getItem('altyn.staff.tab') || 'live', es = null, conn = false, dirty = false;
const seen = new Set();
const isAdmin = () => S?.role === 'admin';

async function api(path, opts = {}) {
  const isBlob = opts.body instanceof Blob;
  const r = await fetch(path, { credentials: 'same-origin', ...opts,
    headers: isBlob ? { 'Content-Type': opts.body.type } : { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : isBlob ? opts.body : JSON.stringify(opts.body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { S = null; renderLogin(); throw new Error('Войдите заново'); }
  if (!r.ok) throw new Error(j.error || 'Ошибка');
  return j;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); }

// ---------- звук / уведомления ----------
let actx;
function beep(kind = 'order') {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'call' ? [880, 660, 880, 660] : kind === 'booking' ? [523, 659, 784] : [660, 880];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = f; o.type = 'sine'; o.connect(g); g.connect(actx.destination);
      const t0 = actx.currentTime + i * 0.18; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.start(t0); o.stop(t0 + 0.17);
    });
  } catch {}
  navigator.vibrate?.([120, 60, 120]);
}
function notify(title, body) {
  if (document.visibilityState === 'visible') return;
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: '/img/icon.svg', tag: title });
}

// ---------- вход ----------
function renderLogin() {
  es?.close();
  $('#app').innerHTML = `<div class="login"><div class="card">
    <div style="text-align:center;margin-bottom:10px"><img src="/img/icon.svg" width="64" height="64" style="margin:0 auto" alt=""></div>
    <h2 class="h2" style="text-align:center">ALTYN · персонал</h2>
    <form id="lf"><div class="fld"><label>Пароль или PIN</label><input id="pw" type="password" autocomplete="current-password" autofocus></div>
    <button class="btn btn-gold btn-block" style="margin-top:14px">Войти</button></form>
    <p class="note" style="text-align:center;margin-top:12px">PIN — для официантов, пароль — для администратора</p></div></div>`;
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    try { await api('/api/login', { method: 'POST', body: { password: $('#pw').value } }); boot(); } catch (err) { toast(err.message); }
  };
}

// ---------- данные / поток событий ----------
async function load() { S = await api('/api/staff/state'); for (const x of [...S.orders, ...S.calls, ...S.bookings]) seen.add(x.id); }
function upsert(arr, x) { const i = arr.findIndex(y => y.id === x.id); if (i < 0) arr.push(x); else arr[i] = x; }
function stream() {
  es?.close();
  es = new EventSource('/api/staff/stream');
  es.onopen = () => { conn = true; hdrConn(); };
  es.onerror = () => { conn = false; hdrConn(); };
  es.addEventListener('order', e => { const o = JSON.parse(e.data); const isNew = !seen.has(o.id); seen.add(o.id); upsert(S.orders, o);
    if (isNew) { beep('order'); notify(`Новый заказ №${o.no}`, o.type === 'table' ? `Стол ${o.table} · ${money(o.total)}` : `${o.type === 'delivery' ? 'Доставка' : 'Самовывоз'} · ${money(o.total)}`); toast(`Новый заказ №${o.no}`); } rerender(); });
  es.addEventListener('call', e => { const c = JSON.parse(e.data); const isNew = !seen.has(c.id); seen.add(c.id); upsert(S.calls, c);
    if (isNew) { beep('call'); notify(`Стол ${c.table}: ${callLabel(c)}`, c.amount ? money(c.amount) : ''); } rerender(); });
  es.addEventListener('booking', e => { const b = JSON.parse(e.data); const isNew = !seen.has(b.id); seen.add(b.id); upsert(S.bookings, b);
    if (isNew) { beep('booking'); notify('Новая бронь', `${b.date} ${b.time} · ${b.guests} гостей · ${b.name}`); toast('Новая заявка на бронь'); } rerender(); });
  es.addEventListener('review', e => { S.reviews.unshift(JSON.parse(e.data)); rerender(); });
  es.addEventListener('menu', e => { const m = JSON.parse(e.data); const it = S.items.find(i => i.id === m.id); if (it) it.stop = m.stop; rerender(); });
  es.addEventListener('content', () => { if (!dirty && !$('#sheet-root').innerHTML) load().then(rerender); });
}
function hdrConn() { const c = $('.conn'); if (c) { c.className = 'conn ' + (conn ? 'ok' : 'bad'); c.textContent = conn ? 'онлайн' : 'нет связи'; } }

const callLabel = c => ({ waiter: '🔔 Зовут официанта', bill: '🧾 Просят счёт', paid: '💳 Оплатили Kaspi — проверьте', kaspi: '📱 Нужен Kaspi QR' }[c.kind] || c.kind);
const ST = { new: 'Новые', accepted: 'Приняты', cooking: 'Готовятся', served: 'Поданы' };
const NEXT = { new: ['accepted', 'Принять'], accepted: ['cooking', 'На кухню'], cooking: ['served', 'Подано'], served: null };
const PAY = { unpaid: 'не оплачен', kaspi: 'Kaspi', cash: 'наличные', card: 'карта' };
const TYPE = { table: 'Стол', pickup: 'Самовывоз', delivery: 'Доставка' };
const TAGS = { hit: 'Хит', spicy: 'Острое', veg: 'Без мяса', promo: 'Акция', national: 'Национальное', kids: 'Детям' };

// ---------- шапка ----------
function header() {
  const openCalls = S.calls.filter(c => c.status === 'open').length;
  const newOrders = S.orders.filter(o => o.status === 'new').length;
  const newBk = S.bookings.filter(b => b.status === 'new').length;
  const newRv = S.reviews.filter(r => !r.approved && r.source !== '2gis' && Date.now() - Date.parse(r.created) < 3 * 864e5).length;
  document.title = (openCalls + newOrders ? `(${openCalls + newOrders}) ` : '') + 'ALTYN — персонал';
  const tabs = isAdmin()
    ? [['live', 'Зал', openCalls + newOrders], ['bookings', 'Брони', newBk], ['menu', 'Меню', 0], ['home', 'Главная', 0], ['halls', 'Залы', 0], ['gallery', 'Галерея', 0], ['reviews', 'Отзывы', newRv], ['qr', 'QR столов', 0], ['settings', 'Настройки', 0]]
    : [['live', 'Зал', openCalls + newOrders], ['bookings', 'Брони', newBk], ['menu', 'Стоп-лист', 0], ['qr', 'QR столов', 0]];
  if (!tabs.some(t => t[0] === tab)) tab = 'live';
  return `<header class="st-h"><div class="row"><b class="brand">ALTYN</b><span class="conn ${conn ? 'ok' : 'bad'}">${conn ? 'онлайн' : 'нет связи'}</span>
    <span class="note" style="color:#bca98c">${isAdmin() ? 'администратор' : 'официант'}</span>
    <span style="margin-left:auto;display:flex;gap:8px">${'Notification' in window && Notification.permission === 'default' ? '<button class="btn btn-ghost btn-xs" data-notif>🔔 Уведомления</button>' : ''}
    <a class="btn btn-ghost btn-xs" href="/" target="_blank" rel="noopener">Открыть сайт ↗</a>
    <button class="btn btn-ghost btn-xs" data-logout>Выйти</button></span></div>
    <nav class="tabs">${tabs.map(([k, n, c]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}${c ? `<span class="dot">${c}</span>` : ''}</button>`).join('')}</nav></header>`;
}

// ================= ЗАЛ =================
function liveView() {
  const today = new Date().toDateString();
  const todays = S.orders.filter(o => new Date(o.created).toDateString() === today && o.status !== 'cancelled');
  const paid = todays.filter(o => o.pay !== 'unpaid').reduce((s, o) => s + o.total, 0);
  const active = S.orders.filter(o => !['closed', 'cancelled'].includes(o.status));
  const calls = S.calls.filter(c => c.status === 'open');
  const top = {}; for (const o of todays) for (const it of o.items) top[it.name] = (top[it.name] || 0) + it.qty;
  const topList = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, q]) => `${n} ×${q}`).join(', ');
  const tablesUnpaid = [...new Set(active.filter(o => o.type === 'table' && o.pay === 'unpaid').map(o => o.table))];
  return `<div class="stats">
      <div class="stat"><b>${todays.length}</b><span>заказов сегодня (онлайн/QR)</span></div>
      <div class="stat"><b>${money(paid)}</b><span>оплачено сегодня</span></div>
      <div class="stat"><b>${active.length}</b><span>активных заказов</span></div>
      <div class="stat"><b>${S.bookings.filter(b => b.date === isoDay(0) && b.status !== 'declined').length}</b><span>броней на сегодня</span></div>
      <div class="stat" style="grid-column:span 2"><b style="font-size:15px">${esc(topList) || '—'}</b><span>топ блюд сегодня</span></div>
    </div>
    ${calls.length ? `<div class="calls">${calls.map(c => `<div class="call ${c.kind}"><span class="t">Стол ${esc(c.table)}</span><div><b>${callLabel(c)}</b><div class="note">${fmtT(c.created)} · ${mins(c.created)} мин назад${c.amount ? ' · ' + money(c.amount) : ''}</div></div>
      ${c.kind === 'paid' || c.kind === 'bill' ? `<button class="btn btn-dark btn-xs" data-paytable="${esc(c.table)}" data-paymethod="${c.kind === 'paid' ? 'kaspi' : ''}">Закрыть стол</button>` : ''}
      <button class="btn btn-gold btn-xs" data-calldone="${c.id}">Готово</button></div>`).join('')}</div>` : ''}
    ${tablesUnpaid.length ? `<p class="note">Неоплаченные столы: ${tablesUnpaid.map(t => `<button class="chip" data-paytable="${esc(t)}">Стол ${esc(t)}</button>`).join(' ')}</p>` : ''}
    <div class="board">${Object.keys(ST).map(st => { const list = active.filter(o => o.status === st).sort((a, b) => a.created.localeCompare(b.created)); return `<div class="col"><h4>${ST[st]} <span>${list.length}</span></h4>${list.map(orderCard).join('') || '<p class="note" style="padding:0 6px">—</p>'}</div>`; }).join('')}</div>
    ${recentClosed()}`;
}
function orderCard(o) {
  const age = mins(o.created), late = (o.status === 'new' && age >= 3) || (['accepted', 'cooking'].includes(o.status) && age >= 25);
  const nx = NEXT[o.status];
  return `<div class="oc ${late ? 'late' : ''}"><div class="top"><span class="tb">${o.type === 'table' ? `Стол ${esc(o.table)}` : TYPE[o.type]} · №${o.no}</span><span class="age">${age} мин</span></div>
    ${o.type !== 'table' ? `<div class="note">${esc(o.name)} · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>${o.address ? `<br>📍 ${esc(o.address)}` : ''}</div>` : ''}
    <ul>${o.items.map(i => `<li><b>${i.qty}×</b> ${esc(i.name)}${i.note ? ` <i>(${esc(i.note)})</i>` : ''}</li>`).join('')}</ul>
    ${o.comment ? `<div class="cm">💬 ${esc(o.comment)}</div>` : ''}
    <div class="top"><b>${money(o.total)}</b><span class="pay ${o.pay}">${PAY[o.pay]}</span></div>
    <div class="acts">${nx ? `<button class="btn btn-gold btn-xs" data-ost="${o.id}" data-to="${nx[0]}">${nx[1]}</button>` : ''}
      ${o.status === 'served' || o.type !== 'table' ? `<select class="btn btn-line btn-xs" data-opay="${o.id}"><option value="">Оплата…</option><option value="kaspi">Kaspi</option><option value="cash">Наличные</option><option value="card">Карта</option></select>` : ''}
      ${o.status === 'new' ? `<button class="btn btn-line btn-xs" data-ost="${o.id}" data-to="cancelled">Отменить</button>` : ''}
      ${o.status === 'served' && o.pay !== 'unpaid' ? `<button class="btn btn-dark btn-xs" data-ost="${o.id}" data-to="closed">Закрыть</button>` : ''}</div></div>`;
}
function recentClosed() {
  const list = S.orders.filter(o => ['closed', 'cancelled'].includes(o.status)).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 12);
  return list.length ? `<h3 class="h2" style="font-size:22px;margin-top:26px">Закрытые недавно</h3><div class="list">${list.map(o => `<div class="note">№${o.no} · ${o.type === 'table' ? 'стол ' + esc(o.table) : TYPE[o.type]} · ${money(o.total)} · ${o.status === 'cancelled' ? 'отменён' : PAY[o.pay]} · ${fmtT(o.updated)}</div>`).join('')}</div>` : '';
}

// ================= БРОНИ =================
function bookingsView() {
  const list = [...S.bookings].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const days = [...new Set(list.map(b => b.date))];
  const wa = (b, text) => `https://wa.me/${b.phone.replace(/\D/g, '').replace(/^8/, '7')}?text=${encodeURIComponent(text)}`;
  return days.length ? days.map(d => `<h3 class="h2" style="font-size:24px">${d === isoDay(0) ? 'Сегодня' : d === isoDay(1) ? 'Завтра' : new Date(d + 'T12:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    <div class="list" style="margin-bottom:18px">${list.filter(b => b.date === d).map(b => `<div class="bkc ${b.status}"><div>
      <b style="font-size:18px">${esc(b.time)} · ${b.guests} гост. · ${b.kind === 'event' ? '🎉 ' + esc(b.event || 'Мероприятие') : 'Столик'}</b>
      <div>${esc(b.hallName || 'зал не выбран')} · ${esc(b.name)} · <a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></div>
      ${b.comment ? `<div class="note">💬 ${esc(b.comment)}</div>` : ''}${b.preorder ? `<div class="note">🍽 Предзаказ: ${esc(b.preorder)}</div>` : ''}
      <div class="note">Статус: <b>${{ new: 'новая', confirmed: 'подтверждена', declined: 'отклонена', done: 'пришли' }[b.status]}</b> · создана ${new Date(b.created).toLocaleString('ru-RU')}</div></div>
      <div class="acts" style="display:flex;flex-direction:column;gap:6px">
        ${b.status !== 'confirmed' ? `<button class="btn btn-gold btn-xs" data-bst="${b.id}" data-to="confirmed">Подтвердить</button>` : `<button class="btn btn-line btn-xs" data-bst="${b.id}" data-to="done">Гости пришли</button>`}
        ${b.status !== 'declined' ? `<button class="btn btn-line btn-xs" data-bst="${b.id}" data-to="declined">Отклонить</button>` : ''}
        <a class="btn btn-wa btn-xs" target="_blank" rel="noopener" href="${wa(b, `Здравствуйте, ${b.name}! Ресторан ALTYN подтверждает бронь: ${b.date} в ${b.time}, гостей: ${b.guests}${b.hallName ? ', ' + b.hallName : ''}. Ждём вас! ${S.settings.address || ''}`)}">WhatsApp</a></div></div>`).join('')}</div>`).join('')
    : '<p class="note">Заявок на бронь пока нет.</p>';
}

// ================= МЕНЮ =================
let mq = '';
function menuView() {
  const admin = isAdmin();
  const q = mq.toLowerCase();
  const items = S.items.filter(i => !q || (i.name + ' ' + (i.desc || '')).toLowerCase().includes(q));
  const catsWith = S.categories.filter(c => items.some(i => i.cat === c.id) || (admin && !q));
  return `<div class="toolbar">
      <label class="search" style="flex:1;min-width:200px;margin:0">🔎<input id="mq" placeholder="Поиск блюда" value="${esc(mq)}"></label>
      ${admin ? `<button class="btn btn-gold btn-sm" data-newitem="">+ Новое блюдо</button><button class="btn btn-line btn-sm" data-cats>Категории</button>` : ''}</div>
    <div class="hint">${admin
      ? '<b>Как пользоваться:</b> нажмите на блюдо — откроется карточка: фото, названия, состав, цена. Цену можно менять прямо в списке. Стрелки ↑↓ меняют порядок на сайте. Переключатель справа — <b>в наличии / стоп-лист</b>.'
      : 'Переключатель — <b>в наличии / стоп-лист</b>. Блюдо в стоп-листе гости видят серым и не могут заказать.'}</div>
    ${admin && !q ? `<div class="chips" style="margin:6px 0 4px">${S.categories.map(c => `<a class="chip" href="#mc-${c.id}">${esc(c.name)}${c.hidden ? ' (скрыта)' : ''}</a>`).join('')}</div>` : ''}
    ${catsWith.map(c => { const its = items.filter(i => i.cat === c.id); return `<div class="mcat" id="mc-${c.id}"><div class="mcat-h"><h3 class="h2" style="font-size:24px;margin:0">${esc(c.name)} ${c.hidden ? '<span class="tag stop">скрыта</span>' : ''}</h3>
      <span class="note">${its.length} поз.</span>${admin ? `<button class="btn btn-line btn-xs" data-newitem="${c.id}">+ блюдо</button>` : ''}</div>
      <div class="list">${its.map((i, k) => itemRow(i, admin, k === 0, k === its.length - 1)).join('') || '<p class="note">Пусто</p>'}</div></div>`; }).join('')}`;
}
function itemRow(i, admin, first, last) {
  const ph = i.thumb || i.photo;
  return `<div class="mi ${i.stop ? 'stop' : ''} ${i.hidden ? 'hid' : ''}">
    <button class="mi-ph" ${admin ? `data-edit="${i.id}"` : ''} aria-label="Фото">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : `<span>${admin ? '+ фото' : ''}</span>`}</button>
    <div class="mi-bd" ${admin ? `data-edit="${i.id}"` : ''}><b>${esc(i.name)}</b>${i.hidden ? ' <span class="tag stop">скрыто с сайта</span>' : ''}${(i.tags || []).map(t => ` <span class="tag ${t}">${TAGS[t] || t}</span>`).join('')}
      <div class="note">${esc(i.desc || '')}</div></div>
    ${admin ? `<label class="mi-pr"><input type="number" inputmode="numeric" id="pr-${i.id}" data-price="${i.id}" value="${i.price}"><span>₸</span></label>
      <div class="mi-mv"><button data-mv="${i.id}" data-d="-1" ${first ? 'disabled' : ''} aria-label="Выше">↑</button><button data-mv="${i.id}" data-d="1" ${last ? 'disabled' : ''} aria-label="Ниже">↓</button></div>` : `<b class="mi-pr">${money(i.price)}</b>`}
    <button class="sw ${i.stop ? '' : 'on'}" data-stop="${i.id}" title="${i.stop ? 'В стоп-листе' : 'В наличии'}" aria-label="В наличии"></button></div>`;
}

// ---------- фото: сжатие на устройстве + миниатюра ----------
function pickFiles(multiple = false) {
  return new Promise(res => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple });
    inp.onchange = () => res([...inp.files]); inp.click();
  });
}
function resize(file, max, q = 0.84) {
  return new Promise(res => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => res(b), 'image/jpeg', q);
    }; img.onerror = () => res(null); img.src = URL.createObjectURL(file);
  });
}
async function uploadPhoto(file) {
  if (!file) return null;
  toast('Загружаю фото…');
  const [big, small] = await Promise.all([resize(file, 1600), resize(file, 520, 0.8)]);
  if (!big) { toast('Не удалось прочитать фото. Попробуйте JPG или PNG.'); return null; }
  const a = await api('/api/admin/upload', { method: 'POST', body: big });
  const b = small ? await api('/api/admin/upload', { method: 'POST', body: small }) : a;
  return { photo: a.url, thumb: b.url };
}
async function saveContent(part, msg = 'Сохранено ✓') {
  await api('/api/admin/content', { method: 'PUT', body: part });
  dirty = false; toast(msg);
}

// ---------- карточка блюда ----------
function sheetOpen(title, body, foot) {
  $('#sheet-root').innerHTML = `<div class="ov" data-ovclose><div class="sheet wide"><div class="sh-h"><h3>${title}</h3><button class="x" data-sheetx aria-label="Закрыть">×</button></div>
    <div class="sh-b">${body}</div>${foot ? `<div class="sh-f">${foot}</div>` : ''}</div></div>`;
  return $('#sheet-root .sheet');
}
function sheetClose() { $('#sheet-root').innerHTML = ''; $('#sheet-root').onclick = null; }

function editItem(id, presetCat) {
  const src = id ? S.items.find(i => i.id === id) : { id: '', cat: presetCat || S.categories[0].id, name: '', nameKk: '', desc: '', descKk: '', price: 0, tags: [], photo: '', thumb: '', stop: false, hidden: false };
  const d = JSON.parse(JSON.stringify(src)); d.tags ||= [];
  const photoBlock = () => `<div class="ph-edit">${d.photo ? `<img src="${esc(d.photo)}" alt="">` : '<div class="ph-empty">Фото нет<br><small>гости охотнее заказывают блюда с фото</small></div>'}
      <div class="ph-acts"><button class="btn btn-gold btn-sm" data-iphoto>${d.photo ? 'Заменить фото' : 'Загрузить фото'}</button>${d.photo ? '<button class="btn btn-line btn-sm" data-iphotodel>Убрать фото</button>' : ''}</div></div>`;
  const el = sheetOpen(id ? 'Блюдо' : 'Новое блюдо', `
    <div id="phb">${photoBlock()}</div>
    <div class="form" style="margin-top:14px">
      <div class="fld"><label>Название (рус)</label><input id="e-name" value="${esc(d.name)}"></div>
      <div class="fld"><label>Атауы (қаз) — необязательно</label><input id="e-nameKk" value="${esc(d.nameKk || '')}"></div>
      <div class="fld"><label>Состав / описание (рус)</label><textarea id="e-desc" rows="3">${esc(d.desc || '')}</textarea></div>
      <div class="fld"><label>Құрамы (қаз)</label><textarea id="e-descKk" rows="3">${esc(d.descKk || '')}</textarea></div>
      <div class="fld"><label>Цена, ₸</label><input id="e-price" type="number" inputmode="numeric" value="${d.price}"></div>
      <div class="fld"><label>Старая цена, ₸ (для акции, зачёркнутая)</label><input id="e-old" type="number" inputmode="numeric" value="${d.oldPrice || ''}"></div>
      <div class="fld full"><label>Категория</label><select id="e-cat">${S.categories.map(c => `<option value="${c.id}" ${c.id === d.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="fld full"><label>Метки на сайте</label><div class="pills">${Object.entries(TAGS).map(([k, v]) => `<button type="button" data-etag="${k}" class="${d.tags.includes(k) ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <div class="fld full toggles">
        <label class="tgl"><input type="checkbox" id="e-avail" ${d.stop ? '' : 'checked'}><span>В наличии <small>(выключите — блюдо попадёт в стоп-лист)</small></span></label>
        <label class="tgl"><input type="checkbox" id="e-vis" ${d.hidden ? '' : 'checked'}><span>Показывать на сайте <small>(выключите — блюдо спрячется, но не удалится)</small></span></label>
      </div>
    </div>`,
    `<button class="btn btn-gold btn-block" data-isave>Сохранить</button>
     ${id ? '<div class="row2"><button class="btn btn-line" data-idup>Дублировать</button><button class="btn btn-line danger" data-idel>Удалить</button></div>' : ''}`);
  const root = $('#sheet-root');
  const collect = () => Object.assign(d, { name: $('#e-name').value.trim(), nameKk: $('#e-nameKk').value.trim(), desc: $('#e-desc').value.trim(), descKk: $('#e-descKk').value.trim(),
    price: +$('#e-price').value || 0, cat: $('#e-cat').value, stop: !$('#e-avail').checked, hidden: !$('#e-vis').checked });
  root.onclick = async e => {
    const b = e.target.closest('button'); const ov = e.target.matches('[data-ovclose]');
    if (ov || b?.dataset.sheetx !== undefined) return sheetClose();
    if (!b) return;
    const bd = b.dataset;
    try {
      if (bd.etag) { const k = bd.etag; d.tags = d.tags.includes(k) ? d.tags.filter(x => x !== k) : [...d.tags, k]; b.classList.toggle('on'); }
      if (bd.iphoto !== undefined) { const [f] = await pickFiles(); const r = await uploadPhoto(f); if (r) { Object.assign(d, r); $('#phb').innerHTML = photoBlock();
        if (id) { const cur = S.items.find(i => i.id === id); Object.assign(cur, r); await saveContent({ items: S.items }, 'Фото сохранено ✓'); rerender(); }
        else toast('Фото загружено — нажмите «Сохранить»'); } }
      if (bd.iphotodel !== undefined) { d.photo = ''; d.thumb = ''; $('#phb').innerHTML = photoBlock();
        if (id) { Object.assign(S.items.find(i => i.id === id), { photo: '', thumb: '' }); await saveContent({ items: S.items }, 'Фото убрано'); rerender(); } }
      if (bd.isave !== undefined) {
        collect(); const old = +$('#e-old').value; if (old > d.price) d.oldPrice = old; else delete d.oldPrice;
        if (!d.name) return toast('Введите название');
        if (!d.price) return toast('Укажите цену');
        if (!id) { d.id = d.cat + Date.now().toString(36); S.items.push(d); } else S.items[S.items.findIndex(i => i.id === id)] = d;
        await saveContent({ items: S.items }); sheetClose(); rerender();
      }
      if (bd.idup !== undefined) {
        collect(); const copy = { ...JSON.parse(JSON.stringify(d)), id: d.cat + Date.now().toString(36), name: d.name + ' (копия)' };
        S.items.splice(S.items.findIndex(i => i.id === id) + 1, 0, copy); await saveContent({ items: S.items }, 'Копия создана'); sheetClose(); rerender(); editItem(copy.id);
      }
      if (bd.idel !== undefined) {
        if (bd.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Точно удалить? Ещё раз'; return; }
        S.items = S.items.filter(i => i.id !== id); for (const k in S.pairs) S.pairs[k] = S.pairs[k].filter(x => x !== id);
        await saveContent({ items: S.items, pairs: S.pairs }, 'Блюдо удалено'); sheetClose(); rerender();
      }
    } catch (err) { toast(err.message); }
  };
}

// ---------- категории ----------
function editCats() {
  const cats = JSON.parse(JSON.stringify(S.categories));
  const pairs = JSON.parse(JSON.stringify(S.pairs || {}));
  const moves = {}; // catId -> targetCatId для удалённых категорий
  const draw = () => {
    $('#cats-body').innerHTML = cats.map((c, i) => {
      const n = S.items.filter(x => x.cat === c.id).length;
      return `<div class="catrow ${c.hidden ? 'hid' : ''}">
        <div class="mi-mv"><button data-cmv="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button data-cmv="${i}" data-d="1" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button></div>
        <div class="catf"><input data-cn="${i}" value="${esc(c.name)}" placeholder="Название (рус)"><input data-ck="${i}" value="${esc(c.nameKk || '')}" placeholder="Атауы (қаз)"></div>
        <div class="catb"><span class="note">${n} блюд · к ним советуем: ${(pairs[c.id] || []).length}</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-line btn-xs" data-cpair="${c.id}">Что советовать</button>
          <button class="btn btn-line btn-xs" data-chide="${i}">${c.hidden ? '👁 Показать' : 'Скрыть'}</button>
          <button class="btn btn-line btn-xs danger" data-cdel="${i}">Удалить</button></div></div></div>`;
    }).join('');
  };
  sheetOpen('Категории меню', `<p class="note">Порядок здесь = порядок на сайте. «Скрыть» убирает всю категорию с сайта (например, сезонное меню). «Что советовать» — какие позиции предлагать гостю в корзине к блюдам этой категории.</p>
    <div id="cats-body" class="list"></div><button class="btn btn-line btn-block" style="margin-top:12px" data-cadd>+ Добавить категорию</button>`,
    '<button class="btn btn-gold btn-block" data-csave>Сохранить категории</button>');
  draw();
  const root = $('#sheet-root');
  root.oninput = e => { const t = e.target; if (t.dataset.cn) cats[+t.dataset.cn].name = t.value; if (t.dataset.ck) cats[+t.dataset.ck].nameKk = t.value; };
  root.onclick = async e => {
    const b = e.target.closest('button'); if (e.target.matches('[data-ovclose]') || b?.dataset.sheetx !== undefined) return sheetClose();
    if (!b) return; const bd = b.dataset;
    if (bd.cmv) { const i = +bd.cmv, j = i + +bd.d; [cats[i], cats[j]] = [cats[j], cats[i]]; draw(); }
    if (bd.chide) { cats[+bd.chide].hidden = !cats[+bd.chide].hidden; draw(); }
    if (bd.cadd !== undefined) { cats.push({ id: 'c' + Date.now().toString(36), name: 'Новая категория', nameKk: '' }); draw(); $$('#cats-body [data-cn]').at(-1).select(); }
    if (bd.cdel) {
      const i = +bd.cdel, c = cats[i], n = S.items.filter(x => x.cat === c.id).length;
      if (n) {
        const others = cats.filter(x => x.id !== c.id);
        b.closest('.catrow').insertAdjacentHTML('beforeend', `<div class="catmove">В категории ${n} блюд. Перенести их в: <select data-cto="${i}">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select> <button class="btn btn-gold btn-xs" data-cdelok="${i}">Перенести и удалить</button></div>`);
        b.disabled = true; return;
      }
      cats.splice(i, 1); draw();
    }
    if (bd.cdelok) { const i = +bd.cdelok; moves[cats[i].id] = $(`[data-cto="${i}"]`).value; cats.splice(i, 1); draw(); }
    if (bd.cpair) pickPairs(bd.cpair, pairs, draw);
    if (bd.csave !== undefined) {
      if (cats.some(c => !c.name.trim())) return toast('У каждой категории должно быть название');
      for (const it of S.items) if (moves[it.cat]) it.cat = moves[it.cat];
      S.categories = cats; S.pairs = pairs;
      try { await saveContent({ categories: cats, pairs, items: S.items }); sheetClose(); rerender(); } catch (err) { toast(err.message); }
    }
  };
}
function pickPairs(catId, pairs, done) {
  const sel = new Set(pairs[catId] || []);
  const holder = document.createElement('div'); holder.className = 'ov'; holder.style.zIndex = 95;
  const cat = S.categories.find(c => c.id === catId);
  holder.innerHTML = `<div class="sheet wide"><div class="sh-h"><h3>К «${esc(cat?.name)}» советуем</h3><button class="x" data-px>×</button></div>
    <div class="sh-b"><p class="note">Выберите 2–6 позиций (лепёшка, чай, соус, лимонад…). Их гость увидит в корзине.</p>
    <label class="search">🔎<input id="pq" placeholder="Поиск"></label><div id="plist" class="list"></div></div>
    <div class="sh-f"><button class="btn btn-gold btn-block" data-pok>Готово</button></div></div>`;
  document.body.append(holder);
  const draw = q => { $('#plist', holder).innerHTML = S.items.filter(i => !q || i.name.toLowerCase().includes(q)).map(i => `<label class="tgl"><input type="checkbox" value="${i.id}" ${sel.has(i.id) ? 'checked' : ''}><span>${esc(i.name)} <small>${money(i.price)}</small></span></label>`).join(''); };
  draw('');
  $('#pq', holder).oninput = e => draw(e.target.value.toLowerCase());
  holder.onchange = e => { if (e.target.type === 'checkbox') e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); };
  holder.onclick = e => {
    const b = e.target.closest('button');
    if (e.target === holder || b?.dataset.px !== undefined) return holder.remove();
    if (b?.dataset.pok !== undefined) { pairs[catId] = [...sel]; holder.remove(); done(); toast('Выбрано: ' + sel.size + ' — нажмите «Сохранить категории»'); }
  };
}

// ================= ГЛАВНАЯ =================
function homeView() {
  const s = S.settings, h = s.home || {};
  const f = (key, label, v, opts = {}) => `<div class="fld ${opts.full ? 'full' : ''}"><label>${label}</label>${opts.area ? `<textarea data-hk="${key}" rows="${opts.rows || 3}">${esc(v ?? '')}</textarea>` : `<input data-hk="${key}" ${opts.type ? `type="${opts.type}" step="any"` : ''} value="${esc(v ?? '')}">`}</div>`;
  const feats = h.features || [];
  return `<div class="hint">Здесь тексты и картинка первого экрана сайта. Левая колонка — на русском, правая — на казахском (если пусто, покажется русский). После изменений нажмите <b>«Сохранить»</b> внизу.</div>
  <div class="set-grid">
    <div class="card"><h3 class="h3">Первый экран</h3>
      <div class="ph-edit hero"><img src="${esc(h.heroPhoto || '/img/gis/hall-3.jpg')}" alt=""><div class="ph-acts"><button class="btn btn-gold btn-sm" data-herophoto>Заменить главное фото</button></div></div>
      <div class="form" style="margin-top:12px">
        ${f('home.eyebrow', 'Надпись над заголовком', h.eyebrow)}${f('home.eyebrowKk', 'Қазақша', h.eyebrowKk)}
        ${f('tagline', 'Слоган', s.tagline)}${f('taglineKk', 'Слоган (қаз)', s.taglineKk)}
        ${f('home.lead', 'Описание под заголовком', h.lead, { area: 1 })}${f('home.leadKk', 'Сипаттама (қаз)', h.leadKk, { area: 1 })}
        ${f('home.heroCaption', 'Подпись на фото', h.heroCaption)}${f('home.heroCaptionKk', 'Фото жазуы (қаз)', h.heroCaptionKk)}
      </div></div>
    <div class="card"><h3 class="h3">4 карточки преимуществ</h3>
      ${feats.map((ft, i) => `<div class="feat-ed"><div class="form">
        <div class="fld"><label>Крупно (цифра / значок)</label><input data-hf="${i}.n" value="${esc(ft.n)}"></div><div></div>
        <div class="fld"><label>Заголовок</label><input data-hf="${i}.t" value="${esc(ft.t)}"></div><div class="fld"><label>Тақырып (қаз)</label><input data-hf="${i}.tKk" value="${esc(ft.tKk || '')}"></div>
        <div class="fld"><label>Текст</label><input data-hf="${i}.p" value="${esc(ft.p)}"></div><div class="fld"><label>Мәтін (қаз)</label><input data-hf="${i}.pKk" value="${esc(ft.pKk || '')}"></div>
      </div><button class="btn btn-line btn-xs danger" data-hfdel="${i}">Убрать карточку</button></div>`).join('')}
      ${feats.length < 6 ? '<button class="btn btn-line btn-sm" data-hfadd>+ Карточка</button>' : ''}</div>
    <div class="card"><h3 class="h3">Блок «Сеты»</h3><div class="form">
      ${f('home.setsTitle', 'Заголовок', h.setsTitle)}${f('home.setsTitleKk', 'Тақырып (қаз)', h.setsTitleKk)}
      ${f('home.setsText', 'Текст', h.setsText, { area: 1, rows: 2 })}${f('home.setsTextKk', 'Мәтін (қаз)', h.setsTextKk, { area: 1, rows: 2 })}</div>
      <p class="note">Сами сеты — это блюда из категории «Сеты и акции» во вкладке «Меню».</p></div>
    <div class="card"><h3 class="h3">Рейтинг 2ГИС</h3><div class="form">
      ${f('gisRating', 'Рейтинг', s.gisRating, { type: 'number' })}${f('gisReviews', 'Количество отзывов', s.gisReviews, { type: 'number' })}
      ${f('gis', 'Ссылка на 2ГИС', s.gis, { full: 1 })}${f('cuisine', 'Кухня (подзаголовок меню)', s.cuisine, { full: 1 })}</div>
      <p class="note">Обновляйте цифры раз в месяц — их видно на первом экране.</p></div>
  </div>
  <div class="savebar"><button class="btn btn-gold" data-homesave>Сохранить главную</button><a class="btn btn-line" href="/" target="_blank" rel="noopener">Посмотреть сайт ↗</a></div>`;
}
const setPath = (obj, p, v) => { const ks = p.split('.'); let o = obj; while (ks.length > 1) { const k = ks.shift(); o = o[k] ||= {}; } o[ks[0]] = v; };
function collectHome() {
  const s = S.settings; s.home ||= {}; s.home.features ||= [];
  $$('[data-hk]').forEach(i => setPath(s, i.dataset.hk, i.type === 'number' ? +i.value || 0 : i.value.trim()));
  $$('[data-hf]').forEach(i => { const [idx, k] = i.dataset.hf.split('.'); s.home.features[+idx][k] = i.value.trim(); });
}

// ================= ЗАЛЫ =================
function hallsView() {
  return `<div class="hint">Залы показываются на сайте в этом порядке и доступны для выбора в форме брони. Нажмите <b>«Сохранить залы»</b> после изменений.</div>
    <div class="halls-ed">${S.halls.map((h, i) => `<div class="card hall-ed ${h.hidden ? 'hid' : ''}">
      <div class="ph-edit"><img src="${esc(h.photo)}" alt=""><div class="ph-acts"><button class="btn btn-gold btn-xs" data-hphoto="${i}">Заменить фото</button></div></div>
      <div class="form" style="margin-top:10px">
        <div class="fld"><label>Название</label><input data-hl="${i}.name" value="${esc(h.name)}"></div>
        <div class="fld"><label>Атауы (қаз)</label><input data-hl="${i}.nameKk" value="${esc(h.nameKk || '')}"></div>
        <div class="fld"><label>Тип</label><select data-hl="${i}.kind"><option value="main" ${h.kind === 'main' ? 'selected' : ''}>Общий зал</option><option value="vip" ${h.kind === 'vip' ? 'selected' : ''}>VIP</option></select></div>
        <div class="fld"><label>Мест (гостей)</label><input type="number" inputmode="numeric" data-hl="${i}.capacity" value="${h.capacity || ''}"></div>
        <div class="fld full"><label>Описание</label><textarea rows="3" data-hl="${i}.desc">${esc(h.desc)}</textarea></div>
        <div class="fld full"><label>Сипаттама (қаз)</label><textarea rows="2" data-hl="${i}.descKk">${esc(h.descKk || '')}</textarea></div>
        <div class="fld full toggles"><label class="tgl"><input type="checkbox" data-hl="${i}.isNew" ${h.isNew ? 'checked' : ''}><span>Метка «NEW»</span></label>
          <label class="tgl"><input type="checkbox" data-hl="${i}.visible" ${h.hidden ? '' : 'checked'}><span>Показывать на сайте</span></label></div>
      </div>
      <div class="row2"><div class="mi-mv"><button data-hmv="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button data-hmv="${i}" data-d="1" ${i === S.halls.length - 1 ? 'disabled' : ''}>↓</button></div>
      <button class="btn btn-line btn-xs danger" data-hdel="${i}">Удалить зал</button></div></div>`).join('')}</div>
    <div class="savebar"><button class="btn btn-line" data-hadd>+ Добавить зал</button><button class="btn btn-gold" data-hsave>Сохранить залы</button></div>`;
}
function collectHalls() {
  $$('[data-hl]').forEach(i => {
    const [idx, k] = i.dataset.hl.split('.'); const h = S.halls[+idx];
    if (k === 'visible') h.hidden = !i.checked; else if (k === 'isNew') h.isNew = i.checked;
    else h[k] = k === 'capacity' ? +i.value || 0 : i.value.trim();
  });
}

// ================= ГАЛЕРЕЯ =================
function galleryView() {
  const reels = S.gallery.filter(g => g.type === 'reel'), photos = S.gallery.filter(g => g.type === 'photo');
  return `<div class="card" style="margin-bottom:16px"><h3 class="h3">Видео из Instagram</h3>
      <p class="note">Откройте Reels в Instagram → «Поделиться» → «Копировать ссылку» и вставьте сюда. Обложка подтянется сама.</p>
      <div class="toolbar"><input id="reel-url" class="inp" placeholder="https://www.instagram.com/reel/…" style="flex:1;min-width:220px"><button class="btn btn-gold btn-sm" data-reeladd>Добавить видео</button></div>
      <div class="gal-grid reels-ed">${reels.map(g => { const i = S.gallery.indexOf(g); return `<div class="gcell">
        <button class="gimg" data-gcover="${i}" title="Сменить обложку">${g.cover ? `<img src="${esc(g.cover)}" alt="">` : '<span>нет обложки</span>'}</button>
        <input class="inp" data-gcap="${i}" value="${esc(g.caption || '')}" placeholder="Подпись">
        <div class="row2"><div class="mi-mv"><button data-gmv="${i}" data-d="-1">←</button><button data-gmv="${i}" data-d="1">→</button></div>
        <a class="btn btn-line btn-xs" target="_blank" rel="noopener" href="https://www.instagram.com/reel/${esc(g.code)}/">▶</a><button class="btn btn-line btn-xs danger" data-gdel="${i}">✕</button></div></div>`; }).join('')}</div></div>
    <div class="card"><h3 class="h3">Фотографии</h3>
      <p class="note">Можно выбрать сразу несколько фото с телефона — они сожмутся автоматически.</p>
      <button class="btn btn-gold btn-sm" data-photoadd>+ Загрузить фото</button>
      <div class="gal-grid" style="margin-top:12px">${photos.map(g => { const i = S.gallery.indexOf(g); return `<div class="gcell"><div class="gimg sq"><img src="${esc(g.thumb || g.src)}" alt="" loading="lazy"></div>
        <div class="row2"><div class="mi-mv"><button data-gmv="${i}" data-d="-1">←</button><button data-gmv="${i}" data-d="1">→</button></div><button class="btn btn-line btn-xs danger" data-gdel="${i}">✕</button></div></div>`; }).join('')}</div></div>`;
}
function moveSameType(i, d) {
  const g = S.gallery, type = g[i].type;
  let j = i + d; while (j >= 0 && j < g.length && g[j].type !== type) j += d;
  if (j < 0 || j >= g.length) return false;
  [g[i], g[j]] = [g[j], g[i]]; return true;
}

// ================= ОТЗЫВЫ =================
function reviewsView() {
  const list = S.reviews;
  return `<div class="hint">После оплаты гость ставит оценку: 4–5★ — сайт предлагает ему написать отзыв в 2ГИС, 1–3★ — сообщение приходит только сюда (не публикуется). Отзывы с текстом можно опубликовать на сайте. Хорошие отзывы из 2ГИС/Instagram можно добавить вручную.</div>
  <details class="card" style="margin-bottom:14px"><summary><b>+ Добавить отзыв вручную</b></summary><div class="form" style="margin-top:10px">
    <div class="fld"><label>Имя</label><input id="nr-name"></div><div class="fld"><label>Оценка</label><select id="nr-rating">${[5, 4, 3, 2, 1].map(n => `<option>${n}</option>`).join('')}</select></div>
    <div class="fld full"><label>Текст</label><textarea id="nr-text" rows="3"></textarea></div>
    <div class="fld"><label>Дата</label><input id="nr-date" type="date" value="${isoDay(0)}"></div><div class="fld"><label>Источник</label><select id="nr-src"><option value="2gis">2ГИС</option><option value="site">Сайт / Instagram</option></select></div>
    <div class="full"><button class="btn btn-gold btn-sm" data-rvadd>Добавить и опубликовать</button></div></div></details>
  <div class="list">${list.map(r => `<div class="bkc ${r.rating <= 3 ? 'new' : 'confirmed'}"><div>
    <b>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</b> · ${esc(r.name)}${r.table ? ` · стол ${esc(r.table)}` : ''}${r.source === '2gis' ? ' · 2ГИС' : ''} · <span class="note">${esc((r.created || '').slice(0, 16).replace('T', ' '))}</span>
    ${r.approved ? ' <span class="tag veg">на сайте</span>' : ''}
    <div>${esc(r.text) || '<span class="note">без текста</span>'}</div>${r.phone ? `<div class="note">📞 <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></div>` : ''}
    ${r.reply ? `<div class="note">Ответ: ${esc(r.reply)}</div>` : ''}</div>
    <div style="display:flex;flex-direction:column;gap:6px">${r.text ? `<button class="btn ${r.approved ? 'btn-line' : 'btn-gold'} btn-xs" data-rvap="${r.id}" data-v="${r.approved ? 0 : 1}">${r.approved ? 'Скрыть с сайта' : 'Опубликовать'}</button>` : ''}
      <button class="btn btn-line btn-xs" data-rvreply="${r.id}">Ответить</button><button class="btn btn-line btn-xs danger" data-rvdel="${r.id}">Удалить</button></div></div>`).join('') || '<p class="note">Пока пусто.</p>'}</div>`;
}

// ================= QR =================
function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace('<svg ', '<svg class="q" ');
}
function qrView() {
  const n = +S.settings.tables || 20, origin = location.origin;
  return `<div class="noprint toolbar"><p class="note" style="margin:0;flex:1">Распечатайте и поставьте на каждый стол. Гость сканирует → открывается меню этого стола: заказ, вызов официанта, счёт и Kaspi. Количество столов меняется в «Настройках».</p>
      <button class="btn btn-gold btn-sm" onclick="print()">🖨 Печать</button></div>
    <div class="qrgrid">${Array.from({ length: n }, (_, i) => i + 1).map(t => `<div class="qrcard"><h5>ALTYN</h5><div class="note">Меню · заказ · официант · Kaspi</div>
      ${qrSvg(`${origin}/t/${t}`)}<div class="tn">Стол ${t}</div><div class="note">${origin.replace(/^https?:\/\//, '')}/t/${t}</div></div>`).join('')}
      <div class="qrcard"><h5>ALTYN</h5><div class="note">Меню и бронь онлайн (вход, Instagram, визитки)</div>${qrSvg(`${origin}/`)}<div class="tn" style="font-size:20px">Сайт</div><div class="note">${origin.replace(/^https?:\/\//, '')}</div></div></div>`;
}

// ================= НАСТРОЙКИ =================
function settingsView() {
  const s = S.settings;
  const f = (k, label, v, type = 'text', hint = '') => `<div class="fld"><label>${label}</label><input data-set="${k}" type="${type}" value="${esc(v ?? '')}">${hint ? `<small class="note">${hint}</small>` : ''}</div>`;
  const tg = (k, label, v) => `<label class="tgl"><input type="checkbox" data-setb="${k}" ${v ? 'checked' : ''}><span>${label}</span></label>`;
  return `<div class="set-grid">
    <div class="card"><h3 class="h3">Оплата Kaspi QR</h3>
      <p class="note">В приложении <b>Kaspi Pay</b> откройте ваш QR для оплаты, сделайте скриншот и загрузите сюда. Гость увидит этот QR и сумму счёта.</p>
      ${s.kaspi?.qr ? `<img src="${esc(s.kaspi.qr)}" style="width:170px;border-radius:12px;margin:8px 0;border:1px solid var(--line)">` : '<p class="note"><b>QR ещё не загружен</b> — сейчас при оплате гостю предлагается позвать официанта.</p>'}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-gold btn-sm" data-kaspiqr>${s.kaspi?.qr ? 'Заменить QR' : 'Загрузить QR'}</button>${s.kaspi?.qr ? '<button class="btn btn-line btn-sm danger" data-kaspidel>Убрать</button>' : ''}</div>
      ${f('kaspi.link', 'Ссылка на оплату Kaspi (если есть)', s.kaspi?.link)}${f('kaspi.receiver', 'Получатель (как видит гость в Kaspi)', s.kaspi?.receiver)}</div>
    <div class="card"><h3 class="h3">Контакты</h3>
      ${f('phone', 'Телефон', s.phone)}${f('whatsapp', 'WhatsApp — только цифры', s.whatsapp, 'text', 'например 77772504878')}
      ${f('address', 'Адрес', s.address)}${f('addressKk', 'Мекенжай (қаз)', s.addressKk)}${f('hours', 'Часы работы', s.hours)}${f('instagram', 'Instagram (без @)', s.instagram)}</div>
    <div class="card"><h3 class="h3">Заказы и доставка</h3>
      ${tg('pickup.enabled', 'Самовывоз доступен', s.pickup?.enabled !== false)}${tg('delivery.enabled', 'Доставка доступна', s.delivery?.enabled)}
      ${f('delivery.fee', 'Стоимость доставки, ₸', s.delivery?.fee, 'number')}${f('delivery.note', 'Условия доставки (видит гость)', s.delivery?.note)}
      ${f('delivery.minOrder', 'Мин. сумма доставки, ₸', s.delivery?.minOrder, 'number', '0 — без минимума')}
      ${f('tables', 'Количество столов (для QR)', s.tables, 'number')}${f('serviceFee', 'Обслуживание, %', s.serviceFee, 'number', '0 — не добавлять к счёту')}</div>
    <div class="card"><h3 class="h3">Бронирование</h3>${f('deposit', 'Текст про предоплату банкетов', s.deposit)}
      <p class="note">Этот текст показывается под формой брони.</p>
      <h3 class="h3" style="margin-top:18px">Резервная копия</h3><p class="note">Всё содержимое сайта и заказы одним файлом. Автокопии делаются сами каждые 6 часов.</p>
      <a class="btn btn-line btn-sm" href="/api/admin/export">Скачать копию</a></div>
  </div>
  <div class="savebar"><button class="btn btn-gold" data-savesettings>Сохранить настройки</button></div>`;
}

// ---------- отрисовка ----------
const VIEWS = { live: liveView, bookings: bookingsView, menu: menuView, home: homeView, halls: hallsView, gallery: galleryView, reviews: reviewsView, qr: qrView, settings: settingsView };
const FORM_TABS = ['home', 'halls', 'settings', 'gallery'];
function rerender(force) {
  if (!S) return;
  if (!force && dirty && FORM_TABS.includes(tab)) { const h = $('header.st-h'); if (h) h.outerHTML = header(); return; }
  const y = scrollY, a = document.activeElement, focusId = a?.id, pos = a?.selectionStart;
  $('#app').innerHTML = header() + `<div class="main">${(VIEWS[tab] || liveView)()}</div>`;
  scrollTo(0, y);
  if (focusId) { const el = document.getElementById(focusId); if (el) { el.focus(); try { if (pos != null) el.setSelectionRange(pos, pos); } catch {} } }
}

// ---------- события ----------
document.addEventListener('input', e => {
  if (e.target.id === 'mq') { mq = e.target.value; rerender(); return; }
  if (FORM_TABS.includes(tab) && e.target.closest('.main')) dirty = true;
});
document.addEventListener('change', async e => {
  const el = e.target;
  try {
    if (el.dataset.opay) { if (!el.value) return; await api(`/api/staff/orders/${el.dataset.opay}`, { method: 'PATCH', body: { pay: el.value } }); return; }
    if (el.dataset.price) {
      const it = S.items.find(i => i.id === el.dataset.price), v = +el.value;
      if (!v || v < 0) { el.value = it.price; return toast('Неверная цена'); }
      it.price = v; await saveContent({ items: S.items }, `${it.name}: ${money(v)} ✓`); return;
    }
    if (el.dataset.gcap !== undefined) { S.gallery[+el.dataset.gcap].caption = el.value.trim(); await saveContent({ gallery: S.gallery }, 'Подпись сохранена'); return; }
    if (FORM_TABS.includes(tab) && el.closest('.main')) dirty = true;
  } catch (err) { toast(err.message); }
});
document.addEventListener('click', async e => {
  if ($('#sheet-root').contains(e.target)) return; // у листов свои обработчики
  const el = e.target.closest('button,a,[data-edit]'); if (!el) return;
  const d = el.dataset;
  try {
    if (d.tab) {
      if (dirty && FORM_TABS.includes(tab) && d.sure !== '1') { el.dataset.sure = '1'; return toast('Есть несохранённые изменения. Нажмите вкладку ещё раз, чтобы уйти без сохранения'); }
      dirty = false; tab = d.tab; localStorage.setItem('altyn.staff.tab', tab); scrollTo(0, 0); return rerender(true);
    }
    if (d.logout !== undefined) { await fetch('/api/logout'); S = null; return renderLogin(); }
    if (d.notif !== undefined) { await Notification.requestPermission(); beep(); return rerender(); }
    // зал
    if (d.calldone) return void await api(`/api/staff/calls/${d.calldone}`, { method: 'PATCH', body: {} });
    if (d.ost) return void await api(`/api/staff/orders/${d.ost}`, { method: 'PATCH', body: { status: d.to } });
    if (d.paytable) {
      const method = d.paymethod || await pickPay(`Стол ${d.paytable}: как оплатили?`); if (!method) return;
      const r = await api(`/api/staff/table/${encodeURIComponent(d.paytable)}/pay`, { method: 'POST', body: { pay: method } }); return toast(`Стол ${d.paytable} закрыт (${r.closed} заказ.)`);
    }
    if (d.bst) return void await api(`/api/staff/bookings/${d.bst}`, { method: 'PATCH', body: { status: d.to } });
    // меню
    if (d.stop) { const r = await api(`/api/staff/items/${d.stop}/stop`, { method: 'POST' }); return toast(r.stop ? `«${r.name}» — в стоп-листе` : `«${r.name}» снова в наличии`); }
    if (d.edit) return editItem(d.edit);
    if (d.newitem !== undefined) return editItem(null, d.newitem);
    if (d.cats !== undefined) return editCats();
    if (d.mv) {
      const i = S.items.findIndex(x => x.id === d.mv), cat = S.items[i].cat, dir = +d.d;
      let j = i + dir; while (j >= 0 && j < S.items.length && S.items[j].cat !== cat) j += dir;
      if (j < 0 || j >= S.items.length) return;
      [S.items[i], S.items[j]] = [S.items[j], S.items[i]]; rerender(); await saveContent({ items: S.items }, 'Порядок сохранён'); return;
    }
    // главная
    if (d.herophoto !== undefined) { const [f] = await pickFiles(); const r = await uploadPhoto(f); if (!r) return; collectHome(); S.settings.home.heroPhoto = r.photo; await saveContent({ settings: S.settings }, 'Главное фото обновлено'); return rerender(true); }
    if (d.hfadd !== undefined) { collectHome(); S.settings.home.features.push({ n: '★', t: 'Заголовок', p: 'Текст' }); dirty = true; return rerender(true); }
    if (d.hfdel) { collectHome(); S.settings.home.features.splice(+d.hfdel, 1); dirty = true; return rerender(true); }
    if (d.homesave !== undefined) { collectHome(); await saveContent({ settings: S.settings }, 'Главная сохранена ✓'); return rerender(true); }
    // залы
    if (d.hphoto) { const [f] = await pickFiles(); const r = await uploadPhoto(f); if (!r) return; collectHalls(); S.halls[+d.hphoto].photo = r.photo; await saveContent({ halls: S.halls }, 'Фото зала обновлено'); return rerender(true); }
    if (d.hmv) { collectHalls(); const i = +d.hmv, j = i + +d.d; [S.halls[i], S.halls[j]] = [S.halls[j], S.halls[i]]; dirty = true; return rerender(true); }
    if (d.hadd !== undefined) { collectHalls(); S.halls.push({ id: 'h' + Date.now().toString(36), name: 'Новый зал', kind: 'vip', capacity: 0, desc: '', photo: '/img/gis/hall-2.jpg' }); dirty = true; rerender(true); return scrollTo(0, document.body.scrollHeight); }
    if (d.hdel) { if (d.sure !== '1') { el.dataset.sure = '1'; el.textContent = 'Точно удалить?'; return; } collectHalls(); S.halls.splice(+d.hdel, 1); dirty = true; return rerender(true); }
    if (d.hsave !== undefined) { collectHalls(); if (S.halls.some(h => !h.name)) return toast('У каждого зала должно быть название'); await saveContent({ halls: S.halls }, 'Залы сохранены ✓'); return rerender(true); }
    // галерея
    if (d.reeladd !== undefined) {
      const url = $('#reel-url').value.trim(); if (!url) return toast('Вставьте ссылку');
      el.disabled = true; el.textContent = 'Загружаю…';
      try { const g = await api('/api/admin/reel', { method: 'POST', body: { url } });
        if (S.gallery.some(x => x.code === g.code)) return toast('Это видео уже есть');
        S.gallery.unshift(g); await saveContent({ gallery: S.gallery }, g.cover ? 'Видео добавлено ✓' : 'Добавлено, но обложку получить не удалось — загрузите её, нажав на пустую плитку');
      } finally { dirty = false; rerender(true); }
      return;
    }
    if (d.gcover) { const [f] = await pickFiles(); const r = await uploadPhoto(f); if (!r) return; S.gallery[+d.gcover].cover = r.thumb; await saveContent({ gallery: S.gallery }, 'Обложка обновлена'); return rerender(true); }
    if (d.photoadd !== undefined) {
      const files = await pickFiles(true); let n = 0;
      for (const f of files) { const r = await uploadPhoto(f); if (r) { S.gallery.push({ type: 'photo', src: r.photo, thumb: r.thumb }); n++; } }
      if (n) { await saveContent({ gallery: S.gallery }, `Добавлено фото: ${n}`); rerender(true); } return;
    }
    if (d.gmv) { if (moveSameType(+d.gmv, +d.d)) { await saveContent({ gallery: S.gallery }, 'Порядок сохранён'); rerender(true); } return; }
    if (d.gdel) { if (d.sure !== '1') { el.dataset.sure = '1'; el.textContent = 'Точно?'; return; } S.gallery.splice(+d.gdel, 1); await saveContent({ gallery: S.gallery }, 'Удалено'); return rerender(true); }
    // отзывы
    if (d.rvadd !== undefined) {
      const body = { name: $('#nr-name').value, rating: +$('#nr-rating').value, text: $('#nr-text').value, date: $('#nr-date').value, source: $('#nr-src').value };
      if (!body.text.trim()) return toast('Введите текст отзыва');
      S.reviews.unshift(await api('/api/admin/reviews', { method: 'POST', body })); toast('Отзыв добавлен на сайт'); return rerender(true);
    }
    if (d.rvap) { await api(`/api/admin/reviews/${d.rvap}`, { method: 'PATCH', body: { approved: d.v === '1' } }); S.reviews.find(r => r.id === d.rvap).approved = d.v === '1'; return rerender(); }
    if (d.rvdel) { if (d.sure !== '1') { el.dataset.sure = '1'; el.textContent = 'Точно?'; return; } await api(`/api/admin/reviews/${d.rvdel}`, { method: 'DELETE' }); S.reviews = S.reviews.filter(r => r.id !== d.rvdel); return rerender(); }
    if (d.rvreply) { const r = S.reviews.find(x => x.id === d.rvreply); const box = el.closest('.bkc'); if ($('textarea', box)) return;
      box.insertAdjacentHTML('beforeend', `<div style="grid-column:1/-1"><textarea rows="2" style="width:100%" placeholder="Ответ от ресторана (будет виден на сайте)">${esc(r.reply || '')}</textarea><button class="btn btn-gold btn-xs" data-rvsave="${r.id}">Сохранить ответ</button></div>`); return; }
    if (d.rvsave) { const txt = $('textarea', el.parentElement).value; await api(`/api/admin/reviews/${d.rvsave}`, { method: 'PATCH', body: { reply: txt } }); S.reviews.find(r => r.id === d.rvsave).reply = txt; return rerender(); }
    // настройки
    if (d.kaspiqr !== undefined) { const [f] = await pickFiles(); const r = await uploadPhoto(f); if (!r) return; S.settings.kaspi ||= {}; S.settings.kaspi.qr = r.photo; await saveContent({ settings: S.settings }, 'Kaspi QR загружен ✓'); return rerender(true); }
    if (d.kaspidel !== undefined) { S.settings.kaspi.qr = ''; await saveContent({ settings: S.settings }, 'QR убран'); return rerender(true); }
    if (d.savesettings !== undefined) {
      const s = S.settings;
      $$('[data-set]').forEach(i => setPath(s, i.dataset.set, i.type === 'number' ? +i.value || 0 : i.value.trim()));
      $$('[data-setb]').forEach(i => setPath(s, i.dataset.setb, i.checked));
      await saveContent({ settings: s }, 'Настройки сохранены ✓'); return rerender(true);
    }
  } catch (err) { toast(err.message); }
});
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

function pickPay(title) {
  return new Promise(res => {
    const root = $('#sheet-root');
    root.innerHTML = `<div class="ov"><div class="sheet"><div class="sh-h"><h3>${esc(title)}</h3><button class="x" data-p="">×</button></div>
      <div class="sh-f"><button class="btn btn-block" style="background:#f14635;color:#fff" data-p="kaspi">Kaspi</button><button class="btn btn-dark btn-block" data-p="card">Карта</button><button class="btn btn-line btn-block" data-p="cash">Наличные</button></div></div></div>`;
    root.onclick = e => { const b = e.target.closest('[data-p]'); if (!b && e.target.matches('.ov')) { sheetClose(); return res(''); } if (b) { sheetClose(); res(b.dataset.p); } };
  });
}

async function boot() {
  try { await load(); } catch { return renderLogin(); }
  rerender(true); stream();
  setInterval(() => { if (tab === 'live' && !document.activeElement?.matches('select') && !$('#sheet-root').innerHTML) rerender(); }, 30000);
}
boot();
})();
