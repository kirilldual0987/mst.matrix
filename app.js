// app.js – updated for Material You UI, dark mode toggle, search, and settings handling
let client = null;
let currentRoomId = null;
let typingTimer = null;
let searchQuery = '';

// Helper
const $ = (id) => document.getElementById(id);

// ----- UI helpers -----
function openDrawer() {
  const drawer = document.getElementById('drawer');
  if (drawer) drawer.show();
}
function closeDrawer() {
  const drawer = document.getElementById('drawer');
  if (drawer) drawer.hide();
}

// Settings dialog handling
function initSettings() {
  const topBar = document.getElementById('topBar');
  if (!topBar) return;
  // Listen for trailing icon click to open menu
  topBar.addEventListener('click', (e) => {
    if (e.target.closest('md-standard-icon-button')) {
      // Show simple menu using native alert as placeholder (real menu can be built later)
      const choice = confirm('Open Settings?');
      if (choice) openSettings();
    }
  });
}
function openSettings() {
  const dlg = document.getElementById('settingsDialog');
  if (dlg) dlg.show();
}
function applyDarkMode(enabled) {
  document.documentElement.dataset.theme = enabled ? 'dark' : 'light';
  const darkSwitch = document.getElementById('darkModeSwitch');
  if (darkSwitch) darkSwitch.checked = enabled;
}

function initDarkModeToggle() {
  const darkSwitch = document.getElementById('darkModeSwitch');
  if (!darkSwitch) return;
  darkSwitch.addEventListener('change', (e) => {
    applyDarkMode(e.target.checked);
  });
  // Initialize based on system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyDarkMode(prefersDark);
}

// ----- Messaging -----
function renderRoomList() {
  const roomList = $('#roomList');
  roomList.innerHTML = '';
  client.getRooms().forEach(room => {
    const item = document.createElement('md-list-item');
    item.textContent = room.name || room.roomId;
    item.addEventListener('click', () => loadRoom(room.roomId));
    roomList.appendChild(item);
  });
}

function addMessage(event, isOwn) {
  // Filter by search query (if any)
  const body = event.getContent().body || '';
  if (searchQuery && !body.toLowerCase().includes(searchQuery.toLowerCase())) return;

  const container = $('#messages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  const timestamp = new Date(event.getTs()).toLocaleTimeString();
  meta.textContent = `${event.getSender()} • ${timestamp}`;
  msgDiv.appendChild(meta);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'content';
  // Determine type
  const content = event.getContent();
  if (content.msgtype === 'm.text') {
    contentDiv.textContent = content.body;
  } else if (content.msgtype === 'm.image') {
    const img = document.createElement('img');
    img.src = client.mxcUrlToHttp(content.url);
    img.alt = content.body || 'image';
    img.style.maxWidth = '200px';
    contentDiv.appendChild(img);
  } else if (content.msgtype === 'm.file') {
    const a = document.createElement('a');
    a.href = client.mxcUrlToHttp(content.url);
    a.textContent = content.body || 'file';
    a.download = '';
    contentDiv.appendChild(a);
  }

  msgDiv.appendChild(contentDiv);

  // Actions (edit/delete/react) for own messages
  const actions = document.createElement('div');
  actions.className = 'actions';
  if (isOwn) {
    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.title = 'Edit';
    editBtn.onclick = async () => {
      const newText = prompt('Edit message', content.body);
      if (newText !== null) {
        await client.sendEvent(currentRoomId, 'm.room.message', {
          msgtype: 'm.text',
          body: newText,
          "m.relates_to": { "rel_type": "m.replace", "event_id": event.getId() }
        }, '');
      }
    };
    actions.appendChild(editBtn);
    const delBtn = document.createElement('button');
    delBtn.textContent = '🗑';
    delBtn.title = 'Delete';
    delBtn.onclick = async () => {
      if (confirm('Delete this message?')) {
        await client.redactEvent(currentRoomId, event.getId(), {});
      }
    };
    actions.appendChild(delBtn);
  }
  // React button (available for all)
  const reactBtn = document.createElement('button');
  reactBtn.textContent = '😀';
  reactBtn.title = 'React';
  reactBtn.onclick = () => showEmojiPicker(event.getId());
  actions.appendChild(reactBtn);

  msgDiv.appendChild(actions);
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function loadRoom(roomId) {
  currentRoomId = roomId;
  const room = client.getRoom(roomId);
  $('#roomTitle').textContent = room.name || room.roomId;
  $('#messages').innerHTML = '';
  room.timeline.forEach(ev => {
    if (ev.getType() === 'm.room.message') addMessage(ev, ev.getSender() === client.getUserId());
  });
}

// ----- Reactions -----
const EMOJIS = ['👍','👎','❤️','😂','😮','😢','😡','🎉'];
function showEmojiPicker(eventId) {
  // Simple inline picker (could be replaced with a proper dialog)
  const picker = document.createElement('div');
  picker.style.position = 'fixed';
  picker.style.bottom = '80px';
  picker.style.right = '20px';
  picker.style.background = 'var(--md-sys-color-surface)';
  picker.style.border = '1px solid #ccc';
  picker.style.padding = '4px';
  picker.style.zIndex = 1000;
  EMOJIS.forEach(e => {
    const btn = document.createElement('button');
    btn.textContent = e;
    btn.style.fontSize = '1.2rem';
    btn.onclick = async () => {
      await client.sendEvent(currentRoomId, 'm.reaction', {
        "m.relates_to": { "rel_type": "m.annotation", "event_id": eventId, "key": e }
      }, '');
      document.body.removeChild(picker);
    };
    picker.appendChild(btn);
  });
  document.body.appendChild(picker);
  // Clicking outside closes picker
  const close = (e) => { if (!picker.contains(e.target)) { document.body.removeChild(picker); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 10);
}

// ----- Typing notifications -----
function startTyping() {
  if (!currentRoomId) return;
  client.sendTyping(currentRoomId, true, 30000);
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 5000);
}
function stopTyping() {
  if (!currentRoomId) return;
  client.sendTyping(currentRoomId, false);
}

// ----- Event listeners -----
$('#loginBtn').addEventListener('click', async () => {
  const homeserver = $('#homeserver').value.trim();
  const userId = $('#userId').value.trim();
  const password = $('#password').value;
  const status = $('#loginStatus');
  status.textContent = '';
  try {
    client = matrixcs.createClient({ baseUrl: homeserver, userId });
    await client.loginWithPassword(userId, password);
    client.startClient();
    client.on('Room.timeline', (event, room, toStartOfTimeline) => {
      if (!toStartOfTimeline && event.getType() === 'm.room.message') {
        addMessage(event, event.getSender() === client.getUserId());
      }
    });
    client.on('RoomMember.typing', (room, members) => {
      if (room.roomId !== currentRoomId) return;
      const names = members.map(m => m.userId).join(', ');
      $('#typing').textContent = names ? `${names} typing…` : '';
    });
    // UI switch
    $('#login').style.display = 'none';
    $('#client').classList.remove('d-none');
    renderRoomList();
    initSettings();
    initDarkModeToggle();
  } catch (e) {
    console.error(e);
    status.textContent = 'Login failed: ' + e.message;
  }
});

$('#logoutBtn').addEventListener('click', () => {
  if (client) client.stopClient();
  client = null;
  currentRoomId = null;
  $('#client').classList.add('d-none');
  $('#login').style.display = 'flex';
});

$('#sendBtn').addEventListener('click', async () => {
  const text = $('#msgInput').value.trim();
  const files = $('#fileInput').files;
  if (!text && files.length === 0) return;
  if (text) {
    await client.sendEvent(currentRoomId, 'm.room.message', { msgtype: 'm.text', body: text }, '' );
  }
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const uri = await client.uploadContent(file);
    const mime = file.type || 'application/octet-stream';
    const msgtype = mime.startsWith('image/') ? 'm.image' : 'm.file';
    const content = {
      msgtype,
      body: file.name,
      url: uri,
      info: { mimetype: mime, size: file.size }
    };
    await client.sendEvent(currentRoomId, 'm.room.message', content, '' );
  }
  $('#msgInput').value = '';
  $('#fileInput').value = '';
  stopTyping();
});

$('#msgInput').addEventListener('input', () => {
  startTyping();
});

$('#createRoomBtn').addEventListener('click', async () => {
  const name = $('#newRoomName').value.trim();
  if (!name) return;
  try {
    if (name.startsWith('#')) {
      await client.joinRoom(name);
    } else {
      const roomId = await client.createRoom({ name });
      console.log('Created room', roomId);
    }
    renderRoomList();
    $('#newRoomName').value = '';
  } catch (e) {
    alert('Failed to create/join room: ' + e.message);
  }
});

// ----- Search -----
$('#searchInput').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  // Re‑render current room messages with filter
  if (currentRoomId) loadRoom(currentRoomId);
});
$('#clearSearchBtn').addEventListener('click', () => {
  $('#searchInput').value = '';
  searchQuery = '';
  if (currentRoomId) loadRoom(currentRoomId);
});

// Drawer menu icon handling (open drawer)
const topBar = document.getElementById('topBar');
if (topBar) {
  topBar.addEventListener('click', (e) => {
    if (e.target.closest('md-standard-icon-button[icon="menu"]')) {
      openDrawer();
    }
  });
}

// End of app.js
