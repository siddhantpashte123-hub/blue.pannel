/* ============================================================
   BLUENODES — core: helpers, api, state, router, sse, chrome
   made by blue
   ============================================================ */
'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

function esc(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  restart: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'hard-drive': '<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  up: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
};

function icon(name) {
  const body = ICONS[name] || ICONS.info;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
}

function paintIcons(root) {
  $$('[data-icon]', root || document).forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
    delete el.dataset.icon;
  });
}

// ---------------- formatting ----------------
function fmtUptime(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return d + 'd ' + h + 'h';
  if (h) return h + 'h ' + m + 'm';
  if (m) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return (i === 0 ? v.toFixed(0) : v.toFixed(v >= 100 ? 0 : 1)) + ' ' + units[i];
}

function fmtAgo(ts) {
  if (!ts) return '—';
  const diff = Math.max(0, Date.now() - Number(ts));
  const s = Math.floor(diff / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour12: false });
  } catch (err) {
    return '';
  }
}

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch (err) {
    return '';
  }
}

function meterClass(pct) {
  if (pct >= 88) return 'danger';
  if (pct >= 70) return 'warn';
  return '';
}

// ---------------- api ----------------
async function api(path, options) {
  options = options || {};
  const method = options.method || 'GET';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30000);
  let res;
  try {
    const headers = {};
    if (options.body) headers['Content-Type'] = 'application/json';
    if (API_TOKEN) headers.Authorization = 'Bearer ' + API_TOKEN;
    res = await fetch(path, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      cache: 'no-store'
    });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(err.name === 'AbortError' ? 'Request timed out' : 'Cannot reach the panel (is it running?)');
  }
  clearTimeout(timer);
  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    throw new Error('Bad response from panel (HTTP ' + res.status + ')');
  }
  if (!res.ok || !payload || payload.ok === false) {
    throw new Error((payload && payload.error) || 'Request failed (HTTP ' + res.status + ')');
  }
  return payload.data;
}

// ---------------- state ----------------
const state = {
  route: { view: 'dashboard', id: null, tab: 'console' },
  servers: [],
  system: null,
  versions: null,
  versionsState: 'idle',
  logs: {},
  files: { id: null, path: '', entries: [], loading: false },
  properties: {},
  backups: [],
  detail: null,
  job: null,
  search: '',
  bootstrapped: false,
  online: false,
  create: { type: 'vanilla', version: '', memory: 2048, port: '', name: '' },
  consoleFollow: true,
  resourceTab: 'console'
};

const VERSION = '1.0.0';

// optional BLUENODES_TOKEN support: ?token=... is stored in localStorage
const API_TOKEN = (() => {
  try {
    const fromUrl = new URLSearchParams(location.search).get('token');
    if (fromUrl) {
      localStorage.setItem('bluenodes_token', fromUrl);
      const clean = location.pathname + (location.hash || '');
      history.replaceState(null, '', clean);
      return fromUrl;
    }
    return localStorage.getItem('bluenodes_token') || '';
  } catch (err) {
    return '';
  }
})();
const REPO_URL = 'https://github.com/siddhantpashte123-hub/blue.pannel';
const INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/siddhantpashte123-hub/blue.pannel/main/cli/bluenodes -o /tmp/bluenodes && sudo bash /tmp/bluenodes';
const ASCII = [
  '██████╗  ██╗      ██╗   ██╗ ███████╗ ███╗   ██╗  ██████╗  ██████╗  ███████╗ ███████╗',
  '██╔══██╗ ██║      ██║   ██║ ██╔════╝ ████╗  ██║ ██╔═══██╗ ██╔══██╗ ██╔════╝ ██╔════╝',
  '██████╔╝ ██║      ██║   ██║ █████╗   ██╔██╗ ██║ ██║   ██║ ██║  ██║ █████╗   ███████╗',
  '██╔══██╗ ██║      ██║   ██║ ██╔══╝   ██║╚██╗██║ ██║   ██║ ██║  ██║ ██╔══╝   ╚════██║',
  '██████╔╝ ███████╗ ╚██████╔╝ ███████╗ ██║ ╚████║ ╚██████╔╝ ██████╔╝ ███████╗ ███████║',
  '╚═════╝  ╚══════╝  ╚═════╝  ╚══════╝ ╚═╝  ╚═══╝  ╚═════╝  ╚═════╝  ╚══════╝ ╚══════╝'
];

function serverById(id) {
  return state.servers.find((s) => s.id === id) || null;
}

function mergeServer(snap) {
  if (!snap || !snap.id) return;
  const idx = state.servers.findIndex((s) => s.id === snap.id);
  if (idx >= 0) state.servers[idx] = Object.assign({}, state.servers[idx], snap);
  else state.servers.push(snap);
}

// ---------------- toasts ----------------
function toast(title, message, type) {
  type = type || 'info';
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const ico = type === 'ok' ? 'check' : type === 'err' ? 'alert' : 'info';
  el.innerHTML =
    '<span class="nav-ico">' + icon(ico) + '</span>' +
    '<div class="t-body"><div class="t-title">' + esc(title) + '</div>' +
    (message ? '<div class="t-msg">' + esc(message) + '</div>' : '') + '</div>';
  root.appendChild(el);
  const kill = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  setTimeout(kill, type === 'err' ? 6500 : 3800);
  el.addEventListener('click', kill);
}

// ---------------- modal ----------------
const modalState = { open: false, onClose: null };

function openModal(opts) {
  const root = $('#modalRoot');
  const wide = opts.wide ? ' wide' : '';
  root.innerHTML =
    '<div class="modal-backdrop" data-close="1"></div>' +
    '<div class="modal' + wide + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
        '<div><h3>' + esc(opts.title || '') + '</h3>' +
        (opts.sub ? '<div class="sub">' + esc(opts.sub) + '</div>' : '') + '</div>' +
        '<button class="icon-btn" data-close="1" aria-label="Close">' + icon('x') + '</button>' +
      '</div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer === false ? '' : '<div class="modal-foot">' + (opts.footer || '<button class="btn btn-ghost" data-close="1">Close</button>') + '</div>') +
    '</div>';
  root.classList.add('open');
  modalState.open = true;
  modalState.onClose = opts.onClose || null;
  root.onclick = (event) => {
    if (event.target.closest('[data-close]')) closeModal();
  };
  paintIcons(root);
  if (opts.onMount) opts.onMount(root);
  const focusEl = root.querySelector('[autofocus], input, select, textarea, button.btn-primary');
  if (focusEl && !opts.noFocus) setTimeout(() => focusEl.focus(), 60);
}

function closeModal() {
  const root = $('#modalRoot');
  if (!root.classList.contains('open')) return;
  root.classList.remove('open');
  root.innerHTML = '';
  modalState.open = false;
  const cb = modalState.onClose;
  modalState.onClose = null;
  if (typeof cb === 'function') cb();
}

function confirmDialog(opts) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      closeModal();
      resolve(value);
    };
    openModal({
      title: opts.title || 'Are you sure?',
      sub: opts.sub || '',
      body: '<div class="notice ' + (opts.danger ? 'danger' : 'info') + '">' +
        icon(opts.danger ? 'alert' : 'info') +
        '<div>' + (opts.message || '') + '</div></div>' +
        (opts.requireText ? '<div class="field" style="margin-top:14px"><label>Type <b>' + esc(opts.requireText) +
          '</b> to confirm</label><input type="text" id="confirmText" autofocus placeholder="' + esc(opts.requireText) + '"></div>' : ''),
      footer: '<button class="btn btn-ghost" data-close="1">Cancel</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" id="confirmBtn">' +
        esc(opts.confirmText || 'Confirm') + '</button>',
      onClose: () => done(false),
      onMount: (root) => {
        const btn = root.querySelector('#confirmBtn');
        btn.addEventListener('click', () => {
          if (opts.requireText) {
            const input = root.querySelector('#confirmText');
            if (input.value.trim() !== opts.requireText) {
              input.focus();
              toast('Name does not match', 'Type the exact server name to confirm.', 'err');
              return;
            }
          }
          settled = true;
          closeModal();
          resolve(true);
        });
        const input = root.querySelector('#confirmText');
        if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
      }
    });
  });
}

async function copyText(text, label) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Copied', label || 'Copied to clipboard', 'ok');
  } catch (err) {
    toast('Copy failed', 'Select and copy manually.', 'err');
  }
}

// ---------------- router ----------------
function parseRoute() {
  const raw = String(location.hash || '').replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  if (!parts.length) return { view: 'dashboard', id: null, tab: null };
  if (parts[0] === 'server' && parts[1]) {
    return {
      view: 'server',
      id: parts[1],
      tab: ['console', 'files', 'settings', 'properties', 'backups'].includes(parts[2]) ? parts[2] : 'console'
    };
  }
  if (['dashboard', 'servers', 'create', 'system', 'about'].includes(parts[0])) {
    return { view: parts[0], id: null, tab: null };
  }
  return { view: 'dashboard', id: null, tab: null };
}

function navigate(hash) {
  if (location.hash === hash) {
    render();
    return;
  }
  location.hash = hash;
}

function setActiveNav() {
  const view = state.route.view;
  $$('.nav-item').forEach((el) => {
    const route = el.dataset.route || '';
    const target = route.replace('#/', '');
    el.classList.toggle('active', target === view || (view === 'server' && target === 'servers'));
  });
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
}

// ---------------- chrome ----------------
function renderChrome() {
  const servers = state.servers;
  const running = servers.filter((s) => s.status === 'running' || s.status === 'starting').length;
  const players = servers.reduce((n, s) => n + (s.online || 0), 0);
  const nav = $('#navServerCount');
  if (nav) nav.textContent = String(servers.length);

  const sys = state.system;
  const pills = $('#sysPills');
  if (pills) {
    if (!sys) {
      pills.innerHTML = '';
    } else {
      pills.innerHTML =
        '<span class="pill" title="CPU usage"><span class="nav-ico">' + icon('cpu') + '</span><b>' + sys.cpu.percent + '%</b></span>' +
        '<span class="pill hide-md" title="Memory usage"><span class="nav-ico">' + icon('activity') + '</span><b>' + sys.memory.percent + '%</b></span>' +
        '<span class="pill hide-md" title="Disk usage"><span class="nav-ico">' + icon('hard-drive') + '</span><b>' + sys.disk.percent + '%</b></span>' +
        '<span class="pill ' + (sys.java.installed ? 'good' : 'warn') + '" title="Java runtime"><span class="nav-ico">' + icon('coffee') + '</span><b>' +
          (sys.java.installed ? 'Java ' + (sys.java.major || '') : 'No java') + '</b></span>';
    }
  }

  const javaValue = $('#javaSideValue');
  const javaCard = $('#javaCard');
  if (javaValue && sys) {
    if (sys.java.installed) {
      javaValue.className = 'sidebar-card-value ok';
      javaValue.textContent = 'Java ' + (sys.java.major || '?') + ' · ' + (sys.java.vendor || 'installed');
    } else {
      javaValue.className = 'sidebar-card-value bad';
      javaValue.textContent = 'Java not installed — servers cannot start';
    }
    if (javaCard) javaCard.style.display = '';
  }
  const liveDot = $('#liveDot');
  const liveLabel = $('#liveLabel');
  if (liveDot) {
    liveDot.className = 'dot-live ' + (state.online ? 'on' : 'off');
    liveLabel.textContent = state.online ? 'live · ' + running + ' running · ' + players + ' players' : 'reconnecting...';
  }
  $$('.js-version').forEach((el) => { el.textContent = VERSION; });
  const footerPort = $('#footerPort');
  if (footerPort && sys) footerPort.textContent = String(sys.panel.port);
  const title = $('#pageTitle');
  const sub = $('#pageSub');
  const meta = pageMeta();
  if (title) title.textContent = meta.title;
  if (sub) sub.textContent = meta.sub;
}

function pageMeta() {
  const r = state.route;
  if (r.view === 'dashboard') return { title: 'Dashboard', sub: 'Minecraft hosting, one command away.' };
  if (r.view === 'servers') return { title: 'Servers', sub: 'All Minecraft servers on this node.' };
  if (r.view === 'create') return { title: 'Create server', sub: 'Vanilla or Paper — installed in seconds.' };
  if (r.view === 'system') return { title: 'System', sub: 'Host resources, Java runtime and panel details.' };
  if (r.view === 'about') return { title: 'About BLUENODES', sub: 'made by blue' };
  if (r.view === 'server') {
    const s = serverById(r.id);
    return { title: s ? s.name : 'Server', sub: s ? (s.type + ' ' + s.version + ' · port ' + s.port) : 'Loading server...' };
  }
  return { title: 'BLUENODES', sub: 'made by blue' };
}

// ---------------- SSE ----------------
function connectSSE() {
  if (!window.EventSource) return;
  let es;
  try {
    es = new EventSource('/api/events' + (API_TOKEN ? '?token=' + encodeURIComponent(API_TOKEN) : ''));
  } catch (err) {
    return;
  }
  es.onopen = () => {
    state.online = true;
    renderChrome();
  };
  es.onerror = () => {
    state.online = false;
    renderChrome();
    if (es.readyState === EventSource.CLOSED) {
      setTimeout(connectSSE, 4000);
    }
  };
  es.onmessage = (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch (err) { return; }
    handleEvent(payload);
  };
}

function handleEvent(payload) {
  if (!payload || !payload.type) return;
  const type = payload.type;
  const data = payload.data;

  if (type === 'hello' || type === 'ping') {
    state.online = true;
    renderChrome();
    return;
  }

  if (type === 'log') {
    const id = data.id;
    if (!state.logs[id]) state.logs[id] = [];
    state.logs[id].push(data.entry);
    if (state.logs[id].length > 600) state.logs[id].splice(0, state.logs[id].length - 600);
    appendConsoleLine(id, data.entry);
    return;
  }

  if (type === 'stats') {
    const server = serverById(data.id);
    if (server) {
      server.cpu = data.cpu;
      server.ram = data.ram;
      server.ramText = data.ramText;
      server.players = data.players;
      server.online = (data.players || []).length;
      server.uptime = data.uptime;
      server.status = data.status;
    }
    updateLiveBits(data);
    return;
  }

  if (type === 'state') {
    const statusChanged = (serverById(data.id) || {}).status !== data.status;
    mergeServer(data);
    if (statusChanged) {
      renderChrome();
      if (state.route.view === 'dashboard' || state.route.view === 'servers') {
        renderServersGrid();
      }
      if (state.route.view === 'dashboard') updateDashboardCounts();
      if (state.route.view === 'server' && state.route.id === data.id) {
        updateServerHeader();
        if (state.route.tab === 'settings' || state.route.tab === 'console') {
          updateServerQuickStats();
        }
      }
    }
    return;
  }

  if (type === 'job') {
    applyJobEvent(data);
    return;
  }

  if (type === 'created') {
    mergeServer(data);
    renderChrome();
    toast('Server created', data.name + ' is ready to start.', 'ok');
    reloadServers();
    return;
  }

  if (type === 'deleted') {
    state.servers = state.servers.filter((s) => s.id !== data.id);
    renderChrome();
    renderServersGrid();
    toast('Server deleted', 'Server and files were removed.', 'info');
    if (state.route.view === 'server' && state.route.id === data.id) navigate('#/servers');
  }
}
