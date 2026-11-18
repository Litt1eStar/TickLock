// Zero-dependency HTTP + SQLite backend for Tick Lock 3D (Open House booth & public VPS).
// Requires Node >= 22.5 (tested on Node v26) with built-in node:sqlite.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const ROOT_DIR = import.meta.dirname;

// Load optional .env file without external dependencies
function loadEnv(file = path.join(ROOT_DIR, '.env')) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const PORT = Number(process.env.PORT || 8642);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = path.resolve(ROOT_DIR, process.env.DB_PATH || './data/ticklock.sqlite');
const MODE = (process.env.TICKLOCK_MODE || 'openhouse').toLowerCase() === 'public' ? 'public' : 'openhouse';
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const UPSTREAM_URL = (process.env.UPSTREAM_URL || '').trim().replace(/\/+$/, '');

function mirrorToUpstream(route, body, authHeader = '') {
  if (!UPSTREAM_URL) return;
  fetch(`${UPSTREAM_URL}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'ace',
    best_score INTEGER NOT NULL DEFAULT 0,
    total_runs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_run_id TEXT UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_guest INTEGER NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'ace',
    score INTEGER NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    max_combo INTEGER NOT NULL DEFAULT 0,
    perfects INTEGER NOT NULL DEFAULT 0,
    hits INTEGER NOT NULL DEFAULT 0,
    run_time REAL NOT NULL DEFAULT 0,
    fatal_text TEXT NOT NULL DEFAULT '',
    event_tag TEXT NOT NULL DEFAULT 'openhouse',
    day_key TEXT NOT NULL,
    time_label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    cleared_today INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_runs_today ON runs(day_key, cleared_today, score DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_event ON runs(event_tag, score DESC);
  CREATE INDEX IF NOT EXISTS idx_runs_all ON runs(score DESC);
`);

const stmts = {
  getMeta: db.prepare('SELECT value FROM meta WHERE key = ?'),
  setMeta: db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  incPlays: db.prepare(`
    INSERT INTO meta (key, value) VALUES ('total_plays', '1')
    ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(meta.value AS INTEGER) + 1 AS TEXT)
  `),
  countRuns: db.prepare('SELECT COUNT(*) AS n FROM runs'),
  countOpenhouse: db.prepare("SELECT COUNT(*) AS n FROM runs WHERE event_tag = 'openhouse'"),
  countToday: db.prepare('SELECT COUNT(*) AS n FROM runs WHERE day_key = ? AND cleared_today = 0'),
  countUnique: db.prepare('SELECT COUNT(DISTINCT name) AS n FROM runs WHERE score > 0'),
  boardToday: db.prepare(`
    SELECT id, name, score, level, max_combo, perfects, hits, run_time, avatar, time_label, day_key, event_tag, is_guest
    FROM runs WHERE day_key = ? AND cleared_today = 0 AND score > 0
    ORDER BY score DESC, id ASC LIMIT 10
  `),
  boardOpenhouse: db.prepare(`
    SELECT id, name, score, level, max_combo, perfects, hits, run_time, avatar, time_label, day_key, event_tag, is_guest
    FROM runs WHERE event_tag = 'openhouse' AND score > 0
    ORDER BY score DESC, id ASC LIMIT 10
  `),
  boardAll: db.prepare(`
    SELECT id, name, score, level, max_combo, perfects, hits, run_time, avatar, time_label, day_key, event_tag, is_guest
    FROM runs WHERE score > 0
    ORDER BY score DESC, id ASC LIMIT 10
  `),
  findRunByClientId: db.prepare('SELECT id, user_id FROM runs WHERE client_run_id = ?'),
  insertRun: db.prepare(`
    INSERT INTO runs (
      client_run_id, user_id, is_guest, name, avatar, score, level, max_combo,
      perfects, hits, run_time, fatal_text, event_tag, day_key, time_label, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateRunMeta: db.prepare('UPDATE runs SET name = ?, avatar = ?, user_id = ?, is_guest = ? WHERE id = ?'),
  bumpUserStats: db.prepare('UPDATE users SET best_score = MAX(best_score, ?), total_runs = total_runs + 1, avatar = ? WHERE id = ?'),
  getUserByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser: db.prepare(`
    INSERT INTO users (username, display_name, pass_hash, avatar, best_score, total_runs, created_at)
    VALUES (?, ?, ?, ?, 0, 0, ?)
  `),
  getUserById: db.prepare('SELECT id, username, display_name, avatar, best_score, total_runs, created_at FROM users WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
  getSessionUser: db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.best_score, u.total_runs, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  clearToday: db.prepare('UPDATE runs SET cleared_today = 1 WHERE day_key = ?'),
  exportCsvRuns: db.prepare('SELECT * FROM runs ORDER BY id DESC'),
};

const todayKey = () => new Date().toLocaleDateString('en-CA');
const validScope = (s) => (s === 'openhouse' || s === 'all' ? s : 'today');
const clampInt = (v, min, max, fallback = min) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const clampFloat = (v, min, max, fallback = min) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const sanitizeName = (str, fallback = 'VISITOR') => {
  const clean = String(str || '').trim().slice(0, 14).toUpperCase();
  return clean || fallback;
};
const sanitizeAvatar = (str) => (/^[a-z0-9_-]{1,16}$/i.test(String(str || '')) ? String(str) : 'ace');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, keyHex] = String(stored || '').split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  return derived.length === storedBuf.length && crypto.timingSafeEqual(derived, storedBuf);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const exp = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  stmts.insertSession.run(token, userId, now.toISOString(), exp.toISOString());
  return token;
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar,
    bestScore: u.best_score,
    totalRuns: u.total_runs,
  };
}

function authUser(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+([a-f0-9]{64})$/i);
  if (!match) return null;
  const row = stmts.getSessionUser.get(match[1]);
  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    stmts.deleteSession.run(match[1]);
    return null;
  }
  return publicUser(row);
}

function getTotalPlays() {
  const raw = stmts.getMeta.get('total_plays')?.value;
  const runsCount = stmts.countRuns.get()?.n || 0;
  return Math.max(Number(raw || 0), runsCount);
}

function getStats() {
  const totalRuns = stmts.countRuns.get()?.n || 0;
  return {
    totalPlays: getTotalPlays(),
    totalRuns,
    openhouseRuns: stmts.countOpenhouse.get()?.n || 0,
    todayRuns: stmts.countToday.get(todayKey())?.n || 0,
    uniquePlayers: stmts.countUnique.get()?.n || 0,
  };
}

function mapBoardRow(r) {
  return {
    id: r.id,
    name: r.name,
    score: r.score,
    level: r.level,
    maxCombo: r.max_combo,
    perfects: r.perfects,
    hits: r.hits,
    runTime: r.run_time,
    avatar: r.avatar,
    timeLabel: r.time_label,
    dayKey: r.day_key,
    eventTag: r.event_tag,
    isGuest: Boolean(r.is_guest),
  };
}

function getBoard(scope = 'today') {
  const s = validScope(scope);
  const rows = s === 'openhouse'
    ? stmts.boardOpenhouse.all()
    : s === 'all'
      ? stmts.boardAll.all()
      : stmts.boardToday.all(todayKey());
  return rows.map(mapBoardRow);
}

// Per-IP fixed-window write rate limiter (90 writes per 60s)
const writeBuckets = new Map();
function allowWrite(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local').toString().split(',')[0].trim();
  const now = Date.now();
  const bucket = writeBuckets.get(ip);
  if (!bucket || now - bucket.t > 60_000) {
    writeBuckets.set(ip, { count: 1, t: now });
    return true;
  }
  if (bucket.count >= 90) return false;
  bucket.count += 1;
  return true;
}

function readJsonBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) { resolve({}); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-key');
}

function sendJson(req, res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const acceptGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (acceptGzip && body.length > 512) {
    res.setHeader('Content-Encoding', 'gzip');
    res.end(zlib.gzipSync(body));
  } else {
    res.end(body);
  }
}

const ALLOWED_STATIC_PREFIXES = ['/src/', '/assets/', '/vendor/'];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.glb', '.txt']);

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const allowed = rel === '/index.html' || ALLOWED_STATIC_PREFIXES.some((p) => rel.startsWith(p));
  if (!allowed) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  const abs = path.resolve(ROOT_DIR, `.${decoded}`);
  if (!abs.startsWith(ROOT_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  if (!stat.isFile()) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const ext = path.extname(abs).toLowerCase();
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
  const immutable = rel.startsWith('/vendor/') || rel.startsWith('/assets/');
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', immutable ? 'public, max-age=604800' : 'no-cache');

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    res.end();
    return;
  }

  const acceptGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }
  if (acceptGzip && COMPRESSIBLE_EXT.has(ext) && stat.size > 1024) {
    res.setHeader('Content-Encoding', 'gzip');
    res.statusCode = 200;
    fs.createReadStream(abs).pipe(zlib.createGzip()).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    res.statusCode = 200;
    fs.createReadStream(abs).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
  }

  try {
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(req, res, 200, { ok: true, mode: MODE, uptime: Math.round(process.uptime()) });
    }

    if (pathname === '/api/state' && req.method === 'GET') {
      const scope = validScope(url.searchParams.get('scope'));
      const board = getBoard(scope);
      return sendJson(req, res, 200, {
        ok: true,
        mode: MODE,
        adminProtected: Boolean(ADMIN_KEY || MODE === 'public'),
        scope,
        stats: getStats(),
        board,
        bestScore: board[0]?.score || 0,
        user: authUser(req),
      });
    }

    if (pathname === '/api/runs/export.csv' && req.method === 'GET') {
      const rows = stmts.exportCsvRuns.all();
      const header = 'ID,Timestamp,Day,Time,EventTag,AccountType,Callsign,Score,SurvivalTime_s,Level,MaxCombo,Perfects,Hits,FatalReason,Avatar';
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = rows.map((r) => [
        r.id, r.created_at, r.day_key, r.time_label, r.event_tag,
        r.is_guest ? 'guest' : 'account', esc(r.name), r.score, r.run_time,
        r.level, r.max_combo, r.perfects, r.hits, esc(r.fatal_text), r.avatar,
      ].join(','));
      const csv = Buffer.from([header, ...lines].join('\n'), 'utf8');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ticklock-scores-${todayKey()}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      res.end(csv);
      return;
    }

    if (pathname.startsWith('/api/') && req.method === 'POST') {
      if (!allowWrite(req)) {
        return sendJson(req, res, 429, { ok: false, error: 'Too many requests, try again shortly.' });
      }
      const body = await readJsonBody(req);

      if (pathname === '/api/plays/start') {
        stmts.incPlays.run();
        mirrorToUpstream('/api/plays/start', {});
        return sendJson(req, res, 200, { ok: true, totalPlays: getTotalPlays() });
      }

      if (pathname === '/api/runs') {
        const list = Array.isArray(body?.runs) ? body.runs : [body];
        if (!list.length || list.length > 50) {
          return sendJson(req, res, 400, { ok: false, error: 'Invalid runs payload' });
        }
        const caller = authUser(req);
        const scope = validScope(body?.scope || url.searchParams.get('scope'));
        const normalizedRuns = [];

        db.exec('BEGIN');
        try {
          for (const raw of list) {
            if (!raw || typeof raw !== 'object') continue;
            const score = clampInt(raw.score, 0, 10_000_000, 0);
            const level = clampInt(raw.level, 1, 999, 1);
            const maxCombo = clampInt(raw.maxCombo, 0, 9999, 0);
            const perfects = clampInt(raw.perfects, 0, 9999, 0);
            const hits = clampInt(raw.hits, 0, 9999, 0);
            const runTime = Number(clampFloat(raw.runTime, 0, 36_000, 0).toFixed(1));
            const clientRunId = raw.clientRunId ? String(raw.clientRunId).slice(0, 64) : null;
            const avatar = sanitizeAvatar(raw.avatar || caller?.avatar);
            const name = sanitizeName(raw.name || caller?.displayName, score > 0 ? 'VISITOR' : 'ANON');
            const userId = caller ? caller.id : null;
            const isGuest = caller ? 0 : 1;
            const eventTag = raw.eventTag === 'openhouse' || raw.eventTag === 'public' ? raw.eventTag : MODE;
            const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.dayKey || '')) ? raw.dayKey : todayKey();
            const timeLabel = /^\d{2}:\d{2}$/.test(String(raw.timeLabel || '')) ? raw.timeLabel : new Date().toTimeString().slice(0, 5);
            const createdAt = raw.at && !Number.isNaN(Date.parse(raw.at)) ? new Date(raw.at).toISOString() : new Date().toISOString();
            const fatalText = String(raw.fatalText || '').slice(0, 80);

            normalizedRuns.push({
              clientRunId,
              countedStart: Boolean(raw.countedStart),
              name,
              avatar,
              score,
              level,
              maxCombo,
              perfects,
              hits,
              runTime,
              fatalText,
              eventTag,
              dayKey,
              timeLabel,
              at: createdAt,
            });

            const existing = clientRunId ? stmts.findRunByClientId.get(clientRunId) : null;
            if (existing) {
              stmts.updateRunMeta.run(name, avatar, userId ?? existing.user_id, isGuest, existing.id);
            } else {
              stmts.insertRun.run(
                clientRunId, userId, isGuest, name, avatar, score, level, maxCombo,
                perfects, hits, runTime, fatalText, eventTag, dayKey, timeLabel, createdAt,
              );
              if (!raw.countedStart) stmts.incPlays.run();
              if (userId) stmts.bumpUserStats.run(score, avatar, userId);
            }
          }
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }

        if (normalizedRuns.length) {
          mirrorToUpstream('/api/runs', { scope, runs: normalizedRuns }, req.headers.authorization || '');
        }

        const board = getBoard(scope);
        return sendJson(req, res, 200, {
          ok: true,
          stats: getStats(),
          board,
          bestScore: board[0]?.score || 0,
          user: caller ? publicUser(stmts.getUserById.get(caller.id)) : null,
        });
      }

      if (pathname === '/api/auth/register') {
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
          return sendJson(req, res, 400, { ok: false, error: 'Username must be 3 to 20 letters, numbers, _ or -.' });
        }
        if (password.length < 4 || password.length > 64) {
          return sendJson(req, res, 400, { ok: false, error: 'Password must be 4 to 64 characters.' });
        }
        if (stmts.getUserByUsername.get(username)) {
          return sendJson(req, res, 409, { ok: false, error: 'That username is already taken.' });
        }
        const displayName = sanitizeName(body.displayName || username, username.toUpperCase().slice(0, 14));
        const avatar = sanitizeAvatar(body.avatar);
        const info = stmts.insertUser.run(username, displayName, hashPassword(password), avatar, new Date().toISOString());
        const userId = Number(info.lastInsertRowid);
        const token = createSession(userId);
        return sendJson(req, res, 201, {
          ok: true,
          token,
          user: publicUser(stmts.getUserById.get(userId)),
        });
      }

      if (pathname === '/api/auth/login') {
        const username = String(body.username || '').trim();
        const password = String(body.password || '');
        const row = stmts.getUserByUsername.get(username);
        if (!row || !verifyPassword(password, row.pass_hash)) {
          return sendJson(req, res, 401, { ok: false, error: 'Wrong username or password.' });
        }
        const token = createSession(row.id);
        return sendJson(req, res, 200, {
          ok: true,
          token,
          user: publicUser(row),
        });
      }

      if (pathname === '/api/auth/logout') {
        const auth = req.headers.authorization || '';
        const match = auth.match(/^Bearer\s+([a-f0-9]{64})$/i);
        if (match) stmts.deleteSession.run(match[1]);
        return sendJson(req, res, 200, { ok: true });
      }

      if (pathname === '/api/admin/clear-today') {
        if (ADMIN_KEY || MODE === 'public') {
          const provided = String(req.headers['x-admin-key'] || '');
          if (!ADMIN_KEY || provided !== ADMIN_KEY) {
            return sendJson(req, res, 403, { ok: false, error: 'Admin key required in public mode.' });
          }
        }
        stmts.clearToday.run(todayKey());
        return sendJson(req, res, 200, { ok: true, stats: getStats(), board: [], bestScore: 0 });
      }

      return sendJson(req, res, 404, { ok: false, error: 'Unknown API route' });
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(req, res, 405, { ok: false, error: 'Method not allowed' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error('[TickLock server]', err);
    if (!res.headersSent) {
      if (pathname.startsWith('/api/')) sendJson(req, res, status, { ok: false, error: err?.message || 'Server error' });
      else { res.statusCode = status; res.end('Server error'); }
    }
  }
});

server.listen(PORT, HOST, () => {
  console.info(`[TickLock] http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT} (${MODE}, db=${DB_PATH})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      try { db.close(); } catch {}
      process.exit(0);
    });
  });
}
