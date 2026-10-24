import * as matrixcs from 'matrix-js-sdk';
import { hydrateIcons, icon } from './icons.js';
import './style.css';

/* ════════════════════════════════════════════════════════════
   State & constants
   ════════════════════════════════════════════════════════════ */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const SESSION_KEY = 'mst.matrix.session.v1';
const PREFS_KEY = 'mst.matrix.prefs.v1';

const state = {
  client: null,
  userId: null,
  profile: { displayName: '', avatarUrl: null },
  currentRoomId: null,
  roomFilter: '',
  messageFilter: '',
  pendingFiles: [],
  replyingTo: null,
  typing: {},
  demo: false,
  demoRooms: [],
  demoRoomId: null,
  readReceiptTimers: {},
  prefs: {
    theme: 'system',
    accent: 'violet',
    sound: false,
    notify: false,
  },
};

const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒',
  '😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡',
  '🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶',
  '👍','👎','👏','🙌','🤝','🙏','💪','✌️','🤞','👌','🤌','🫶','❤️','🧡','💛','💚',
  '💙','💜','🖤','🤍','💔','❣️','💕','💞','💓','💗','💖','💘','💝','🔥','✨','🎉',
  '🎊','🥳','💯','✅','❌','⭐','🌟','💫','⚡','💥','🎯','🚀','🌈','☀️','🌙','☁️',
];

/* ════════════════════════════════════════════════════════════
   Small utilities
   ════════════════════════════════════════════════════════════ */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str = '') {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

function hueFor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

function initials(name = '?') {
  const cleaned = name.replace(/^[@#]/, '').trim();
  return (cleaned[0] || '#').toUpperCase();
}

function normalizeHomeserver(url) {
  let u = (url || '').trim();
  if (!u) return 'https://matrix.org';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}

function normalizeUserId(id, homeserver) {
  let u = (id || '').trim();
  if (!u) return '';
  if (!u.startsWith('@')) u = '@' + u;
  if (!u.includes(':')) {
    try {
      const host = new URL(homeserver).hostname;
      u += ':' + host;
    } catch {
      u += ':matrix.org';
    }
  }
  return u;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86400000;
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts);
}

function formatListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(now) - startOf(d)) / 86400000;
  if (diff === 0) return formatTime(ts);
  if (diff === 1) return 'Вчера';
  if (diff < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function formatBytes(n = 0) {
  if (!n) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function formatText(text = '') {
  let html = escapeHtml(text);

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(
    /(https?:\/\/[^\s<]+[^\s<.,:;"')\]}])/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
  return html;
}

function mxcToUrl(mxc, w = 800, h = 800, method = 'scale') {
  if (!mxc || !state.client) return '';
  if (!String(mxc).startsWith('mxc://')) return String(mxc);
  try {
    return state.client.mxcUrlToHttp(mxc, w, h, method, true, true, false) || '';
  } catch {
    return '';
  }
}

function avatarHtml(name, mxcOrUrl, cls = '') {
  const hue = hueFor(name || '?');
  const url = mxcOrUrl
    ? (String(mxcOrUrl).startsWith('http') ? mxcOrUrl : mxcToUrl(mxcOrUrl, 96, 96, 'crop'))
    : '';
  if (url) {
    const isMxc = String(mxcOrUrl || '').startsWith('mxc://');
    return `<span class="avatar ${cls}" style="--av:${hue}"><img src="${escapeAttr(url)}" alt="" loading="lazy" ${isMxc ? `data-avatar-mxc="${escapeAttr(mxcOrUrl)}" data-media-w="96" data-media-h="96" data-media-method="crop"` : ''} /></span>`;
  }
  return `<span class="avatar ${cls}" style="--av:${hue}">${escapeHtml(initials(name))}</span>`;
}

function setIcon(el, name) {
  if (!el) return;
  el.innerHTML = icon(name);
}

function debounce(fn, ms = 60) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function toast(message, type = 'info', ms = 3200) {
  const stack = $('#toast-stack');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'sparkles')}<span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = 'opacity .25s, transform .25s';
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ════════════════════════════════════════════════════════════
   Preferences / theme
   ════════════════════════════════════════════════════════════ */
function loadPrefs() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    state.prefs = { ...state.prefs, ...stored };
  } catch {}
  applyTheme();
  applyAccent();
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch {}
}

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function applyTheme() {
  const resolved = resolveTheme(state.prefs.theme);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#0e0e13' : '#f6f5fa';
  $$('#theme-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.themeValue === state.prefs.theme);
  });
}

function applyAccent() {
  document.documentElement.dataset.accent = state.prefs.accent;
  $$('#accent-row .accent-swatch').forEach((b) => {
    b.classList.toggle('active', b.dataset.accentValue === state.prefs.accent);
  });
}

function cycleTheme() {
  const order = ['light', 'dark', 'system'];
  state.prefs.theme = order[(order.indexOf(state.prefs.theme) + 1) % order.length];
  applyTheme();
  savePrefs();
}

/* ════════════════════════════════════════════════════════════
   Session
   ════════════════════════════════════════════════════════════ */
function saveSession(session, remember = true) {
  const json = JSON.stringify(session);
  try {
    if (remember) {
      localStorage.setItem(SESSION_KEY, json);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, json);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {}
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

/* ════════════════════════════════════════════════════════════
   Auth
   ════════════════════════════════════════════════════════════ */
function setAuthError(msg = '') {
  const el = $('#login-error');
  if (el) el.textContent = msg;
}

function setLoginLoading(loading, label = 'Войти') {
  const btn = $('#login-btn');
  if (!btn) return;
  btn.disabled = loading;
  const spinner = $('.spinner', btn);
  const text = $('.btn-label', btn);
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (text) text.textContent = loading ? 'Подключение…' : label;
}

async function waitForPrepared(client, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.off('sync', onSync);
      reject(new Error('Синхронизация заняла слишком много времени. Проверьте homeserver.'));
    }, timeout);

    function onSync(syncState) {
      if (syncState !== 'PREPARED' || settled) return;
      settled = true;
      clearTimeout(timer);
      client.off('sync', onSync);
      resolve();
    }
    client.on('sync', onSync);
  });
}

async function prepareCrypto(client) {
  try {
    if (client.getCrypto?.()) return;
    await client.initRustCrypto({ useIndexedDB: true });
  } catch (err) {
    console.warn('E2EE init unavailable:', err);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  setAuthError('');

  const homeserver = normalizeHomeserver($('#homeserver').value);
  const userId = normalizeUserId($('#user-id').value, homeserver);
  const password = $('#password').value;

  if (!userId || !password) {
    setAuthError('Введите Matrix ID и пароль.');
    return;
  }

  setLoginLoading(true);
  try {
    const client = matrixcs.createClient({ baseUrl: homeserver, userId });
    await client.loginWithPassword(userId, password);

    state.userId = client.getUserId();
    attachClient(client);
    await prepareCrypto(client);
    const ready = waitForPrepared(client);
    client.startClient({ initialSyncLimit: 40, lazyLoadMembers: true });
    await ready;

    const remember = $('#remember')?.checked !== false;
    saveSession({
      baseUrl: homeserver,
      userId: state.userId,
      accessToken: client.getAccessToken(),
      deviceId: client.getDeviceId(),
    }, remember);

    await finishLogin();
    toast('Добро пожаловать в mst.matrix', 'success');
  } catch (err) {
    console.error(err);
    const code = err?.errcode || err?.data?.errcode || '';
    let msg = err?.message || 'Не удалось войти.';
    if (code === 'M_FORBIDDEN') msg = 'Неверный Matrix ID или пароль.';
    if (code === 'M_USER_DEACTIVATED') msg = 'Этот аккаунт деактивирован.';
    if (/fetch|network|Failed/i.test(msg)) msg = 'Не удалось подключиться к homeserver. Проверьте адрес и CORS.';
    setAuthError(msg);
  } finally {
    setLoginLoading(false);
  }
}

async function restoreSession(session) {
  setLoginLoading(true, 'Войти');
  $('.btn-label', $('#login-btn')).textContent = 'Восстанавливаем сессию…';
  try {
    const client = matrixcs.createClient({
      baseUrl: session.baseUrl,
      userId: session.userId,
      accessToken: session.accessToken,
      deviceId: session.deviceId,
    });
    state.userId = session.userId;
    attachClient(client);
    await prepareCrypto(client);
    const ready = waitForPrepared(client);
    client.startClient({ initialSyncLimit: 40, lazyLoadMembers: true });
    await ready;
    await finishLogin();
  } catch (err) {
    console.warn('Session restore failed', err);
    clearSession();
    try { state.client?.stopClient(); } catch {}
    state.client = null;
    setAuthError('Сессия истекла. Войдите снова.');
  } finally {
    setLoginLoading(false);
    const label = $('.btn-label', $('#login-btn'));
    if (label) label.textContent = 'Войти';
  }
}

async function finishLogin() {
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  await refreshProfile();
  renderRooms();
  const rooms = state.client.getRooms();
  if (rooms.length && !state.currentRoomId) {
    // Do not auto-join a room visually, keep the welcome screen.
  }
}

/* ════════════════════════════════════════════════════════════
   Client listeners
   ════════════════════════════════════════════════════════════ */
function attachClient(client) {
  state.client = client;

  client.on('Room.timeline', (event, room, toStartOfTimeline) => {
    if (!room) return;
    const type = event.getType();

    if (type === 'm.typing') {
      const ids = (event.getContent().user_ids || []).filter((id) => id !== state.userId);
      state.typing[room.roomId] = ids;
      if (room.roomId === state.currentRoomId) renderTyping();
      scheduleRooms();
      return;
    }

    if (type === 'm.room.message' || type === 'm.room.encrypted' || type === 'm.reaction') {
      if (room.roomId === state.currentRoomId && !toStartOfTimeline) {
        scheduleMessages(false);
      }
      scheduleRooms();

      if (!toStartOfTimeline && type !== 'm.reaction') {
        const sender = event.getSender();
        const isNew = Date.now() - event.getTs() < 15000;
        if (isNew && sender !== state.userId) {
          notifyNewMessage(room, event);
        }
        if (room.roomId === state.currentRoomId) {
          scheduleReadReceipt(room);
        }
      }
    }
  });

  client.on('Room', () => scheduleRooms());
  client.on('Room.myMembership', () => scheduleRooms());
  client.on('RoomState.events', (event, roomState) => {
    if (roomState?.roomId === state.currentRoomId) renderRoomHeader();
    scheduleRooms();
  });
  client.on('sync', (syncState) => {
    if (syncState === 'PREPARED' || syncState === 'SYNCING') {
      scheduleRooms();
      if (state.currentRoomId) scheduleMessages(false);
    }
    if (syncState === 'ERROR') {
      console.warn('Matrix sync error');
    }
  });
  client.on('Session.logged_out', () => {
    clearSession();
    showAuth();
    toast('Сессия завершена', 'info');
  });
}

async function refreshProfile() {
  if (!state.client) return;
  const userId = state.client.getUserId();
  const user = state.client.getUser(userId);
  let profile = null;

  try { profile = await state.client.getProfileInfo(userId); } catch {}

  state.profile = {
    displayName:
      profile?.displayname ||
      user?.displayName ||
      userId?.replace(/^@/, '').split(':')[0] ||
      'Вы',
    avatarUrl: profile?.avatar_url || user?.avatarUrl || null,
  };

  const name = state.profile.displayName;
  $('#my-name').textContent = name;
  $('#my-id').textContent = userId || '';
  $('#my-avatar').outerHTML = avatarHtml(name, state.profile.avatarUrl, 'avatar-36').replace(
    '<span class="avatar avatar-36"',
    '<span id="my-avatar" class="avatar avatar-36"'
  );
  $('#settings-name').textContent = name;
  $('#settings-id').textContent = userId || '';
  const settingsAvatar = $('#settings-avatar');
  if (settingsAvatar) settingsAvatar.outerHTML = avatarHtml(name, state.profile.avatarUrl, 'avatar-56').replace(
    '<span class="avatar avatar-56"',
    '<span id="settings-avatar" class="avatar avatar-56"'
  );
  const input = $('#display-name');
  if (input && document.activeElement !== input) input.value = name;
}

/* ════════════════════════════════════════════════════════════
   Room rendering
   ════════════════════════════════════════════════════════════ */
const scheduleRooms = debounce(renderRooms, 50);
const scheduleMessages = debounce((force) => renderMessages(force), 50);

function roomName(room) {
  return room?.name || room?.getDefaultDisplayName?.() || room?.getCanonicalAlias?.() || room?.roomId || 'Комната';
}

function roomAvatarMxc(room) {
  try {
    return room.getAvatarUrl(state.client.getHomeserverUrl(), 96, 96, 'crop') || null;
  } catch {
    return null;
  }
}

function roomPreview(room) {
  const events = room.timeline || [];
  const edits = new Map();
  for (const ev of events) {
    if (ev.getType() !== 'm.room.message') continue;
    const rel = ev.getContent()?.['m.relates_to'];
    if (rel?.rel_type === 'm.replace' && rel.event_id) {
      edits.set(rel.event_id, ev.getContent()?.['m.new_content'] || {});
    }
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.getType() === 'm.reaction') continue;
    if (ev.getType() === 'm.room.encrypted') {
      return { text: 'Зашифрованное сообщение', ts: ev.getTs(), own: false };
    }
    if (ev.getType() !== 'm.room.message') continue;
    const content = ev.getContent() || {};
    if (content['m.relates_to']?.rel_type === 'm.replace') continue;
    let text = edits.get(ev.getId())?.body || content.body || '';
    if (content.msgtype === 'm.image') text = 'Фото';
    else if (content.msgtype === 'm.file') text = 'Файл';
    else if (content.msgtype === 'm.audio') text = 'Аудио';
    else if (content.msgtype === 'm.video') text = 'Видео';
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 90) text = text.slice(0, 90) + '…';
    return { text, ts: ev.getTs(), own: ev.getSender() === state.userId };
  }
  return { text: 'Нет сообщений', ts: room.getLastActiveTimestamp?.() || 0, own: false };
}

function unreadFor(room) {
  try {
    const total = room.getUnreadNotificationCount?.('total') || 0;
    const highlight = room.getUnreadNotificationCount?.('highlight') || 0;
    return { total, highlight };
  } catch {
    return { total: 0, highlight: 0 };
  }
}

function renderRooms() {
  if (!state.client && !state.demo) return;
  const list = $('#room-list');
  if (!list) return;

  let rooms;
  if (state.demo) {
    rooms = state.demoRooms;
  } else {
    rooms = state.client.getRooms().slice().sort((a, b) => {
      return (b.getLastActiveTimestamp?.() || 0) - (a.getLastActiveTimestamp?.() || 0);
    });
  }

  const filter = state.roomFilter.trim().toLowerCase();
  const visible = rooms.filter((room) => {
    const name = state.demo ? room.name : roomName(room);
    return !filter || name.toLowerCase().includes(filter) || (!state.demo && room.roomId.toLowerCase().includes(filter));
  });

  $('#room-count').textContent = String(rooms.length);
  $('#rooms-empty').classList.toggle('hidden', visible.length !== 0);

  if (!visible.length) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = visible
    .map((room) => {
      let id, name, avatar, preview, time, unread, typing;
      if (state.demo) {
        id = room.id;
        name = room.name;
        avatar = avatarHtml(name, null, '');
        const last = room.messages[room.messages.length - 1];
        preview = last ? last.body.replace(/\s+/g, ' ').slice(0, 90) : 'Нет сообщений';
        time = last ? formatListTime(last.ts) : '';
        unread = { total: room.unread || 0, highlight: room.unread ? 1 : 0 };
        typing = false;
      } else {
        id = room.roomId;
        name = roomName(room);
        avatar = avatarHtml(name, roomAvatarMxc(room), '');
        const p = roomPreview(room);
        preview = p.own ? `Вы: ${p.text}` : p.text;
        time = formatListTime(p.ts);
        unread = unreadFor(room);
        typing = (state.typing[room.roomId] || []).length > 0;
      }

      if (typing) preview = '<span class="typing-preview">печатает…</span>';
      else preview = escapeHtml(preview);
      const active = id === state.currentRoomId ? 'active' : '';
      return `
        <button class="room-item ${active}" data-room-id="${escapeAttr(id)}" title="${escapeAttr(name)}">
          ${avatar}
          <span class="room-item-main">
            <span class="room-item-top">
              <span class="room-item-name">${escapeHtml(name)}</span>
              <span class="room-item-time">${escapeHtml(time)}</span>
            </span>
            <span class="room-item-preview">${preview}</span>
          </span>
          <span class="room-item-side">
            ${unread.total ? `<span class="unread-badge">${unread.total > 99 ? '99+' : unread.total}</span>` : ''}
            ${!unread.total && unread.highlight ? '<span class="mention-badge"></span>' : ''}
          </span>
        </button>`;
    })
    .join('');
}

function renderRoomHeader() {
  const room = getCurrentRoom();
  if (!room) return;
  if (state.demo) {
    $('#room-name').textContent = room.name;
    $('#room-sub').textContent = `${room.members.length} участников · ${room.topic}`;
    const av = $('#room-avatar');
    if (av) av.outerHTML = avatarHtml(room.name, null, 'avatar-42').replace(
      '<span class="avatar avatar-42"',
      '<span id="room-avatar" class="avatar avatar-42"'
    );
    return;
  }

  const name = roomName(room);
  const topic = room.getTopic?.() || '';
  const count = room.getJoinedMemberCount?.() || 0;
  $('#room-name').textContent = name;
  $('#room-sub').textContent = [count ? `${count} участников` : '', topic].filter(Boolean).join(' · ') || 'Комната Matrix';
  const av = $('#room-avatar');
  if (av) {
    av.outerHTML = avatarHtml(name, roomAvatarMxc(room), 'avatar-42').replace(
      '<span class="avatar avatar-42"',
      '<span id="room-avatar" class="avatar avatar-42"'
    );
  }
}

function selectRoom(roomId) {
  state.currentRoomId = roomId;
  if (state.demo) state.demoRoomId = roomId;
  state.messageFilter = '';
  $('#chat-search-bar').classList.add('hidden');
  $('#chat-search').value = '';
  $('#empty-state').classList.add('hidden');
  $('#chat-view').classList.remove('hidden');
  renderRoomHeader();
  renderMessages(true);
  renderRooms();
  closeSidebar();
  const room = getCurrentRoom();
  if (room && !state.demo) scheduleReadReceipt(room, true);
  $('#message-input')?.focus();
}

function showEmptyState() {
  state.currentRoomId = null;
  $('#chat-view').classList.add('hidden');
  $('#empty-state').classList.remove('hidden');
  renderRooms();
}

/* ════════════════════════════════════════════════════════════
   Message model
   ════════════════════════════════════════════════════════════ */
function getCurrentRoom() {
  if (!state.currentRoomId) return null;
  if (state.demo) return state.demoRooms.find((r) => r.id === state.currentRoomId) || null;
  return state.client?.getRoom(state.currentRoomId) || null;
}

function buildTimeline(room) {
  if (state.demo) {
    return room.messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      senderName: m.name,
      ts: m.ts,
      msgtype: m.msgtype || 'm.text',
      body: m.body,
      content: m.content || { msgtype: m.msgtype || 'm.text', body: m.body },
      own: !!m.isOwn,
      redacted: false,
      edited: !!m.edited,
      reactions: m.reactions || {},
      encrypted: false,
    }));
  }

  const events = room.timeline || [];
  const edits = new Map();
  const reactionMap = new Map(); // targetId -> Map<key, {count, mine, eventId}>

  for (const ev of events) {
    const type = ev.getType();
    if (type === 'm.room.message') {
      const rel = ev.getContent()?.['m.relates_to'];
      if (rel?.rel_type === 'm.replace' && rel.event_id) {
        const edited = ev.getContent()['m.new_content'] || ev.getContent();
        edits.set(rel.event_id, edited);
      }
    } else if (type === 'm.reaction') {
      const rel = ev.getContent()?.['m.relates_to'];
      if (rel?.rel_type === 'm.annotation' && rel.event_id) {
        if (!reactionMap.has(rel.event_id)) reactionMap.set(rel.event_id, new Map());
        const byKey = reactionMap.get(rel.event_id);
        const key = rel.key || '👍';
        const prev = byKey.get(key) || { count: 0, mine: false, eventId: null };
        prev.count += 1;
        if (ev.getSender() === state.userId) {
          prev.mine = true;
          prev.eventId = ev.getId();
        }
        byKey.set(key, prev);
      }
    }
  }

  const messages = [];
  for (const ev of events) {
    const type = ev.getType();
    if (type !== 'm.room.message' && type !== 'm.room.encrypted') continue;
    const content = ev.getContent() || {};
    const rel = content['m.relates_to'];
    if (rel?.rel_type === 'm.replace') continue;
    if (rel?.rel_type === 'm.thread') continue;
    if (type === 'm.room.message' && !content.msgtype && !ev.isRedacted?.()) continue;

    let finalContent = content;
    const edit = edits.get(ev.getId());
    if (edit) finalContent = { ...content, ...edit };

    const reactionObj = {};
    const rmap = reactionMap.get(ev.getId());
    if (rmap) {
      for (const [key, val] of rmap) reactionObj[key] = val;
    }

    const member = room.getMember?.(ev.getSender());
    messages.push({
      id: ev.getId(),
      sender: ev.getSender(),
      senderName: member?.name || ev.getSender(),
      ts: ev.getTs(),
      msgtype: finalContent.msgtype || (type === 'm.room.encrypted' ? 'm.room.encrypted' : 'm.text'),
      body: finalContent.body || '',
      content: finalContent,
      own: ev.getSender() === state.userId,
      redacted: !!ev.isRedacted?.(),
      edited: !!edit,
      reactions: reactionObj,
      encrypted: type === 'm.room.encrypted',
      decryptionFailure: type === 'm.room.encrypted' && (ev.isDecryptionFailure?.() ?? true),
    });
  }

  return messages;
}

function reactionChips(reactions, targetId) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) return '';
  return `<div class="reactions">${entries
    .map(([key, val]) => {
      return `<button class="reaction ${val.mine ? 'mine' : ''}" data-action="reaction-toggle"
        data-target="${escapeAttr(targetId)}" data-key="${escapeAttr(key)}" data-event="${escapeAttr(val.eventId || '')}">
        <span>${escapeHtml(key)}</span><span class="count">${val.count}</span>
      </button>`;
    })
    .join('')}</div>`;
}

function fileCard(content) {
  const url = mxcToUrl(content.url, 1200, 1200, 'scale');
  const name = content.body || 'Файл';
  const size = formatBytes(content.info?.size);
  return `<a class="file-card" href="${escapeAttr(url || '#')}" target="_blank" rel="noopener noreferrer" download data-file-mxc="${escapeAttr(content.url || '')}" data-file-name="${escapeAttr(name)}">
    <span class="file-ico">${icon('file')}</span>
    <span class="file-meta"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(size)}</small></span>
    <span class="file-dl">${icon('download')}</span>
  </a>`;
}

function messageBodyHtml(msg) {
  if (msg.redacted) return '<span class="msg-redacted">Сообщение удалено</span>';
  if (msg.encrypted && msg.decryptionFailure) {
    return `<span class="msg-redacted">🔒 Зашифрованное сообщение. Для расшифровки нужен ключ устройства.</span>`;
  }

  const c = msg.content || {};
  const url = c.url ? mxcToUrl(c.url, 900, 900, 'scale') : '';

  if (msg.msgtype === 'm.image' && url) {
    const caption = c.body && !/^image/i.test(c.body) && c.body !== 'image' ? `<div class="image-caption">${escapeHtml(c.body)}</div>` : '';
    return `<img class="msg-image" src="${escapeAttr(url)}" alt="${escapeAttr(c.body || 'Изображение')}" loading="lazy" data-action="lightbox" data-src="${escapeAttr(url)}" data-media-mxc="${escapeAttr(c.url || '')}" data-media-w="900" data-media-h="900" data-media-method="scale" />${caption}`;
  }
  if (msg.msgtype === 'm.file') return fileCard(c);
  if (msg.msgtype === 'm.audio' && url) {
    return `<audio controls preload="none" src="${escapeAttr(url)}"></audio>`;
  }
  if (msg.msgtype === 'm.video' && url) {
    return `<video controls preload="metadata" src="${escapeAttr(url)}" style="max-width:100%;border-radius:12px;"></video>`;
  }
  if (msg.msgtype === 'm.emote') {
    return `<em>* ${escapeHtml(msg.senderName)} ${formatText(msg.body)}</em>`;
  }
  if (msg.msgtype === 'm.notice') {
    return `<span class="muted">${formatText(msg.body)}</span>`;
  }
  return formatText(msg.body || '');
}

function messageHtml(msg, grouped) {
  const own = msg.own;
  const name = own ? 'Вы' : msg.senderName || msg.sender;
  const tools = `
    <div class="msg-tools">
      <button class="icon-btn" data-action="reply" data-event="${escapeAttr(msg.id)}" title="Ответить">${icon('reply')}</button>
      <button class="icon-btn" data-action="react" data-event="${escapeAttr(msg.id)}" title="Реакция">${icon('smile')}</button>
      ${own ? `<button class="icon-btn" data-action="edit" data-event="${escapeAttr(msg.id)}" title="Изменить">${icon('edit')}</button>` : ''}
      ${own ? `<button class="icon-btn" data-action="delete" data-event="${escapeAttr(msg.id)}" title="Удалить">${icon('trash')}</button>` : ''}
      <button class="icon-btn" data-action="copy" data-event="${escapeAttr(msg.id)}" title="Копировать">${icon('copy')}</button>
    </div>`;

  return `<div class="msg ${own ? 'own' : ''} ${grouped ? 'grouped' : ''}" data-event-id="${escapeAttr(msg.id)}">
    <div class="msg-avatar">${avatarHtml(msg.senderName || msg.sender)}</div>
    <div class="msg-main">
      <div class="msg-head">
        <span class="msg-sender">${escapeHtml(name)}</span>
        <span class="msg-time">${formatTime(msg.ts)}${msg.edited ? ' · изм.' : ''}</span>
      </div>
      <div class="bubble">${messageBodyHtml(msg)}</div>
      ${reactionChips(msg.reactions, msg.id)}
      ${tools}
    </div>
  </div>`;
}

function renderMessages(forceBottom = false) {
  const room = getCurrentRoom();
  if (!room) return;

  const scroll = $('#message-scroll');
  const messagesEl = $('#messages');
  if (!scroll || !messagesEl) return;

  const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 140;
  let messages = buildTimeline(room);
  if (state.messageFilter) {
    const q = state.messageFilter.toLowerCase();
    messages = messages.filter((m) => `${m.body || ''} ${m.senderName || ''}`.toLowerCase().includes(q));
  }

  let html = '';
  let lastDate = '';
  let lastSender = null;
  let lastTs = 0;

  for (const msg of messages) {
    const date = new Date(msg.ts).toDateString();
    if (date !== lastDate) {
      html += `<div class="date-sep"><span>${formatDateLabel(msg.ts)}</span></div>`;
      lastDate = date;
      lastSender = null;
      lastTs = 0;
    }
    const grouped = lastSender === msg.sender && msg.ts - lastTs < 5 * 60 * 1000;
    html += messageHtml(msg, grouped);
    lastSender = msg.sender;
    lastTs = msg.ts;
  }

  if (!messages.length) {
    html = `<div class="msg-system">${state.messageFilter ? 'Ничего не найдено' : 'Пока нет сообщений. Напишите первым!'}</div>`;
  }

  messagesEl.innerHTML = html;

  if (forceBottom || nearBottom) {
    requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
    });
  }

  if (!state.demo) {
    const last = [...(room.timeline || [])].reverse().find((e) => e.getType() === 'm.room.message');
    if (last) scheduleReadReceipt(room);
  }
}

/* ════════════════════════════════════════════════════════════
   Typing & receipts
   ════════════════════════════════════════════════════════════ */
function renderTyping() {
  const el = $('#typing');
  if (!el) return;
  const ids = state.typing[state.currentRoomId] || [];
  if (!ids.length) {
    el.innerHTML = '';
    return;
  }
  const names = ids.map((id) => {
    const room = getCurrentRoom();
    if (state.demo) return 'Кто-то';
    return room?.getMember?.(id)?.name || id;
  });
  el.innerHTML = `${escapeHtml(names.join(', '))} печатает<span class="dots"><i></i><i></i><i></i></span>`;
}

function scheduleReadReceipt(room, immediate = false) {
  if (!room || state.demo || !state.client) return;
  const roomId = room.roomId;
  const send = () => {
    const events = (room.timeline || []).filter((e) => e.getType() === 'm.room.message');
    const last = events[events.length - 1];
    if (!last) return;
    state.client.sendReadReceipt(last).catch(() => {});
  };
  if (immediate) {
    send();
    return;
  }
  clearTimeout(state.readReceiptTimers[roomId]);
  state.readReceiptTimers[roomId] = setTimeout(send, 800);
}

/* ════════════════════════════════════════════════════════════
   Authenticated media fallback
   ════════════════════════════════════════════════════════════ */
const authMediaCache = new Map();

async function loadAuthenticatedMedia(img) {
  if (!img || !state.client || state.demo) return;
  const mxc = img.dataset.mediaMxc || img.dataset.avatarMxc;
  if (!mxc || img.dataset.authLoading === '1') return;
  img.dataset.authLoading = '1';

  const w = Number(img.dataset.mediaW) || 96;
  const h = Number(img.dataset.mediaH) || 96;
  const method = img.dataset.mediaMethod || 'scale';
  const key = `${mxc}|${w}|${h}|${method}`;
  if (authMediaCache.has(key)) {
    img.src = authMediaCache.get(key);
    return;
  }

  try {
    const url = state.client.mxcUrlToHttp(mxc, w, h, method, true, true, true);
    if (!url) throw new Error('No authenticated media URL');
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${state.client.getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`Media HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    authMediaCache.set(key, objectUrl);
    img.src = objectUrl;
  } catch (err) {
    console.warn('Authenticated media failed', err);
  }
}

async function downloadAuthenticatedFile(link) {
  const mxc = link?.dataset.fileMxc;
  if (!mxc || !state.client || state.demo) return false;
  try {
    const url = state.client.mxcUrlToHttp(mxc, undefined, undefined, undefined, true, true, true);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${state.client.getAccessToken()}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = link.dataset.fileName || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    return true;
  } catch (err) {
    console.warn('File download failed', err);
    return false;
  }
}

/* ════════════════════════════════════════════════════════════
   Notifications
   ════════════════════════════════════════════════════════════ */
function notifyNewMessage(room, event) {
  if (document.hasFocus() && room.roomId === state.currentRoomId) return;

  const sender = room.getMember?.(event.getSender())?.name || event.getSender();
  let body = event.getContent()?.body || 'Новое сообщение';
  if (event.getType() === 'm.room.encrypted') body = 'Зашифрованное сообщение';
  if (event.getContent()?.msgtype === 'm.image') body = 'Фото';
  if (event.getContent()?.msgtype === 'm.file') body = 'Файл';

  if (state.prefs.sound) playBeep();

  if (state.prefs.notify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`${sender} · ${roomName(room)}`, {
        body: String(body).slice(0, 160),
        tag: event.getId(),
        silent: true,
      });
      n.onclick = () => {
        window.focus();
        selectRoom(room.roomId);
        n.close();
      };
    } catch {}
  }
}

let audioContext = null;
function playBeep() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.frequency.value = 620;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
    osc.connect(gain).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.2);
  } catch {}
}

/* ════════════════════════════════════════════════════════════
   Sending
   ════════════════════════════════════════════════════════════ */
let typingSent = false;
let typingStopTimer = null;

function sendTypingState() {
  const roomId = state.currentRoomId;
  if (!roomId || state.demo || !state.client) return;
  if (!typingSent) {
    typingSent = true;
    state.client.sendTyping(roomId, true, 30000).catch(() => {});
  }
  clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(stopTypingState, 4500);
}

function stopTypingState() {
  clearTimeout(typingStopTimer);
  if (!typingSent || !state.currentRoomId || state.demo || !state.client) {
    typingSent = false;
    return;
  }
  typingSent = false;
  state.client.sendTyping(state.currentRoomId, false, 0).catch(() => {});
}

function resizeComposer() {
  const ta = $('#message-input');
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  updateSendButton();
}

function updateSendButton() {
  const ta = $('#message-input');
  const btn = $('#send-btn');
  if (!ta || !btn) return;
  btn.disabled = !ta.value.trim() && state.pendingFiles.length === 0;
}

async function sendMessage() {
  const input = $('#message-input');
  const text = input.value.trim();
  const files = [...state.pendingFiles];
  if (!text && !files.length) return;
  if (!state.currentRoomId) return;

  const replyId = state.replyingTo?.id || null;
  state.replyingTo = null;
  renderReplyBanner();

  input.value = '';
  resizeComposer();
  state.pendingFiles = [];
  renderFilePreview();
  updateSendButton();
  stopTypingState();

  if (state.demo) {
    const room = getCurrentRoom();
    room.messages.push({
      id: `demo-${Date.now()}`,
      sender: '@you:matrix.org',
      name: state.profile.displayName || 'Вы',
      ts: Date.now(),
      body: text || files.map((f) => f.name).join(', '),
      msgtype: 'm.text',
      isOwn: true,
      reactions: {},
    });
    renderMessages(true);
    renderRooms();
    return;
  }

  try {
    if (text) {
      const content = { msgtype: 'm.text', body: text };
      if (replyId) content['m.relates_to'] = { 'm.in_reply_to': { event_id: replyId } };
      await state.client.sendEvent(state.currentRoomId, 'm.room.message', content);
    }

    for (const file of files) {
      const upload = await state.client.uploadContent(file, { name: file.name, type: file.type });
      const contentUri = upload?.content_uri || upload;
      const mime = file.type || 'application/octet-stream';
      let msgtype = 'm.file';
      if (mime.startsWith('image/')) msgtype = 'm.image';
      else if (mime.startsWith('audio/')) msgtype = 'm.audio';
      else if (mime.startsWith('video/')) msgtype = 'm.video';

      const content = {
        msgtype,
        body: file.name,
        url: contentUri,
        info: { mimetype: mime, size: file.size },
      };
      if (msgtype === 'm.image') {
        const dims = await imageSize(file).catch(() => null);
        if (dims) content.info.w = dims.w, content.info.h = dims.h;
      }
      await state.client.sendEvent(state.currentRoomId, 'm.room.message', content);
    }

    renderMessages(true);
  } catch (err) {
    console.error(err);
    toast(`Не удалось отправить: ${err?.message || 'ошибка'}`, 'error');
    input.value = text;
    resizeComposer();
  }
}

function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function renderFilePreview() {
  const el = $('#file-preview');
  if (!el) return;
  el.innerHTML = state.pendingFiles
    .map(
      (f, i) => `<span class="file-chip">${icon('paperclip')}<span>${escapeHtml(f.name)}</span><button class="icon-btn" data-remove-file="${i}" style="width:24px;height:24px;">${icon('x')}</button></span>`
    )
    .join('');
}

function renderReplyBanner() {
  const el = $('#reply-banner');
  if (!el) return;
  if (!state.replyingTo) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  el.innerHTML = `
    <span class="reply-ico">${icon('reply')}</span>
    <span class="reply-content">
      <strong>${escapeHtml(state.replyingTo.name)}</strong>
      <small>${escapeHtml((state.replyingTo.body || '').slice(0, 120))}</small>
    </span>
    <button class="icon-btn" id="reply-cancel" aria-label="Отменить ответ">${icon('x')}</button>`;
  $('#reply-cancel')?.addEventListener('click', () => {
    state.replyingTo = null;
    renderReplyBanner();
  });
}

/* ════════════════════════════════════════════════════════════
   Message actions
   ════════════════════════════════════════════════════════════ */
function findMessage(eventId) {
  const room = getCurrentRoom();
  if (!room) return null;
  return buildTimeline(room).find((m) => m.id === eventId) || null;
}

function openPrompt(title, label, value = '', confirmText = 'Сохранить', multiline = false) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal modal-sm" role="dialog" aria-modal="true">
        <header class="modal-head"><h3>${escapeHtml(title)}</h3><button class="icon-btn" data-prompt-cancel>${icon('x')}</button></header>
        <div class="modal-body">
          <div class="field"><label>${escapeHtml(label)}</label><div class="input-wrap">
            ${multiline
              ? `<textarea class="modal-textarea" rows="4">${escapeHtml(value)}</textarea>`
              : `<input type="text" value="${escapeAttr(value)}" />`}
          </div></div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-prompt-cancel>Отмена</button>
            <button class="btn btn-primary" data-prompt-ok>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input, textarea');
    input?.focus();
    if (input) input.select?.();

    const close = (val) => {
      wrap.remove();
      resolve(val);
    };
    wrap.querySelectorAll('[data-prompt-cancel]').forEach((b) => b.addEventListener('click', () => close(null)));
    wrap.querySelector('[data-prompt-ok]')?.addEventListener('click', () => close(input?.value ?? ''));
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close(null);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && !multiline && !e.shiftKey) {
        e.preventDefault();
        close(input?.value ?? '');
      }
    });
  });
}

function confirmDialog(title, text, confirmText = 'Удалить') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal modal-sm" role="dialog" aria-modal="true">
        <header class="modal-head"><h3>${escapeHtml(title)}</h3><button class="icon-btn" data-confirm-cancel>${icon('x')}</button></header>
        <div class="modal-body">
          <p class="confirm-text">${escapeHtml(text)}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-confirm-cancel>Отмена</button>
            <button class="btn btn-danger-soft" data-confirm-ok>${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = (val) => {
      wrap.remove();
      resolve(val);
    };
    wrap.querySelectorAll('[data-confirm-cancel]').forEach((b) => b.addEventListener('click', () => close(false)));
    wrap.querySelector('[data-confirm-ok]')?.addEventListener('click', () => close(true));
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close(false);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close(false);
    });
  });
}

async function handleMessageAction(action, eventId, el) {
  const msg = findMessage(eventId);
  if (!msg) return;
  const roomId = state.currentRoomId;

  if (action === 'reply') {
    state.replyingTo = { id: msg.id, name: msg.own ? 'Вы' : msg.senderName, body: msg.body };
    renderReplyBanner();
    $('#message-input')?.focus();
    return;
  }

  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(msg.body || '');
      toast('Скопировано', 'success', 1800);
    } catch {
      toast('Не удалось скопировать', 'error');
    }
    return;
  }

  if (action === 'react') {
    openEmojiPicker(el, msg.id);
    return;
  }

  if (action === 'edit') {
    if (!msg.own) return;
    const newText = await openPrompt('Изменить сообщение', 'Новый текст', msg.body, 'Сохранить', true);
    if (newText === null || !newText.trim()) return;
    if (state.demo) {
      msg.body = newText;
      const m = getCurrentRoom().messages.find((x) => x.id === msg.id);
      if (m) m.body = newText, m.edited = true;
      renderMessages(false);
      renderRooms();
      return;
    }
    try {
      await state.client.sendEvent(roomId, 'm.room.message', {
        msgtype: 'm.text',
        body: `* ${newText}`,
        'm.new_content': { msgtype: 'm.text', body: newText },
        'm.relates_to': { rel_type: 'm.replace', event_id: msg.id },
      });
      renderMessages(false);
      scheduleRooms();
    } catch (e) {
      toast('Не удалось изменить сообщение', 'error');
    }
    return;
  }

  if (action === 'delete') {
    if (!msg.own) return;
    const ok = await confirmDialog('Удалить сообщение?', 'Это действие нельзя отменить. Сообщение будет удалено для всех участников.');
    if (!ok) return;
    if (state.demo) {
      const room = getCurrentRoom();
      room.messages = room.messages.filter((m) => m.id !== msg.id);
      renderMessages(false);
      renderRooms();
      return;
    }
    try {
      await state.client.redactEvent(roomId, msg.id, {});
      renderMessages(false);
      scheduleRooms();
      toast('Сообщение удалено', 'success', 1800);
    } catch {
      toast('Не удалось удалить сообщение', 'error');
    }
  }
}

async function toggleReaction(key, targetId, reactionEventId) {
  if (!state.currentRoomId) return;
  if (state.demo) {
    const msg = findMessage(targetId);
    if (!msg) return;
    const current = msg.reactions[key] || { count: 0, mine: false };
    if (current.mine) {
      if (current.count <= 1) delete msg.reactions[key];
      else msg.reactions[key] = { count: current.count - 1, mine: false };
    } else {
      msg.reactions[key] = { count: current.count + 1, mine: true };
    }
    renderMessages(false);
    renderRooms();
    return;
  }

  try {
    if (reactionEventId) {
      await state.client.redactEvent(state.currentRoomId, reactionEventId, {});
    } else {
      await state.client.sendEvent(state.currentRoomId, 'm.reaction', {
        'm.relates_to': { rel_type: 'm.annotation', event_id: targetId, key },
      });
    }
    renderMessages(false);
    scheduleRooms();
  } catch {
    toast('Не удалось поставить реакцию', 'error');
  }
}

/* ════════════════════════════════════════════════════════════
   Emoji picker
   ════════════════════════════════════════════════════════════ */
function openEmojiPicker(anchor, targetEventId = null, mode = 'insert') {
  const pop = $('#emoji-pop');
  if (!pop) return;

  if (!pop.classList.contains('hidden')) {
    pop.classList.add('hidden');
    return;
  }

  pop.innerHTML = `
    <h5>${targetEventId ? 'Реакция' : 'Эмодзи'}</h5>
    <div class="emoji-grid">${EMOJIS.map((e) => `<button data-emoji="${escapeAttr(e)}">${e}</button>`).join('')}</div>`;
  pop.classList.remove('hidden');

  const rect = anchor?.getBoundingClientRect();
  const width = pop.offsetWidth || 300;
  const height = pop.offsetHeight || 330;
  let left = rect ? rect.left : window.innerWidth / 2 - width / 2;
  let top = rect ? rect.bottom + 8 : window.innerHeight / 2;
  if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
  if (top + height > window.innerHeight - 12) top = (rect ? rect.top - height - 8 : window.innerHeight - height - 12);
  pop.style.left = Math.max(12, left) + 'px';
  pop.style.top = Math.max(12, top) + 'px';

  pop.querySelectorAll('[data-emoji]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      pop.classList.add('hidden');
      if (targetEventId) {
        const msg = findMessage(targetEventId);
        const existing = msg?.reactions?.[emoji];
        toggleReaction(emoji, targetEventId, existing?.mine ? existing.eventId : null);
      } else {
        insertAtCursor($('#message-input'), emoji);
      }
    });
  });
}

function insertAtCursor(el, text) {
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
  resizeComposer();
}

/* ════════════════════════════════════════════════════════════
   Room management
   ════════════════════════════════════════════════════════════ */
async function createRoom() {
  const name = $('#new-room-name').value.trim();
  const topic = $('#new-room-topic').value.trim();
  const isPublic = $('#new-room-public').checked;
  const error = $('#new-room-error');
  error.textContent = '';
  if (!name) {
    error.textContent = 'Введите название комнаты.';
    return;
  }

  if (state.demo) {
    const room = {
      id: `!demo-${Date.now()}:matrix.org`,
      name,
      topic: topic || 'Новая комната',
      unread: 0,
      members: [{ name: state.profile.displayName || 'Вы', id: '@you:matrix.org', power: 100 }],
      messages: [],
    };
    state.demoRooms.unshift(room);
    closeModals();
    renderRooms();
    selectRoom(room.id);
    return;
  }

  try {
    const roomId = await state.client.createRoom({
      name,
      topic: topic || undefined,
      visibility: isPublic ? 'public' : 'private',
      preset: isPublic ? (matrixcs.Preset?.PublicChat || 'public_chat') : (matrixcs.Preset?.PrivateChat || 'private_chat'),
    });
    closeModals();
    $('#new-room-name').value = '';
    $('#new-room-topic').value = '';
    renderRooms();
    selectRoom(roomId);
    toast('Комната создана', 'success');
  } catch (e) {
    console.error(e);
    error.textContent = e?.message || 'Не удалось создать комнату.';
  }
}

async function joinRoom() {
  const value = $('#join-room-id').value.trim();
  const error = $('#new-room-error');
  error.textContent = '';
  if (!value) {
    error.textContent = 'Введите адрес или ID комнаты.';
    return;
  }
  if (state.demo) {
    toast('В демо-режиме присоединение недоступно', 'info');
    return;
  }
  try {
    const roomId = await state.client.joinRoom(value);
    closeModals();
    $('#join-room-id').value = '';
    renderRooms();
    selectRoom(roomId);
    toast('Вы присоединились к комнате', 'success');
  } catch (e) {
    console.error(e);
    error.textContent = e?.message || 'Не удалось войти в комнату.';
  }
}

async function leaveRoom(roomId) {
  if (state.demo) {
    state.demoRooms = state.demoRooms.filter((r) => r.id !== roomId);
    showEmptyState();
    renderRooms();
    closeModals();
    return;
  }
  const ok = await confirmDialog('Покинуть комнату?', 'Вы больше не будете получать сообщения из этой комнаты.', 'Покинуть');
  if (!ok) return;
  try {
    await state.client.leave(roomId);
    closeModals();
    showEmptyState();
    renderRooms();
    toast('Вы покинули комнату', 'success');
  } catch {
    toast('Не удалось покинуть комнату', 'error');
  }
}

/* ════════════════════════════════════════════════════════════
   Modals
   ════════════════════════════════════════════════════════════ */
function openModal(id) {
  const backdrop = $('#modal-backdrop');
  backdrop.classList.remove('hidden');
  $$('.modal', backdrop).forEach((m) => m.classList.add('hidden'));
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeModals() {
  $('#modal-backdrop')?.classList.add('hidden');
  $$('.modal').forEach((m) => m.classList.add('hidden'));
  const emoji = $('#emoji-pop');
  emoji?.classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function openSettings() {
  const displayName = state.profile.displayName || (state.demo ? 'Гость' : 'Вы');
  $('#settings-name').textContent = displayName;
  $('#settings-id').textContent = state.userId || '@you:matrix.org';
  const nameInput = $('#display-name');
  if (nameInput) nameInput.value = displayName;
  const settingsAvatar = $('#settings-avatar');
  if (settingsAvatar) {
    settingsAvatar.outerHTML = avatarHtml(displayName, state.profile.avatarUrl, 'avatar-56').replace(
      '<span class="avatar avatar-56"',
      '<span id="settings-avatar" class="avatar avatar-56"'
    );
  }
  applyTheme();
  applyAccent();
  $('#sound-toggle').checked = state.prefs.sound;
  $('#notify-toggle').checked = state.prefs.notify;
  openModal('settings-modal');
}

function openNewRoom() {
  $('#new-room-error').textContent = '';
  openModal('new-room-modal');
}

function openRoomInfo() {
  const room = getCurrentRoom();
  if (!room) return;

  if (state.demo) {
    $('#room-info-body').innerHTML = `
      <div class="profile-hero">
        ${avatarHtml(room.name, null, 'avatar-72')}
        <strong>${escapeHtml(room.name)}</strong>
        <small>${escapeHtml(room.topic)}</small>
      </div>
      <div class="info-list">
        <div class="info-row">${icon('hash')}<span>${escapeHtml(room.id)}</span></div>
        <div class="info-row">${icon('users')}<span>${room.members.length} участников</span></div>
      </div>
      <div class="member-list">${room.members.map((m) => `
        <div class="member-row">${avatarHtml(m.name)}<span>${escapeHtml(m.name)}</span><small>${m.power >= 100 ? 'Админ' : ''}</small></div>`).join('')}</div>
      <button class="btn btn-danger-soft btn-block" style="margin-top:16px;" data-leave-room="${escapeAttr(room.id)}">${icon('logout')} Покинуть комнату</button>`;
  } else {
    const name = roomName(room);
    const alias = room.getCanonicalAlias?.() || '';
    const topic = room.getTopic?.() || 'Без темы';
    const members = room.getJoinedMembers?.() || [];
    const myMember = room.getMember?.(state.userId);
    const canLeave = myMember?.membership === 'join';
    $('#room-info-body').innerHTML = `
      <div class="profile-hero">
        ${avatarHtml(name, roomAvatarMxc(room), 'avatar-72')}
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(topic)}</small>
      </div>
      <div class="info-list">
        ${alias ? `<div class="info-row">${icon('link')}<span>${escapeHtml(alias)}</span></div>` : ''}
        <div class="info-row">${icon('hash')}<span>${escapeHtml(room.roomId)}</span></div>
        <div class="info-row">${icon('users')}<span>${members.length} участников</span></div>
      </div>
      <div class="settings-label">Участники</div>
      <div class="member-list">
        ${members.slice(0, 80).map((m) => `
          <div class="member-row">${avatarHtml(m.name, m.getAvatarUrl?.(state.client.getHomeserverUrl(), 64, 64, 'crop'))}
          <span>${escapeHtml(m.name)}${m.userId === state.userId ? ' (вы)' : ''}</span><small>${m.powerLevel >= 100 ? 'Админ' : ''}</small></div>`).join('')}
      </div>
      ${canLeave ? `<button class="btn btn-danger-soft btn-block" style="margin-top:16px;" data-leave-room="${escapeAttr(room.roomId)}">${icon('logout')} Покинуть комнату</button>` : ''}`;
  }
  openModal('room-info-modal');
}

function openProfileModal() {
  const name = state.profile.displayName || 'Вы';
  const id = state.userId || '@you:matrix.org';
  const rooms = state.demo ? state.demoRooms.length : (state.client?.getRooms()?.length || 0);
  const joinedRooms = state.demo ? rooms : (state.client?.getRooms()?.filter((r) => r.getMyMembership?.() === 'join').length || 0);
  $('#profile-body').innerHTML = `
    <div class="profile-hero">
      ${avatarHtml(name, state.profile.avatarUrl, 'avatar-72')}
      <strong>${escapeHtml(name)}</strong>
      <small>${escapeHtml(id)}</small>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><strong>${rooms}</strong><small>комнат</small></div>
      <div class="profile-stat"><strong>${joinedRooms}</strong><small>активных</small></div>
    </div>
    <div class="info-list">
      <div class="info-row">${icon('shield')}<span>Клиент mst.matrix</span></div>
      <div class="info-row">${icon('server')}<span>${escapeHtml(state.demo ? 'Демо-режим' : state.client?.getHomeserverUrl() || '')}</span></div>
      ${!state.demo ? `<div class="info-row">${icon('monitor')}<span>Устройство ${escapeHtml(state.client?.getDeviceId() || '—')}</span></div>` : ''}
    </div>
    <button class="btn btn-soft btn-block" style="margin-top:16px;" id="copy-user-id">${icon('copy')} Скопировать Matrix ID</button>`;
  openModal('profile-modal');
  $('#copy-user-id')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast('Matrix ID скопирован', 'success', 1800);
    } catch {
      toast('Не удалось скопировать', 'error');
    }
  });
}

/* ════════════════════════════════════════════════════════════
   Sidebar mobile
   ════════════════════════════════════════════════════════════ */
function openSidebar() {
  $('#app-view')?.classList.add('sidebar-open');
}

function closeSidebar() {
  $('#app-view')?.classList.remove('sidebar-open');
}

/* ════════════════════════════════════════════════════════════
   Demo mode
   ════════════════════════════════════════════════════════════ */
function buildDemoData() {
  const now = Date.now();
  const min = 60 * 1000;
  const day = 24 * 60 * min;

  state.demoRooms = [
    {
      id: '!design:matrix.org',
      name: 'Design Crew',
      topic: 'Продуктовый дизайн и интерфейсы',
      unread: 3,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 100 },
        { name: 'Алина Морозова', id: '@alina:matrix.org', power: 50 },
        { name: 'Максим Волков', id: '@max:matrix.org', power: 0 },
        { name: 'Nikita', id: '@nikita:matrix.org', power: 0 },
      ],
      messages: [
        { id: 'd1', sender: '@alina:matrix.org', name: 'Алина Морозова', ts: now - 2 * day, body: 'Привет! Собрала первые макеты нового мессенджера. Хочу показать вам направление.', isOwn: false, reactions: {} },
        { id: 'd2', sender: '@max:matrix.org', name: 'Максим Волков', ts: now - 2 * day + 4 * min, body: 'Круто! Особенно нравится, как получились пузыри сообщений и цветовая система.', isOwn: false, reactions: { '🔥': { count: 2, mine: false }, '👍': { count: 1, mine: true } } },
        { id: 'd3', sender: '@you:matrix.org', name: 'Вы', ts: now - 2 * day + 9 * min, body: 'Согласен. Давайте только сделаем акцент на читаемости и добавим больше воздуха в списке чатов.', isOwn: true, reactions: {} },
        { id: 'd4', sender: '@nikita:matrix.org', name: 'Nikita', ts: now - day - 40 * min, body: 'Я подготовил прототип тёмной темы. Выглядит очень мягко — без чистого чёрного.', isOwn: false, reactions: {} },
        { id: 'd5', sender: '@alina:matrix.org', name: 'Алина Морозова', ts: now - 55 * min, body: 'Отлично! К вечеру соберу финальную версию и закину в Figma. Нужно ещё проверить мобильную версию.', isOwn: false, reactions: { '❤️': { count: 3, mine: true } } },
        { id: 'd6', sender: '@you:matrix.org', name: 'Вы', ts: now - 18 * min, body: 'Супер. Я как раз доделал адаптив — на телефоне сайдбар уезжает, а композер остаётся внизу. Попробуй!', isOwn: true, reactions: { '🎉': { count: 2, mine: false } } },
      ],
    },
    {
      id: '!matrix:matrix.org',
      name: 'Matrix Community',
      topic: 'Официальное сообщество Matrix',
      unread: 12,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 0 },
        { name: 'Sarah', id: '@sarah:matrix.org', power: 100 },
        { name: 'devnull', id: '@devnull:matrix.org', power: 50 },
      ],
      messages: [
        { id: 'm1', sender: '@sarah:matrix.org', name: 'Sarah', ts: now - 3 * day, body: 'Matrix 1.12 уже здесь! Улучшенная аутентификация медиа и новые возможности для клиентов.', isOwn: false, reactions: { '🚀': { count: 8, mine: true } } },
        { id: 'm2', sender: '@devnull:matrix.org', name: 'devnull', ts: now - 2 * day, body: 'Кто-нибудь уже тестировал authenticated media? Интересно, как это влияет на старые клиенты.', isOwn: false, reactions: {} },
        { id: 'm3', sender: '@you:matrix.org', name: 'Вы', ts: now - day, body: 'Да, в mst.matrix добавил поддержку. Работает заметно стабильнее.', isOwn: true, reactions: {} },
      ],
    },
    {
      id: '!aurora:matrix.org',
      name: 'Проект «Аврора»',
      topic: 'Внутренний проект · Q4',
      unread: 0,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 100 },
        { name: 'Ольга', id: '@olga:matrix.org', power: 50 },
      ],
      messages: [
        { id: 'a1', sender: '@olga:matrix.org', name: 'Ольга', ts: now - 5 * day, body: 'Добавила тесты для синхронизации. Покрытие выросло до 87%.', isOwn: false, reactions: { '✅': { count: 1, mine: false } } },
        { id: 'a2', sender: '@you:matrix.org', name: 'Вы', ts: now - 4 * day, body: 'Отлично, спасибо! Осталось проверить обработку ошибок при потере сети.', isOwn: true, reactions: {} },
      ],
    },
    {
      id: '!sophia:matrix.org',
      name: 'София',
      topic: 'Личные сообщения',
      unread: 1,
      members: [
        { name: 'Вы', id: '@you:matrix.org', power: 0 },
        { name: 'София', id: '@sophia:matrix.org', power: 0 },
      ],
      messages: [
        { id: 's1', sender: '@sophia:matrix.org', name: 'София', ts: now - 35 * min, body: 'Привет! Посмотрела клиент — выглядит правда современно. Особенно понравилась тёмная тема ✨', isOwn: false, reactions: {} },
        { id: 's2', sender: '@you:matrix.org', name: 'Вы', ts: now - 30 * min, body: 'Спасибо! Ещё добавил акцентные цвета и настройки профиля.', isOwn: true, reactions: { '😊': { count: 1, mine: false } } },
        { id: 's3', sender: '@sophia:matrix.org', name: 'София', ts: now - 12 * min, body: 'Класс. А можно как-то попробовать без аккаунта?', isOwn: false, reactions: {} },
      ],
    },
  ];

  state.profile = { displayName: 'Вы', avatarUrl: null };
  state.userId = '@you:matrix.org';
  state.demo = true;
}

function enterDemo() {
  buildDemoData();
  document.documentElement.dataset.demo = 'true';
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#my-name').textContent = 'Вы';
  $('#my-id').textContent = '@you:matrix.org';
  const myAvatar = $('#my-avatar');
  if (myAvatar) myAvatar.outerHTML = avatarHtml('Вы', null, 'avatar-36').replace(
    '<span class="avatar avatar-36"',
    '<span id="my-avatar" class="avatar avatar-36"'
  );
  renderRooms();
  selectRoom(state.demoRooms[0].id);
  toast('Демо-режим: интерфейс без подключения к серверу', 'info', 5000);
}

function exitDemo() {
  state.demo = false;
  state.demoRooms = [];
  state.currentRoomId = null;
  location.hash = '';
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
}

/* ════════════════════════════════════════════════════════════
   Logout
   ════════════════════════════════════════════════════════════ */
async function logout() {
  if (state.demo) {
    exitDemo();
    return;
  }
  const ok = await confirmDialog('Выйти из аккаунта?', 'Сессия будет завершена на этом устройстве.', 'Выйти');
  if (!ok) return;

  try { await state.client?.logout(true); } catch {}
  try { state.client?.stopClient(); } catch {}
  clearSession();
  state.client = null;
  state.userId = null;
  state.currentRoomId = null;
  state.profile = { displayName: '', avatarUrl: null };
  state.typing = {};
  closeModals();
  showAuth();
  toast('Вы вышли из аккаунта', 'info');
}

function showAuth() {
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
  $('#password').value = '';
  $('#login-error').textContent = '';
  state.currentRoomId = null;
  $('#chat-view').classList.add('hidden');
  $('#empty-state').classList.remove('hidden');
}

/* ════════════════════════════════════════════════════════════
   Event bindings
   ════════════════════════════════════════════════════════════ */
function bindEvents() {
  $('#login-form').addEventListener('submit', handleLogin);

  $('#toggle-password').addEventListener('click', () => {
    const input = $('#password');
    const btn = $('#toggle-password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    setIcon(btn, show ? 'eye-off' : 'eye');
    btn.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });

  $('#advanced-toggle').addEventListener('click', () => {
    $('#advanced-box').classList.toggle('hidden');
  });

  $('#logout-btn').addEventListener('click', logout);
  $('#logout-btn-2').addEventListener('click', logout);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#empty-settings-btn').addEventListener('click', openSettings);
  $('#profile-btn').addEventListener('click', openProfileModal);

  $('#new-room-btn').addEventListener('click', openNewRoom);
  $('#empty-new-room').addEventListener('click', openNewRoom);
  $('#empty-new-room-2').addEventListener('click', openNewRoom);

  $('#room-search').addEventListener('input', (e) => {
    state.roomFilter = e.target.value;
    renderRooms();
  });

  $('#room-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-room-id]');
    if (item) selectRoom(item.dataset.roomId);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $('#room-search')?.focus();
    }
    if (e.key === 'Escape') {
      closeModals();
      closeLightbox();
      $('#emoji-pop')?.classList.add('hidden');
      closeSidebar();
    }
  });

  // Sidebar / mobile
  $('#menu-btn').addEventListener('click', openSidebar);
  $('#sidebar-scrim').addEventListener('click', closeSidebar);

  // Header
  $('#chat-search-btn').addEventListener('click', () => {
    const bar = $('#chat-search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) $('#chat-search').focus();
    else {
      $('#chat-search').value = '';
      state.messageFilter = '';
      renderMessages(false);
    }
  });
  $('#chat-search-close').addEventListener('click', () => {
    $('#chat-search-bar').classList.add('hidden');
    $('#chat-search').value = '';
    state.messageFilter = '';
    renderMessages(false);
  });
  $('#chat-search').addEventListener('input', (e) => {
    state.messageFilter = e.target.value.trim();
    renderMessages(false);
  });
  $('#room-info-btn').addEventListener('click', openRoomInfo);
  $('#room-info-btn-2').addEventListener('click', openRoomInfo);

  // Composer
  $('#message-input').addEventListener('input', () => {
    resizeComposer();
    sendTypingState();
  });
  $('#message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $('#send-btn').addEventListener('click', sendMessage);

  $('#attach-btn').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', (e) => {
    const files = [...e.target.files];
    state.pendingFiles.push(...files);
    e.target.value = '';
    renderFilePreview();
    updateSendButton();
    $('#message-input').focus();
  });

  $('#emoji-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openEmojiPicker(e.currentTarget);
  });

  // File preview removal
  $('#file-preview').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-file]');
    if (!btn) return;
    state.pendingFiles.splice(Number(btn.dataset.removeFile), 1);
    renderFilePreview();
    updateSendButton();
  });

  // Messages
  $('#messages').addEventListener('click', async (e) => {
    const fileLink = e.target.closest('[data-file-mxc]');
    if (fileLink && fileLink.dataset.fileMxc) {
      e.preventDefault();
      const ok = await downloadAuthenticatedFile(fileLink);
      if (!ok) window.open(fileLink.href, '_blank', 'noopener');
      return;
    }

    const lightboxImg = e.target.closest('[data-action="lightbox"]');
    if (lightboxImg) {
      openLightbox(lightboxImg.currentSrc || lightboxImg.dataset.src);
      return;
    }

    const reactionBtn = e.target.closest('[data-action="reaction-toggle"]');
    if (reactionBtn) {
      toggleReaction(
        reactionBtn.dataset.key,
        reactionBtn.closest('.msg')?.dataset.eventId,
        reactionBtn.dataset.event || null
      );
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    if (['reply', 'react', 'edit', 'delete', 'copy'].includes(action)) {
      handleMessageAction(action, actionBtn.dataset.event, actionBtn);
    }
  });

  // Modals
  $('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModals();
    if (e.target.closest('[data-close-modal]')) closeModals();
  });

  // Settings
  $('#theme-switch').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-value]');
    if (!btn) return;
    state.prefs.theme = btn.dataset.themeValue;
    applyTheme();
    savePrefs();
  });

  $('#accent-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accent-value]');
    if (!btn) return;
    state.prefs.accent = btn.dataset.accentValue;
    applyAccent();
    savePrefs();
  });

  $('#save-name-btn').addEventListener('click', async () => {
    const value = $('#display-name').value.trim();
    if (!value) return;
    if (state.demo) {
      state.profile.displayName = value;
      $('#my-name').textContent = value;
      $('#settings-name').textContent = value;
      toast('Имя сохранено (демо)', 'success', 1800);
      return;
    }
    try {
      await state.client.setDisplayName(value);
      state.profile.displayName = value;
      await refreshProfile();
      toast('Имя обновлено', 'success');
    } catch {
      toast('Не удалось обновить имя', 'error');
    }
  });

  $('#sound-toggle').addEventListener('change', (e) => {
    state.prefs.sound = e.target.checked;
    savePrefs();
    if (e.target.checked) playBeep();
  });

  $('#notify-toggle').addEventListener('change', async (e) => {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        e.target.checked = false;
        toast('Уведомления не разрешены в браузере', 'error');
        state.prefs.notify = false;
        savePrefs();
        return;
      }
    }
    state.prefs.notify = e.target.checked;
    savePrefs();
  });

  // New room
  $('#new-room-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    $$('#new-room-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    $('#tab-create').classList.toggle('hidden', btn.dataset.tab !== 'create');
    $('#tab-join').classList.toggle('hidden', btn.dataset.tab !== 'join');
  });
  $('#create-room-submit').addEventListener('click', createRoom);
  $('#join-room-submit').addEventListener('click', joinRoom);

  // Room leave (delegated)
  $('#room-info-body').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-leave-room]');
    if (btn) leaveRoom(btn.dataset.leaveRoom);
  });

  // Demo link
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-demo-link]');
    if (link) {
      e.preventDefault();
      enterDemo();
    }
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.prefs.theme === 'system') applyTheme();
  });
}

function openLightbox(src) {
  if (!src) return;
  const box = $('#lightbox');
  const img = $('#lightbox-img');
  img.src = src;
  box.classList.remove('hidden');
}

function closeLightbox() {
  const box = $('#lightbox');
  if (!box || box.classList.contains('hidden')) return;
  box.classList.add('hidden');
  $('#lightbox-img').src = '';
}

/* ════════════════════════════════════════════════════════════
   Init
   ════════════════════════════════════════════════════════════ */
async function init() {
  hydrateIcons();
  loadPrefs();

  // Extra elements must exist before event bindings are attached.
  const composerWrap = $('.composer-wrap');
  if (composerWrap) {
    const reply = document.createElement('div');
    reply.className = 'reply-banner hidden';
    reply.id = 'reply-banner';
    composerWrap.insertBefore(reply, composerWrap.firstChild);

    const filePreview = document.createElement('div');
    filePreview.className = 'file-preview';
    filePreview.id = 'file-preview';
    composerWrap.insertBefore(filePreview, composerWrap.querySelector('.composer'));
  }

  // The lightbox and emoji picker must not inherit the hidden modal backdrop.
  const lightbox = $('#lightbox');
  const emojiPop = $('#emoji-pop');
  if (lightbox) document.body.appendChild(lightbox);
  if (emojiPop) document.body.appendChild(emojiPop);

  bindEvents();

  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img?.tagName === 'IMG' && (img.dataset.mediaMxc || img.dataset.avatarMxc)) {
      loadAuthenticatedMedia(img);
    }
  }, true);

  // Demo link in auth footer
  const authFoot = $('.auth-foot');
  if (authFoot) {
    authFoot.insertAdjacentHTML('beforeend', ' · <a href="#demo" data-demo-link>Посмотреть демо</a>');
  }

  // Lightbox close
  $('.lightbox-close')?.addEventListener('click', closeLightbox);
  $('#lightbox')?.addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });

  // Close emoji pop when clicking outside
  document.addEventListener('click', (e) => {
    const pop = $('#emoji-pop');
    if (!pop || pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || e.target.closest('#emoji-btn') || e.target.closest('[data-action="react"]')) return;
    pop.classList.add('hidden');
  });

  resizeComposer();
  updateSendButton();

  if (location.hash === '#demo') {
    enterDemo();
    return;
  }

  const session = readSession();
  if (session?.accessToken && session?.baseUrl && session?.userId) {
    await restoreSession(session);
  }
}

init().catch((e) => {
  console.error(e);
  setAuthError('Не удалось запустить клиент. Обновите страницу.');
});
