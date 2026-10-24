// app.js – full‑featured Matrix client
// Uses matrix-js-sdk (loaded via CDN in index.html)

let client = null;
let currentRoomId = null;
let typingTimer = null;

// Utility helpers
function $(id) { return document.getElementById(id); }
function createElem(tag, cls, txt) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (txt) el.textContent = txt;
  return el;
}

// ---------- UI rendering ----------
function renderRoomList() {
  const list = $('roomList');
  list.innerHTML = '';
  client.getRooms().forEach(room => {
    const li = createElem('li');
    const btn = createElem('button', null, room.name || room.roomId);
    btn.onclick = () => loadRoom(room.roomId);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function addMessage(event, isOwn) {
  const msgBox = $('messages');
  const div = createElem('div', isOwn ? 'own' : 'other');
  const sender = event.getSender();
  const content = event.getContent();
  const timestamp = new Date(event.getTs()).toLocaleTimeString();
  let body = '';

  if (content.msgtype === 'm.text') {
    body = content.body;
  } else if (content.msgtype === 'm.image') {
    const img = document.createElement('img');
    img.src = client.mxcUrlToHttp(content.url);
    img.alt = content.body || 'image';
    img.style.maxWidth = '200px';
    body = img.outerHTML;
  } else if (content.msgtype === 'm.file') {
    const link = document.createElement('a');
    link.href = client.mxcUrlToHttp(content.url);
    link.textContent = content.body || 'file';
    link.download = '';
    body = link.outerHTML;
  }

  const meta = createElem('div', 'meta', `${sender} • ${timestamp}`);
  const contentDiv = createElem('div', null);
  contentDiv.innerHTML = body;
  div.appendChild(meta);
  div.appendChild(contentDiv);

  // Edit / Delete for own messages (if allowed)
  if (isOwn) {
    const editBtn = createElem('button', null, '✎');
    editBtn.title = 'Edit';
    editBtn.onclick = async () => {
      const newText = prompt('Edit message', content.body);
      if (newText !== null) {
        await client.sendEvent(currentRoomId, 'm.room.message', {
          msgtype: 'm.text',
          body: newText,
          'm.new_content': { msgtype: 'm.text', body: newText },
          'm.relates_to': { rel_type: 'm.replace', event_id: event.getId() }
        }, '' );
      }
    };
    const delBtn = createElem('button', null, '🗑');
    delBtn.title = 'Delete';
    delBtn.onclick = async () => {
      if (confirm('Delete this message?')) {
        await client.redactEvent(currentRoomId, event.getId(), {});
      }
    };
    const reactBtn = createElem('button', null, '😀');
    reactBtn.title = 'React';
    reactBtn.onclick = () => showEmojiPicker(event.getId());
    const controls = createElem('span', null);
    controls.appendChild(editBtn);
    controls.appendChild(delBtn);
    controls.appendChild(reactBtn);
    div.appendChild(controls);
  } else {
    // Reaction button for others' messages
    const reactBtn = createElem('button', null, '😀');
    reactBtn.title = 'React';
    reactBtn.onclick = () => showEmojiPicker(event.getId());
    const controls = createElem('span', null);
    controls.appendChild(reactBtn);
    div.appendChild(controls);
  }

  msgBox.appendChild(div);
  msgBox.scrollTop = msgBox.scrollHeight;
}

function loadRoom(roomId) {
  currentRoomId = roomId;
  const room = client.getRoom(roomId);
  $('roomTitle').textContent = room.name || room.roomId;
  const msgsDiv = $('messages');
  msgsDiv.innerHTML = '';
  room.timeline.forEach(ev => {
    if (ev.getType() === 'm.room.message') addMessage(ev, ev.getSender() === client.getUserId());
  });
}

// ---------- Reactions ----------
const EMOJIS = ['👍','👎','❤️','😂','😮','😢','😡','🎉'];
function showEmojiPicker(eventId) {
  const picker = document.createElement('div');
  picker.style.position = 'absolute';
  picker.style.background = '#fff';
  picker.style.border = '1px solid #ccc';
  picker.style.padding = '5px';
  picker.style.zIndex = 1000;
  EMOJIS.forEach(e => {
    const btn = createElem('button', null, e);
    btn.style.fontSize = '1.2em';
    btn.onclick = async () => {
      await client.sendEvent(currentRoomId, 'm.reaction', {
        'm.relates_to': { 'rel_type': 'm.annotation', 'event_id': eventId, 'key': e }
      }, '' );
      document.body.removeChild(picker);
    };
    picker.appendChild(btn);
  });
  document.body.appendChild(picker);
  // Position near mouse (simple)
  picker.style.left = '50%';
  picker.style.top = '50%';
}

// ---------- Typing ----------
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

// ---------- Event listeners ----------
$('loginBtn').addEventListener('click', async () => {
  const homeserver = $('homeserver').value.trim();
  const userId = $('userId').value.trim();
  const password = $('password').value;
  const status = $('loginStatus');
  status.textContent = '';
  try {
    client = matrixcs.createClient({ baseUrl: homeserver, userId });
    await client.loginWithPassword(userId, password);
    client.startClient();
    client.on('Room.timeline', (event, room, toStartOfTimeline) => {
      if (event.getType() === 'm.room.message' && !toStartOfTimeline) {
        addMessage(event, event.getSender() === client.getUserId());
      }
    });
    client.on('RoomMember.typing', (room, members) => {
      if (room.roomId !== currentRoomId) return;
      const names = members.map(m => m.userId).join(', ');
      $('typing').textContent = names ? `${names} typing…` : '';
    });
    client.on('RoomState.events', (event, state, room) => {
      if (event.getType() === 'm.room.name' && room.roomId === currentRoomId) {
        $('roomTitle').textContent = event.getContent().name;
      }
    });
    // UI switch
    $('login').style.display = 'none';
    $('client').style.display = 'block';
    renderRoomList();
  } catch (e) {
    console.error(e);
    status.textContent = 'Login failed: ' + e.message;
  }
});

$('logoutBtn').addEventListener('click', () => {
  if (client) client.stopClient();
  client = null;
  currentRoomId = null;
  $('client').style.display = 'none';
  $('login').style.display = 'block';
});

$('sendBtn').addEventListener('click', async () => {
  const text = $('msgInput').value.trim();
  if (!text && !$('fileInput').files.length) return;
  if (text) {
    await client.sendEvent(currentRoomId, 'm.room.message', { msgtype: 'm.text', body: text }, '' );
  }
  const files = $('fileInput').files;
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
  // reset UI
  $('msgInput').value = '';
  $('fileInput').value = '';
  stopTyping();
});

$('msgInput').addEventListener('input', () => {
  startTyping();
});

$('createRoomBtn').addEventListener('click', async () => {
  const nameOrAlias = $('newRoomName').value.trim();
  if (!nameOrAlias) return;
  try {
    // Try to join if alias, otherwise create a new room
    if (nameOrAlias.startsWith('#')) {
      await client.joinRoom(nameOrAlias);
    } else {
      const roomId = await client.createRoom({ name: nameOrAlias });
      console.log('Created room', roomId);
    }
    renderRoomList();
    $('newRoomName').value = '';
  } catch (e) {
    alert('Failed to create/join room: ' + e.message);
  }
});

// End of app.js
