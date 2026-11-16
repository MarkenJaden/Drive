import http from 'http';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import {
  initDb,
  getUsers,
  getUserById,
  getUserByUsername,
  saveUser,
  getDevices,
  getDevice,
  getDeviceBySerialOrKey,
  saveDevice,
  deleteDevice,
} from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'markenjaden-drive-super-secret-key-32b';
const REQUIRE_2FA = process.env.REQUIRE_2FA !== 'false';
const UPSTREAM_API_URL = process.env.UPSTREAM_API_URL || null;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

initDb();

function generateDongleId(seed = null) {
  if (seed) {
    return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  }
  return crypto.randomBytes(8).toString('hex');
}

function generateJwt(user) {
  return jwt.sign(
    {
      identity: user.id,
      email: user.email,
      username: user.username,
      superuser: !!user.superuser,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    const decoded = jwt.decode(token);
    if (decoded?.identity) {
      const dev = getDevice(decoded.identity);
      if (dev?.public_key) {
        return jwt.verify(token, dev.public_key, { algorithms: ['RS256', 'ES256'] });
      }
    }
    throw new Error('Invalid or expired token');
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !['JWT', 'Bearer'].includes(parts[0])) {
    return res.status(401).json({ error: 'Invalid Authorization header format' });
  }

  try {
    req.user = verifyToken(parts[1]);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'drive-companion-api', timestamp: new Date().toISOString() });
});

// Auth Status check
app.get('/api/auth/status', (req, res) => {
  const users = getUsers();
  res.json({
    initialized: users.length > 0,
    allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
    require2fa: REQUIRE_2FA,
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password, code } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = getUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  if (user.twoFactorEnabled) {
    if (!code) {
      return res.status(200).json({
        requires2fa: true,
        message: 'Two-Factor Authentication required',
      });
    }

    const isValidCode = authenticator.check(code, user.twoFactorSecret);
    if (!isValidCode) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }
  } else if (REQUIRE_2FA) {
    const setupToken = jwt.sign(
      { identity: user.id, purpose: '2fa_setup' },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    return res.status(200).json({
      requires2faSetup: true,
      setupToken,
      message: '2FA setup required for this account',
    });
  }

  const token = generateJwt(user);
  return res.json({
    access_token: token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  });
});

// 2FA Setup
app.post('/api/auth/2fa/setup', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  let userId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.identity;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired setup token' });
  }

  const user = getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const secret = authenticator.generateSecret();
  const serviceName = 'MarkenJaden Drive';
  const otpauth = authenticator.keyuri(user.email || user.username, serviceName, secret);

  QRCode.toDataURL(otpauth, (err, qrCodeUrl) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to generate QR code' });
    }
    res.json({ secret, qrCodeUrl });
  });
});

// 2FA Verify & Complete Setup
app.post('/api/auth/2fa/verify', (req, res) => {
  const { code, secret } = req.body;
  const authHeader = req.headers.authorization;

  if (!code || !secret || !authHeader) {
    return res.status(400).json({ error: 'Code, secret and authorization required' });
  }

  const token = authHeader.split(' ')[1];
  let userId;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.identity;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const isValid = authenticator.check(code, secret);
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid 2FA code. Please check your authenticator app.' });
  }

  user.twoFactorEnabled = true;
  user.twoFactorSecret = secret;
  saveUser(user);

  const accessToken = generateJwt(user);
  res.json({
    access_token: accessToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
    message: '2FA successfully enabled',
  });
});

// ---------------- Comma Connect & IoniqPilot API Endpoints ----------------

// Profile
app.get('/v1/me/', authMiddleware, (req, res) => {
  const user = getUserById(req.user.identity);
  res.json({
    id: req.user.identity,
    email: user?.email || req.user.email || 'admin@markenjaden.de',
    username: user?.username || req.user.username || 'admin',
    superuser: !!(user?.superuser ?? req.user.superuser),
    points: 0,
    reg_date: Math.floor(Date.now() / 1000),
  });
});

// Devices list
app.get('/v1/me/devices/', authMiddleware, (req, res) => {
  const devices = getDevices(req.user.identity);
  res.json(devices);
});

// Device registration from openpilot / IoniqPilot (POST /v2/pilotauth/)
app.post('/v2/pilotauth/', (req, res) => {
  const imei = req.query.imei ?? req.body?.imei ?? '';
  const serial = req.query.serial ?? req.body?.serial ?? '';
  const publicKey = req.query.public_key ?? req.body?.public_key ?? '';
  const registerToken = req.query.register_token ?? req.body?.register_token ?? '';

  if (!publicKey) {
    return res.status(400).json({ error: 'public_key required' });
  }

  if (registerToken) {
    try {
      const payload = jwt.verify(registerToken, publicKey, { algorithms: ['RS256', 'ES256'] });
      if (!payload?.register) {
        return res.status(403).json({ error: 'Invalid register_token payload' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid register_token signature' });
    }
  }

  let existing = getDeviceBySerialOrKey(serial, publicKey);
  if (existing) {
    existing.public_key = publicKey;
    if (serial) existing.serial = serial;
    if (imei) existing.imei = imei;
    existing.fetched_at = Math.floor(Date.now() / 1000);
    saveDevice(existing);
    return res.json({ dongle_id: existing.dongle_id });
  }

  const users = getUsers();
  const defaultOwner = users[0]?.id || 'admin-1';
  const dongleId = generateDongleId(`${serial}:${publicKey}`);
  const newDevice = {
    dongle_id: dongleId,
    owner_id: defaultOwner,
    alias: serial ? `IoniqPilot (${serial.slice(0, 8)})` : 'IoniqPilot',
    device_type: 'three',
    serial: serial || null,
    imei: imei || null,
    public_key: publicKey,
    is_owner: true,
    prime: true,
    last_athena_ping: Math.floor(Date.now() / 1000),
    fetched_at: Math.floor(Date.now() / 1000),
  };
  saveDevice(newDevice);
  return res.json({ dongle_id: dongleId });
});

// Pair device from Connect UI
app.post('/v2/pilotpair/', authMiddleware, (req, res) => {
  const { pair_token } = req.body;
  let dongleId = null;

  if (pair_token) {
    const decoded = jwt.decode(pair_token);
    if (decoded?.identity && /^[a-f0-9]{16}$/.test(decoded.identity)) {
      dongleId = decoded.identity;
    }
  }

  if (dongleId) {
    const existing = getDevice(dongleId);
    if (existing) {
      existing.owner_id = req.user.identity;
      existing.is_owner = true;
      existing.pair_token = pair_token;
      existing.fetched_at = Math.floor(Date.now() / 1000);
      saveDevice(existing);
      return res.json({ dongle_id: dongleId, first_pair: false });
    }
  }

  dongleId = dongleId || generateDongleId();
  const newDevice = {
    dongle_id: dongleId,
    owner_id: req.user.identity,
    alias: 'IoniqPilot',
    device_type: 'three',
    is_owner: true,
    prime: true,
    last_athena_ping: Math.floor(Date.now() / 1000),
    fetched_at: Math.floor(Date.now() / 1000),
    pair_token: pair_token || null,
  };
  saveDevice(newDevice);
  res.json({ dongle_id: dongleId, first_pair: true });
});

// Device stats
app.get('/v1.1/devices/:dongleId/stats', authMiddleware, (req, res) => {
  res.json({
    all: { distance: 0, count: 0, minutes: 0 },
    week: { distance: 0, count: 0, minutes: 0 },
  });
});

// Device firehose stats
app.get('/v1/devices/:dongleId/firehose_stats', authMiddleware, (req, res) => {
  res.json({ segment_count: 0 });
});

// Device info
function handleGetDevice(req, res) {
  const dev = getDevice(req.params.dongleId);
  if (dev) {
    return res.json(dev);
  }
  res.json({
    dongle_id: req.params.dongleId,
    alias: 'IoniqPilot',
    device_type: 'three',
    is_owner: true,
    prime: true,
    last_athena_ping: Math.floor(Date.now() / 1000),
    fetched_at: Math.floor(Date.now() / 1000),
  });
}

app.get('/v1.1/devices/:dongleId/', authMiddleware, handleGetDevice);
app.get('/v1/devices/:dongleId/', authMiddleware, handleGetDevice);

// Device owner
app.get('/v1/devices/:dongleId/owner', authMiddleware, (req, res) => {
  const user = getUserById(req.user.identity);
  res.json({
    username: user?.username || req.user.username || 'admin',
    email: user?.email || req.user.email || 'admin@markenjaden.de',
  });
});

// Device location
app.get('/v1/devices/:dongleId/location', authMiddleware, (req, res) => {
  const dev = getDevice(req.params.dongleId);
  res.json(
    dev?.last_location || {
      lat: 50.875,
      lng: 8.016,
      speed: 0,
      bearing: 0,
      time: Math.floor(Date.now() / 1000),
    }
  );
});

// Routes segments
app.get('/v1/devices/:dongleId/routes_segments', authMiddleware, (req, res) => {
  res.json([]);
});

// Preserved routes
app.get('/v1/devices/:dongleId/routes/preserved', authMiddleware, (req, res) => {
  res.json([]);
});

// Route files
app.get('/v1/route/:routeName/files', authMiddleware, (req, res) => {
  res.json({
    cameras: [],
    dcameras: [],
    ecameras: [],
    logs: [],
    qcameras: [],
    qlogs: [],
  });
});

// Athena queue
app.get('/v1/devices/:dongleId/athena_offline_queue', authMiddleware, (req, res) => {
  res.json([]);
});

// Update device alias
app.patch('/v1/devices/:dongleId/', authMiddleware, (req, res) => {
  const { alias } = req.body;
  let dev = getDevice(req.params.dongleId) || { dongle_id: req.params.dongleId, owner_id: req.user.identity };
  dev.alias = alias;
  saveDevice(dev);
  res.json(dev);
});

// Unpair device
app.post('/v1/devices/:dongleId/unpair', authMiddleware, (req, res) => {
  deleteDevice(req.params.dongleId);
  res.json({ success: true });
});

// Prime / Subscription mock
app.get('/v1/prime/subscription', authMiddleware, (req, res) => {
  res.json({
    is_prime: true,
    plan: 'prime',
    subscribed_at: Math.floor(Date.now() / 1000),
  });
});

app.get('/v1/prime/subscribe_info', authMiddleware, (req, res) => {
  res.json({
    is_prime: true,
    sim_id: null,
    device_online: activeAthenaSockets.has(req.query.dongle_id),
  });
});

// ---------------- Athena WebSocket & JSON-RPC Bridge ----------------

const activeAthenaSockets = new Map();
const pendingAthenaRequests = new Map();

app.post('/athena/:dongleId', authMiddleware, (req, res) => {
  const { dongleId } = req.params;
  const ws = activeAthenaSockets.get(dongleId);
  if (!ws || ws.readyState !== 1) {
    return res.status(404).json({ error: 'Device not connected to Athena' });
  }

  const rpcId = req.body?.id ?? Date.now();
  const payload = { jsonrpc: '2.0', ...req.body, id: rpcId };
  const key = `${dongleId}:${rpcId}`;

  const timer = setTimeout(() => {
    pendingAthenaRequests.delete(key);
    if (!res.headersSent) {
      res.status(504).json({ error: 'Athena request timed out' });
    }
  }, 15000);

  pendingAthenaRequests.set(key, { res, timer });
  ws.send(JSON.stringify(payload));
});

// Fallback / proxy to upstream if configured
if (UPSTREAM_API_URL) {
  app.use(async (req, res) => {
    try {
      const targetUrl = `${UPSTREAM_API_URL.replace(/\/$/, '')}${req.originalUrl}`;
      const options = {
        method: req.method,
        headers: { ...req.headers, host: new URL(UPSTREAM_API_URL).host },
      };
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        options.body = JSON.stringify(req.body);
      }
      const response = await fetch(targetUrl, options);
      const data = await response.text();
      res.status(response.status).send(data);
    } catch {
      res.status(502).json({ error: 'Failed to proxy request to upstream API' });
    }
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const match = req.url?.match(/^\/ws\/v2\/([a-f0-9]{16})\/?$/);
  if (!match) {
    socket.destroy();
    return;
  }

  const dongleId = match[1];
  const authHeader = req.headers.authorization || '';
  const cookieHeader = req.headers.cookie || '';
  const cookieToken = cookieHeader.match(/(?:^|;\s*)jwt=([^;]+)/)?.[1];
  const token = authHeader.split(' ')[1] || cookieToken;

  if (token) {
    try {
      verifyToken(token);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, dongleId);
  });
});

wss.on('connection', (ws, dongleId) => {
  activeAthenaSockets.set(dongleId, ws);

  const updatePing = () => {
    const dev = getDevice(dongleId);
    if (dev) {
      dev.last_athena_ping = Math.floor(Date.now() / 1000);
      saveDevice(dev);
    }
  };
  updatePing();

  ws.on('pong', updatePing);
  ws.on('message', (raw) => {
    updatePing();
    try {
      const msg = JSON.parse(raw.toString());
      if (msg?.id !== undefined) {
        const key = `${dongleId}:${msg.id}`;
        const pending = pendingAthenaRequests.get(key);
        if (pending) {
          clearTimeout(pending.timer);
          pendingAthenaRequests.delete(key);
          if (!pending.res.headersSent) {
            pending.res.json(msg);
          }
        }
      }
    } catch {
      // Ignore malformed JSON frames
    }
  });

  ws.on('close', () => {
    if (activeAthenaSockets.get(dongleId) === ws) {
      activeAthenaSockets.delete(dongleId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[Drive Companion API] Running on port ${PORT}`);
});
