'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { which, formatBytes } = require('./util');

let lastCpu = null;
let cpuPercent = 0;
let cpuHistory = [];

function readCpuTimes() {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8');
    const first = stat.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
    const idle = first[3] + (first[4] || 0);
    const total = first.reduce((a, b) => a + b, 0);
    return { idle, total };
  } catch (err) {
    return null;
  }
}

function sampleCpu() {
  const now = readCpuTimes();
  if (!now) {
    const load = os.loadavg()[0] / Math.max(1, os.cpus().length);
    cpuPercent = Math.max(0, Math.min(100, load * 100));
    return cpuPercent;
  }
  if (lastCpu) {
    const idleDelta = now.idle - lastCpu.idle;
    const totalDelta = now.total - lastCpu.total;
    if (totalDelta > 0) {
      cpuPercent = Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
    }
  }
  lastCpu = now;
  cpuHistory.push({ t: Date.now(), v: Math.round(cpuPercent * 10) / 10 });
  if (cpuHistory.length > 120) cpuHistory.shift();
  return cpuPercent;
}

setInterval(sampleCpu, 1000).unref();
sampleCpu();

let lastMem = null;

function memory() {
  let total = os.totalmem();
  let available = os.freemem();
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const grab = (key) => {
      const m = meminfo.match(new RegExp('^' + key + ':\\s+(\\d+)\\s+kB', 'm'));
      return m ? Number(m[1]) * 1024 : null;
    };
    const t = grab('MemTotal');
    const a = grab('MemAvailable') || grab('MemFree');
    if (t) total = t;
    if (a) available = a;
  } catch (err) { /* not linux */ }
  const used = Math.max(0, total - available);
  lastMem = { total, used, available, percent: total ? Math.round((used / total) * 1000) / 10 : 0 };
  return lastMem;
}

function disk() {
  let size = 0;
  let free = 0;
  try {
    if (typeof fs.statfsSync === 'function') {
      const st = fs.statfsSync('/');
      size = st.blocks * st.bsize;
      free = st.bavail * st.bsize;
    }
  } catch (err) { /* ignore */ }
  if (!size) {
    try {
      const out = execSync('df -kP /', { encoding: 'utf8', timeout: 3000 });
      const parts = out.trim().split('\n').pop().split(/\s+/);
      size = Number(parts[1]) * 1024;
      free = Number(parts[3]) * 1024;
    } catch (err) { /* ignore */ }
  }
  const used = Math.max(0, size - free);
  return {
    total: size, used, free,
    percent: size ? Math.round((used / size) * 1000) / 10 : 0
  };
}

let javaCache = { at: 0, info: null };

function javaInfo(force) {
  if (!force && javaCache.info && Date.now() - javaCache.at < 30000) return javaCache.info;
  const bin = which('java');
  const info = { installed: false, path: bin, version: null, major: null, vendor: null, error: null };
  if (!bin) {
    info.error = 'java not found in PATH';
    javaCache = { at: Date.now(), info };
    return info;
  }
  try {
    const res = spawnSync(bin, ['-version'], { encoding: 'utf8', timeout: 6000 });
    const text = String(res.stderr || '') + String(res.stdout || '');
    const m = text.match(/version "([^"]+)"/);
    if (m) {
      info.installed = true;
      info.version = m[1];
      const major = info.version.startsWith('1.') ? info.version.split('.')[1] : info.version.split('.')[0];
      info.major = Number(major) || null;
    }
    const vendor = text.match(/(OpenJDK|Java\(TM\)|Eclipse Adoptium|Temurin|GraalVM|Zulu|Corretto)/i);
    info.vendor = vendor ? vendor[0] : null;
  } catch (err) {
    info.error = err.message;
  }
  javaCache = { at: Date.now(), info };
  return info;
}

function processStats(pid, prev) {
  const out = { cpu: 0, memory: 0 };
  if (!pid) return out;
  try {
    const statm = fs.readFileSync('/proc/' + pid + '/statm', 'utf8').trim().split(' ');
    out.memory = Number(statm[1]) * 4096;
  } catch (err) { /* ignore */ }
  try {
    const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).split(' ');
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    const ticks = utime + stime;
    const now = Date.now();
    if (prev && prev.ticks !== undefined && prev.at) {
      const cores = Math.max(1, os.cpus().length);
      const seconds = (now - prev.at) / 1000;
      out.cpu = Math.max(0, Math.min(100 * cores, ((ticks - prev.ticks) / 100) / seconds * 100));
    }
    out.ticks = ticks;
    out.at = now;
  } catch (err) { /* ignore */ }
  return out;
}

function panelDiskUsage(dir) {
  let total = 0;
  try {
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (err) { continue; }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) {
          try { total += fs.statSync(full).size; } catch (err) { /* ignore */ }
        }
      }
    }
  } catch (err) { /* ignore */ }
  return total;
}

function nodeInfo(panelVersion) {
  const mem = memory();
  const d = disk();
  const cpus = os.cpus();
  return {
    panel: {
      name: 'BLUENODES',
      version: panelVersion,
      author: 'blue',
      port: Number(process.env.BLUENODES_PORT || 6868),
      dataDir: process.env.BLUENODES_HOME || path.join(os.homedir(), '.bluenodes', 'data'),
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      startedAt: Date.now() - Math.floor(process.uptime() * 1000)
    },
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: cpus.length,
      cpuModel: cpus.length ? cpus[0].model.trim() : 'unknown',
      load: os.loadavg().map((n) => Math.round(n * 100) / 100),
      uptime: Math.floor(os.uptime()),
      localIp: localIp()
    },
    cpu: { percent: Math.round(cpuPercent * 10) / 10, history: cpuHistory.slice(-40) },
    memory: {
      total: mem.total,
      used: mem.used,
      percent: mem.percent,
      totalText: formatBytes(mem.total),
      usedText: formatBytes(mem.used)
    },
    disk: {
      total: d.total,
      used: d.used,
      percent: d.percent,
      totalText: formatBytes(d.total),
      usedText: formatBytes(d.used)
    },
    java: javaInfo(),
    node: { version: process.version, uptime: Math.floor(process.uptime()) }
  };
}

function localIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch (err) { /* ignore */ }
  return '127.0.0.1';
}

module.exports = { nodeInfo, javaInfo, processStats, panelDiskUsage, localIp };
