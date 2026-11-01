/* ============================================================
   BLUENODES — actions & bindings
   made by blue
   ============================================================ */
'use strict';

// ---------------- live bit updates ----------------
function updateLiveBits(stats) {
  const players = stats.players || [];
  $$('[data-srv="' + stats.id + '"]').forEach((card) => {
    const cpu = card.querySelector('.js-cpu');
    if (cpu) cpu.textContent = (stats.cpu || 0).toFixed(0) + '%';
    const ram = card.querySelector('.js-ram');
    if (ram) ram.textContent = stats.ramText || '—';
    const pl = card.querySelector('.js-players');
    if (pl) {
      if (players.length) {
        pl.innerHTML = players.slice(0, 3).map((p) =>
          '<span class="avatar" title="' + esc(p) + '">' + esc(p.slice(0, 1)) + '</span>').join(' ') +
          (players.length > 3 ? ' +' + (players.length - 3) : '');
      } else {
        pl.textContent = stats.status === 'running' ? '0' : '—';
      }
    }
    const uptimeSub = card.querySelector('.server-sub');
    if (uptimeSub && stats.status === 'running') {
      const last = uptimeSub.querySelector('.js-uptime-inline');
      if (!last) {
        const span = document.createElement('span');
        span.className = 'js-uptime-inline';
        span.textContent = '· ' + fmtUptime(stats.uptime);
        uptimeSub.appendChild(span);
      } else {
        last.textContent = '· ' + fmtUptime(stats.uptime);
      }
    }
  });

  if (state.route.view === 'server' && state.route.id === stats.id) {
    updateServerQuickStats();
    const playerList = $('#playerList');
    if (playerList) {
      playerList.innerHTML = players.length
        ? players.map((p) => '<span class="player-pill"><span class="avatar">' + esc(p.slice(0, 1)) + '</span>' + esc(p) + '</span>').join('')
        : '<span class="hint">No players online right now.</span>';
    }
  }

  if (state.route.view === 'dashboard') {
    const total = state.servers.reduce((n, s) => n + (s.online || 0), 0);
    const el = $('#dashPlayers');
    if (el) el.textContent = String(total);
  }
}

// ---------------- server actions ----------------
async function serverAction(id, action) {
  const gerunds = { start: 'Starting', stop: 'Stopping', restart: 'Restarting', kill: 'Killing' };
  const errors = { start: 'Start failed', stop: 'Stop failed', restart: 'Restart failed', kill: 'Kill failed' };
  const server = serverById(id);
  toast(gerunds[action] + ' server', server ? server.name : '', 'info');
  try {
    const res = await api('/api/servers/' + encodeURIComponent(id) + '/' + action, {
      method: 'POST',
      timeout: action === 'restart' ? 120000 : 60000
    });
    if (action === 'start') toast('Server started', 'Watch the console for download / world generation.', 'ok');
    if (action === 'stop') toast('Server stopped', 'World saved and process closed.', 'ok');
    if (action === 'restart') toast('Server restarted', 'Back online.', 'ok');
    if (action === 'kill') toast('Server killed', 'Process terminated — world may not be saved.', 'info');
    if (res && res.status) mergeServer(res);
  } catch (err) {
    toast(errors[action] || 'Action failed', err.message, 'err');
  }
  await reloadServers();
  if (state.route.view === 'server' && state.route.id === id) {
    state.detailAt = 0;
    updateServerHeader();
  }
}

async function deleteServer(id, name) {
  const server = serverById(id);
  const label = name || (server ? server.name : id);
  const yes = await confirmDialog({
    title: 'Delete this server?',
    sub: 'The world and all files will be removed.',
    message: 'This permanently deletes <b>' + esc(label) + '</b> and everything inside its folder. Backups in data/backups are kept.',
    confirmText: 'Delete server',
    danger: true,
    requireText: label
  });
  if (!yes) return;
  try {
    await api('/api/servers/' + encodeURIComponent(id), { method: 'DELETE', timeout: 60000 });
    state.servers = state.servers.filter((s) => s.id !== id);
    toast('Server deleted', label + ' was removed.', 'info');
    renderChrome();
    navigate('#/servers');
  } catch (err) {
    toast('Delete failed', err.message, 'err');
  }
}

async function sendCommand(id, command) {
  if (!command) return;
  try {
    await api('/api/servers/' + encodeURIComponent(id) + '/command', { method: 'POST', body: { command: command } });
    const input = $('#consoleCmd');
    if (input) {
      input.value = '';
      input.focus();
    }
  } catch (err) {
    toast('Command failed', err.message, 'err');
  }
}

// ---------------- files ----------------
async function openFileEditor(path) {
  const id = state.route.id;
  if (!id) return;
  try {
    const data = await api('/api/servers/' + id + '/file?path=' + encodeURIComponent(path));
    openModal({
      title: data.path.split('/').pop() || data.path,
      sub: data.path + ' · ' + fmtBytes(data.size),
      wide: true,
      body: '<div class="field"><textarea id="fileContent" spellcheck="false" style="min-height:52vh"></textarea></div>' +
        '<div class="hint" style="margin-top:8px">' + icon('info') + ' Saving replaces the whole file. The server may need a restart.</div>',
      footer: '<button class="btn btn-ghost" data-close="1">Close</button>' +
        '<button class="btn btn-primary" id="fileSave">' + icon('save') + 'Save file</button>',
      onMount: (root) => {
        const ta = root.querySelector('#fileContent');
        ta.value = data.content;
        root.querySelector('#fileSave').addEventListener('click', async () => {
          try {
            await api('/api/servers/' + id + '/file', { method: 'POST', body: { path: path, content: ta.value } });
            toast('File saved', path, 'ok');
            closeModal();
            refreshFiles();
          } catch (err) {
            toast('Save failed', err.message, 'err');
          }
        });
      }
    });
  } catch (err) {
    toast('Cannot open file', err.message, 'err');
  }
}

function promptModal(opts) {
  return new Promise((resolve) => {
    openModal({
      title: opts.title,
      sub: opts.sub,
      body: '<div class="field"><label>' + esc(opts.label || 'Name') + '</label>' +
        '<input type="text" id="promptInput" value="' + esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '" autofocus></div>' +
        (opts.hint ? '<div class="hint" style="margin-top:8px">' + esc(opts.hint) + '</div>' : ''),
      footer: '<button class="btn btn-ghost" data-close="1">Cancel</button>' +
        '<button class="btn btn-primary" id="promptOk">' + esc(opts.confirmText || 'Create') + '</button>',
      onClose: () => resolve(null),
      onMount: (root) => {
        const input = root.querySelector('#promptInput');
        const ok = () => {
          const value = input.value.trim();
          if (!value) return input.focus();
          closeModal();
          resolve(value);
        };
        root.querySelector('#promptOk').addEventListener('click', ok);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
      }
    });
  });
}

async function deleteFile(path) {
  const yes = await confirmDialog({
    title: 'Delete file?',
    message: 'Delete <b>' + esc(path) + '</b>? This cannot be undone.',
    confirmText: 'Delete',
    danger: true
  });
  if (!yes) return;
  try {
    await api('/api/servers/' + state.route.id + '/delete-file', { method: 'POST', body: { path: path } });
    toast('Deleted', path, 'info');
    refreshFiles();
  } catch (err) {
    toast('Delete failed', err.message, 'err');
  }
}

async function newFile() {
  const dir = state.files.path || '';
  const name = await promptModal({ title: 'New file', label: 'File name', placeholder: 'config.yml', confirmText: 'Create file' });
  if (!name) return;
  const path = dir ? dir + '/' + name : name;
  try {
    await api('/api/servers/' + state.route.id + '/file', {
      method: 'POST',
      body: { path: path, content: '' }
    });
    toast('File created', path, 'ok');
    await refreshFiles();
    openFileEditor(path);
  } catch (err) {
    toast('Could not create file', err.message, 'err');
  }
}

async function newFolder() {
  const dir = state.files.path || '';
  const name = await promptModal({ title: 'New folder', label: 'Folder name', placeholder: 'plugins', confirmText: 'Create folder' });
  if (!name) return;
  const path = dir ? dir + '/' + name : name;
  try {
    await api('/api/servers/' + state.route.id + '/mkdir', { method: 'POST', body: { path: path } });
    toast('Folder created', path, 'ok');
    refreshFiles();
  } catch (err) {
    toast('Could not create folder', err.message, 'err');
  }
}

// ---------------- settings / properties ----------------
async function saveSettings(form) {
  const id = form.dataset.id;
  const payload = {
    name: $('#setName').value.trim(),
    memory: Number($('#setMemory').value),
    autoRestart: $('#setAutoRestart').checked,
    eula: $('#setEula').checked
  };
  const portEl = $('#setPort');
  if (portEl && !portEl.disabled) payload.port = Number(portEl.value);
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    await api('/api/servers/' + id + '/settings', { method: 'POST', body: payload });
    toast('Settings saved', 'Restart the server to apply changes.', 'ok');
    state.detailAt = 0;
    await loadCore();
    await loadServerDetail(id, true);
    updateServerHeader();
  } catch (err) {
    toast('Save failed', err.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function saveProperties() {
  const props = {};
  $$('#propList [data-prop]').forEach((input) => {
    props[input.dataset.prop] = input.value;
  });
  try {
    const data = await api('/api/servers/' + state.route.id + '/properties', { method: 'POST', body: props });
    state.properties = data;
    toast('Properties saved', 'Restart the server to apply.', 'ok');
  } catch (err) {
    toast('Save failed', err.message, 'err');
  }
}

async function addProperty() {
  const key = ($('#newPropKey').value || '').trim();
  const value = ($('#newPropValue').value || '').trim();
  if (!/^[a-z0-9.-]{1,48}$/i.test(key)) {
    toast('Invalid key', 'Use letters, numbers, dots and dashes.', 'err');
    return;
  }
  try {
    const data = await api('/api/servers/' + state.route.id + '/properties', { method: 'POST', body: { [key]: value } });
    state.properties = data;
    const body = $('#serverTabBody');
    if (body) {
      body.innerHTML = propertiesTabHtml();
      paintIcons(body);
    }
    toast('Property added', key + '=' + value, 'ok');
  } catch (err) {
    toast('Could not add property', err.message, 'err');
  }
}

// ---------------- backups ----------------
async function createBackup() {
  const id = state.route.id;
  const btn = $('[data-action="backup-create"]');
  if (btn) btn.disabled = true;
  toast('Creating backup', 'Packing the server folder…', 'info');
  try {
    await api('/api/servers/' + id + '/backups', { method: 'POST', timeout: 180000 });
    toast('Backup created', 'Stored in data/backups.', 'ok');
    await refreshBackups();
  } catch (err) {
    toast('Backup failed', err.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function restoreBackup(file) {
  const yes = await confirmDialog({
    title: 'Restore backup?',
    message: 'Your current world will be <b>replaced</b> by <span class="mono">' + esc(file) + '</span>. The server must be stopped.',
    confirmText: 'Restore',
    danger: true
  });
  if (!yes) return;
  try {
    await api('/api/servers/' + state.route.id + '/backups/restore', { method: 'POST', body: { file: file }, timeout: 180000 });
    toast('Backup restored', 'Start the server to load it.', 'ok');
  } catch (err) {
    toast('Restore failed', err.message, 'err');
  }
}

async function deleteBackup(file) {
  const yes = await confirmDialog({ title: 'Delete backup?', message: 'Remove <span class="mono">' + esc(file) + '</span>?', confirmText: 'Delete', danger: true });
  if (!yes) return;
  try {
    await api('/api/servers/' + state.route.id + '/backups/delete', { method: 'POST', body: { file: file } });
    toast('Backup deleted', '', 'info');
    refreshBackups();
  } catch (err) {
    toast('Delete failed', err.message, 'err');
  }
}

// ---------------- click actions ----------------
const ACTIONS = {
  'toggle-sidebar': () => $('#sidebar').classList.toggle('open'),
  'refresh': async () => {
    try {
      await loadCore();
      state.detailAt = 0;
      await render();
      toast('Refreshed', 'Panel data reloaded.', 'ok');
    } catch (err) {
      toast('Refresh failed', err.message, 'err');
    }
  },
  'copy': (el) => copyText(el.dataset.copy || '', 'Copied to clipboard'),
  'copy-address': (el) => copyText(el.dataset.copy || '', 'Server address copied'),
  'retry': (el) => {
    if (el.dataset.hash) navigate(el.dataset.hash);
    else render();
  },
  'start-server': (el) => serverAction(el.dataset.id, 'start'),
  'stop-server': (el) => serverAction(el.dataset.id, 'stop'),
  'restart-server': (el) => serverAction(el.dataset.id, 'restart'),
  'kill-server': async (el) => {
    const yes = await confirmDialog({
      title: 'Force kill server?',
      message: 'The java process will be killed immediately. The world may not save.',
      confirmText: 'Kill process',
      danger: true
    });
    if (yes) serverAction(el.dataset.id, 'kill');
  },
  'delete-server': (el) => deleteServer(el.dataset.id, el.dataset.name),
  'set-type': (el) => {
    state.create.type = el.dataset.type;
    $$('#typeSwitch .seg').forEach((seg) => seg.classList.toggle('active', seg.dataset.type === el.dataset.type));
    const pv = $('#pvType');
    if (pv) pv.textContent = el.dataset.type;
    fillVersionDatalist();
    renderChips();
  },
  'pick-version': (el) => {
    const input = $('#version');
    if (input) input.value = el.dataset.version;
    state.create.version = el.dataset.version;
    const pv = $('#pvVersion');
    if (pv) pv.textContent = el.dataset.version;
  },
  'quick-command': (el) => sendCommand(el.dataset.id, el.dataset.cmd),
  'toggle-follow': () => {
    state.consoleFollow = !state.consoleFollow;
    const btn = $('#followBtn');
    if (btn) {
      btn.classList.toggle('btn-primary', state.consoleFollow);
      btn.classList.toggle('btn-ghost', !state.consoleFollow);
      btn.innerHTML = icon(state.consoleFollow ? 'check' : 'x') + 'Follow';
    }
    if (state.consoleFollow) scrollConsoleToBottom();
  },
  'clear-console': (el) => {
    state.logs[el.dataset.id] = [];
    const box = $('#console');
    if (box) box.innerHTML = consoleEmptyHtml(serverById(el.dataset.id) || { status: 'stopped' });
    toast('Console cleared', 'Only the browser view was cleared.', 'info');
  },
  'file-nav': (el) => {
    state.files.path = el.dataset.path || '';
    refreshFiles();
  },
  'file-open': (el) => openFileEditor(el.dataset.path),
  'file-delete': (el) => deleteFile(el.dataset.path),
  'file-new': () => newFile(),
  'file-mkdir': () => newFolder(),
  'file-up': (el) => {
    const parts = (el.dataset.path || '').split('/').filter(Boolean);
    parts.pop();
    state.files.path = parts.join('/');
    refreshFiles();
  },
  'file-refresh': () => refreshFiles(),
  'save-properties': () => saveProperties(),
  'add-property': () => addProperty(),
  'backup-create': () => createBackup(),
  'backup-restore': (el) => restoreBackup(el.dataset.file),
  'backup-delete': (el) => deleteBackup(el.dataset.file),
  'java-help': () => {
    openModal({
      title: 'Install Java',
      sub: 'Minecraft needs a Java runtime on the host',
      body: '<div class="notice info">' + icon('info') + '<div>Minecraft <b>1.20.5+</b> needs <b>Java 21</b>. Older versions (1.17–1.20.4) use <b>Java 17</b>, and 1.16.5 or older use Java 8.</div></div>' +
        '<div class="code-block" style="margin-top:14px"><code>sudo bluenodes install-java</code>' +
        '<button class="btn btn-sm copy-btn" data-action="copy" data-copy="sudo bluenodes install-java">Copy</button></div>' +
        '<div class="hint" style="margin-top:10px">The CLI detects your distro and installs a headless JRE. You can also use <span class="mono">apt install openjdk-21-jre-headless</span>.</div>',
      footer: '<button class="btn btn-ghost" data-close="1">Close</button>'
    });
  }
};

function onClick(event) {
  const navItem = event.target.closest('.nav-item[data-route]');
  if (navItem) {
    event.preventDefault();
    navigate(navItem.dataset.route);
    closeSidebar();
    return;
  }
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const handler = ACTIONS[action];
  if (!handler) return;
  event.preventDefault();
  handler(actionEl, event);
}

function onSubmit(event) {
  const form = event.target;
  if (form.id === 'consoleForm') {
    event.preventDefault();
    const input = $('#consoleCmd');
    if (!input) return;
    sendCommand(state.route.id, input.value.trim());
    return;
  }
  if (form.id === 'settingsForm') {
    event.preventDefault();
    saveSettings(form);
  }
}

// ---------------- boot ----------------
function boot() {
  paintIcons(document);
  renderChrome();

  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalState.open) closeModal();
    if (event.key === 'Enter' && $('#confirmText') && modalState.open) {
      const btn = $('#confirmBtn');
      if (btn) btn.click();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'setMemory') {
      const v = Number(event.target.value);
      const label = $('#setMemoryValue');
      if (label) label.textContent = v >= 1024 ? (v / 1024) + ' GB' : v + ' MB';
    }
  });

  window.addEventListener('hashchange', () => {
    state.detail = null;
    state.detailAt = 0;
    state.files = { id: null, path: '', entries: [], loading: false };
    state.backups = [];
    closeSidebar();
    render();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeSidebar();
  });

  connectSSE();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
