// Lightweight offline-resilient client for the Tick Lock Node + SQLite backend.
const TOKEN_KEY = 'ticklock_auth_token';
const USER_KEY = 'ticklock_auth_user';
const OUTBOX_KEY = 'ticklock_outbox';
const LOCAL_PLAYS_KEY = 'ticklock_local_plays';
const API_URL_KEY = 'ticklock_api_url';

// Set to your VPS URL (e.g. 'https://ticklock.example.com') to bake a remote server into a local booth build.
export const DEFAULT_API_URL = '';

const normalizeBase = (url) => String(url || '').trim().replace(/\/+$/, '');

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

export function createApi() {
  const queryApi = new URLSearchParams(location.search).get('api');
  if (queryApi !== null) {
    try {
      const norm = normalizeBase(queryApi);
      if (norm) localStorage.setItem(API_URL_KEY, norm);
      else localStorage.removeItem(API_URL_KEY);
    } catch {}
  }

  const savedApi = normalizeBase((() => {
    try { return localStorage.getItem(API_URL_KEY) || ''; } catch { return ''; }
  })());

  const initialOutbox = readJson(OUTBOX_KEY, []);
  const state = {
    online: false,
    mode: 'openhouse',
    adminProtected: false,
    scope: 'today',
    apiBase: savedApi || normalizeBase(DEFAULT_API_URL),
    pendingCount: Array.isArray(initialOutbox) ? initialOutbox.length : 0,
    stats: {
      totalPlays: Number(localStorage.getItem(LOCAL_PLAYS_KEY) || 0),
      totalRuns: 0,
      openhouseRuns: 0,
      todayRuns: 0,
      uniquePlayers: 0,
    },
    user: readJson(USER_KEY, null),
    token: localStorage.getItem(TOKEN_KEY) || '',
  };

  let apiBase = state.apiBase;
  let baseResolved = Boolean(state.apiBase);

  async function resolveBase() {
    if (state.apiBase) {
      apiBase = state.apiBase;
      baseResolved = true;
      return apiBase;
    }
    if (baseResolved) return apiBase;
    const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!isLocalHost || location.port === '8642') {
      baseResolved = true;
      return '';
    }
    try {
      const same = await fetch('/api/health');
      if (same.ok) { apiBase = ''; baseResolved = true; return ''; }
    } catch {}
    try {
      const alt = await fetch('http://127.0.0.1:8642/api/health');
      if (alt.ok) { apiBase = 'http://127.0.0.1:8642'; baseResolved = true; return apiBase; }
    } catch {}
    return '';
  }

  function persistAuth(token, user) {
    state.token = token || '';
    state.user = user || null;
    try {
      if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
      else localStorage.removeItem(TOKEN_KEY);
      if (state.user) localStorage.setItem(USER_KEY, JSON.stringify(state.user));
      else localStorage.removeItem(USER_KEY);
    } catch {}
  }

  function getOutbox() {
    const raw = readJson(OUTBOX_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }

  function setOutbox(items) {
    const capped = items.slice(-50);
    state.pendingCount = capped.length;
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(capped)); } catch {}
  }

  function enqueueRun(run) {
    const list = getOutbox();
    const idx = list.findIndex((r) => r.clientRunId && r.clientRunId === run.clientRunId);
    if (idx >= 0) list[idx] = { ...list[idx], ...run };
    else list.push(run);
    setOutbox(list);
  }

  async function req(url, opts = {}) {
    const base = await resolveBase();
    const headers = { ...(opts.headers || {}) };
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(`${base}${url}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, data };
  }

  async function fetchState(scope = state.scope) {
    try {
      const { ok, data } = await req(`/api/state?scope=${encodeURIComponent(scope)}`);
      if (!ok || !data?.ok) return null;
      state.online = true;
      state.mode = data.mode || state.mode;
      state.adminProtected = Boolean(data.adminProtected);
      state.scope = data.scope || scope;
      state.stats = data.stats || state.stats;
      if (data.user) persistAuth(state.token, data.user);
      else if (state.token && data.user === null) persistAuth('', null);
      return data;
    } catch {
      state.online = false;
      return null;
    }
  }

  async function flushOutbox(scope = state.scope) {
    const pending = getOutbox();
    if (!pending.length) return true;
    try {
      const { ok, data } = await req(`/api/runs?scope=${encodeURIComponent(scope)}`, {
        method: 'POST',
        body: JSON.stringify({ scope, runs: pending }),
      });
      if (!ok || !data?.ok) return false;
      setOutbox([]);
      state.online = true;
      if (data.stats) state.stats = data.stats;
      return true;
    } catch {
      state.online = false;
      return false;
    }
  }

  async function init() {
    await flushOutbox('today');
    return fetchState('today');
  }

  async function notifyPlayStart() {
    const nextLocal = Number(localStorage.getItem(LOCAL_PLAYS_KEY) || 0) + 1;
    try { localStorage.setItem(LOCAL_PLAYS_KEY, String(nextLocal)); } catch {}
    state.stats.totalPlays = Math.max(state.stats.totalPlays + 1, nextLocal);
    try {
      const { ok, data } = await req('/api/plays/start', { method: 'POST', body: '{}' });
      if (ok && data?.ok) {
        state.online = true;
        state.stats.totalPlays = data.totalPlays;
        return true;
      }
    } catch {
      state.online = false;
    }
    return false;
  }

  async function submitRun(run, scope = state.scope) {
    const payload = { ...run, eventTag: state.mode };
    enqueueRun(payload);
    try {
      const pending = getOutbox();
      const { ok, data } = await req(`/api/runs?scope=${encodeURIComponent(scope)}`, {
        method: 'POST',
        body: JSON.stringify({ scope, runs: pending }),
      });
      if (!ok || !data?.ok) return null;
      setOutbox([]);
      state.online = true;
      if (data.stats) state.stats = data.stats;
      if (data.user) persistAuth(state.token, data.user);
      return data;
    } catch {
      state.online = false;
      return null;
    }
  }

  async function register({ username, password, displayName, avatar }) {
    const { ok, data } = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName, avatar }),
    });
    if (ok && data?.ok) persistAuth(data.token, data.user);
    return data;
  }

  async function login({ username, password }) {
    const { ok, data } = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (ok && data?.ok) persistAuth(data.token, data.user);
    return data;
  }

  async function logout() {
    try { await req('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    persistAuth('', null);
  }

  async function clearToday(adminKey = '') {
    try {
      const { status, ok, data } = await req('/api/admin/clear-today', {
        method: 'POST',
        headers: adminKey ? { 'x-admin-key': adminKey } : {},
        body: '{}',
      });
      return { status, ok, data };
    } catch {
      return { status: 0, ok: false, data: null };
    }
  }

  async function setApiBase(url) {
    const next = normalizeBase(url);
    state.apiBase = next;
    apiBase = next;
    baseResolved = Boolean(next);
    try {
      if (next) localStorage.setItem(API_URL_KEY, next);
      else localStorage.removeItem(API_URL_KEY);
    } catch {}
    return init();
  }

  return {
    state,
    init,
    fetchState,
    notifyPlayStart,
    submitRun,
    register,
    login,
    logout,
    clearToday,
    setApiBase,
    getExportUrl: () => `${state.apiBase || apiBase}/api/runs/export.csv`,
  };
}
