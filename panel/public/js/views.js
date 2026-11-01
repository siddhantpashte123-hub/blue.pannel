/* ============================================================
   BLUENODES — views
   made by blue
   ============================================================ */
'use strict';

let systemTimer = null;
let sparkId = 0;

function clearSystemTimer() {
  if (systemTimer) {
    clearInterval(systemTimer);
    systemTimer = null;
  }
}

async function loadCore() {
  const results = await Promise.allSettled([api('/api/servers'), api('/api/system')]);
  if (results[0].status === 'fulfilled') {
    state.servers = results[0].value.servers || [];
    state.bootstrapped = true;
  }
  if (results[1].status === 'fulfilled') state.system = results[1].value;
  if (results[0].status === 'rejected') throw results[0].reason;
  renderChrome();
}

async function reloadServers() {
  try {
    const data = await api('/api/servers');
    state.servers = data.servers || [];
    renderChrome();
    renderServersGrid();
  } catch (err) { /* quiet */ }
}

function errorView(message, retryHash) {
  return '<div class="empty">' +
    '<div class="empty-ico">' + icon('alert') + '</div>' +
    '<h3>Something went wrong</h3>' +
    '<p>' + esc(message) + '</p>' +
    '<button class="btn btn-primary" data-action="retry" data-hash="' + esc(retryHash || '') + '">' + icon('refresh') + 'Try again</button>' +
    '</div>';
}

function serverAddress(server) {
  const host = location.hostname && location.hostname !== '0.0.0.0' ? location.hostname : 'localhost';
  return host + ':' + server.port;
}

function serverActionsHtml(s, big) {
  const status = s.status || 'stopped';
  const size = big ? '' : ' btn-sm';
  const busy = status === 'starting' || status === 'stopping';
  const running = status === 'running' || status === 'starting' || status === 'stopping';
  let html = '';
  if (status === 'running' || status === 'starting') {
    html += '<button class="btn btn-danger' + size + '" data-action="stop-server" data-id="' + s.id + '"' + (busy ? ' disabled' : '') + '>' + icon('stop') + 'Stop</button>';
  } else {
    html += '<button class="btn btn-primary' + size + '" data-action="start-server" data-id="' + s.id + '"' + (busy ? ' disabled' : '') + '>' + icon('play') + 'Start</button>';
  }
  if (running) {
    html += '<button class="btn' + size + '" data-action="restart-server" data-id="' + s.id + '"' + (busy ? ' disabled' : '') + '>' + icon('restart') + 'Restart</button>';
  }
  if (big) {
    html += '<a class="btn' + size + '" href="#/server/' + s.id + '/console">' + icon('terminal') + 'Console</a>' +
      '<button class="btn btn-danger' + size + '" data-action="kill-server" data-id="' + s.id + '" title="Force kill">' + icon('power') + 'Kill</button>';
  }
  return html;
}

function statusBadge(status, id) {
  const safe = ['running', 'starting', 'stopping', 'stopped'].includes(status) ? status : 'stopped';
  const labels = { running: 'online', starting: 'starting', stopping: 'stopping', stopped: 'offline' };
  return '<span class="status ' + safe + '"' + (id ? ' id="' + id + '"' : '') + '>' + labels[safe] + '</span>';
}

function serverCardHtml(s) {
  const running = s.status === 'running';
  const players = s.players || [];
  return '<article class="card server-card" data-srv="' + s.id + '">' +
    '<div class="server-top">' +
      '<div class="server-cube">' + icon('box') + '</div>' +
      '<div class="server-title">' +
        '<div class="server-name">' + esc(s.name) + '</div>' +
        '<div class="server-sub"><span class="tag ' + esc(s.type) + '">' + esc(s.type) + '</span><span>' + esc(s.version) + '</span>' +
          (running ? '<span>· ' + fmtUptime(s.uptime) + '</span>' : '') + '</div>' +
      '</div>' +
      statusBadge(s.status) +
    '</div>' +
    '<div class="server-meta">' +
      '<div class="mini"><div class="mini-label">Players</div><div class="mini-value js-players">' +
        (players.length ? players.slice(0, 3).map((p) => '<span class="avatar" title="' + esc(p) + '">' + esc(p.slice(0, 1)) + '</span>').join(' ') : (running ? '0' : '—')) +
        (players.length > 3 ? ' +' + (players.length - 3) : '') + '</div></div>' +
      '<div class="mini"><div class="mini-label">CPU</div><div class="mini-value js-cpu">' + (running ? (s.cpu || 0).toFixed(0) + '%' : '—') + '</div></div>' +
      '<div class="mini"><div class="mini-label">RAM</div><div class="mini-value js-ram">' + (running ? (s.ramText || '—') : (s.memory ? s.memory + 'M' : '—')) + '</div></div>' +
    '</div>' +
    '<div class="server-addr">' + icon('globe') + '<span>' + esc(serverAddress(s)) + '</span>' +
      '<button class="icon-btn btn-sm" data-action="copy-address" data-copy="' + esc(serverAddress(s)) + '" title="Copy address">' + icon('copy') + '</button></div>' +
    '<div class="server-actions">' + serverActionsHtml(s, false) +
      '<a class="btn btn-ghost btn-sm btn-manage" href="#/server/' + s.id + '/console">' + icon('sliders') + 'Manage</a></div>' +
    '</article>';
}

function renderServersGrid() {
  const grid = $('#serverGrid') || $('#dashServerGrid');
  if (!grid) return;
  const query = (state.search || '').trim().toLowerCase();
  const list = state.servers.filter((s) => !query ||
    s.name.toLowerCase().includes(query) || s.version.toLowerCase().includes(query) || String(s.port).includes(query));
  grid.innerHTML = list.length
    ? list.map(serverCardHtml).join('')
    : '<div class="empty" style="grid-column:1/-1">' +
        '<div class="empty-ico">' + icon('server') + '</div>' +
        '<h3>' + (state.servers.length ? 'No matching servers' : 'No servers yet') + '</h3>' +
        '<p>' + (state.servers.length ? 'Try a different search.' : 'Create your first Minecraft server — vanilla or Paper, installed in seconds.') + '</p>' +
        '<a class="btn btn-primary" href="#/create">' + icon('plus') + 'Create server</a>' +
      '</div>';
  paintIcons(grid);
}

// ---------------- dashboard ----------------
function dashboardHtml() {
  const sys = state.system;
  const servers = state.servers;
  const running = servers.filter((s) => s.status === 'running' || s.status === 'starting').length;
  const players = servers.reduce((n, s) => n + (s.online || 0), 0);
  const recent = servers.slice(0, 4);
  const cpu = sys ? sys.cpu.percent : 0;
  const mem = sys ? sys.memory.percent : 0;
  const disk = sys ? sys.disk.percent : 0;

  return '' +
  '<section class="hero card">' +
    '<div class="hero-left">' +
      '<span class="hero-kicker">' + icon('zap') + ' self-hosted minecraft panel</span>' +
      '<h2>Your Minecraft.<br><span>Your node.</span></h2>' +
      '<p>One command installs BLUENODES on your VPS — then create servers, watch the live console, edit files and take backups right from the browser.</p>' +
      '<div class="hero-actions">' +
        '<a class="btn btn-primary" href="#/create">' + icon('plus') + 'Create server</a>' +
        '<button class="btn" data-action="copy" data-copy="' + esc(INSTALL_CMD) + '">' + icon('copy') + 'Copy install command</button>' +
      '</div>' +
      '<div class="code-block" style="margin-top:14px;max-width:640px">' +
        '<code>' + esc(INSTALL_CMD) + '</code>' +
        '<button class="btn btn-sm copy-btn" data-action="copy" data-copy="' + esc(INSTALL_CMD) + '">Copy</button>' +
      '</div>' +
    '</div>' +
    '<div class="hero-right">' +
      '<div class="hero-node">' +
        '<div class="host-badge">' + (sys ? esc(sys.host.hostname) : 'this node') + '</div>' +
        '<div class="hero-orb">' + icon('box') + '</div>' +
        '<div class="hero-node-line"><span class="dot-live on"></span> panel ' + (state.online ? 'live' : 'offline') + ' · port ' + (sys ? sys.panel.port : 6868) + '</div>' +
        '<div class="hero-node-stats">' +
          '<div><b id="heroServers">' + servers.length + '</b><span>servers</span></div>' +
          '<div><b id="heroRunning">' + running + '</b><span>running</span></div>' +
          '<div><b id="heroPlayers">' + players + '</b><span>players</span></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</section>' +

  '<div class="grid grid-4" style="margin-top:14px">' +
    statCard('server', 'Servers', '<span id="dashServerValue">' + servers.length + '</span><small>/ ' + running + ' running</small>', '<span id="dashServerFoot">' + servers.length + ' total on this node</span>') +
    statCard('users', 'Players online', '<span id="dashPlayers">' + players + '</span>', '<span id="dashPlayersFoot">' + (running ? 'across ' + running + ' live server' + (running === 1 ? '' : 's') : 'no servers online') + '</span>') +
    statCard('cpu', 'CPU usage', '<span id="dashCpu">' + cpu + '</span><small>%</small>', '<span>' + (sys ? sys.host.cpus + ' cores · load ' + sys.host.load[0].toFixed(2) : '—') + '</span>', cpu) +
    statCard('activity', 'Memory', '<span id="dashRam">' + mem + '</span><small>%</small>', '<span>' + (sys ? sys.memory.usedText + ' / ' + sys.memory.totalText : '—') + '</span>', mem) +
  '</div>' +

  '<div class="dash-grid">' +
    '<section class="card">' +
      '<div class="card-head">' +
        '<div><h2>Servers</h2><div class="sub">' + (servers.length ? servers.length + ' configured on this node' : 'nothing installed yet') + '</div></div>' +
        '<div class="card-head-actions"><a class="btn btn-sm btn-ghost" href="#/servers">View all' + icon('chevron-right') + '</a></div>' +
      '</div>' +
      '<div class="card-pad" style="padding:14px">' +
        (recent.length
          ? '<div class="grid grid-2" id="dashServerGrid">' + recent.map(serverCardHtml).join('') + '</div>'
          : '<div class="empty" style="padding:34px 20px"><div class="empty-ico">' + icon('server') + '</div><h3>No servers yet</h3><p>Create your first server in under a minute.</p><a class="btn btn-primary" href="#/create">' + icon('plus') + 'Create server</a></div>') +
      '</div>' +
    '</section>' +

    '<section class="card">' +
      '<div class="card-head"><div><h2>Node health</h2><div class="sub">live from the host</div></div>' +
        '<div class="card-head-actions"><span class="pill ' + (sys && sys.java.installed ? 'good' : 'warn') + '">' + icon('coffee') + '<b>' + (sys && sys.java.installed ? 'Java ' + sys.java.major : 'no java') + '</b></span></div>' +
      '</div>' +
      '<div class="card-pad">' +
        '<div class="health-row"><span>CPU</span><b id="dashCpuText">' + cpu + '%</b></div>' +
        '<div id="dashCpuSpark">' + (sys ? sparkline(sys.cpu.history) : '') + '</div>' +
        '<div class="meter ' + meterClass(cpu) + '"><span id="dashCpuBar" style="width:' + cpu + '%"></span></div>' +
        '<div class="health-row" style="margin-top:16px"><span>Memory</span><b id="dashRamText">' + mem + '%</b></div>' +
        '<div class="meter ' + meterClass(mem) + '"><span id="dashRamBar" style="width:' + mem + '%"></span></div>' +
        '<div class="health-row" style="margin-top:16px"><span>Disk</span><b id="dashDiskText">' + disk + '%</b></div>' +
        '<div class="meter ' + meterClass(disk) + '"><span id="dashDiskBar" style="width:' + disk + '%"></span></div>' +
        '<div class="health-foot">' +
          '<div><span>Hostname</span><b>' + esc(sys ? sys.host.hostname : '—') + '</b></div>' +
          '<div><span>Uptime</span><b>' + (sys ? fmtUptime(sys.host.uptime) : '—') + '</b></div>' +
          '<div><span>Node</span><b>' + (sys ? sys.node.version : '—') + '</b></div>' +
        '</div>' +
      '</div>' +
    '</section>' +
  '</div>' +

  '<section class="card" style="margin-top:14px">' +
    '<div class="card-head">' +
      '<div><h2>One command install</h2><div class="sub">the bluenodes cli — banner, menu, everything</div></div>' +
      '<div class="card-head-actions"><button class="btn btn-sm" data-action="copy" data-copy="' + esc(INSTALL_CMD) + '">' + icon('copy') + 'Copy command</button></div>' +
    '</div>' +
    '<div class="card-pad" style="padding:14px">' +
      '<div class="terminal">' +
        '<div class="terminal-bar"><span class="console-dots"><i></i><i></i><i></i></span><b style="color:var(--muted)">root@node:~</b><span style="margin-left:auto">bluenodes</span></div>' +
        '<pre class="ascii">' + asciiBlock() + '</pre>' +
      '</div>' +
      '<div class="hint" style="margin-top:10px">Run it on any Debian / Ubuntu VPS — installs the panel on <b>port 6868</b> and opens the menu. Requires root (or sudo).</div>' +
    '</div>' +
  '</section>';
}

function asciiBlock() {
  const art = ASCII.join('\n');
  return '<span class="hi">' + esc(art) + '</span>\n\n' +
    '<span class="white">  BLUENODES</span>  <span class="dim">— made by blue</span>\n\n' +
    '<span class="num">  1</span>  INSTALL\n' +
    '<span class="num">  2</span>  UNINSTALL\n' +
    '<span class="num">  3</span>  STATUS\n' +
    '<span class="num">  4</span>  START\n' +
    '<span class="num">  5</span>  STOP\n' +
    '<span class="num">  6</span>  LOGS\n' +
    '<span class="num">  7</span>  UPDATE\n' +
    '<span class="num">  8</span>  INSTALL JAVA\n' +
    '<span class="num">  0</span>  EXIT\n\n' +
    '<span class="dim">  panel  : http://0.0.0.0:6868</span>\n' +
    '<span class="dim">  data   : /opt/bluenodes/data</span>\n' +
    '<span class="hi">  choose an option &gt;</span> ';
}

function statCard(ico, label, value, foot, meter) {
  return '<div class="stat-card">' +
    '<div class="stat-top"><span class="stat-ico">' + icon(ico) + '</span><span class="stat-label">' + label + '</span></div>' +
    '<div class="stat-value">' + value + '</div>' +
    (typeof meter === 'number' ? '<div class="meter ' + meterClass(meter) + '"><span style="width:' + meter + '%"></span></div>' : '') +
    '<div class="stat-foot">' + foot + '</div>' +
    '</div>';
}

function sparkline(history) {
  const points = Array.isArray(history) && history.length ? history : [{ v: 0 }];
  const values = points.map((p) => Number(p.v) || 0);
  const w = 320;
  const h = 36;
  const max = Math.max(10, Math.max.apply(null, values));
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const coords = values.map((v, i) => (i * step).toFixed(1) + ',' + (h - (v / max) * (h - 3) - 1).toFixed(1));
  const d = 'M' + coords.join(' L');
  const area = d + ' L' + w + ',' + h + ' L0,' + h + ' Z';
  const id = 'sg' + (++sparkId);
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#3b82f6" stop-opacity="0.45"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>' +
    '<path class="area" fill="url(#' + id + ')" d="' + area + '"/>' +
    '<path class="line" d="' + d + '"/></svg>';
}

// ---------------- servers page ----------------
function serversPageHtml() {
  const query = esc(state.search);
  return '<section class="card">' +
    '<div class="card-head">' +
      '<div><h2>All servers</h2><div class="sub">' + state.servers.length + ' installed · ' +
        state.servers.filter((s) => s.status === 'running').length + ' online</div></div>' +
      '<div class="card-head-actions file-toolbar">' +
        '<div class="search-box">' + icon('search') + '<input type="search" id="serverSearch" placeholder="Search servers..." value="' + query + '"></div>' +
        '<a class="btn btn-primary btn-sm" href="#/create">' + icon('plus') + 'New server</a>' +
      '</div>' +
    '</div>' +
    '<div class="card-pad" style="padding:14px">' +
      '<div class="grid grid-servers" id="serverGrid"></div>' +
    '</div>' +
  '</section>';
}

// ---------------- create page ----------------
function createPageHtml() {
  const c = state.create;
  const sys = state.system;
  const mem = c.memory;
  return '<div class="create-grid">' +
    '<section class="card">' +
      '<div class="card-head"><div><h2>New Minecraft server</h2><div class="sub">installed from Mojang / Paper, then placed in its own folder</div></div></div>' +
      '<div class="card-pad">' +
        '<form id="createForm" autocomplete="off">' +
          '<div class="form-grid">' +
            '<div class="field full">' +
              '<label for="name">Server name</label>' +
              '<input type="text" id="name" name="name" placeholder="e.g. Blue SMP" maxlength="32" value="' + esc(c.name) + '" required>' +
              '<span class="hint">Used for the panel, the folder name and the default MOTD.</span>' +
              '<span class="err">Enter a name (max 32 characters).</span>' +
            '</div>' +
            '<div class="field full">' +
              '<label>Server software</label>' +
              '<div class="segmented" id="typeSwitch">' +
                '<button type="button" class="seg' + (c.type === 'vanilla' ? ' active' : '') + '" data-action="set-type" data-type="vanilla">' +
                  icon('box') + '<span>Vanilla<small>official Mojang jar</small></span></button>' +
                '<button type="button" class="seg' + (c.type === 'paper' ? ' active' : '') + '" data-action="set-type" data-type="paper">' +
                  icon('zap') + '<span>Paper<small>plugins + performance</small></span></button>' +
              '</div>' +
            '</div>' +
            '<div class="field full">' +
              '<label for="version">Minecraft version</label>' +
              '<div class="version-row">' +
                '<input type="text" id="version" name="version" list="versionList" placeholder="e.g. 1.21.4" value="' + esc(c.version) + '" required>' +
                '<datalist id="versionList"></datalist>' +
                '<span class="version-latest" id="versionHint">loading version list…</span>' +
              '</div>' +
              '<div class="chips" id="versionChips"></div>' +
              '<span class="err">Pick a valid version like 1.21.4</span>' +
            '</div>' +
            '<div class="field">' +
              '<label for="memory">RAM allocation</label>' +
              '<div class="range-row">' +
                '<input type="range" id="memory" name="memory" min="512" max="16384" step="512" value="' + mem + '">' +
                '<span class="range-value" id="memoryValue">' + (mem >= 1024 ? (mem / 1024) + ' GB' : mem + ' MB') + '</span>' +
              '</div>' +
              '<span class="hint">Host has ' + (sys ? sys.memory.totalText : '?') + ' RAM. Keep 1–2 GB for the system.</span>' +
            '</div>' +
            '<div class="field">' +
              '<label for="port">Server port</label>' +
              '<input type="number" id="port" name="port" placeholder="auto (25565)" min="1024" max="65535" value="' + esc(c.port) + '">' +
              '<span class="hint">Leave empty to auto-pick the first free port.</span>' +
              '<span class="err">Port must be 1024–65535</span>' +
            '</div>' +
            '<div class="field">' +
              '<label for="maxPlayers">Max players</label>' +
              '<input type="number" id="maxPlayers" name="maxPlayers" min="1" max="1000" value="20">' +
            '</div>' +
            '<div class="field">' +
              '<label for="gamemode">Gamemode</label>' +
              '<select id="gamemode" name="gamemode">' +
                '<option value="survival">Survival</option><option value="creative">Creative</option>' +
                '<option value="adventure">Adventure</option><option value="spectator">Spectator</option>' +
              '</select>' +
            '</div>' +
            '<div class="field">' +
              '<label for="difficulty">Difficulty</label>' +
              '<select id="difficulty" name="difficulty">' +
                '<option value="peaceful">Peaceful</option><option value="easy" selected>Easy</option>' +
                '<option value="normal">Normal</option><option value="hard">Hard</option>' +
              '</select>' +
            '</div>' +
            '<div class="field full">' +
              '<label for="motd">MOTD</label>' +
              '<input type="text" id="motd" name="motd" maxlength="60" placeholder="Blue SMP | BLUENODES">' +
            '</div>' +
            '<div class="field full">' +
              '<label class="switch"><input type="checkbox" id="autoRestart" name="autoRestart" checked><span class="track"></span>' +
                '<span class="switch-label">Auto-restart the server if it crashes</span></label>' +
              '<label class="check" style="margin-top:10px">' +
                '<input type="checkbox" id="eula" name="eula" checked>' +
                '<span>I accept the <a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noreferrer">Minecraft EULA</a> — required to start the server.</span>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '<div class="form-actions">' +
            '<a class="btn btn-ghost" href="#/servers">Cancel</a>' +
            '<button class="btn btn-primary" type="submit" id="createSubmit">' + icon('download') + 'Install server</button>' +
          '</div>' +
        '</form>' +
      '</div>' +
    '</section>' +

    '<aside class="create-aside">' +
      '<section class="card">' +
        '<div class="card-head"><div><h2>Summary</h2><div class="sub">what will be installed</div></div></div>' +
        '<div class="card-pad">' +
          '<div class="preview-cube">' + icon('box') + '</div>' +
          '<div class="kv" style="margin-top:14px">' +
            '<div class="k">Software</div><div class="v" id="pvType">' + esc(c.type) + '</div>' +
            '<div class="k">Version</div><div class="v" id="pvVersion">' + esc(c.version || '—') + '</div>' +
            '<div class="k">Address</div><div class="v" id="pvAddress">' + esc(serverAddress({ port: c.port || 25565 })) + '</div>' +
            '<div class="k">RAM</div><div class="v" id="pvMemory">' + (mem >= 1024 ? (mem / 1024) + ' GB' : mem + ' MB') + '</div>' +
            '<div class="k">Folder</div><div class="v" id="pvFolder">data/servers/…</div>' +
          '</div>' +
          '<div class="notice info" style="margin-top:16px">' + icon('info') +
            '<div>The jar is downloaded once and cached, so extra servers install instantly. Java must be installed on the host.</div></div>' +
        '</div>' +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><div><h2>After install</h2><div class="sub">you can manage everything</div></div></div>' +
        '<div class="card-pad feature-list">' +
          '<div>' + icon('terminal') + '<span><b>Live console</b> with command input</span></div>' +
          '<div>' + icon('folder') + '<span><b>File manager</b> — edit server.properties, yml, plugins</span></div>' +
          '<div>' + icon('archive') + '<span><b>Backups</b> as tar.gz, restore in one click</span></div>' +
          '<div>' + icon('users') + '<span><b>Player list</b> from the console output</span></div>' +
        '</div>' +
      '</section>' +
    '</aside>' +
  '</div>';
}

// ---------------- system page ----------------
function systemPageHtml() {
  const sys = state.system;
  if (!sys) return '<div class="empty"><div class="empty-ico">' + icon('cpu') + '</div><h3>System info unavailable</h3><p>The panel could not read host details.</p></div>';
  const java = sys.java;
  return '<div class="grid grid-3">' +
    statCard('cpu', 'CPU', '<span data-sys="cpu">' + sys.cpu.percent + '</span><small>%</small>', '<span>' + esc(sys.host.cpuModel) + '</span>', sys.cpu.percent) +
    statCard('activity', 'Memory', '<span data-sys="mem">' + sys.memory.percent + '</span><small>%</small>', '<span data-sys="memText">' + sys.memory.usedText + ' / ' + sys.memory.totalText + '</span>', sys.memory.percent) +
    statCard('hard-drive', 'Disk', '<span data-sys="disk">' + sys.disk.percent + '</span><small>%</small>', '<span data-sys="diskText">' + sys.disk.usedText + ' / ' + sys.disk.totalText + '</span>', sys.disk.percent) +
  '</div>' +

  '<div class="grid grid-2" style="margin-top:14px">' +
    '<section class="card">' +
      '<div class="card-head"><div><h2>Host</h2><div class="sub">the machine running this panel</div></div></div>' +
      '<div class="card-pad"><div class="kv">' +
        '<div class="k">Hostname</div><div class="v">' + esc(sys.host.hostname) + '</div>' +
        '<div class="k">IP address</div><div class="v">' + esc(sys.host.localIp) + '</div>' +
        '<div class="k">OS</div><div class="v">' + esc(sys.host.platform + ' ' + sys.host.release) + '</div>' +
        '<div class="k">Architecture</div><div class="v">' + esc(sys.host.arch) + '</div>' +
        '<div class="k">CPU cores</div><div class="v">' + sys.host.cpus + '</div>' +
        '<div class="k">Load average</div><div class="v">' + sys.host.load.join(' · ') + '</div>' +
        '<div class="k">Host uptime</div><div class="v">' + fmtUptime(sys.host.uptime) + '</div>' +
      '</div></div>' +
    '</section>' +

    '<section class="card">' +
      '<div class="card-head"><div><h2>Java runtime</h2><div class="sub">required to run Minecraft servers</div></div>' +
        '<div class="card-head-actions"><span class="pill ' + (java.installed ? 'good' : 'warn') + '">' + icon('coffee') + '<b>' +
        (java.installed ? 'installed' : 'missing') + '</b></span></div></div>' +
      '<div class="card-pad">' +
        (java.installed
          ? '<div class="kv">' +
              '<div class="k">Version</div><div class="v">' + esc(java.version || '?') + ' (major ' + (java.major || '?') + ')</div>' +
              '<div class="k">Vendor</div><div class="v">' + esc(java.vendor || 'unknown') + '</div>' +
              '<div class="k">Binary</div><div class="v">' + esc(java.path || 'java') + '</div>' +
            '</div>' +
            '<div class="notice info" style="margin-top:14px">' + icon('info') + '<div>Minecraft 1.20.5+ needs <b>Java 21</b>, older versions run on <b>Java 17</b> or 8.</div></div>'
          : '<div class="notice">' + icon('alert') + '<div><b>Java is not installed.</b> Servers will fail to start until you install it.</div></div>' +
            '<div class="code-block" style="margin-top:12px"><code>sudo bluenodes install-java</code>' +
            '<button class="btn btn-sm copy-btn" data-action="copy" data-copy="sudo bluenodes install-java">Copy</button></div>') +
      '</div>' +
    '</section>' +
  '</div>' +

  '<div class="grid grid-2" style="margin-top:14px">' +
    '<section class="card">' +
      '<div class="card-head"><div><h2>Panel</h2><div class="sub">bluenodes v' + VERSION + ' — made by blue</div></div></div>' +
      '<div class="card-pad"><div class="kv">' +
        '<div class="k">Panel port</div><div class="v">' + sys.panel.port + '</div>' +
        '<div class="k">Data directory</div><div class="v">' + esc(sys.panel.dataDir) + '</div>' +
        '<div class="k">GitHub</div><div class="v"><a href="' + REPO_URL + '" target="_blank" rel="noreferrer">siddhantpashte123-hub/blue.pannel</a></div>' +
        '<div class="k">Node.js</div><div class="v">' + esc(sys.node.version) + '</div>' +
        '<div class="k">Panel uptime</div><div class="v">' + fmtUptime(sys.panel.uptime) + '</div>' +
        '<div class="k">PID</div><div class="v">' + sys.panel.pid + '</div>' +
        '<div class="k">Servers</div><div class="v">' + state.servers.length + '</div>' +
      '</div></div>' +
    '</section>' +

    '<section class="card">' +
      '<div class="card-head"><div><h2>BLUENODES CLI</h2><div class="sub">one command — banner, menu, install</div></div></div>' +
      '<div class="card-pad">' +
        '<div class="cli-line"><span>install</span><code>curl -fsSL …/bluenodes -o /tmp/bluenodes && sudo bash /tmp/bluenodes</code>' +
          '<button class="btn btn-sm" data-action="copy" data-copy="' + esc(INSTALL_CMD) + '">' + icon('copy') + '</button></div>' +
        '<div class="cli-line"><span>status</span><code>sudo bluenodes status</code>' +
          '<button class="btn btn-sm" data-action="copy" data-copy="sudo bluenodes status">' + icon('copy') + '</button></div>' +
        '<div class="cli-line"><span>uninstall</span><code>sudo bluenodes uninstall</code>' +
          '<button class="btn btn-sm" data-action="copy" data-copy="sudo bluenodes uninstall">' + icon('copy') + '</button></div>' +
        '<div class="cli-line"><span>menu</span><code>sudo bluenodes</code>' +
          '<button class="btn btn-sm" data-action="copy" data-copy="sudo bluenodes">' + icon('copy') + '</button></div>' +
        '<div class="hint" style="margin-top:10px">Panel runs on <b>port 6868</b>. Open the firewall for port 6868 (panel) and your server ports (Minecraft).</div>' +
      '</div>' +
    '</section>' +
  '</div>';
}

// ---------------- about ----------------
function aboutPageHtml() {
  return '<section class="card">' +
    '<div class="card-pad" style="padding:22px">' +
      '<div class="terminal">' +
        '<div class="terminal-bar"><span class="console-dots"><i></i><i></i><i></i></span><b style="color:var(--muted)">bluenodes --about</b></div>' +
        '<pre class="ascii">' + asciiBlock() + '</pre>' +
      '</div>' +
      '<h2 style="margin:22px 0 6px;font-size:20px">BLUENODES <span style="color:var(--blue-2)">v' + VERSION + '</span></h2>' +
      '<p style="color:var(--muted);max-width:720px;margin:0">A self-hosted Minecraft hosting panel built for quick VPS setups. One command installs the panel on port <b>6868</b>, then you create, start and manage Minecraft servers straight from the browser. No Docker. No database. No dependencies — just Node.js.</p>' +
      '<div class="grid grid-3" style="margin-top:18px">' +
        featureCard('terminal', 'Live console', 'Attach to the server console, see server output and type commands in real time.') +
        featureCard('folder', 'File manager', 'Browse the server folder, edit configs and YAML, create files and folders.') +
        featureCard('archive', 'Backups', 'Create tar.gz backups, download them or restore in one click while the server is stopped.') +
        featureCard('cpu', 'System monitor', 'CPU, memory, disk, load and Java runtime detected from the host.') +
        featureCard('users', 'Player tracking', 'Online players are parsed from the console in real time.') +
        featureCard('zap', 'One-click install', 'Install, uninstall and check status from a single CLI menu.') +
      '</div>' +
      '<div class="notice info" style="margin-top:18px">' + icon('info') + '<div>Created and maintained by <b>blue</b>. Source: <a href="' + REPO_URL + '" target="_blank" rel="noreferrer">' + esc(REPO_URL.replace('https://', '')) + '</a></div></div>' +
    '</div>' +
  '</section>';
}

function featureCard(ico, title, text) {
  return '<div class="feature-card"><span class="stat-ico">' + icon(ico) + '</span><b>' + title + '</b><p>' + text + '</p></div>';
}

// ---------------- server detail ----------------
async function loadServerDetail(id, force) {
  if (!force && state.detail && state.detail.id === id && Date.now() - (state.detailAt || 0) < 15000) return;
  const data = await api('/api/servers/' + encodeURIComponent(id), { timeout: 20000 });
  state.detail = data.server;
  state.detailAt = Date.now();
  state.logs[id] = data.logs || [];
  state.properties = data.properties || {};
  mergeServer(data.server);
}

function serverHeaderHtml(s) {
  return '<div class="detail-head">' +
    '<div class="detail-cube">' + icon('box') + '</div>' +
    '<div class="detail-title">' +
      '<h2><span id="detailName">' + esc(s.name) + '</span>' + statusBadge(s.status, 'detailStatus') + '</h2>' +
      '<p id="detailSub">' + serverSubHtml(s) + '</p>' +
    '</div>' +
    '<div class="detail-actions" id="detailActions">' +
      serverActionsHtml(s, true).replace('<button class="btn btn-danger" data-action="kill-server"', '<button class="btn btn-ghost" data-action="kill-server"') +
    '</div>' +
  '</div>';
}

function serverSubHtml(s) {
  return '<span class="tag ' + esc(s.type) + '">' + esc(s.type) + '</span>' +
    '<span>' + esc(s.version) + '</span><span>·</span>' +
    '<span>port ' + s.port + '</span><span>·</span>' +
    '<span class="mono">' + esc(serverAddress(s)) + '</span>' +
    '<button class="icon-btn btn-sm" data-action="copy" data-copy="' + esc(serverAddress(s)) + '" title="Copy address">' + icon('copy') + '</button>';
}

function tabsHtml(active) {
  const tabs = [
    ['console', 'terminal', 'Console'],
    ['files', 'folder', 'Files'],
    ['settings', 'sliders', 'Settings'],
    ['properties', 'settings', 'Properties'],
    ['backups', 'archive', 'Backups']
  ];
  return '<div class="tabs">' + tabs.map((t) =>
    '<a class="tab' + (active === t[0] ? ' active' : '') + '" href="#/server/' + state.route.id + '/' + t[0] + '">' +
    icon(t[1]) + t[2] + '</a>').join('') + '</div>';
}

async function serverPageHtml() {
  const id = state.route.id;
  let server = serverById(id);
  if (!server) {
    await loadCore();
    server = serverById(id);
  }
  if (!server) {
    return '<div class="empty"><div class="empty-ico">' + icon('alert') + '</div><h3>Server not found</h3>' +
      '<p>It may have been deleted. Check the servers list.</p><a class="btn btn-primary" href="#/servers">Back to servers</a></div>';
  }
  try {
    await loadServerDetail(id, state.detailTabLoaded !== state.route.tab);
  } catch (err) {
    toast('Could not load server', err.message, 'err');
  }
  server = serverById(id) || server;
  state.detailTabLoaded = state.route.tab;

  if (state.route.tab === 'files') await fetchFilesData(id);
  if (state.route.tab === 'backups') await fetchBackupsData(id);

  let tabBody = '';
  if (state.route.tab === 'console') tabBody = consoleTabHtml(server);
  else if (state.route.tab === 'files') tabBody = filesTabHtml();
  else if (state.route.tab === 'settings') tabBody = settingsTabHtml(server);
  else if (state.route.tab === 'properties') tabBody = propertiesTabHtml();
  else if (state.route.tab === 'backups') tabBody = backupsTabHtml();

  return '<div class="crumbs"><a href="#/servers">Servers</a><span>›</span><span>' + esc(server.name) + '</span></div>' +
    serverHeaderHtml(server) + tabsHtml(state.route.tab) + '<div id="serverTabBody">' + tabBody + '</div>';
}

// console
function consoleTabHtml(s) {
  const logs = state.logs[s.id] || [];
  const players = s.players || [];
  return '<div class="server-detail-grid">' +
    '<section class="card">' +
      '<div class="card-head"><div><h2>Live console</h2><div class="sub">pid ' + (s.pid || '—') + ' · ' + fmtUptime(s.uptime) + ' · ' + (s.status === 'running' ? 'accepting commands' : s.status) + '</div></div>' +
        '<div class="card-head-actions">' +
          '<button class="btn btn-sm btn-ghost" data-action="toggle-follow" id="followBtn">' + icon('check') + 'Follow</button>' +
          '<button class="btn btn-sm btn-ghost" data-action="clear-console" data-id="' + s.id + '">' + icon('trash') + 'Clear</button>' +
        '</div></div>' +
      '<div class="card-pad" style="padding:14px">' +
        '<div class="console-wrap">' +
          '<div class="console-bar"><span class="console-dots"><i></i><i></i><i></i></span><b>' + esc(s.name) + '</b>' +
            '<span>· ' + esc(s.type + ' ' + s.version) + '</span>' +
            '<span style="margin-left:auto">' + (players.length ? players.length + ' online' : 'no players') + '</span></div>' +
          '<div class="console" id="console">' + (logs.length ? logs.map(consoleLineHtml).join('') : consoleEmptyHtml(s)) + '</div>' +
          '<form class="console-input" id="consoleForm" autocomplete="off">' +
            '<span class="prompt">&gt;</span>' +
            '<input id="consoleCmd" type="text" placeholder="' + (s.status === 'running' ? 'Type a command — say hello, list, whitelist add blue…' : 'Start the server to send commands') + '"' +
              (s.status === 'running' ? '' : ' disabled') + ' spellcheck="false" maxlength="200">' +
            '<button class="btn btn-primary btn-sm" type="submit"' + (s.status === 'running' ? '' : ' disabled') + '>Send</button>' +
          '</form>' +
        '</div>' +
        '<div class="chips" style="margin-top:12px">' +
          ['list', 'say Hello from BLUENODES', 'save-all', 'whitelist list', 'tps'].map((cmd) =>
            '<button class="chip" data-action="quick-command" data-id="' + s.id + '" data-cmd="' + esc(cmd) + '">' + esc(cmd) + '</button>').join('') +
        '</div>' +
      '</div>' +
    '</section>' +

    '<aside class="detail-aside">' +
      '<section class="card">' +
        '<div class="card-head"><div><h2>Quick stats</h2><div class="sub">updated every 2s</div></div></div>' +
        '<div class="card-pad" id="quickStats">' + quickStatsHtml(s) + '</div>' +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><div><h2>Online players</h2><div class="sub">' + players.length + ' connected</div></div></div>' +
        '<div class="card-pad"><div class="player-list" id="playerList">' +
          (players.length ? players.map((p) => '<span class="player-pill"><span class="avatar">' + esc(p.slice(0, 1)) + '</span>' + esc(p) + '</span>').join('')
            : '<span class="hint">No players online right now.</span>') +
        '</div></div>' +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><div><h2>Server</h2><div class="sub">details</div></div></div>' +
        '<div class="card-pad"><div class="kv">' +
          '<div class="k">Address</div><div class="v">' + esc(serverAddress(s)) + '</div>' +
          '<div class="k">Jar</div><div class="v">' + esc(s.jar || 'server.jar') + ' (' + esc(s.jarText || '') + ')</div>' +
          '<div class="k">Folder size</div><div class="v">' + esc(s.disk || '—') + '</div>' +
          '<div class="k">RAM limit</div><div class="v">' + s.memory + ' MB</div>' +
          '<div class="k">Auto restart</div><div class="v">' + (s.autoRestart ? 'enabled' : 'disabled') + '</div>' +
          '<div class="k">Created</div><div class="v">' + fmtAgo(s.createdAt) + '</div>' +
        '</div>' +
        (s.lastError ? '<div class="notice danger" style="margin-top:12px">' + icon('alert') + '<div><b>Last error</b><br><span class="mono">' + esc(s.lastError.line) + '</span></div></div>' : '') +
        '</div>' +
      '</section>' +
    '</aside>' +
  '</div>';
}

function quickStatsHtml(s) {
  const running = s.status === 'running' || s.status === 'starting';
  return '<div class="quick-grid">' +
    '<div class="quick"><span>CPU</span><b class="js-quick-cpu">' + (running ? (s.cpu || 0).toFixed(0) + '%' : '—') + '</b></div>' +
    '<div class="quick"><span>RAM</span><b class="js-quick-ram">' + (running ? (s.ramText || '—') : '—') + '</b></div>' +
    '<div class="quick"><span>Players</span><b class="js-quick-players">' + (s.online || 0) + '</b></div>' +
    '<div class="quick"><span>Uptime</span><b class="js-quick-uptime">' + fmtUptime(s.uptime) + '</b></div>' +
  '</div>' +
  '<div class="health-row" style="margin-top:12px"><span>RAM limit</span><b>' + s.memory + ' MB</b></div>' +
  '<div class="meter"><span style="width:100%"></span></div>';
}

function consoleEmptyHtml(s) {
  return '<div class="console-empty">' +
    (s.status === 'running' ? 'Connected — waiting for server output…' : 'Server is offline. Press Start to boot it.') +
    '</div>';
}

function logClass(line) {
  if (/^\[console\]/.test(line)) return 'cmd';
  if (/^\[BLUENODES\]/.test(line)) return 'sys';
  if (/\b(ERROR|SEVERE|FATAL)\b|Exception|Error:|Caused by:|FAILED/.test(line)) return 'error';
  if (/\bWARN(ING)?\b/.test(line)) return 'warn';
  if (/joined the game|left the game|<[^>]+> /.test(line)) return 'chat';
  return 'info';
}

function consoleLineHtml(entry) {
  return '<span class="ln ' + logClass(entry.line) + '"><span class="ts">' + fmtTime(entry.t) + '</span>' + esc(entry.line) + '</span>';
}

function appendConsoleLine(id, entry) {
  if (!(state.route.view === 'server' && state.route.id === id && state.route.tab === 'console')) return;
  const box = $('#console');
  if (!box) return;
  const empty = box.querySelector('.console-empty');
  if (empty) empty.remove();
  box.insertAdjacentHTML('beforeend', consoleLineHtml(entry));
  while (box.childElementCount > 900) box.firstElementChild.remove();
  if (state.consoleFollow) box.scrollTop = box.scrollHeight;
}

function updateDashboardCounts() {
  const servers = state.servers;
  const running = servers.filter((x) => x.status === 'running' || x.status === 'starting').length;
  const players = servers.reduce((n, x) => n + (x.online || 0), 0);
  const setText = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };
  setText('#dashServerValue', String(servers.length));
  setText('#dashPlayers', String(players));
  setText('#dashServerFoot', servers.length + ' total on this node');
  const foot = $('#dashPlayersFoot');
  if (foot) foot.textContent = running ? 'across ' + running + ' live server' + (running === 1 ? '' : 's') : 'no servers online';
  setText('#navServerCount', String(servers.length));
  setText('#heroServers', String(servers.length));
  setText('#heroRunning', String(running));
  setText('#heroPlayers', String(players));
}

function updateServerHeader() {
  const s = serverById(state.route.id);
  if (!s) return;
  const name = $('#detailName');
  if (name) name.textContent = s.name;
  const status = $('#detailStatus');
  if (status) status.outerHTML = statusBadge(s.status, 'detailStatus');
  const sub = $('#detailSub');
  if (sub) sub.innerHTML = serverSubHtml(s);
  const actions = $('#detailActions');
  if (actions) {
    actions.innerHTML = serverActionsHtml(s, true)
      .replace('<button class="btn btn-danger" data-action="kill-server"', '<button class="btn btn-ghost" data-action="kill-server"');
    paintIcons(actions);
  }
  const input = $('#consoleCmd');
  if (input) {
    const live = s.status === 'running';
    input.disabled = !live;
    input.placeholder = live ? 'Type a command — say hello, list, whitelist add blue…' : 'Start the server to send commands';
    const send = input.form ? input.form.querySelector('button[type="submit"]') : null;
    if (send) send.disabled = !live;
  }
}

function updateServerQuickStats() {
  const s = serverById(state.route.id);
  if (!s) return;
  const running = s.status === 'running' || s.status === 'starting';
  const set = (sel, value) => {
    const el = $(sel);
    if (el) el.textContent = value;
  };
  set('.js-quick-cpu', running ? (s.cpu || 0).toFixed(0) + '%' : '—');
  set('.js-quick-ram', running ? (s.ramText || '—') : '—');
  set('.js-quick-players', String(s.online || 0));
  set('.js-quick-uptime', fmtUptime(s.uptime));
  const list = $('#playerList');
  const players = s.players || [];
  if (list) {
    list.innerHTML = players.length
      ? players.map((p) => '<span class="player-pill"><span class="avatar">' + esc(p.slice(0, 1)) + '</span>' + esc(p) + '</span>').join('')
      : '<span class="hint">No players online right now.</span>';
  }
}

// files
function filesTabHtml() {
  const dir = state.files.path || '';
  const parts = dir ? dir.split('/').filter(Boolean) : [];
  const crumbs = ['<button data-action="file-nav" data-path="">root</button>'];
  parts.forEach((part, i) => {
    crumbs.push('<span class="sep">/</span><button data-action="file-nav" data-path="' + esc(parts.slice(0, i + 1).join('/')) + '">' + esc(part) + '</button>');
  });
  return '<section class="card">' +
    '<div class="card-head"><div><h2>File manager</h2><div class="sub">' + (state.files.entries.length || 0) + ' items in this folder</div></div>' +
      '<div class="card-head-actions file-toolbar">' +
        '<button class="btn btn-sm btn-ghost" data-action="file-up" data-path="' + esc(dir) + '">' + icon('up') + 'Up</button>' +
        '<button class="btn btn-sm" data-action="file-new">' + icon('file') + 'New file</button>' +
        '<button class="btn btn-sm" data-action="file-mkdir">' + icon('folder') + 'Folder</button>' +
        '<button class="btn btn-sm btn-ghost" data-action="file-refresh">' + icon('refresh') + '</button>' +
      '</div></div>' +
    '<div class="card-pad" style="padding:14px">' +
      '<div class="breadcrumb" style="margin-bottom:10px">' + crumbs.join('') + '</div>' +
      '<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Size</th><th class="hide-sm">Modified</th><th></th></tr></thead><tbody>' +
      (state.files.loading ? '<tr><td colspan="4" class="muted">Loading…</td></tr>' :
        state.files.entries.length
          ? state.files.entries.map(fileRowHtml).join('')
          : '<tr><td colspan="4" class="muted">This folder is empty.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="hint" style="margin-top:10px">Editing a file while the server is running may be overwritten by the server — stop it for important changes.</div>' +
    '</div>' +
  '</section>';
}

function fileRowHtml(entry) {
  const path = (state.files.path ? state.files.path + '/' : '') + entry.name;
  return '<tr>' +
    '<td><div class="file-name ' + (entry.dir ? 'dir' : '') + '" data-action="' + (entry.dir ? 'file-nav' : 'file-open') + '" data-path="' + esc(path) + '">' +
      icon(entry.dir ? 'folder' : 'file-text') + '<span>' + esc(entry.name) + '</span></div></td>' +
    '<td class="muted">' + esc(entry.sizeText || '—') + '</td>' +
    '<td class="muted hide-sm">' + (entry.mtime ? fmtAgo(entry.mtime) : '—') + '</td>' +
    '<td><div class="row-actions">' +
      (entry.dir ? '' : '<button class="icon-btn btn-sm" data-action="file-open" data-path="' + esc(path) + '" title="Edit">' + icon('code') + '</button>') +
      '<button class="icon-btn btn-sm" data-action="file-delete" data-path="' + esc(path) + '" title="Delete">' + icon('trash') + '</button>' +
    '</div></td>' +
  '</tr>';
}

// settings
function settingsTabHtml(s) {
  return '<div class="grid grid-2">' +
    '<section class="card">' +
      '<div class="card-head"><div><h2>Server settings</h2><div class="sub">changes need a restart to apply</div></div></div>' +
      '<div class="card-pad">' +
        '<form id="settingsForm" data-id="' + s.id + '">' +
          '<div class="form-grid">' +
            '<div class="field full"><label for="setName">Server name</label>' +
              '<input type="text" id="setName" value="' + esc(s.name) + '" maxlength="32"></div>' +
            '<div class="field"><label for="setMemory">RAM limit</label>' +
              '<div class="range-row"><input type="range" id="setMemory" min="512" max="16384" step="512" value="' + s.memory + '">' +
              '<span class="range-value" id="setMemoryValue">' + (s.memory >= 1024 ? (s.memory / 1024) + ' GB' : s.memory + ' MB') + '</span></div></div>' +
            '<div class="field"><label for="setPort">Port</label>' +
              '<input type="number" id="setPort" min="1024" max="65535" value="' + s.port + '"' + (s.status !== 'stopped' ? ' disabled' : '') + '>' +
              (s.status !== 'stopped' ? '<span class="hint">Stop the server to change the port.</span>' : '') + '</div>' +
            '<div class="field full">' +
              '<label class="switch"><input type="checkbox" id="setAutoRestart"' + (s.autoRestart ? ' checked' : '') + '><span class="track"></span>' +
                '<span class="switch-label">Auto-restart on crash</span></label>' +
              '<label class="switch" style="margin-top:12px"><input type="checkbox" id="setEula"' + (s.eula ? ' checked' : '') + '><span class="track"></span>' +
                '<span class="switch-label">Minecraft EULA accepted</span></label>' +
            '</div>' +
          '</div>' +
          '<div class="form-actions"><button type="submit" class="btn btn-primary">' + icon('save') + 'Save settings</button></div>' +
        '</form>' +
      '</div>' +
    '</section>' +

    '<section class="card">' +
      '<div class="card-head"><div><h2>Danger zone</h2><div class="sub">irreversible actions</div></div></div>' +
      '<div class="card-pad">' +
        '<div class="danger-row">' +
          '<div><b>Force kill</b><div class="hint">Stops the java process immediately — the world may not save.</div></div>' +
          '<button class="btn btn-danger btn-sm" data-action="kill-server" data-id="' + s.id + '">' + icon('power') + 'Kill</button>' +
        '</div>' +
        '<div class="danger-row" style="margin-top:12px">' +
          '<div><b>Delete server</b><div class="hint">Removes the server, its world and every file inside its folder.</div></div>' +
          '<button class="btn btn-danger btn-sm" data-action="delete-server" data-id="' + s.id + '" data-name="' + esc(s.name) + '">' + icon('trash') + 'Delete</button>' +
        '</div>' +
        '<div class="notice info" style="margin-top:16px">' + icon('info') + '<div>Backups in <span class="mono">data/backups</span> stay on disk after the server is deleted.</div></div>' +
      '</div>' +
    '</section>' +
  '</div>';
}

// properties
const COMMON_PROPS = ['server-port', 'motd', 'max-players', 'gamemode', 'difficulty', 'online-mode', 'pvp', 'view-distance', 'simulation-distance', 'spawn-protection', 'level-name', 'white-list', 'enable-command-block', 'allow-flight'];

function propertiesTabHtml() {
  const props = state.properties || {};
  const keys = Object.keys(props);
  const ordered = COMMON_PROPS.filter((k) => keys.includes(k)).concat(keys.filter((k) => !COMMON_PROPS.includes(k)).sort());
  return '<section class="card">' +
    '<div class="card-head"><div><h2>server.properties</h2><div class="sub">' + keys.length + ' properties · restart the server to apply</div></div>' +
      '<div class="card-head-actions"><button class="btn btn-sm btn-primary" data-action="save-properties">' + icon('save') + 'Save properties</button></div></div>' +
    '<div class="card-pad">' +
      (ordered.length
        ? '<div class="prop-list" id="propList">' + ordered.map((key) =>
            '<div class="prop-row"><label>' + esc(key) + '</label>' +
            '<input type="text" data-prop="' + esc(key) + '" value="' + esc(props[key]) + '" spellcheck="false"></div>').join('') + '</div>'
        : '<div class="empty" style="padding:26px"><h3>No properties yet</h3><p>Start the server once so Minecraft generates server.properties.</p></div>') +
      '<div class="prop-add">' +
        '<input type="text" id="newPropKey" placeholder="new-key">' +
        '<input type="text" id="newPropValue" placeholder="value">' +
        '<button class="btn btn-sm" data-action="add-property">' + icon('plus') + 'Add</button>' +
      '</div>' +
      '<div class="hint" style="margin-top:12px">Tip: <b>online-mode=false</b> allows cracked clients — only for private servers.</div>' +
    '</div>' +
  '</section>';
}

// backups
function backupsTabHtml() {
  return '<section class="card">' +
    '<div class="card-head"><div><h2>Backups</h2><div class="sub">tar.gz archives of the whole server folder</div></div>' +
      '<div class="card-head-actions"><button class="btn btn-primary btn-sm" data-action="backup-create">' + icon('archive') + 'Create backup</button></div></div>' +
    '<div class="card-pad">' +
      (state.backups.length
        ? '<div style="display:flex;flex-direction:column;gap:8px">' + state.backups.map((b) =>
            '<div class="backup-row"><span class="stat-ico" style="width:28px;height:28px">' + icon('archive') + '</span>' +
            '<div style="min-width:0"><div class="b-name">' + esc(b.file) + '</div><div class="b-meta">' + esc(b.sizeText) + ' · ' + fmtDate(b.createdAt) + '</div></div>' +
            '<div class="row-actions">' +
              '<a class="icon-btn btn-sm" href="/api/servers/' + state.route.id + '/backups/download?file=' + encodeURIComponent(b.file) + (API_TOKEN ? '&token=' + encodeURIComponent(API_TOKEN) : '') + '" title="Download">' + icon('download') + '</a>' +
              '<button class="icon-btn btn-sm" data-action="backup-restore" data-file="' + esc(b.file) + '" title="Restore">' + icon('restart') + '</button>' +
              '<button class="icon-btn btn-sm" data-action="backup-delete" data-file="' + esc(b.file) + '" title="Delete">' + icon('trash') + '</button>' +
            '</div></div>').join('') + '</div>'
        : '<div class="empty" style="padding:34px"><div class="empty-ico">' + icon('archive') + '</div>' +
          '<h3>No backups yet</h3><p>Create one before updating plugins or changing the world.</p>' +
          '<button class="btn btn-primary" data-action="backup-create">' + icon('archive') + 'Create backup</button></div>') +
      '<div class="notice info" style="margin-top:14px">' + icon('info') +
        '<div>Restoring requires the server to be stopped. Backups are stored in <span class="mono">data/backups</span> and are kept even if you delete the server.</div></div>' +
    '</div>' +
  '</section>';
}

// ---------------- job modal ----------------
function jobModal(job) {
  openModal({
    title: 'Installing Minecraft server',
    sub: 'The panel downloads the jar and prepares the folder.',
    body: '<div class="job-phase"><span id="jobPhase">' + esc(job.phase || 'Starting') + '</span><span id="jobPct">' + (job.percent || 0) + '%</span></div>' +
      '<div class="progress"><span id="jobBar" style="width:' + (job.percent || 0) + '%"></span></div>' +
      '<div class="job-note" id="jobNote" style="margin-top:12px;font-size:12px;color:var(--muted)">This can take a minute on slow connections. You can close this window — the install keeps running.</div>' +
      '<div id="jobError"></div>',
    footer: '<button class="btn btn-ghost" data-close="1">Close</button>',
    onClose: () => { state.job = null; }
  });
}

const finishedJobs = {};

function applyJobEvent(job) {
  if (!job || !job.id) return;
  if (!state.job || state.job.id !== job.id) {
    if (job.status === 'running') return;
  }
  state.job = job;
  const phase = $('#jobPhase');
  const pct = $('#jobPct');
  const bar = $('#jobBar');
  if (phase) phase.textContent = job.phase || 'Working';
  if (pct) pct.textContent = (job.percent || 0) + '%';
  if (bar) bar.style.width = (job.percent || 0) + '%';

  if (job.status === 'error' && !finishedJobs[job.id]) {
    finishedJobs[job.id] = true;
    if ($('#jobError')) {
      $('#jobError').innerHTML = '<div class="notice danger" style="margin-top:14px">' + icon('alert') +
        '<div><b>Install failed</b><br>' + esc(job.error || 'unknown error') + '</div></div>';
      if ($('#jobNote')) $('#jobNote').textContent = 'Fix the problem above and try again.';
    }
    toast('Install failed', job.error || 'unknown error', 'err');
  }

  if (job.status === 'done' && !finishedJobs[job.id]) {
    finishedJobs[job.id] = true;
    if ($('#jobNote')) $('#jobNote').textContent = 'Server ready. Opening it…';
    if (bar) bar.style.width = '100%';
    if (pct) pct.textContent = '100%';
    toast('Server installed', 'Your Minecraft server is ready.', 'ok');
    setTimeout(() => {
      closeModal();
      state.job = null;
      if (job.serverId) {
        state.detail = null;
        state.detailAt = 0;
        loadCore().then(() => navigate('#/server/' + job.serverId + '/console')).catch(() => {});
      } else {
        reloadServers();
      }
    }, 700);
  }
}

async function pollJob(id) {
  let tries = 0;
  while (tries++ < 600) {
    await new Promise((r) => setTimeout(r, 1500));
    if (!state.job || state.job.id !== id) return;
    if (state.job.status === 'done' || state.job.status === 'error') return;
    try {
      const job = await api('/api/jobs/' + id);
      if (job.status !== state.job.status || job.percent !== state.job.percent) applyJobEvent(job);
    } catch (err) { /* keep polling */ }
  }
}

// ---------------- main render ----------------
async function render() {
  clearSystemTimer();
  state.route = parseRoute();
  setActiveNav();
  const view = $('#view');
  const route = state.route;

  if (!state.bootstrapped) {
    try {
      await loadCore();
    } catch (err) {
      view.innerHTML = errorView(err.message);
      renderChrome();
      return;
    }
  }
  renderChrome();

  try {
    if (route.view === 'dashboard') {
      view.innerHTML = dashboardHtml();
    } else if (route.view === 'servers') {
      view.innerHTML = serversPageHtml();
      renderServersGrid();
      bindServerSearch();
    } else if (route.view === 'create') {
      view.innerHTML = createPageHtml();
      initCreateForm();
    } else if (route.view === 'system') {
      view.innerHTML = systemPageHtml();
    } else if (route.view === 'about') {
      view.innerHTML = aboutPageHtml();
    } else if (route.view === 'server') {
      view.innerHTML = '<div class="skeleton-wrap"><div class="skeleton" style="height:70px"></div><div class="skeleton" style="height:420px"></div></div>';
      view.innerHTML = await serverPageHtml();
      if (route.tab === 'console') scrollConsoleToBottom();
    }
  } catch (err) {
    view.innerHTML = errorView(err.message);
  }

  paintIcons(view);
  renderChrome();

  if (route.view === 'dashboard' || route.view === 'system') {
    systemTimer = setInterval(refreshSystem, 8000);
  }
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

async function refreshSystem() {
  try {
    const sys = await api('/api/system', { timeout: 12000 });
    state.system = sys;
    renderChrome();
    if (state.route.view === 'dashboard') {
      updateDashboardLive(sys);
    } else if (state.route.view === 'system') {
      updateSystemLive(sys);
    }
  } catch (err) { /* ignore */ }
}

function updateDashboardLive(sys) {
  const setText = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };
  setText('#dashCpu', String(sys.cpu.percent));
  setText('#dashCpuText', sys.cpu.percent + '%');
  setText('#dashRam', String(sys.memory.percent));
  setText('#dashRamText', sys.memory.percent + '%');
  setText('#dashDiskText', sys.disk.percent + '%');
  const bars = { '#dashCpuBar': sys.cpu.percent, '#dashRamBar': sys.memory.percent, '#dashDiskBar': sys.disk.percent };
  Object.keys(bars).forEach((sel) => {
    const el = $(sel);
    if (el) el.style.width = bars[sel] + '%';
  });
  const spark = $('#dashCpuSpark');
  if (spark) spark.innerHTML = sparkline(sys.cpu.history);
  const servers = state.servers;
  const running = servers.filter((s) => s.status === 'running' || s.status === 'starting').length;
  const players = servers.reduce((n, s) => n + (s.online || 0), 0);
  setText('#dashServerValue', String(servers.length));
  setText('#dashPlayers', String(players));
  const foot = $('#dashPlayersFoot');
  if (foot) foot.textContent = running ? 'across ' + running + ' live server' + (running === 1 ? '' : 's') : 'no servers online';
}

function updateSystemLive(sys) {
  const setText = (sel, value) => { const el = $(sel); if (el) el.textContent = value; };
  setText('[data-sys="cpu"]', String(sys.cpu.percent));
  setText('[data-sys="mem"]', String(sys.memory.percent));
  setText('[data-sys="memText"]', sys.memory.usedText + ' / ' + sys.memory.totalText);
  setText('[data-sys="disk"]', String(sys.disk.percent));
  setText('[data-sys="diskText"]', sys.disk.usedText + ' / ' + sys.disk.totalText);
}

function scrollConsoleToBottom() {
  const box = $('#console');
  if (box) box.scrollTop = box.scrollHeight;
}

function bindServerSearch() {
  const input = $('#serverSearch');
  if (!input) return;
  input.value = state.search;
  input.addEventListener('input', () => {
    state.search = input.value;
    renderServersGrid();
  });
}

// ---------------- create form logic ----------------
async function initCreateForm() {
  const form = $('#createForm');
  if (!form) return;
  const c = state.create;

  const memory = $('#memory');
  const memoryValue = $('#memoryValue');
  const syncMemory = () => {
    const v = Number(memory.value) || 1024;
    c.memory = v;
    memoryValue.textContent = v >= 1024 ? (v / 1024) + ' GB' : v + ' MB';
    const pv = $('#pvMemory');
    if (pv) pv.textContent = memoryValue.textContent;
  };
  memory.addEventListener('input', syncMemory);

  const port = $('#port');
  port.addEventListener('input', () => {
    c.port = port.value;
    const pv = $('#pvAddress');
    if (pv) pv.textContent = serverAddress({ port: port.value || 25565 });
  });

  const version = $('#version');
  version.addEventListener('input', () => {
    c.version = version.value;
    const el = $('#pvVersion');
    if (el) el.textContent = version.value || '—';
  });

  const name = $('#name');
  name.addEventListener('input', () => {
    c.name = name.value;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitCreate(form);
  });

  renderChips();
  updateVersionHint();
  if (state.versionsState === 'idle' || state.versionsState === 'error') {
    ensureVersions(false);
  } else {
    fillVersionDatalist();
  }
  if (!c.version && state.versions && state.versions.latest) {
    version.value = state.versions.latest.release;
    c.version = version.value;
    const pv = $('#pvVersion');
    if (pv) pv.textContent = version.value;
  }
}

function updateVersionHint() {
  const hint = $('#versionHint');
  if (!hint) return;
  if (state.versionsState === 'loading') {
    hint.textContent = 'loading versions…';
    hint.className = 'version-latest loading';
  } else if (state.versionsState === 'error') {
    hint.textContent = 'offline — type a version manually';
    hint.className = 'version-latest bad';
  } else if (state.versions && state.versions.latest) {
    hint.textContent = 'latest: ' + state.versions.latest.release;
    hint.className = 'version-latest ok';
  } else {
    hint.textContent = '';
  }
}

async function ensureVersions(force) {
  if (state.versionsState === 'loading') return;
  if (state.versions && !force) {
    fillVersionDatalist();
    updateVersionHint();
    return;
  }
  state.versionsState = 'loading';
  updateVersionHint();
  try {
    const data = await api('/api/versions' + (force ? '?force=1' : ''), { timeout: 60000 });
    state.versions = data;
    state.versionsState = 'ready';
    const versionInput = $('#version');
    if (versionInput && !versionInput.value && data.latest) {
      versionInput.value = data.latest.release;
      state.create.version = data.latest.release;
      const pv = $('#pvVersion');
      if (pv) pv.textContent = state.create.version;
    }
  } catch (err) {
    state.versionsState = 'error';
    state.versionsError = err.message;
    toast('Version list unavailable', 'Type the Minecraft version manually.', 'err');
  }
  updateVersionHint();
  fillVersionDatalist();
  renderChips();
}

function currentVersionPool() {
  if (!state.versions) return null;
  if (state.create.type === 'paper') return state.versions.paper || [];
  return (state.versions.versions || []).map((v) => v.id);
}

function fillVersionDatalist() {
  const list = $('#versionList');
  if (!list) return;
  const pool = currentVersionPool();
  if (!pool) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = pool.slice(0, 400).map((v) => '<option value="' + esc(v) + '"></option>').join('');
}

function renderChips() {
  const box = $('#versionChips');
  if (!box) return;
  const pool = currentVersionPool();
  const popular = ['1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.9'];
  const shown = pool ? popular.filter((v) => pool.includes(v)).slice(0, 7) : popular.slice(0, 5);
  const latest = state.versions && state.versions.latest ? state.versions.latest.release : null;
  const showLatest = latest && (!pool || pool.includes(latest));
  box.innerHTML = (showLatest ? '<button type="button" class="chip chip-hi" data-action="pick-version" data-version="' + esc(latest) + '">latest ' + esc(latest) + '</button>' : '') +
    shown.map((v) => '<button type="button" class="chip" data-action="pick-version" data-version="' + esc(v) + '">' + esc(v) + '</button>').join('');
}

function submitCreate(form) {
  const c = state.create;
  const name = $('#name').value.trim();
  const version = $('#version').value.trim();
  const portValue = $('#port').value.trim();
  let ok = true;
  const mark = (input, valid) => {
    const field = input.closest('.field');
    if (field) field.classList.toggle('invalid', !valid);
    if (!valid) ok = false;
  };
  mark($('#name'), name.length > 0);
  mark($('#version'), /^[A-Za-z0-9._-]{3,32}$/.test(version));
  if (portValue) mark($('#port'), Number(portValue) >= 1024 && Number(portValue) <= 65535);
  if (!ok) {
    toast('Missing details', 'Fix the highlighted fields and try again.', 'err');
    return;
  }
  const payload = {
    name: name,
    version: version,
    type: c.type,
    memory: Number($('#memory').value),
    maxPlayers: Number($('#maxPlayers').value) || 20,
    gamemode: $('#gamemode').value,
    difficulty: $('#difficulty').value,
    motd: $('#motd').value.trim(),
    autoRestart: $('#autoRestart').checked,
    eula: $('#eula').checked
  };
  if (portValue) payload.port = Number(portValue);
  startCreate(payload);
}

async function startCreate(payload) {
  const btn = $('#createSubmit');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = icon('refresh') + 'Preparing…';
  }
  try {
    const data = await api('/api/servers', { method: 'POST', body: payload, timeout: 30000 });
    state.job = { id: data.job, percent: 1, phase: 'Queued', status: 'running' };
    jobModal(state.job);
    pollJob(data.job);
  } catch (err) {
    toast('Could not create server', err.message, 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = icon('download') + 'Install server';
      paintIcons(btn);
    }
  }
}

async function fetchFilesData(id, quiet) {
  state.files.id = id;
  state.files.loading = true;
  try {
    const data = await api('/api/servers/' + id + '/files?path=' + encodeURIComponent(state.files.path || ''));
    state.files.entries = data.entries;
  } catch (err) {
    state.files.entries = [];
    if (!quiet) toast('Could not list files', err.message, 'err');
  }
  state.files.loading = false;
}

async function refreshFiles() {
  const id = state.route.id;
  if (!id) return;
  await fetchFilesData(id);
  const body = $('#serverTabBody');
  if (body && state.route.tab === 'files') {
    body.innerHTML = filesTabHtml();
    paintIcons(body);
  }
}

async function fetchBackupsData(id, quiet) {
  try {
    const data = await api('/api/servers/' + id + '/backups');
    state.backups = data || [];
  } catch (err) {
    state.backups = [];
    if (!quiet) toast('Could not load backups', err.message, 'err');
  }
}

async function refreshBackups() {
  const id = state.route.id;
  if (!id) return;
  await fetchBackupsData(id);
  const body = $('#serverTabBody');
  if (body && state.route.tab === 'backups') {
    body.innerHTML = backupsTabHtml();
    paintIcons(body);
  }
}
