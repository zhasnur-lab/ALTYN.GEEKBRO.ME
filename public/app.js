/* ALTYN — сайт + QR-меню стола. Без фреймворков. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (Math.round(n) || 0).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₸';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- mode ----------
const tm = /^\/t\/([\w-]{1,10})\/?$/.exec(location.pathname);
const TABLE = tm ? decodeURIComponent(tm[1]) : null;
const CART_KEY = TABLE ? 'altyn.cart.t' + TABLE : 'altyn.cart.web';
const ORDERS_KEY = TABLE ? 'altyn.orders.t' + TABLE : 'altyn.orders.web';

// ---------- i18n ----------
let LANG = store.get('altyn.lang', 'ru');
const T = {
  ru: {
    menu: 'Меню', halls: 'Залы', book: 'Бронь', gallery: 'Галерея', reviews: 'Отзывы', contacts: 'Контакты',
    bookBtn: 'Забронировать', seeMenu: 'Смотреть меню', orderOnline: 'Заказать с собой',
    heroEyebrow: 'Мейрамхана · Усть-Каменогорск', heroLead: 'Восточная и европейская кухня, общий зал на 60 мест и три VIP-зала. Для обеда, семейного ужина, дня рождения и тоя.',
    daily: 'ежедневно', reviewsOn: 'отзывов в 2ГИС',
    qaMenu: 'Меню с ценами', qaMenuS: 'блюд и напитков', qaBook: 'Столик или зал', qaBookS: 'Подтвердим по телефону',
    qaDel: 'Доставка и с собой', qaDelS: 'Закажите онлайн', qaWa: 'WhatsApp', qaWaS: 'Быстрая связь',
    search: 'Найти блюдо…', all: 'Все', nothing: 'Ничего не нашли', add: 'Добавить',
    t_hit: 'Хит', t_spicy: 'Острое', t_veg: 'Без мяса', t_promo: 'Акция', t_national: 'Национальное', t_kids: 'Детям', t_stop: 'Нет в наличии',
    setsH: 'Сеты для компании', setsP: 'Выгодные наборы на 4–10 гостей — плов, шашлыки, напитки.',
    hallsH: 'Залы для любого повода', hallsP: 'Общий зал и три VIP-зала: дни рождения, тусау кесер, юбилеи, корпоративы и деловые встречи.',
    guests: 'гостей', upTo: 'до', capAsk: 'вместимость уточняйте', bookHall: 'Забронировать зал',
    bookH: 'Бронирование', bookP: 'Оставьте заявку, администратор перезвонит и подтвердит бронь.',
    tableT: 'Столик', eventT: 'Мероприятие', date: 'Дата', time: 'Время', nGuests: 'Гостей', hall: 'Зал', anyHall: 'Любой / подберите сами',
    eventType: 'Повод', name: 'Имя', phone: 'Телефон', comment: 'Пожелания', preorder: 'Предзаказ блюд (по желанию)',
    send: 'Отправить заявку', sending: 'Отправляем…',
    bookOk: 'Заявка принята!', bookOkP: 'Администратор свяжется с вами в ближайшее время для подтверждения.',
    dupWa: 'Продублировать в WhatsApp',
    events: ['День рождения', 'Тусау кесер', 'Юбилей', 'Сүндет той', 'Корпоратив', 'Свидание', 'Деловая встреча', 'Поминки / ас беру', 'Другое'],
    galleryH: 'Атмосфера ALTYN', galleryP: 'Видео из нашего Instagram и фото гостей.',
    reviewsH: 'Что говорят гости', reviewsP: 'Реальные отзывы из 2ГИС и с нашего сайта.', allReviews: 'Все отзывы в 2ГИС', leaveReview: 'Оставить отзыв',
    contactsH: 'Ждём в гости', route: 'Маршрут в 2ГИС', address: 'Адрес', hours: 'Часы работы', call: 'Позвонить',
    cart: 'Корзина', toCart: 'Корзина', empty: 'Корзина пуста', total: 'Итого', checkout: 'Оформить заказ', comment2: 'Комментарий к заказу',
    alsoTake: 'С этим часто берут', sendKitchen: 'Отправить заказ на кухню', pickup: 'Самовывоз', delivery: 'Доставка', addr: 'Адрес доставки',
    orderOk: 'Заказ отправлен!', orderNo: 'Заказ №', track: 'Мои заказы',
    st_new: 'Отправлен', st_accepted: 'Принят', st_cooking: 'Готовится', st_served: 'Подан', st_closed: 'Закрыт', st_cancelled: 'Отменён',
    waiter: 'Официант', bill: 'Счёт', callWaiter: 'Вызвать официанта', waiterComing: 'Официант уже идёт к вам 🙌',
    table: 'Стол', welcome: 'Добро пожаловать в ALTYN!', welcomeP: 'Выбирайте блюда — заказ сразу уйдёт на кухню. Официант всегда рядом.',
    billH: 'Ваш счёт', noBill: 'Пока нет заказов через QR. Если заказывали у официанта — попросите счёт.', service: 'Обслуживание',
    payKaspi: 'Оплатить Kaspi QR', payWaiter: 'Оплатить официанту (карта / наличные)', askBill: 'Принести счёт',
    kaspiStep: 'Отсканируйте QR в приложении Kaspi.kz или откройте ссылку, введите сумму', paid: 'Я оплатил(а)', openKaspi: 'Открыть в Kaspi',
    kaspiNoQr: 'QR для оплаты выдаст официант — он уже идёт к вам.',
    paidThanks: 'Спасибо! Официант подтвердит оплату.', rateH: 'Как вам у нас?', rateP: 'Оцените визит — это займёт 5 секунд',
    rateHi: 'Рахмет! Мы очень рады 🤍', rateHiP: 'Поделитесь впечатлением в 2ГИС — это очень помогает нам расти.', rateGis: 'Написать отзыв в 2ГИС',
    rateLo: 'Нам жаль, что что-то пошло не так', rateLoP: 'Расскажите, что улучшить — сообщение получит управляющий лично.', rateSend: 'Отправить управляющему',
    thanks: 'Спасибо!', close: 'Закрыть', min: 'Минимальная сумма доставки', stopErr: 'Нет в наличии',
    features: [['3', 'VIP-зала', 'На 25, 15 и 10 гостей + общий зал на 60 мест'], ['12–24', 'каждый день', 'Обеды, ужины и поздние встречи'], ['4.8★', 'в 2ГИС', 'Более 280 оценок гостей'], ['🧸', 'Детская зона', 'Игровая для маленьких гостей']],
  },
  kk: {
    menu: 'Мәзір', halls: 'Залдар', book: 'Бронь', gallery: 'Галерея', reviews: 'Пікірлер', contacts: 'Байланыс',
    bookBtn: 'Брондау', seeMenu: 'Мәзірді көру', orderOnline: 'Өзіммен алу',
    heroEyebrow: 'Мейрамхана · Өскемен', heroLead: 'Шығыс және еуропа асханасы, 60 орындық жалпы зал және үш VIP-зал. Түскі ас, отбасылық кеш, туған күн мен той үшін.',
    daily: 'күн сайын', reviewsOn: '2ГИС-тегі пікір',
    qaMenu: 'Бағасы бар мәзір', qaMenuS: 'тағам мен сусын', qaBook: 'Үстел не зал', qaBookS: 'Телефонмен растаймыз',
    qaDel: 'Жеткізу және өзіммен', qaDelS: 'Онлайн тапсырыс', qaWa: 'WhatsApp', qaWaS: 'Жылдам байланыс',
    search: 'Тағам іздеу…', all: 'Барлығы', nothing: 'Ештеңе табылмады', add: 'Қосу',
    t_hit: 'Хит', t_spicy: 'Ащы', t_veg: 'Етсіз', t_promo: 'Акция', t_national: 'Ұлттық', t_kids: 'Балаларға', t_stop: 'Қазір жоқ',
    setsH: 'Компанияға арналған сеттер', setsP: '4–10 қонаққа тиімді жиынтықтар — палау, кәуап, сусындар.',
    hallsH: 'Кез келген жағдайға залдар', hallsP: 'Жалпы зал және үш VIP-зал: туған күн, тұсаукесер, мерейтой, корпоратив.',
    guests: 'қонақ', upTo: '', capAsk: 'сыйымдылығын нақтылаңыз', bookHall: 'Залды брондау',
    bookH: 'Брондау', bookP: 'Өтінім қалдырыңыз, әкімші хабарласып растайды.',
    tableT: 'Үстел', eventT: 'Іс-шара', date: 'Күні', time: 'Уақыты', nGuests: 'Қонақ саны', hall: 'Зал', anyHall: 'Кез келген',
    eventType: 'Себебі', name: 'Атыңыз', phone: 'Телефон', comment: 'Тілектер', preorder: 'Алдын ала тапсырыс (қаласаңыз)',
    send: 'Өтінім жіберу', sending: 'Жіберілуде…',
    bookOk: 'Өтінім қабылданды!', bookOkP: 'Әкімші жақын арада хабарласады.', dupWa: 'WhatsApp-қа қайталау',
    events: ['Туған күн', 'Тұсаукесер', 'Мерейтой', 'Сүндет той', 'Корпоратив', 'Кездесу', 'Іскерлік кездесу', 'Ас беру', 'Басқа'],
    galleryH: 'ALTYN атмосферасы', galleryP: 'Instagram-дағы видеолар мен қонақтардың суреттері.',
    reviewsH: 'Қонақтар пікірі', reviewsP: '2ГИС пен сайттағы нақты пікірлер.', allReviews: '2ГИС-тегі барлық пікір', leaveReview: 'Пікір қалдыру',
    contactsH: 'Қонаққа күтеміз', route: '2ГИС-те бағыт', address: 'Мекенжай', hours: 'Жұмыс уақыты', call: 'Қоңырау шалу',
    cart: 'Себет', toCart: 'Себет', empty: 'Себет бос', total: 'Барлығы', checkout: 'Тапсырыс беру', comment2: 'Тапсырысқа түсініктеме',
    alsoTake: 'Мұнымен бірге алады', sendKitchen: 'Тапсырысты асүйге жіберу', pickup: 'Өзім алып кетемін', delivery: 'Жеткізу', addr: 'Жеткізу мекенжайы',
    orderOk: 'Тапсырыс жіберілді!', orderNo: 'Тапсырыс №', track: 'Тапсырыстарым',
    st_new: 'Жіберілді', st_accepted: 'Қабылданды', st_cooking: 'Дайындалуда', st_served: 'Берілді', st_closed: 'Жабылды', st_cancelled: 'Бас тартылды',
    waiter: 'Даяшы', bill: 'Есеп', callWaiter: 'Даяшыны шақыру', waiterComing: 'Даяшы келе жатыр 🙌',
    table: 'Үстел', welcome: 'ALTYN-ға қош келдіңіз!', welcomeP: 'Тағам таңдаңыз — тапсырыс бірден асүйге жетеді. Даяшы әрқашан қасыңызда.',
    billH: 'Сіздің есебіңіз', noBill: 'QR арқылы тапсырыс әлі жоқ. Даяшыдан есеп сұраңыз.', service: 'Қызмет көрсету',
    payKaspi: 'Kaspi QR арқылы төлеу', payWaiter: 'Даяшыға төлеу (карта / қолма-қол)', askBill: 'Есепті әкелу',
    kaspiStep: 'Kaspi.kz қосымшасында QR-ды сканерлеңіз немесе сілтемені ашып, соманы енгізіңіз', paid: 'Төледім', openKaspi: 'Kaspi-де ашу',
    kaspiNoQr: 'Төлем QR-ын даяшы әкеледі — ол келе жатыр.',
    paidThanks: 'Рахмет! Даяшы төлемді растайды.', rateH: 'Бізде ұнады ма?', rateP: 'Сапарыңызды бағалаңыз',
    rateHi: 'Рахмет! Біз өте қуаныштымыз 🤍', rateHiP: '2ГИС-те пікір қалдырыңыз — бұл бізге көп көмектеседі.', rateGis: '2ГИС-те пікір жазу',
    rateLo: 'Бірдеңе дұрыс болмағанына өкінеміз', rateLoP: 'Не жақсартуға болатынын жазыңыз — хабарламаны басқарушы өзі оқиды.', rateSend: 'Басқарушыға жіберу',
    thanks: 'Рахмет!', close: 'Жабу', min: 'Жеткізудің ең аз сомасы', stopErr: 'Қазір жоқ',
    features: [['3', 'VIP-зал', '25, 15 және 10 қонаққа + 60 орындық жалпы зал'], ['12–24', 'күн сайын', 'Түскі ас, кешкі ас, кешкі кездесулер'], ['4.8★', '2ГИС-те', '280-нен астам баға'], ['🧸', 'Балалар аймағы', 'Кішкентай қонақтарға ойын бөлмесі']],
  },
};
const t = k => T[LANG][k] ?? T.ru[k] ?? k;

// ---------- icons ----------
const I = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  bill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  dish: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 16h18M5 16a7 7 0 0 1 14 0M12 7V5"/><path d="M4 19h16"/></svg>',
  wa: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.7 11.7 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2s.2-1.1.2-1.2-.2-.2-.4-.3z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M8 5v14l11-7z"/></svg>',
  burger: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};
// Орнамент-логотип (мотив казахского шаңырақ-узора в круге)
const ORN = (c = '#e3c58c') => `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="${c}" stroke-width="2.2">
<circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="39" stroke-width="1"/>
${[0, 45, 90, 135].map(a => `<g transform="rotate(${a} 50 50)"><path d="M50 14c9 10 9 20 0 26-9-6-9-16 0-26zM50 86c9-10 9-20 0-26-9 6-9 16 0 26z"/><path d="M36 50h28" stroke-width="1.4"/></g>`).join('')}
<circle cx="50" cy="50" r="7"/></g></svg>`;

// ---------- data ----------
let D = null;
let cart = store.get(CART_KEY, {});
let myOrders = store.get(ORDERS_KEY, []);
let filt = { q: '', tag: '' };

async function api(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Ошибка сети, попробуйте ещё раз');
  return j;
}
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600);
}
const item = id => D.items.find(x => x.id === id);
const nm = o => (LANG === 'kk' && o.nameKk) || o.name;
const ds = o => (LANG === 'kk' && o.descKk) || o.desc || '';
const H = (k) => { const h = S().home || {}; return (LANG === 'kk' && h[k + 'Kk']) || h[k] || ''; };
const visItems = () => D.items.filter(i => !i.hidden && !D.categories.find(c => c.id === i.cat)?.hidden);
const visCats = () => D.categories.filter(c => !c.hidden);
const S = () => D.settings;
const waLink = text => `https://wa.me/${S().whatsapp}?text=${encodeURIComponent(text)}`;

// ---------- cart ----------
function cartCount() { return Object.values(cart).reduce((s, q) => s + q, 0); }
function cartSum() { return Object.entries(cart).reduce((s, [id, q]) => s + (item(id)?.price || 0) * q, 0); }
function setQty(id, q) {
  const it = item(id); if (!it) return;
  if (it.stop && q > (cart[id] || 0)) return toast(t('stopErr'));
  if (q <= 0) delete cart[id]; else cart[id] = Math.min(50, q);
  store.set(CART_KEY, cart); refreshCartUI();
}
function qtyCtl(id) {
  const q = cart[id] || 0;
  return q ? `<div class="qty" data-id="${id}"><button data-dec aria-label="−">−</button><span>${q}</span><button data-inc aria-label="+">+</button></div>`
    : `<button class="add" data-add="${id}" aria-label="${t('add')}">+</button>`;
}
function refreshCartUI() {
  $$('.dish[data-id]').forEach(el => { const r = $('.rt .ctl', el); if (r) r.innerHTML = qtyCtl(el.dataset.id); });
  $$('.set [data-ctl]').forEach(el => el.innerHTML = qtyCtl(el.dataset.ctl));
  const n = cartCount();
  if (TABLE) {
    const b = $('.cartbtn'); if (b) b.innerHTML = `${I.bag}<span>${n ? money(cartSum()) : t('cart')}</span>${n ? `<span class="cnt">${n}</span>` : ''}`;
  } else {
    let bar = $('.cartbar');
    if (!n) { bar?.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'cartbar'; document.body.append(bar); }
    bar.innerHTML = `<button class="btn btn-gold" data-open-cart><span>${I.bag} ${t('cart')} <span class="cnt">${n}</span></span><b>${money(cartSum())}</b></button>`;
  }
  if ($('.sheet[data-kind=cart]')) renderCartSheet();
}

// ---------- sheets ----------
function sheet(kind, title, bodyHtml, footHtml = '') {
  closeSheet(true);
  const root = $('#sheet-root');
  root.innerHTML = `<div class="ov" data-close-ov><div class="sheet" data-kind="${kind}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sh-h"><h3>${title}</h3><button class="x" data-close aria-label="${t('close')}">×</button></div>
    <div class="sh-b">${bodyHtml}</div>${footHtml ? `<div class="sh-f">${footHtml}</div>` : ''}</div></div>`;
  document.body.style.overflow = 'hidden';
  if (!closeSheet.pushed) { history.pushState({ sheet: 1 }, ''); closeSheet.pushed = true; }
  return $('.sheet', root);
}
function closeSheet(keepHistory) {
  $('#sheet-root').innerHTML = ''; document.body.style.overflow = '';
  if (!keepHistory && closeSheet.pushed) { closeSheet.pushed = false; history.back(); }
}
addEventListener('popstate', () => { if (closeSheet.pushed) { closeSheet.pushed = false; closeSheet(true); } });

function tagsHtml(it) {
  const tags = [...(it.tags || [])]; if (it.stop) tags.unshift('stop');
  return tags.length ? `<div class="tg">${tags.map(g => `<span class="tag ${g}">${t('t_' + g)}</span>`).join('')}</div>` : '';
}
function dishRow(it) {
  return `<div class="dish${it.stop ? ' off' : ''}" data-id="${it.id}" data-open-dish="${it.id}">
    ${it.photo ? `<img class="ph" src="${esc(it.thumb || it.photo)}" alt="" loading="lazy">` : ''}
    <div class="bd"><div class="nm">${esc(nm(it))}</div>${ds(it) ? `<div class="ds">${esc(ds(it))}</div>` : ''}${tagsHtml(it)}</div>
    <div class="rt"><div class="price">${it.oldPrice ? `<s>${money(it.oldPrice)}</s>` : ''}${money(it.price)}</div><div class="ctl">${it.stop ? '' : qtyCtl(it.id)}</div></div></div>`;
}
function openDish(id) {
  const it = item(id); if (!it) return;
  sheet('dish', esc(nm(it)), `${it.photo ? `<div class="dish-hero" style="background-image:url('${it.photo}')"></div>` : ''}
    ${ds(it) ? `<p>${esc(ds(it))}</p>` : ''}${tagsHtml(it)}
    <div class="tot"><span>${D.categories.find(c => c.id === it.cat) ? esc(nm(D.categories.find(c => c.id === it.cat))) : ''}</span><span>${money(it.price)}</span></div>`,
    it.stop ? `<button class="btn btn-line btn-block" disabled>${t('t_stop')}</button>` : `<button class="btn btn-gold btn-block" data-add-close="${it.id}">${t('add')} · ${money(it.price)}</button>`);
}

function renderCartSheet() {
  const ids = Object.keys(cart).filter(item);
  const upIds = [...new Set(ids.flatMap(id => (D.pairs || {})[item(id).cat] || []))].filter(x => !cart[x] && item(x) && !item(x).stop && !item(x).hidden).slice(0, 6);
  const s = S();
  const body = !ids.length ? `<div class="empty">${t('empty')}</div>` : `
    ${ids.map(id => { const it = item(id); return `<div class="ci"><div class="nm">${esc(nm(it))}<small>${money(it.price)}</small></div>${qtyCtl(id)}</div>`; }).join('')}
    ${upIds.length ? `<p class="note" style="margin:16px 0 4px;font-weight:600">${t('alsoTake')}</p><div class="up">${upIds.map(id => { const it = item(id); return `<div class="u"><b>${esc(nm(it))}</b><span class="muted">${money(it.price)}</span><button class="btn btn-sm btn-dark" data-add="${id}">+ ${t('add')}</button></div>`; }).join('')}</div>` : ''}
    ${!TABLE && checkout.type === 'delivery' && s.delivery?.fee ? `<div class="ci"><div class="nm">${t('delivery')}<small>${esc(s.delivery.note || '')}</small></div><b>${money(s.delivery.fee)}</b></div>` : ''}
    <div class="tot"><span>${t('total')}</span><span>${money(cartSum() + (!TABLE && checkout.type === 'delivery' ? s.delivery?.fee || 0 : 0))}</span></div>
    ${TABLE ? `<div class="fld"><label>${t('comment2')}</label><textarea id="c-comment" rows="2" placeholder="Без лука, острее, подать всё сразу…"></textarea></div>` : `
      <div class="seg" style="margin-top:10px">${s.pickup?.enabled !== false ? `<button data-otype="pickup" class="${checkout.type === 'pickup' ? 'on' : ''}">${t('pickup')}</button>` : ''}${s.delivery?.enabled ? `<button data-otype="delivery" class="${checkout.type === 'delivery' ? 'on' : ''}">${t('delivery')}</button>` : ''}</div>
      <div class="form">
        <div class="fld"><label>${t('name')}</label><input id="c-name" autocomplete="name" value="${esc(checkout.name)}"></div>
        <div class="fld"><label>${t('phone')}</label><input id="c-phone" type="tel" autocomplete="tel" placeholder="+7 7__ ___ __ __" value="${esc(checkout.phone)}"></div>
        ${checkout.type === 'delivery' ? `<div class="fld full"><label>${t('addr')}</label><input id="c-addr" autocomplete="street-address" value="${esc(checkout.address)}"></div>${s.delivery?.minOrder ? `<p class="note full">${t('min')}: ${money(s.delivery.minOrder)}</p>` : ''}` : ''}
        <div class="fld full"><label>${t('comment2')}</label><textarea id="c-comment" rows="2"></textarea></div>
      </div>`}`;
  const foot = ids.length ? `<button class="btn btn-gold btn-block" data-submit-order>${TABLE ? t('sendKitchen') : t('checkout')} · ${money(cartSum())}</button>` : '';
  const el = $('.sheet[data-kind=cart]');
  if (el) {
    const keep = { c: $('#c-comment')?.value, n: $('#c-name')?.value, p: $('#c-phone')?.value, a: $('#c-addr')?.value };
    $('.sh-b', el).innerHTML = body;
    let f = $('.sh-f', el); if (!foot) f?.remove(); else { if (!f) { f = document.createElement('div'); f.className = 'sh-f'; el.append(f); } f.innerHTML = foot; }
    if (keep.c && $('#c-comment')) $('#c-comment').value = keep.c;
    if (keep.n != null && $('#c-name')) $('#c-name').value = keep.n;
    if (keep.p != null && $('#c-phone')) $('#c-phone').value = keep.p;
    if (keep.a != null && $('#c-addr')) $('#c-addr').value = keep.a;
  } else sheet('cart', t('cart'), body, foot);
}
const checkout = store.get('altyn.checkout', { type: 'pickup', name: '', phone: '', address: '' });

async function submitOrder(btn) {
  const payload = { type: TABLE ? 'table' : checkout.type, table: TABLE || '', items: Object.entries(cart).map(([id, qty]) => ({ id, qty })), comment: $('#c-comment')?.value || '' };
  if (!TABLE) {
    Object.assign(checkout, { name: $('#c-name').value.trim(), phone: $('#c-phone').value.trim(), address: $('#c-addr')?.value.trim() || '' });
    store.set('altyn.checkout', checkout);
    Object.assign(payload, { name: checkout.name, phone: checkout.phone, address: checkout.address });
    if (checkout.type === 'delivery' && S().delivery?.minOrder && cartSum() < S().delivery.minOrder) return toast(`${t('min')}: ${money(S().delivery.minOrder)}`);
  }
  btn.disabled = true; btn.textContent = t('sending');
  try {
    const r = await api('/api/orders', { method: 'POST', body: payload });
    myOrders.unshift({ id: r.id, token: r.token, no: r.no, total: r.total, at: Date.now() }); myOrders = myOrders.slice(0, 20);
    store.set(ORDERS_KEY, myOrders);
    cart = {}; store.set(CART_KEY, cart); refreshCartUI();
    sheet('ok', t('orderOk'), `<div class="big-ok">✅</div><p class="center"><b>${t('orderNo')}${r.no}</b> · ${money(r.total)}</p>
      <p class="center muted">${TABLE ? 'Официант подтвердит заказ в течение пары минут. Статус видно в «Мои заказы».' : 'Мы перезвоним для подтверждения. Статус можно смотреть здесь же.'}</p>`,
      `<button class="btn btn-dark btn-block" data-track>${t('track')}</button>`);
    renderMyOrdersChip(); pollOrders();
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = t('sendKitchen'); }
}

// ---------- order tracking ----------
const STEPS = ['new', 'accepted', 'cooking', 'served'];
let orderState = {};
async function pollOrders() {
  const recent = myOrders.filter(o => Date.now() - o.at < 12 * 3600e3);
  if (!recent.length) return;
  await Promise.all(recent.map(o => api(`/api/orders/${o.id}?t=${o.token}`).then(r => { orderState[o.id] = r; }).catch(() => {})));
  if ($('.sheet[data-kind=track]')) openTrack();
  renderMyOrdersChip();
}
function openTrack() {
  const recent = myOrders.filter(o => orderState[o.id]);
  sheet('track', t('track'), recent.length ? recent.map(o => {
    const r = orderState[o.id], i = STEPS.indexOf(r.status);
    return `<div class="ostat"><div style="display:flex;justify-content:space-between"><b>${t('orderNo')}${r.no}</b><span>${money(r.total)}</span></div>
      <div class="status">${STEPS.map((s, k) => `<span class="${k <= i || r.status === 'closed' ? 'on' : ''}"></span>`).join('')}</div>
      <div class="note"><b style="color:var(--text)">${t('st_' + r.status)}</b> · ${r.items.map(x => `${esc(x.name)} ×${x.qty}`).join(', ')}</div></div>`;
  }).join('') : `<div class="empty">—</div>`);
}
function renderMyOrdersChip() {
  const box = $('#myorders'); if (!box) return;
  const recent = myOrders.filter(o => orderState[o.id] && !['closed', 'cancelled'].includes(orderState[o.id].status));
  box.innerHTML = recent.map(o => `<button class="badge" data-track>🧾 ${t('orderNo')}${orderState[o.id].no}: <b>${t('st_' + orderState[o.id].status)}</b></button>`).join('');
}

// ---------- table: waiter & bill & kaspi ----------
async function callWaiter(kind = 'waiter', extra = {}) {
  try { await api('/api/calls', { method: 'POST', body: { table: TABLE, kind, ...extra } }); toast(t('waiterComing')); }
  catch (e) { toast(e.message); }
}
async function openBill() {
  let b; try { b = await api(`/api/table/${encodeURIComponent(TABLE)}/bill`); } catch (e) { return toast(e.message); }
  const k = S().kaspi || {};
  const body = !b.items.length ? `<p class="muted">${t('noBill')}</p>` : `
    ${b.items.map(x => `<div class="ci"><div class="nm">${esc(x.name)}<small>${x.qty} × ${money(x.price)}</small></div><b>${money(x.qty * x.price)}</b></div>`).join('')}
    ${b.fee ? `<div class="ci"><div class="nm">${t('service')} ${S().serviceFee}%</div><b>${money(b.fee)}</b></div>` : ''}
    <div class="tot"><span>${t('total')}</span><span>${money(b.total)}</span></div>`;
  sheet('bill', t('billH'), body, `
    ${b.items.length ? `<button class="btn btn-block" style="background:#f14635;color:#fff" data-kaspi="${b.total}">${t('payKaspi')}</button>` : ''}
    <button class="btn btn-line btn-block" data-callbill="${b.total}">${b.items.length ? t('payWaiter') : t('askBill')}</button>`);
}
function openKaspi(amount) {
  const k = S().kaspi || {};
  if (!k.qr && !k.link) { callWaiter('kaspi', { amount }); return sheet('kaspi', 'Kaspi QR', `<p>${t('kaspiNoQr')}</p>`); }
  sheet('kaspi', 'Kaspi QR', `<div class="kaspi-qr">
      <div class="kaspi-badge">● Kaspi.kz</div>
      ${k.qr ? `<img src="${esc(k.qr)}" alt="Kaspi QR">` : ''}
      <div class="tot" style="justify-content:center;gap:10px"><span>${t('total')}:</span><span>${money(amount)}</span></div>
      <p class="note">${t('kaspiStep')}. ${esc(k.receiver ? 'Получатель: ' + k.receiver : '')}</p></div>`,
    `${k.link ? `<a class="btn btn-block" style="background:#f14635;color:#fff" href="${esc(k.link)}" target="_blank" rel="noopener">${t('openKaspi')}</a>` : ''}
     <button class="btn btn-gold btn-block" data-paid="${amount}">${t('paid')}</button>`);
}
function openRate() {
  let rating = 0;
  const s = sheet('rate', t('rateH'), `<p class="center muted">${t('rateP')}</p><div class="star-pick">${[1, 2, 3, 4, 5].map(n => `<button data-star="${n}" aria-label="${n}">★</button>`).join('')}</div><div id="rate-next"></div>`);
  s.addEventListener('click', e => {
    const st = e.target.closest('[data-star]'); if (!st) return;
    rating = +st.dataset.star;
    $$('[data-star]', s).forEach(b => b.classList.toggle('on', +b.dataset.star <= rating));
    const nx = $('#rate-next');
    if (rating >= 4) {
      api('/api/reviews', { method: 'POST', body: { rating, table: TABLE || '', text: '' } }).catch(() => {});
      nx.innerHTML = `<h4 class="serif center" style="font-size:24px;margin:6px 0">${t('rateHi')}</h4><p class="center muted">${t('rateHiP')}</p><a class="btn btn-gold btn-block" href="${esc(S().gis)}/tab/reviews" target="_blank" rel="noopener">${t('rateGis')}</a>`;
    } else {
      nx.innerHTML = `<h4 class="serif center" style="font-size:24px;margin:6px 0">${t('rateLo')}</h4><p class="center muted">${t('rateLoP')}</p>
        <div class="fld"><textarea id="rv-text" rows="3"></textarea></div><div class="fld" style="margin-top:8px"><input id="rv-phone" type="tel" placeholder="${t('phone')} (по желанию)"></div>
        <button class="btn btn-dark btn-block" style="margin-top:10px" data-rv-send>${t('rateSend')}</button>`;
      $('[data-rv-send]', nx).onclick = async () => {
        try { await api('/api/reviews', { method: 'POST', body: { rating, table: TABLE || '', text: $('#rv-text').value, phone: $('#rv-phone').value, private: true } }); nx.innerHTML = `<p class="center"><b>${t('thanks')}</b></p>`; }
        catch (err) { toast(err.message); }
      };
    }
  });
}

// ---------- page render ----------
function header() {
  return `<header class="hdr"><div class="wrap">
    <a class="logo" href="/" aria-label="ALTYN">${ORN()}<div><small>MEIRAMHANA</small><b>ALTYN</b></div></a>
    <nav class="nav" id="nav">${[['menu', '#menu'], ['halls', '#halls'], ['book', '#book'], ['gallery', '#gallery'], ['reviews', '#reviews'], ['contacts', '#contacts']].map(([k, h]) => `<a href="${h}">${t(k)}</a>`).join('')}</nav>
    <div class="hdr-actions"><div class="lang">${['ru', 'kk'].map(l => `<button data-lang="${l}" class="${LANG === l ? 'on' : ''}">${l === 'kk' ? 'ҚАЗ' : 'РУС'}</button>`).join('')}</div>
    <a class="btn btn-gold btn-sm" href="#book">${t('bookBtn')}</a></div>
    <button class="menu-toggle" data-burger aria-label="Меню">${I.burger}</button>
  </div></header>`;
}

function menuSection(opts = {}) {
  const cats = visCats().filter(c => visItems().some(i => i.cat === c.id));
  const q = filt.q.toLowerCase();
  const list = visItems().filter(i => (!q || (i.name + ' ' + i.desc).toLowerCase().includes(q)) && (!filt.tag || (i.tags || []).includes(filt.tag)));
  const tagSet = ['hit', 'national', 'spicy', 'veg', 'kids'];
  return `<div class="menu-tools"><div class="${opts.wrap === false ? '' : 'wrap'}">
      <label class="search">${I.search}<input id="q" type="search" placeholder="${t('search')}" value="${esc(filt.q)}" autocomplete="off"></label>
      <div class="chips" id="catchips">${cats.map(c => `<button class="chip" data-cat="${c.id}">${esc(nm(c))}</button>`).join('')}</div>
      <div class="filters">${tagSet.map(g => `<button class="chip ${filt.tag === g ? 'on' : ''}" data-tag="${g}">${t('t_' + g)}</button>`).join('')}</div>
    </div></div>
    <div class="${opts.wrap === false ? '' : 'wrap'}" id="menu-list">
      ${cats.map(c => { const its = list.filter(i => i.cat === c.id); return its.length ? `<div class="cat" id="cat-${c.id}"><h3>${esc(nm(c))}</h3><div class="dishes">${its.map(dishRow).join('')}</div></div>` : ''; }).join('') || `<div class="empty">${t('nothing')}</div>`}
    </div>`;
}
function rerenderMenu() {
  const host = $('#menu-host'); if (!host) return;
  const pos = $('#q')?.selectionStart;
  host.innerHTML = menuSection({ wrap: true });
  if (document.activeElement?.id !== 'q' && pos != null) { const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
  bindCatSpy();
}

function siteView() {
  const s = S(); const sets = visItems().filter(i => i.cat === 'sets');
  const heroPhoto = s.home?.heroPhoto || D.halls[0]?.photo || '/img/gis/hall-3.jpg';
  const reviews = D.reviews || [];
  return `${header()}
  <section class="hero"><div class="orn">${ORN()}</div><div class="wrap">
    <div>
      <span class="eyebrow">${esc(H('eyebrow') || t('heroEyebrow'))}</span>
      <h1>ALTYN <em>${LANG === 'kk' ? 'мейрамханасы' : 'ресторан'}</em></h1>
      <p class="lead">${esc(LANG === 'kk' ? s.taglineKk : s.tagline)}. ${esc(H('lead') || t('heroLead'))}</p>
      <div class="ctas"><a class="btn btn-gold" href="#book">${I.book} ${t('bookBtn')}</a><a class="btn btn-ghost" href="#menu">${t('seeMenu')}</a></div>
      <div class="badges">
        <a class="badge" href="${esc(s.gis)}/tab/reviews" target="_blank" rel="noopener"><b>★ ${s.gisRating}</b> · ${s.gisReviews} ${t('reviewsOn')}</a>
        <span class="badge">${I.clock} ${esc(s.hours)} · ${t('daily')}</span>
        <span class="badge">${I.pin} ${esc(LANG === 'kk' ? s.addressKk : s.address)}</span>
      </div>
    </div>
    <div class="hero-art"><div class="arch"><img src="${heroPhoto}" alt="Зал ресторана ALTYN" fetchpriority="high"></div>
      <div class="ring">${ORN()}</div><div class="cap">${esc(H('heroCaption'))}</div></div>
  </div></section>

  <div class="quick"><div class="wrap grid">
    <a class="qa" href="#menu"><span class="ic">${I.dish}</span><div><b>${t('qaMenu')}</b><span>${visItems().length} ${t('qaMenuS')}</span></div></a>
    <a class="qa" href="#book"><span class="ic">${I.book}</span><div><b>${t('qaBook')}</b><span>${t('qaBookS')}</span></div></a>
    <a class="qa" href="#menu" data-online><span class="ic">${I.bag}</span><div><b>${t('qaDel')}</b><span>${t('qaDelS')}</span></div></a>
    <a class="qa" href="${waLink('Здравствуйте! Хочу забронировать столик в ALTYN')}" target="_blank" rel="noopener"><span class="ic" style="background:#1fa855;color:#fff">${I.wa}</span><div><b>${t('qaWa')}</b><span>${esc(s.phone)}</span></div></a>
  </div></div>

  <section class="sec" style="padding-bottom:30px"><div class="wrap"><div class="feats">
    ${(s.home?.features?.length ? s.home.features.map(f => [f.n, (LANG === 'kk' && f.tKk) || f.t, (LANG === 'kk' && f.pKk) || f.p]) : t('features')).map(([n, b, p]) => `<div class="feat"><div class="n">${esc(n)}</div><b>${esc(b)}</b><p>${esc(p)}</p></div>`).join('')}
  </div></div></section>

  ${sets.length ? `<section class="sec" style="padding-top:40px"><div class="wrap">
    <div class="sec-h"><div><span class="eyebrow dark">${t('menu')}</span><h2>${esc(H('setsTitle') || t('setsH'))}</h2><p>${esc(H('setsText') || t('setsP'))}</p></div></div>
    <div class="sets">${sets.map(it => `<div class="set">${it.oldPrice ? `<div class="ribbon">−${Math.round(100 - it.price / it.oldPrice * 100)}%</div>` : ''}
      <h4>${esc(nm(it))}</h4><p>${esc(ds(it))}</p><div class="row"><div class="price">${it.oldPrice ? `<s>${money(it.oldPrice)}</s>` : ''}${money(it.price)}</div><div data-ctl="${it.id}">${qtyCtl(it.id)}</div></div></div>`).join('')}</div>
  </div></section>` : ''}

  <section class="sec paper-sec" id="menu" style="padding-top:60px"><div class="wrap"><div class="sec-h"><div><span class="eyebrow dark">ALTYN</span><h2>${t('menu')}</h2><p>${esc(s.cuisine)}. ${LANG === 'kk' ? 'Тағамдарды себетке қосып, өзіңізбен алуға немесе жеткізуге тапсырыс беріңіз.' : 'Добавляйте блюда в корзину — оформим самовывоз или доставку.'}</p></div></div></div>
    <div id="menu-host">${menuSection()}</div>
  </section>

  <section class="sec dark-sec" id="halls"><div class="wrap">
    <div class="sec-h"><div><span class="eyebrow">${t('halls')}</span><h2>${t('hallsH')}</h2><p>${t('hallsP')}</p></div></div>
    <div class="halls">${D.halls.filter(h => !h.hidden).map(h => `<div class="hall"><div class="im"><img src="${h.photo}" alt="${esc(nm(h))}" loading="lazy"><span class="kind">${h.isNew ? 'NEW · ' : ''}${h.kind === 'vip' ? 'VIP' : (LANG === 'kk' ? 'ЖАЛПЫ' : 'ОБЩИЙ')}</span></div>
      <div class="bd"><h4>${esc(nm(h))}</h4><p>${esc(ds(h))}</p><div class="cap">${h.capacity ? `${t('upTo')} ${h.capacity} ${t('guests')}` : t('capAsk')}</div>
      <button class="btn btn-ghost btn-sm" data-book-hall="${h.id}">${t('bookHall')}</button></div></div>`).join('')}</div>
  </div></section>

  <section class="sec" id="book"><div class="wrap book">
    <div class="book-info"><span class="eyebrow dark">${t('book')}</span><h2 class="serif" style="font-size:clamp(34px,5vw,54px);margin:10px 0 14px;font-weight:600;line-height:1">${t('bookH')}</h2>
      <p class="muted">${t('bookP')}</p>
      <ul>
        <li><i>1</i><span>${LANG === 'kk' ? 'Күнін, уақытын және қонақ санын таңдаңыз' : 'Выберите дату, время и количество гостей'}</span></li>
        <li><i>2</i><span>${LANG === 'kk' ? 'Әкімші хабарласып, мәзір мен залды нақтылайды' : 'Администратор перезвонит и уточнит зал и меню'}</span></li>
        <li><i>3</i><span>${esc(s.deposit)}</span></li>
      </ul>
      <a class="btn btn-wa" href="${waLink('Здравствуйте! Хочу забронировать в ALTYN')}" target="_blank" rel="noopener">${I.wa} WhatsApp</a>
      <a class="btn btn-line" href="tel:${s.phone.replace(/\s/g, '')}" style="margin-left:6px">${I.phone} ${esc(s.phone)}</a>
    </div>
    <div class="card" id="book-card">${bookForm()}</div>
  </div></section>

  <section class="sec dark-sec" id="gallery"><div class="wrap">
    <div class="sec-h"><div><span class="eyebrow">${t('gallery')}</span><h2>${t('galleryH')}</h2><p>${t('galleryP')}</p></div>
      <a class="btn btn-ghost btn-sm" href="https://instagram.com/${esc(s.instagram)}" target="_blank" rel="noopener">${I.ig} @${esc(s.instagram)}</a></div>
    <div class="reels">${D.gallery.filter(g => g.type === 'reel').map(g => `<div class="reel" data-reel="${esc(g.code)}" role="button" tabindex="0" aria-label="${esc(g.caption)}"><img src="${g.cover}" alt="" loading="lazy"><div class="play"><span>${I.play}</span></div><div class="cp">${esc(g.caption)}</div></div>`).join('')}</div>
    <div class="photos">${D.gallery.filter(g => g.type === 'photo').map(g => `<img src="${g.thumb || g.src}" data-full="${g.src}" alt="" loading="lazy">`).join('')}</div>
  </div></section>

  <section class="sec" id="reviews"><div class="wrap">
    <div class="sec-h"><div><span class="eyebrow dark">${t('reviews')}</span><h2>${t('reviewsH')}</h2><p>${t('reviewsP')}</p></div></div>
    <div class="rv-top">
      <div class="score"><div class="big">${s.gisRating}</div><div class="stars">★★★★★</div><p style="margin:8px 0 18px;color:#cdb99a">${s.gisReviews} ${t('reviewsOn')}</p>
        <a class="btn btn-gold btn-block" href="${esc(s.gis)}/tab/reviews" target="_blank" rel="noopener">${t('allReviews')}</a>
        <button class="btn btn-ghost btn-block" style="margin-top:10px" data-rate>${t('leaveReview')}</button></div>
      <div class="rv-list">${reviews.slice(0, 8).map(r => `<div class="rv"><div class="h"><b>${esc(r.name)}</b><span class="stars" style="font-size:14px">${'★'.repeat(r.rating)}</span></div>
        <p>${esc(r.text)}</p><div class="note" style="margin-top:8px">${r.source === '2gis' ? '2ГИС' : 'altyn'} · ${esc((r.created || '').slice(0, 10))}</div>${r.reply ? `<div class="reply">ALTYN: ${esc(r.reply)}</div>` : ''}</div>`).join('')}</div>
    </div>
  </div></section>

  <section class="sec dark-sec" id="contacts"><div class="wrap">
    <div class="sec-h"><div><span class="eyebrow">${t('contacts')}</span><h2>${t('contactsH')}</h2></div></div>
    <div class="contacts"><div class="clist">
      <a class="citem" href="${esc(s.gis)}" target="_blank" rel="noopener"><i>${I.pin}</i><div><small>${t('address')}</small>${esc(s.city)}, ${esc(LANG === 'kk' ? s.addressKk : s.address)}<br><span class="gold">${t('route')} →</span></div></a>
      <div class="citem"><i>${I.clock}</i><div><small>${t('hours')}</small>${esc(s.hours)}, ${t('daily')}</div></div>
      <a class="citem" href="tel:${s.phone.replace(/\s/g, '')}"><i>${I.phone}</i><div><small>${t('call')}</small>${esc(s.phone)}</div></a>
      <a class="citem" href="${waLink('Здравствуйте!')}" target="_blank" rel="noopener"><i>${I.wa}</i><div><small>WhatsApp</small>${esc(s.phone)}</div></a>
      <a class="citem" href="https://instagram.com/${esc(s.instagram)}" target="_blank" rel="noopener"><i>${I.ig}</i><div><small>Instagram</small>@${esc(s.instagram)}</div></a>
    </div>
    <div class="map"><iframe title="Карта" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${s.lon - 0.008}%2C${s.lat - 0.004}%2C${s.lon + 0.008}%2C${s.lat + 0.004}&layer=mapnik&marker=${s.lat}%2C${s.lon}"></iframe></div></div>
  </div></section>

  <footer><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(s.fullName)} · ${esc(s.city)}</span><span><a href="#menu">${t('menu')}</a> · <a href="#book">${t('book')}</a> · <a href="/staff">Персонал</a></span></div></footer>`;
}

let bk = { kind: 'table', hall: '', event: '' };
function bookForm() {
  const today = new Date(); const iso = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  return `<div class="seg"><button data-bkind="table" class="${bk.kind === 'table' ? 'on' : ''}">${t('tableT')}</button><button data-bkind="event" class="${bk.kind === 'event' ? 'on' : ''}">${t('eventT')}</button></div>
  <form class="form" id="bform" novalidate>
    <div class="fld"><label>${t('date')}</label><input name="date" type="date" min="${iso(today)}" value="${bk.date || iso(today)}" required></div>
    <div class="fld"><label>${t('time')}</label><select name="time">${Array.from({ length: 23 }, (_, i) => { const h = 12 + Math.floor(i / 2), m = i % 2 ? '30' : '00'; const v = `${String(h).padStart(2, '0')}:${m}`; return `<option ${v === (bk.time || '19:00') ? 'selected' : ''}>${v}</option>`; }).join('')}</select></div>
    <div class="fld"><label>${t('nGuests')}</label><input name="guests" type="number" min="1" max="500" inputmode="numeric" value="${bk.guests || (bk.kind === 'event' ? 10 : 2)}"></div>
    <div class="fld"><label>${t('hall')}</label><select name="hall"><option value="">${t('anyHall')}</option>${D.halls.filter(h => !h.hidden).map(h => `<option value="${h.id}" ${bk.hall === h.id ? 'selected' : ''}>${esc(nm(h))}${h.capacity ? ` (${t('upTo')} ${h.capacity})` : ''}</option>`).join('')}</select></div>
    ${bk.kind === 'event' ? `<div class="fld full"><label>${t('eventType')}</label><div class="pills">${t('events').map(e => `<button type="button" data-ev="${esc(e)}" class="${bk.event === e ? 'on' : ''}">${esc(e)}</button>`).join('')}</div></div>` : ''}
    <div class="fld"><label>${t('name')}</label><input name="name" autocomplete="name" required></div>
    <div class="fld"><label>${t('phone')}</label><input name="phone" type="tel" autocomplete="tel" placeholder="+7 7__ ___ __ __" required></div>
    <div class="fld full"><label>${t('comment')}</label><textarea name="comment" rows="2" placeholder="${bk.kind === 'event' ? 'Оформление, торт, музыка, детский стол…' : 'У окна, детский стул, тихий столик…'}"></textarea></div>
    ${bk.kind === 'event' ? `<div class="fld full"><label>${t('preorder')}</label><textarea name="preorder" rows="2" placeholder="Бешбармак на 10, плов ханский 2,5 кг, шашлыки…"></textarea></div>` : ''}
    <div class="full"><button class="btn btn-gold btn-block" type="submit">${t('send')}</button><p class="note" style="margin:8px 0 0">${esc(S().deposit)}</p></div>
  </form>`;
}
async function submitBooking(form) {
  const f = Object.fromEntries(new FormData(form));
  Object.assign(bk, { date: f.date, time: f.time, guests: f.guests, hall: f.hall });
  if (!f.name.trim() || f.phone.replace(/\D/g, '').length < 10) return toast(LANG === 'kk' ? 'Аты мен телефонды енгізіңіз' : 'Укажите имя и телефон');
  const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = t('sending');
  try {
    await api('/api/bookings', { method: 'POST', body: { ...f, kind: bk.kind, event: bk.event } });
    const hall = D.halls.find(h => h.id === f.hall);
    const msg = `Здравствуйте! Бронь в ALTYN: ${bk.kind === 'event' ? (bk.event || 'мероприятие') : 'столик'}, ${f.date} в ${f.time}, гостей: ${f.guests}${hall ? ', ' + hall.name : ''}. ${f.name}, ${f.phone}`;
    $('#book-card').innerHTML = `<div class="big-ok">🎉</div><h3 class="serif center" style="font-size:30px;margin:0 0 8px">${t('bookOk')}</h3><p class="center muted">${t('bookOkP')}</p>
      <p class="center"><b>${esc(f.date)} · ${esc(f.time)} · ${esc(f.guests)} ${t('guests')}</b></p>
      <a class="btn btn-wa btn-block" href="${waLink(msg)}" target="_blank" rel="noopener">${I.wa} ${t('dupWa')}</a>`;
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = t('send'); }
}

function tableView() {
  return `<div class="table-mode">
    <header class="thdr"><div class="wrap"><a class="logo" href="/" aria-label="ALTYN">${ORN()}<div><small>MEIRAMHANA</small><b>ALTYN</b></div></a>
      <div class="lang" style="margin-left:auto">${['ru', 'kk'].map(l => `<button data-lang="${l}" class="${LANG === l ? 'on' : ''}">${l === 'kk' ? 'ҚАЗ' : 'РУС'}</button>`).join('')}</div>
      <span class="tbadge" style="margin-left:8px">${t('table')} ${esc(TABLE)}</span></div></header>
    <div class="twelcome"><div class="wrap"><h2>${t('welcome')}</h2><p>${t('welcomeP')}</p><div class="myorders" id="myorders"></div></div></div>
    <div id="menu-host">${menuSection()}</div>
    <div class="wrap" style="padding-block:30px"><button class="btn btn-line btn-block" data-rate>${t('leaveReview')}</button>
      <p class="center note" style="margin-top:14px">${esc(S().fullName)} · ${esc(S().address)} · ${esc(S().phone)}</p></div>
  </div>
  <nav class="dock">
    <button data-waiter>${I.bell}<span>${t('waiter')}</span></button>
    <button data-bill>${I.bill}<span>${t('bill')}</span></button>
    <button class="cartbtn" data-open-cart></button>
  </nav>`;
}

// ---------- category scroll spy ----------
let spyObs;
function bindCatSpy() {
  spyObs?.disconnect();
  const chips = $$('#catchips .chip');
  spyObs = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) {
      const id = e.target.id.slice(4);
      chips.forEach(c => c.classList.toggle('on', c.dataset.cat === id));
      const on = chips.find(c => c.dataset.cat === id); on?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('.cat').forEach(c => spyObs.observe(c));
}

function render() {
  document.documentElement.lang = LANG === 'kk' ? 'kk' : 'ru';
  $('#app').innerHTML = TABLE ? tableView() : siteView();
  refreshCartUI(); bindCatSpy(); renderMyOrdersChip();
  if (!TABLE && location.pathname === '/menu') setTimeout(() => $('#menu')?.scrollIntoView(), 50);
  if (!TABLE && location.pathname === '/book') setTimeout(() => $('#book')?.scrollIntoView(), 50);
}

// ---------- events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('button,a,[data-reel],[data-open-dish],img[data-full],.ov');
  if (!el) return;
  const d = el.dataset;
  if (el.matches('.ov') && e.target === el) return closeSheet();
  if (d.close !== undefined) return closeSheet();
  if (d.lang) { LANG = d.lang; store.set('altyn.lang', LANG); return render(); }
  if (d.burger !== undefined) return $('#nav').classList.toggle('open');
  if (el.closest('#nav') && el.tagName === 'A') $('#nav').classList.remove('open');
  if (d.add) { e.stopPropagation(); setQty(d.add, (cart[d.add] || 0) + 1); if (!TABLE && cartCount() === 1) toast('Добавлено в корзину'); return; }
  if (d.addClose) { setQty(d.addClose, (cart[d.addClose] || 0) + 1); return closeSheet(); }
  if (d.inc !== undefined || d.dec !== undefined) { e.stopPropagation(); const id = el.closest('.qty').dataset.id; return setQty(id, (cart[id] || 0) + (d.inc !== undefined ? 1 : -1)); }
  if (d.openDish && !e.target.closest('.rt')) return openDish(d.openDish);
  if (d.openCart !== undefined) return cartCount() || !TABLE ? renderCartSheet() : toast(t('empty'));
  if (d.otype) { checkout.type = d.otype; store.set('altyn.checkout', checkout); return renderCartSheet(); }
  if (d.submitOrder !== undefined) return submitOrder(el);
  if (d.track !== undefined) return openTrack();
  if (d.cat) { const c = $('#cat-' + d.cat); if (c) window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - (TABLE ? 190 : 200), behavior: 'smooth' }); return; }
  if (d.tag) { filt.tag = filt.tag === d.tag ? '' : d.tag; return rerenderMenu(); }
  if (d.bkind) { bk.kind = d.bkind; $('#book-card').innerHTML = bookForm(); return; }
  if (d.ev) { bk.event = d.ev; $$('[data-ev]').forEach(b => b.classList.toggle('on', b === el)); return; }
  if (d.bookHall) { bk.hall = d.bookHall; bk.kind = D.halls.find(h => h.id === d.bookHall)?.kind === 'vip' ? 'event' : bk.kind; $('#book-card').innerHTML = bookForm(); return $('#book').scrollIntoView({ behavior: 'smooth' }); }
  if (d.online !== undefined) { setTimeout(() => toast(LANG === 'kk' ? 'Тағамдарды «+» арқылы қосыңыз' : 'Добавляйте блюда кнопкой «+»'), 600); return; }
  if (d.reel) return sheet('reel', 'Instagram', `<iframe src="https://www.instagram.com/reel/${encodeURIComponent(d.reel)}/embed" style="width:100%;height:min(74vh,720px);border:0;border-radius:14px;background:#000" allowfullscreen loading="lazy"></iframe>`);
  if (d.full) return sheet('photo', 'ALTYN', `<img src="${d.full}" alt="" style="width:100%;border-radius:14px">`);
  if (d.rate !== undefined) return openRate();
  if (d.waiter !== undefined) return callWaiter('waiter');
  if (d.bill !== undefined) return openBill();
  if (d.kaspi) return openKaspi(+d.kaspi);
  if (d.callbill) { closeSheet(); return callWaiter('bill', { amount: +d.callbill }); }
  if (d.paid) { callWaiter('paid', { amount: +d.paid }); toast(t('paidThanks')); return setTimeout(openRate, 900); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('.ov')) closeSheet();
  if (e.key === 'Enter' && e.target.matches('[data-reel]')) e.target.click();
});
document.addEventListener('input', e => {
  if (e.target.id === 'q') { filt.q = e.target.value; clearTimeout(rerenderMenu.t); rerenderMenu.t = setTimeout(() => {
    const list = $('#menu-list'); if (!list) return;
    const tmp = document.createElement('div'); tmp.innerHTML = menuSection(); list.innerHTML = $('#menu-list', tmp).innerHTML; refreshCartUI(); bindCatSpy();
  }, 120); }
});
document.addEventListener('submit', e => { if (e.target.id === 'bform') { e.preventDefault(); submitBooking(e.target); } });

// ---------- boot ----------
(async function boot() {
  try { D = await api('/api/data'); }
  catch { $('#app').innerHTML = `<div class="wrap" style="padding:60px 20px"><h2 class="serif">ALTYN</h2><p>Не удалось загрузить меню. Обновите страницу или позвоните: <a href="tel:+77772504878">+7 777 250 48 78</a></p></div>`; return; }
  // вычищаем из корзины то, чего больше нет в меню
  for (const id of Object.keys(cart)) if (!item(id)) delete cart[id];
  render(); pollOrders();
  setInterval(pollOrders, 12000);
  if (TABLE) setInterval(async () => { try { const d = await api('/api/data'); D = d; } catch {} }, 60000);
  if ('serviceWorker' in navigator && !TABLE) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
})();
