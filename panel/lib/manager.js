'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const {
  ensureDir, readJson, writeJson, safeJoin, findFreePort, slugify, randomId,
  formatBytes, stamp
} = require('./util');
const download = require('./download');
const system = require('./system');
const { MinecraftServer, readProperties, writeProperties, serverAddress } = require('./mcserver');

const PORT_MIN = 1024;
const PORT_MAX = 65535;

class Manager extends EventEmitter {
  constructor(home, options) {
    super();
    this.setMaxListeners(0);
    this.home = home;
    this.serversDir = path.join(home, 'servers');
    this.jarsDir = path.join(home, 'jars');
    this.cacheDir = path.join(home, 'cache');
    this.backupsDir = path.join(home, 'backups');
    this.serversFile = path.join(home, 'servers.json');
    this.runtimeFile = path.join(home, 'runtime.json');
    this.jobs = new Map();
    this.servers = new Map();
    this.versionCache = { at: 0, data: null };
    this.options = options || {};
    ensureDir(this.serversDir);
    ensureDir(this.jarsDir);
    ensureDir(this.cacheDir);
    ensureDir(this.backupsDir);
  }

  load() {
    const list = readJson(this.serversFile, []);
    for (const meta of Array.isArray(list) ? list : []) {
      try {
        this.register(new MinecraftServer(meta));
      } catch (err) {
        console.error('[BLUENODES] could not load server', meta && meta.id, err.message);
      }
    }
    this.adoptRunning();
    this.startLoops();
  }

  register(server) {
    this.servers.set(server.id, server);
    server.on('log', (entry) => this.emit('log', { id: server.id, entry }));
    server.on('state', (snap) => {
      this.emit('state', snap);
      this.save();
      this.saveRuntime();
    });
    server.on('spawn', () => this.saveRuntime());
    server.on('exit', (info) => {
      this.saveRuntime();
      if (!info.intentional && server.autoRestart && this.servers.has(server.id)) {
        const now = Date.now();
        server._restarts = (server._restarts || []).filter((t) => now - t < 10 * 60 * 1000);
        if (server._restarts.length >= 3) {
          server.pushLine('[BLUENODES] auto-restart stopped after 3 crashes in 10 minutes');
          server.autoRestart = false;
          this.save();
          return;
        }
        server._restarts.push(now);
        server.pushLine('[BLUENODES] auto-restart enabled, restarting in 5s...');
        setTimeout(() => {
          if (this.servers.has(server.id) && server.status === 'stopped') {
            server.start().catch((err) => server.pushLine('[BLUENODES] restart failed: ' + err.message));
          }
        }, 5000);
      }
    });
    return server;
  }

  save() {
    const metas = Array.from(this.servers.values()).map((s) => s.meta());
    writeJson(this.serversFile, metas);
  }

  saveRuntime() {
    const runtime = {};
    for (const s of this.servers.values()) {
      const pid = s.proc ? s.proc.pid : s.adoptedPid;
      if (pid && (s.status === 'running' || s.status === 'starting' || s.status === 'stopping')) {
        runtime[s.id] = { pid, startedAt: s.startedAt, adopted: !s.proc };
      }
    }
    writeJson(this.runtimeFile, runtime);
  }

  adoptRunning() {
    const runtime = readJson(this.runtimeFile, {});
    for (const [id, info] of Object.entries(runtime || {})) {
      const server = this.servers.get(id);
      if (!server || !info || !info.pid) continue;
      let alive = false;
      try {
        const cmdline = fs.readFileSync('/proc/' + info.pid + '/cmdline', 'utf8');
        alive = /java/i.test(cmdline);
      } catch (err) {
        alive = false;
      }
      if (alive) {
        server.adoptedPid = info.pid;
        server.adopted = true;
        server.status = 'running';
        server.startedAt = info.startedAt || Date.now();
        server.pushLine('[BLUENODES] attached to already running process (pid ' + info.pid + ')');
        setTimeout(() => this.emit('state', server.snapshot()), 300);
      }
    }
  }

  startLoops() {
    setInterval(() => {
      for (const server of this.servers.values()) {
        const pid = server.proc ? server.proc.pid : server.adoptedPid;
        if (!pid) continue;
        server.updateStats();
        if (server.status === 'running' || server.status === 'starting') {
          this.emit('stats', {
            id: server.id,
            cpu: server.stats.cpu,
            ram: server.stats.memory,
            ramText: formatBytes(server.stats.memory),
            players: server.snapPlayers(),
            uptime: Math.floor((Date.now() - (server.startedAt || Date.now())) / 1000),
            status: server.status
          });
        }
      }
    }, 2000).unref();
    setInterval(() => this.saveRuntime(), 10000).unref();
  }

  list() {
    return Array.from(this.servers.values()).map((s) => {
      const snap = s.snapshot();
      snap.address = serverAddress(s.port, this.options.host);
      return snap;
    });
  }

  get(id) {
    const server = this.servers.get(id);
    if (!server) {
      const err = new Error('Server not found');
      err.statusCode = 404;
      throw err;
    }
    return server;
  }

  newJob(kind) {
    const job = {
      id: 'job_' + randomId(8),
      kind,
      status: 'running',
      phase: 'starting',
      percent: 0,
      error: null,
      serverId: null,
      startedAt: Date.now()
    };
    this.jobs.set(job.id, job);
    setTimeout(() => this.jobs.delete(job.id), 10 * 60 * 1000).unref();
    return job;
  }

  updateJob(job, patch) {
    Object.assign(job, patch);
    this.emit('job', Object.assign({}, job));
  }

  resolveVersionList(force) {
    return download.getManifest(path.join(this.cacheDir, 'version_manifest.json'), force)
      .then((manifest) => ({
        latest: manifest.latest,
        versions: download.cleanVersions(manifest),
        fetchedAt: Date.now()
      }));
  }

  async versions(force) {
    if (!force && this.versionCache.data && Date.now() - this.versionCache.at < 15 * 60 * 1000) {
      return this.versionCache.data;
    }
    const vanilla = await this.resolveVersionList(force);
    let paper = [];
    let paperError = null;
    try {
      paper = await download.paperVersions();
    } catch (err) {
      paperError = err.message;
    }
    const data = {
      latest: vanilla.latest,
      versions: vanilla.versions,
      paper,
      paperError,
      fetchedAt: vanilla.fetchedAt
    };
    this.versionCache = { at: Date.now(), data };
    return data;
  }

  validateCreate(opts) {
    const name = String(opts.name || '').trim().slice(0, 32) || 'My Server';
    const version = String(opts.version || '').trim();
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(version)) throw new Error('Pick a valid Minecraft version');
    const type = opts.type === 'paper' ? 'paper' : 'vanilla';
    let memory = Math.floor(Number(opts.memory) || 2048);
    memory = Math.max(512, Math.min(32768, memory));
    let port = Math.floor(Number(opts.port) || 25565);
    if (port < PORT_MIN || port > PORT_MAX) throw new Error('Port must be between ' + PORT_MIN + ' and ' + PORT_MAX);
    return {
      name,
      version,
      type,
      memory,
      port,
      eula: opts.eula !== false,
      autoRestart: !!opts.autoRestart,
      motd: String(opts.motd || name + ' | BLUENODES').slice(0, 60),
      maxPlayers: Math.max(1, Math.min(1000, Number(opts.maxPlayers) || 20)),
      difficulty: ['peaceful', 'easy', 'normal', 'hard'].includes(opts.difficulty) ? opts.difficulty : 'easy',
      gamemode: ['survival', 'creative', 'adventure', 'spectator'].includes(opts.gamemode) ? opts.gamemode : 'survival'
    };
  }

  async createServer(opts) {
    const spec = this.validateCreate(opts || {});
    if (opts && opts.port !== undefined && opts.port !== null && opts.port !== '') {
      const taken = Array.from(this.servers.values()).some((s) => s.port === spec.port);
      if (taken) throw new Error('Port ' + spec.port + ' is already used by another server on this panel');
    } else {
      spec.port = await findFreePort(25565);
    }
    const job = this.newJob('create');
    this.createServerJob(job, spec, opts || {}).catch(() => { /* emitted */ });
    return job;
  }

  async createServerJob(job, spec, opts) {
    try {
      this.updateJob(job, { phase: 'Preparing folders', percent: 2 });
      const id = slugify(spec.name).slice(0, 16) + '-' + randomId(3);
      const dir = path.join(this.serversDir, id);
      ensureDir(dir);

      this.updateJob(job, { phase: 'Downloading ' + spec.type + ' ' + spec.version, percent: 5 });
      const onProgress = (p) => {
        if (p && typeof p.percent === 'number') {
          this.updateJob(job, {
            phase: p.phase === 'mirror' ? 'Trying mirror download' : 'Downloading server jar',
            percent: Math.max(5, Math.min(85, Math.round(5 + p.percent * 0.8)))
          });
        } else if (p && p.phase === 'cached') {
          this.updateJob(job, { phase: 'Using cached jar', percent: 85 });
        }
      };
      const result = spec.type === 'paper'
        ? await download.ensurePaperJar(spec.version, this.jarsDir, onProgress)
        : await download.ensureVanillaJar(spec.version, this.jarsDir, onProgress);

      this.updateJob(job, { phase: 'Creating server files', percent: 90 });
      const targetJar = path.join(dir, 'server.jar');
      try {
        fs.copyFileSync(result.jar, targetJar);
      } catch (err) {
        fs.linkSync(result.jar, targetJar);
      }

      fs.writeFileSync(path.join(dir, 'eula.txt'),
        '# BLUENODES - https://github.com/siddhantpashte123-hub/blue.pannel\n' +
        'eula=' + (spec.eula ? 'true' : 'false') + '\n');
      writeProperties(dir, {
        'server-port': spec.port,
        'motd': spec.motd,
        'max-players': spec.maxPlayers,
        'difficulty': spec.difficulty,
        'gamemode': spec.gamemode,
        'online-mode': 'true',
        'view-distance': '8',
        'simulation-distance': '8',
        'spawn-protection': '0',
        'enable-command-block': 'true',
        'allow-flight': 'true',
        'level-name': 'world'
      });
      fs.writeFileSync(path.join(dir, 'start.sh'),
        '#!/usr/bin/env bash\n# BLUENODES quick start\ncd "$(dirname "$0")"\n' +
        'java -Xms' + spec.memory + 'M -Xmx' + spec.memory + 'M -jar server.jar nogui\n');
      try { fs.chmodSync(path.join(dir, 'start.sh'), 0o755); } catch (err) { /* ignore */ }
      fs.writeFileSync(path.join(dir, 'console.log'), '');

      const meta = {
        id,
        name: spec.name,
        dir,
        port: spec.port,
        version: spec.version,
        type: spec.type,
        memory: spec.memory,
        jar: 'server.jar',
        eula: spec.eula,
        autoRestart: spec.autoRestart,
        createdAt: Date.now()
      };
      writeJson(path.join(dir, 'server.json'), meta);
      const server = this.register(new MinecraftServer(meta));
      this.save();

      let versionFromJar = null;
      try {
        versionFromJar = readVersionFromJar(targetJar);
      } catch (err) { /* ignore */ }
      this.updateJob(job, {
        phase: 'Done',
        percent: 100,
        status: 'done',
        serverId: server.id,
        detectedVersion: versionFromJar
      });
      this.emit('created', server.snapshot());
      return server;
    } catch (err) {
      this.updateJob(job, { status: 'error', error: err.message, phase: 'failed' });
      throw err;
    }
  }

  async deleteServer(id) {
    const server = this.get(id);
    try { await server.stop(); } catch (err) { /* ignore */ }
    try { await server.kill(); } catch (err) { /* ignore */ }
    const root = path.resolve(this.serversDir);
    const dir = path.resolve(server.dir);
    if (dir === root || !dir.startsWith(root + path.sep)) {
      throw new Error('Refusing to delete outside server directory');
    }
    this.servers.delete(id);
    this.save();
    this.saveRuntime();
    fs.rmSync(dir, { recursive: true, force: true });
    this.emit('deleted', { id });
    return { ok: true };
  }

  async start(id) {
    const server = this.get(id);
    if (server.status === 'running' || server.status === 'starting' || server.status === 'stopping') {
      throw new Error('Server is ' + server.status);
    }
    await server.start();
    this.save();
    this.saveRuntime();
    return server.snapshot();
  }

  async stop(id) {
    const server = this.get(id);
    const res = await server.stop();
    this.saveRuntime();
    return res;
  }

  async restart(id) {
    const server = this.get(id);
    await server.stop();
    await new Promise((r) => setTimeout(r, 1200));
    await server.start();
    this.saveRuntime();
    return server.snapshot();
  }

  async command(id, command) {
    return this.get(id).send(command);
  }

  async updateSettings(id, patch) {
    const server = this.get(id);
    const before = server.meta();
    if (patch.name !== undefined) {
      const name = String(patch.name).trim().slice(0, 32);
      if (!name) throw new Error('Name cannot be empty');
      server.name = name;
    }
    if (patch.memory !== undefined) {
      server.memory = Math.max(512, Math.min(32768, Math.floor(Number(patch.memory) || 2048)));
    }
    if (patch.autoRestart !== undefined) server.autoRestart = !!patch.autoRestart;
    if (patch.port !== undefined) {
      const port = Math.floor(Number(patch.port));
      if (port < PORT_MIN || port > PORT_MAX) throw new Error('Port must be between ' + PORT_MIN + ' and ' + PORT_MAX);
      if (server.status === 'running' || server.status === 'starting') {
        throw new Error('Stop the server before changing its port');
      }
      if (Array.from(this.servers.values()).some((s) => s.id !== id && s.port === port)) {
        throw new Error('Port ' + port + ' is already used by another server');
      }
      server.port = port;
    }
    if (patch.eula !== undefined) {
      server.eula = !!patch.eula;
      server.writeEula();
    }
    writeProperties(server.dir, {
      'server-port': server.port
    });
    writeJson(path.join(server.dir, 'server.json'), server.meta());
    this.save();
    this.emit('state', server.snapshot());
    return { before, after: server.meta() };
  }

  properties(id) {
    return readProperties(this.get(id).dir);
  }

  setProperties(id, patch) {
    const server = this.get(id);
    const clean = {};
    for (const [key, value] of Object.entries(patch || {})) {
      if (!/^[a-z0-9.-]{1,48}$/i.test(key)) continue;
      clean[key] = String(value).replace(/[\r\n]/g, '').slice(0, 400);
    }
    writeProperties(server.dir, clean);
    if (clean['server-port']) {
      const port = Number(clean['server-port']);
      if (port >= PORT_MIN && port <= PORT_MAX) server.port = port;
    }
    this.save();
    this.emit('state', server.snapshot());
    return readProperties(server.dir);
  }

  // ---------- files ----------
  listFiles(id, rel) {
    const server = this.get(id);
    const target = safeJoin(server.dir, rel || '');
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) throw new Error('Not a directory');
    const entries = fs.readdirSync(target, { withFileTypes: true }).map((entry) => {
      let size = 0;
      let mtime = null;
      try {
        const st = fs.statSync(path.join(target, entry.name));
        size = st.size;
        mtime = st.mtimeMs;
      } catch (err) { /* ignore */ }
      return {
        name: entry.name,
        dir: entry.isDirectory(),
        size,
        sizeText: entry.isDirectory() ? '' : formatBytes(size),
        mtime
      };
    }).sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
    return {
      path: path.relative(server.dir, target).split(path.sep).join('/'),
      entries
    };
  }

  readFile(id, rel) {
    const server = this.get(id);
    const target = safeJoin(server.dir, rel);
    const stat = fs.statSync(target);
    if (stat.size > 1024 * 1024) throw new Error('File is too large to edit (max 1 MB)');
    const buf = fs.readFileSync(target);
    if (buf.includes(0)) throw new Error('Binary file cannot be opened in editor');
    return { path: rel, content: buf.toString('utf8'), size: stat.size };
  }

  writeFile(id, rel, content) {
    const server = this.get(id);
    if (Buffer.byteLength(String(content || '')) > 4 * 1024 * 1024) throw new Error('Content too large (max 4 MB)');
    const target = safeJoin(server.dir, rel);
    ensureDir(path.dirname(target));
    fs.writeFileSync(target, String(content === undefined ? '' : content));
    return { ok: true, size: fs.statSync(target).size };
  }

  deleteFile(id, rel) {
    const server = this.get(id);
    const target = safeJoin(server.dir, rel);
    if (path.resolve(target) === path.resolve(server.dir)) throw new Error('Cannot delete server root');
    fs.rmSync(target, { recursive: true, force: true });
    return { ok: true };
  }

  mkdir(id, rel) {
    const server = this.get(id);
    const target = safeJoin(server.dir, rel);
    ensureDir(target);
    return { ok: true };
  }

  // ---------- backups ----------
  listBackups(id) {
    this.get(id);
    return fs.readdirSync(this.backupsDir)
      .filter((f) => f.startsWith(id + '-') && f.endsWith('.tar.gz'))
      .map((f) => {
        const st = fs.statSync(path.join(this.backupsDir, f));
        return {
          file: f,
          size: st.size,
          sizeText: formatBytes(st.size),
          createdAt: st.mtimeMs
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  backup(id) {
    const server = this.get(id);
    const file = path.join(this.backupsDir, id + '-' + stamp() + '.tar.gz');
    return new Promise((resolve, reject) => {
      const proc = spawn('tar', [
        '-czf', file,
        '--exclude=./logs', '--exclude=./cache',
        '-C', server.dir, '.'
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      let err = '';
      proc.stderr.on('data', (d) => { err += d.toString(); });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code !== 0) return reject(new Error('Backup failed: ' + (err || 'tar exited ' + code)));
        const st = fs.statSync(file);
        resolve({ file: path.basename(file), size: st.size, sizeText: formatBytes(st.size) });
      });
    });
  }

  restoreBackup(id, file) {
    const server = this.get(id);
    const safe = path.basename(String(file || ''));
    if (!safe.startsWith(id + '-') || !safe.endsWith('.tar.gz')) throw new Error('Invalid backup file');
    const full = path.join(this.backupsDir, safe);
    if (!fs.existsSync(full)) throw new Error('Backup not found');
    if (server.status !== 'stopped') throw new Error('Stop the server before restoring a backup');
    const res = spawnSync('tar', ['-xzf', full, '-C', server.dir], { encoding: 'utf8', timeout: 120000 });
    if (res.status !== 0) throw new Error('Restore failed: ' + (res.stderr || 'tar error'));
    return { ok: true };
  }

  deleteBackup(id, file) {
    this.get(id);
    const safe = path.basename(String(file || ''));
    if (!safe.startsWith(id + '-') || !safe.endsWith('.tar.gz')) throw new Error('Invalid backup file');
    fs.rmSync(path.join(this.backupsDir, safe), { force: true });
    return { ok: true };
  }

  // ---------- system ----------
  info(panel) {
    return system.nodeInfo(panel);
  }
}

function readVersionFromJar(jarFile) {
  const res = spawnSync('unzip', ['-p', jarFile, 'version.json'], { encoding: 'utf8', timeout: 8000 });
  if (res.status === 0 && res.stdout) {
    try {
      const data = JSON.parse(res.stdout);
      if (data && data.id) return { id: data.id, name: data.name || data.id };
    } catch (err) { /* ignore */ }
  }
  return null;
}

module.exports = { Manager };
