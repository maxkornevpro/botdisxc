const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const PORT = parseInt(process.env.PORT || process.env.APP_PORT || '3000', 10);
const HOST = process.env.HOST || process.env.APP_HOST || '0.0.0.0';
const TTL_MS = parseInt(process.env.CLIENT_TTL_MS || '45000', 10);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATS_FILE = process.env.STATS_FILE || path.join(DATA_DIR, 'stats.json');

function nowMs() {
  return Date.now();
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let clientStats = {
  totalStarts: 0,
  totalStops: 0,
  lastStartAt: null,
  lastStopAt: null
};

const clientSessions = new Map();

function loadData() {
  ensureDataDir();
  if (!fs.existsSync(STATS_FILE)) return;
  try {
    const raw = fs.readFileSync(STATS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.clientStats && typeof parsed.clientStats === 'object') {
      const cs = parsed.clientStats;
      clientStats = {
        totalStarts: Number(cs.totalStarts || 0),
        totalStops: Number(cs.totalStops || 0),
        lastStartAt: cs.lastStartAt ?? null,
        lastStopAt: cs.lastStopAt ?? null
      };
    }
  } catch {
  }
}

function saveData() {
  ensureDataDir();
  const payload = {
    clientStats,
    savedAt: nowMs()
  };
  const tmp = STATS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, STATS_FILE);
}

function cleanupExpired() {
  const now = nowMs();
  for (const [sid, s] of clientSessions.entries()) {
    const lastSeenAt = Number(s.lastSeenAt || 0);
    if (now - lastSeenAt > TTL_MS) {
      clientSessions.delete(sid);
    }
  }
}

function onlineCount() {
  cleanupExpired();
  return clientSessions.size;
}

loadData();

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || '';
  const isClientApi = typeof req.path === 'string' && req.path.startsWith('/api/client/');
  if (isClientApi) {
    const bodyStr = req.body && typeof req.body === 'object' ? JSON.stringify(req.body) : '';
    console.log(`[${new Date().toISOString()}] ${ip} ${req.method} ${req.path} ${bodyStr}`);
  }
  next();
});

app.get('/health', (req, res) => {
  res.json({ ok: true, timeMs: nowMs(), online: onlineCount() });
});

app.post('/api/client/start', (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const username = typeof body.username === 'string' ? body.username : null;
  const version = typeof body.version === 'string' ? body.version : null;

  const now = nowMs();
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || null;
  const sessionId = crypto.randomBytes(16).toString('hex');

  clientSessions.set(sessionId, {
    startedAt: now,
    lastSeenAt: now,
    username,
    version,
    ip
  });

  clientStats.totalStarts = Number(clientStats.totalStarts || 0) + 1;
  clientStats.lastStartAt = now;
  saveData();

  res.json({ success: true, sessionId, online: onlineCount(), totalStarts: clientStats.totalStarts });
});

app.post('/api/client/ping', (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const sessionId = body.sessionId;

  if (typeof sessionId !== 'string' || !sessionId) {
    return res.status(400).json({ success: false, error: 'Missing sessionId' });
  }

  const session = clientSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Unknown sessionId' });
  }

  session.lastSeenAt = nowMs();
  res.json({ success: true, online: onlineCount() });
});

app.post('/api/client/stop', (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const sessionId = body.sessionId;

  if (typeof sessionId !== 'string' || !sessionId) {
    return res.status(400).json({ success: false, error: 'Missing sessionId' });
  }

  const existed = clientSessions.delete(sessionId);
  if (existed) {
    clientStats.totalStops = Number(clientStats.totalStops || 0) + 1;
    clientStats.lastStopAt = nowMs();
    saveData();
  }

  res.json({ success: true, online: onlineCount() });
});

app.get('/api/client/stats', (req, res) => {
  cleanupExpired();
  res.json({
    success: true,
    online: clientSessions.size,
    ttlMs: TTL_MS,
    stats: clientStats
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Client heartbeat API listening on http://${HOST}:${PORT}`);
});
