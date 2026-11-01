'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function readBody(req, limit) {
  limit = limit || 2 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (err) {
    throw new Error('invalid json body');
  }
}

function safeJoin(root, rel) {
  const clean = String(rel === undefined || rel === null ? '' : rel).replace(/\\/g, '/');
  const target = path.resolve(root, '.' + path.posix.normalize('/' + clean));
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error('path escapes server directory');
  }
  return target;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

async function findFreePort(start, max) {
  max = max || 200;
  for (let p = start; p < start + max; p++) {
    if (await isPortFree(p)) return p;
  }
  return start;
}

function slugify(str) {
  const s = String(str || 'server')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return s || 'server';
}

function randomId(len) {
  return crypto.randomBytes(Math.ceil((len || 4) / 2)).toString('hex').slice(0, len || 4);
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function stamp(date) {
  const d = date || new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' +
    p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
}

function which(bin) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const full = path.join(dir, bin);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch (err) { /* keep looking */ }
  }
  return null;
}

function once(fn) {
  let called = false;
  return function () {
    if (called) return;
    called = true;
    return fn.apply(this, arguments);
  };
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
  readBody,
  readJsonBody,
  safeJoin,
  isPortFree,
  findFreePort,
  slugify,
  randomId,
  formatBytes,
  stamp,
  which,
  once
};
