import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import {
  initDb,
  getUsers,
  getUserById,
  getUserByUsername,
  saveUser,
  getDevices,
  getDevice,
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
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
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
  } catch (e) {
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
  } catch (e) {
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

// ---------------- Comma Connect API Endpoints ----------------

// Profile
app.get('/v1/me/', authMiddleware, (req, res) => {
  const user = getUserById(req.user.identity);
  res.json({
    id: req.user.identity,
    email: req.user.email || 'admin@markenjaden.de',
    username: req.user.username || 'admin',
    superuser: !!req.user.superuser,
    points: 0,
    reg_date: Math.floor(Date.now() / 1000),
  });
});

// Devices list
app.get('/v1/me/devices/', authMiddleware, (req, res) => {
  const devices = getDevices(req.user.identity);
  res.json(devices);
});

// Pair device
app.post('/v2/pilotpair/', authMiddleware, (req, res) => {
  const { pair_token } = req.body;
  const dongleId = `drive-${Math.random().toString(36).substring(2, 10)}`;
  const newDevice = {
    dongle_id: dongleId,
    owner_id: req.user.identity,
    alias: 'openpilot Device',
    device_type: 'three',
    is_owner: true,
    prime: true,
    last_athena_ping: Math.floor(Date.now() / 1000),
    fetched_at: Math.floor(Date.now() / 1000),
    pair_token: pair_token || null,
  };
  saveDevice(newDevice);
  res.json({ dongle_id: dongleId });
});

// Device stats
app.get('/v1.1/devices/:dongleId/stats', authMiddleware, (req, res) => {
  res.json({
    all: { distance: 0, count: 0, minutes: 0 },
    week: { distance: 0, count: 0, minutes: 0 },
  });
});

// Device info
app.get('/v1.1/devices/:dongleId/', authMiddleware, (req, res) => {
  const dev = getDevice(req.params.dongleId);
  if (dev) {
    return res.json(dev);
  }
  res.json({
    dongle_id: req.params.dongleId,
    alias: 'Device',
    device_type: 'three',
    is_owner: true,
    prime: true,
    last_athena_ping: Math.floor(Date.now() / 1000),
    fetched_at: Math.floor(Date.now() / 1000),
  });
});

// Device location
app.get('/v1/devices/:dongleId/location', authMiddleware, (req, res) => {
  res.json({
    lat: 50.875,
    lng: 8.016,
    speed: 0,
    bearing: 0,
    time: Math.floor(Date.now() / 1000),
  });
});

// Routes segments
app.get('/v1/devices/:dongleId/routes_segments', authMiddleware, (req, res) => {
  res.json([]);
});

// Preserved routes
app.get('/v1/devices/:dongleId/routes/preserved', authMiddleware, (req, res) => {
  res.json([]);
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
    } catch (err) {
      res.status(502).json({ error: 'Failed to proxy request to upstream API' });
    }
  });
}

app.listen(PORT, () => {
  console.log(`[Drive Companion API] Running on port ${PORT}`);
});
