'use strict';

/**
 * BLUENODES - Minecraft hosting panel
 * made by blue
 *
 * Plain Node.js, zero dependencies.
 * Panel runs on http://0.0.0.0:6868 by default.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parse } = require('url');
const { Manager } = require('./lib/manager');
const { readJsonBody } = require('./lib/util');
const system = require('./lib/system');

const VERSION = '1.0.0';
const PORT = Number(process.env.BLUENODES_PORT || 6868);
const HOST = process.env.BLUENODES_HOST || '0.0.0.0';
const HOME = process.env.BLUENODES_HOME || path.join(os.homedir(), '.bluenodes', 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TOKEN = process.env.BLUENODES_TOKEN || '';

const manager = new Manager(HOME);
manager.load();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

const clients = new Set();

function sseSend(res, event) {
  try {
    res.write('data: ' + JSON.stringify(event) + '\n\n');
  } catch (err) { /* client gone */ }
}

function broadcast(event) {
  for (const res of clients) sseSend(res, event);
}

manager.on('log', (payload) => broadcast({ type: 'log', data: payload }));
manager.on('state', (payload) => broadcast({ type: 'state', data: payload }));
manager.on('stats', (payload) => broadcast({ type: 'stats', data: payload }));
manager.on('job', (payload) => broadcast({ type: 'job', data: payload }));
manager.on('created', (payload) => broadcast({ type: 'created', data: payload }));
manager.on('deleted', (payload) => broadcast({ type: 'deleted', data: payload }));

setInterval(() => {
  const event = { type: 'ping', t: Date.now() };
  for (const res of clients) sseSend(res, event);
}, 20000).unref();

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(body);
}

function ok(res, data) {
  sendJson(res, 200, { ok: true, data: data === undefined ? null : data });
}

function fail(res, err, status) {
  sendJson(res, status || err.statusCode || 400, {
    ok: false,
    error: err && err.message ? err.message : String(err)
  });
}

function requireAuth(req) {
  if (!TOKEN) return true;
  const header = req.headers.authorization || '';
  const bearer = header.replace(/^Bearer\s+/i, '');
  const urlToken = (parse(req.url, true).query || {}).token;
  return bearer === TOKEN || urlToken === TOKEN;
}

async function handleApi(req, res, pathname, query) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  if (!requireAuth(req)) return fail(res, new Error('Unauthorized: BLUENODES_TOKEN is set'), 401);

  if (pathname === '/api/health') {
    return ok(res, {
      name: 'BLUENODES',
      version: VERSION,
      author: 'blue',
      uptime: Math.floor(process.uptime()),
      servers: manager.servers.size,
      java: system.javaInfo().installed
    });
  }

  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    clients.add(res);
    sseSend(res, { type: 'hello', data: { version: VERSION, time: Date.now() } });
    req.on('close', () => clients.delete(res));
    return;
  }

  if (pathname === '/api/system' && req.method === 'GET') {
    return ok(res, manager.info(VERSION));
  }

  if (pathname === '/api/versions' && req.method === 'GET') {
    const data = await manager.versions(query.force === '1');
    return ok(res, data);
  }

  if (pathname === '/api/servers' && req.method === 'GET') {
    return ok(res, { servers: manager.list() });
  }

  if (pathname === '/api/servers' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const job = await manager.createServer(body);
    return ok(res, { job: job.id });
  }

  if (pathname === '/api/jobs' && req.method === 'GET') {
    return ok(res, Array.from(manager.jobs.values()));
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([A-Za-z0-9_-]+)$/);
  if (jobMatch && req.method === 'GET') {
    const job = manager.jobs.get(jobMatch[1]);
    if (!job) return fail(res, new Error('Job not found'), 404);
    return ok(res, job);
  }

  const serverMatch = pathname.match(/^\/api\/servers\/([A-Za-z0-9_-]+)(\/.*)?$/);
  if (!serverMatch) return fail(res, new Error('Unknown endpoint ' + pathname), 404);

  const id = serverMatch[1];
  const rest = serverMatch[2] || '';
  const bodyMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const body = bodyMethods.includes(req.method) ? await readJsonBody(req, 8 * 1024 * 1024) : {};

  if (rest === '' && req.method === 'GET') {
    const server = manager.get(id);
    return ok(res, {
      server: Object.assign(server.snapshot(), {
        address: require('./lib/mcserver').serverAddress(server.port)
      }),
      logs: server.logs.slice(-300),
      properties: manager.properties(id)
    });
  }

  if (rest === '' && req.method === 'DELETE') {
    return ok(res, await manager.deleteServer(id));
  }

  if (rest === '/start' && req.method === 'POST') return ok(res, await manager.start(id));
  if (rest === '/stop' && req.method === 'POST') return ok(res, await manager.stop(id));
  if (rest === '/restart' && req.method === 'POST') return ok(res, await manager.restart(id));
  if (rest === '/kill' && req.method === 'POST') {
    const server = manager.get(id);
    await server.kill();
    return ok(res, { ok: true });
  }
  if (rest === '/command' && req.method === 'POST') {
    return ok(res, await manager.command(id, body.command));
  }
  if (rest === '/logs' && req.method === 'GET') {
    const server = manager.get(id);
    return ok(res, { logs: server.logs.slice(-400), status: server.status, players: server.snapPlayers() });
  }
  if (rest === '/settings' && req.method === 'POST') {
    return ok(res, await manager.updateSettings(id, body));
  }
  if (rest === '/properties' && req.method === 'GET') return ok(res, manager.properties(id));
  if (rest === '/properties' && req.method === 'POST') return ok(res, manager.setProperties(id, body));

  if (rest === '/files' && req.method === 'GET') return ok(res, manager.listFiles(id, query.path || ''));
  if (rest === '/file' && req.method === 'GET') return ok(res, manager.readFile(id, query.path || ''));
  if (rest === '/file' && req.method === 'POST') return ok(res, manager.writeFile(id, body.path, body.content));
  if (rest === '/delete-file' && req.method === 'POST') return ok(res, manager.deleteFile(id, body.path));
  if (rest === '/mkdir' && req.method === 'POST') return ok(res, manager.mkdir(id, body.path));

  if (rest === '/backups' && req.method === 'GET') return ok(res, manager.listBackups(id));
  if (rest === '/backups' && req.method === 'POST') return ok(res, await manager.backup(id));
  if (rest === '/backups/restore' && req.method === 'POST') {
    return ok(res, manager.restoreBackup(id, body.file));
  }
  if (rest === '/backups/delete' && req.method === 'POST') {
    return ok(res, manager.deleteBackup(id, body.file));
  }
  if (rest === '/backups/download' && req.method === 'GET') {
    const server = manager.get(id);
    const safe = path.basename(String(query.file || ''));
    if (!safe.startsWith(id + '-') || !safe.endsWith('.tar.gz')) {
      return fail(res, new Error('Invalid backup file'));
    }
    const file = path.join(server.dir, '..', '..', 'backups', safe);
    if (!fs.existsSync(file)) return fail(res, new Error('Backup not found'), 404);
    res.writeHead(200, {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="' + safe + '"',
      'Content-Length': fs.statSync(file).size,
      'Access-Control-Allow-Origin': '*'
    });
    return fs.createReadStream(file).pipe(res);
  }

  return fail(res, new Error('Unknown endpoint ' + pathname + rest), 404);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[\/\\])+/, ''));
  if (!target.startsWith(PUBLIC_DIR)) return notFound(res);
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      if (rel !== '/index.html' && !path.extname(rel)) return serveStatic(req, res, '/index.html');
      return notFound(res);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 - not found');
}

const server = http.createServer((req, res) => {
  const parsed = parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';
  res.setHeader('X-Powered-By', 'BLUENODES');
  res.setHeader('X-BlueNodes-Version', VERSION);

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname, parsed.query).catch((err) => {
      if (!res.headersSent) fail(res, err);
      else try { res.end(); } catch (e) { /* ignore */ }
    });
    return;
  }
  serveStatic(req, res, pathname);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error('\n[BLUENODES] Port ' + PORT + ' is already in use.');
    console.error('[BLUENODES] Start on another port:  BLUENODES_PORT=6869 node server.js\n');
  } else {
    console.error('[BLUENODES] server error:', err);
  }
  process.exit(1);
});

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  const line = '='.repeat(58);
  console.log('\n\x1b[94m' + line + '\x1b[0m');
  console.log('\x1b[94m  BLUENODES\x1b[0m  v' + VERSION + '  \x1b[90mmade by blue\x1b[0m');
  console.log('\x1b[94m' + line + '\x1b[0m');
  console.log('  panel   : \x1b[96mhttp://' + HOST + ':' + PORT + '\x1b[0m');
  console.log('  data    : ' + HOME);
  console.log('  node    : ' + process.version + '  pid ' + process.pid);
  console.log('  servers : ' + manager.servers.size);
  console.log('\x1b[94m' + line + '\x1b[0m\n');
});

process.on('uncaughtException', (err) => {
  console.error('[BLUENODES] uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[BLUENODES] unhandled rejection:', err);
});

const shutdown = (signal) => {
  console.log('[BLUENODES] ' + signal + ' received, saving state...');
  try { manager.save(); manager.saveRuntime(); } catch (err) { /* ignore */ }
  setTimeout(() => process.exit(0), 400);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
