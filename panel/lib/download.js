'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { ensureDir, readJson, writeJson } = require('./util');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MIRROR_MANIFEST_URL = 'https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json';
const PAPER_API = 'https://api.papermc.io/v2/projects/paper';
const UA = 'BLUENODES/1.0 (+https://github.com/siddhantpashte123-hub/blue.pannel)';

function httpGet(url, opts, redirects) {
  opts = opts || {};
  redirects = redirects === undefined ? 6 : redirects;
  return new Promise((resolve, reject) => {
    if (!/^https?:\/\//i.test(url)) return reject(new Error('Invalid URL: ' + url));
    const req = https.get(url, {
      timeout: opts.timeout || 30000,
      headers: Object.assign({ 'User-Agent': UA, Accept: '*/*' }, opts.headers)
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        const next = new URL(res.headers.location, url).toString();
        return resolve(httpGet(next, opts, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        const err = new Error('HTTP ' + res.statusCode + ' for ' + url);
        err.statusCode = res.statusCode;
        return reject(err);
      }
      resolve(res);
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out: ' + url)));
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function fetchJson(url, timeout) {
  const res = await httpGet(url, { timeout: timeout || 25000, headers: { Accept: 'application/json' } });
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Bad JSON from ' + url + ': ' + text.slice(0, 120));
  }
}

function downloadFile(url, dest, onProgress, redirects) {
  redirects = redirects === undefined ? 6 : redirects;
  return new Promise((resolve, reject) => {
    ensureDir(path.dirname(dest));
    const request = (currentUrl, hops) => {
      https.get(currentUrl, {
        timeout: 45000,
        headers: { 'User-Agent': UA, Accept: '*/*' }
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (hops <= 0) return reject(new Error('Too many redirects'));
          return request(new URL(res.headers.location, currentUrl).toString(), hops - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode + ' for ' + currentUrl));
        }
        const total = Number(res.headers['content-length'] || 0);
        let received = 0;
        const tmp = dest + '.part';
        const out = fs.createWriteStream(tmp);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress) {
            onProgress({
              downloaded: received,
              total,
              percent: total ? Math.min(100, Math.round((received / total) * 1000) / 10) : null
            });
          }
        });
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            try {
              fs.renameSync(tmp, dest);
            } catch (err) {
              return reject(err);
            }
            resolve({ size: received });
          });
        });
        const fail = (err) => {
          out.destroy();
          try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
          reject(err);
        };
        res.on('error', fail);
        out.on('error', fail);
      }).on('error', reject);
    };
    request(url, redirects);
  });
}

async function withRetry(fn, attempts) {
  attempts = attempts || 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(file);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function getManifest(cacheFile, force) {
  const cached = readJson(cacheFile, null);
  const fresh = cached && cached.fetchedAt && Date.now() - cached.fetchedAt < 60 * 60 * 1000;
  if (cached && fresh && !force) return cached.data;
  const sources = [MANIFEST_URL, MIRROR_MANIFEST_URL];
  let data = null;
  let lastErr = null;
  for (const src of sources) {
    try {
      data = await fetchJson(src);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!data || !Array.isArray(data.versions)) {
    if (cached) return cached.data;
    throw new Error('Could not download Minecraft version list: ' + (lastErr ? lastErr.message : 'unknown error'));
  }
  writeJson(cacheFile, { fetchedAt: Date.now(), data });
  return data;
}

function cleanVersions(manifest) {
  return (manifest.versions || []).map((v) => ({
    id: v.id,
    type: v.type,
    releaseTime: v.releaseTime
  }));
}

async function resolveServerDownload(versionId, cacheDir, onProgress) {
  const manifest = await getManifest(path.join(cacheDir, 'version_manifest.json'));
  const entry = (manifest.versions || []).find((v) => v.id === versionId);
  if (!entry) throw new Error('Unknown Minecraft version: ' + versionId);
  const versionJson = await withRetry(() => fetchJson(entry.url));
  const server = versionJson.downloads && versionJson.downloads.server;
  if (!server || !server.url) throw new Error('Version ' + versionId + ' has no server download');
  return {
    id: versionId,
    url: server.url,
    mirrorUrl: server.url.replace('https://piston-data.mojang.com', 'https://bmclapi2.bangbang93.com')
      .replace('https://launcher.mojang.com', 'https://bmclapi2.bangbang93.com'),
    sha1: server.sha1,
    size: server.size,
    releaseTime: entry.releaseTime
  };
}

async function ensureVanillaJar(versionId, cacheDir, onProgress) {
  ensureDir(cacheDir);
  const jarFile = path.join(cacheDir, 'minecraft-' + versionId + '.jar');
  const metaFile = path.join(cacheDir, 'minecraft-' + versionId + '.json');
  const cachedMeta = readJson(metaFile, null);
  if (fs.existsSync(jarFile) && cachedMeta && cachedMeta.sha1) {
    if (onProgress) onProgress({ phase: 'cached', percent: 100 });
    return { jar: jarFile, meta: cachedMeta };
  }
  const info = await resolveServerDownload(versionId, cacheDir, onProgress);
  if (onProgress) onProgress({ phase: 'downloading', percent: 0, size: info.size });
  try {
    await withRetry(() => downloadFile(info.url, jarFile, (p) => {
      if (onProgress) onProgress(Object.assign({ phase: 'downloading' }, p));
    }));
  } catch (err) {
    if (!info.mirrorUrl || info.mirrorUrl === info.url) throw err;
    if (onProgress) onProgress({ phase: 'mirror', percent: 0 });
    await withRetry(() => downloadFile(info.mirrorUrl, jarFile, (p) => {
      if (onProgress) onProgress(Object.assign({ phase: 'downloading' }, p));
    }));
  }
  if (info.sha1) {
    const actual = await sha1File(jarFile);
    if (actual !== info.sha1) {
      try { fs.unlinkSync(jarFile); } catch (err) { /* ignore */ }
      throw new Error('Downloaded jar failed SHA1 check. Please try again.');
    }
  }
  const meta = {
    version: versionId,
    sha1: info.sha1,
    size: fs.statSync(jarFile).size,
    type: 'vanilla',
    downloadedAt: Date.now()
  };
  writeJson(metaFile, meta);
  if (onProgress) onProgress({ phase: 'done', percent: 100 });
  return { jar: jarFile, meta };
}

async function paperVersions() {
  const data = await withRetry(() => fetchJson(PAPER_API));
  return (data.versions || []).slice().reverse();
}

async function ensurePaperJar(versionId, cacheDir, onProgress) {
  ensureDir(cacheDir);
  const jarFile = path.join(cacheDir, 'paper-' + versionId + '.jar');
  if (fs.existsSync(jarFile) && fs.statSync(jarFile).size > 1000) {
    if (onProgress) onProgress({ phase: 'cached', percent: 100 });
    return { jar: jarFile, meta: { version: versionId, type: 'paper', size: fs.statSync(jarFile).size } };
  }
  const buildsData = await withRetry(() => fetchJson(PAPER_API + '/versions/' + versionId + '/builds'));
  const builds = (buildsData.builds || []).filter((b) => b.downloads && b.downloads.application);
  if (!builds.length) throw new Error('No Paper builds available for ' + versionId);
  const build = builds[builds.length - 1];
  const app = build.downloads.application;
  const url = PAPER_API + '/versions/' + versionId + '/builds/' + build.build + '/downloads/' + app.name;
  if (onProgress) onProgress({ phase: 'downloading', percent: 0, size: app.size });
  await withRetry(() => downloadFile(url, jarFile, (p) => {
    if (onProgress) onProgress(Object.assign({ phase: 'downloading' }, p));
  }));
  if (onProgress) onProgress({ phase: 'done', percent: 100 });
  return {
    jar: jarFile,
    meta: { version: versionId, type: 'paper', build: build.build, size: app.size, downloadedAt: Date.now() }
  };
}

module.exports = {
  fetchJson,
  downloadFile,
  getManifest,
  cleanVersions,
  ensureVanillaJar,
  ensurePaperJar,
  paperVersions,
  sha1File
};
