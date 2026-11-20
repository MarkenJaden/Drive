import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
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
import {
  canonicalKeyPath,
  parseUploadKey,
  signStorageToken,
  verifyStorageToken,
  signRouteAccess,
  verifyRouteAccess,
  getUploadFilePath,
  upsertSegmentFile,
  upsertSegmentMeta,
  getDeviceRoutes,
  getRoute,
  updateRouteFlags,
  getRouteFilesForConnect,
  getDeviceStats,
  getFirehoseCount,
  appendSwaglogs,
  recordMiscLog,
  getDeviceLogs,
  mergeIoniqSync,
  addDriveRefuel,
  getIoniqOverview,
  getIoniqRecording,
} from './storage.js';
import { probeDurationSeconds, generateSpriteAsync, buildQcameraM3u8 } from './media.js';

const CONTENT_TYPES = {
  '.ts': 'video/mp2t',
  '.hevc': 'video/hevc',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.zst': 'application/zstd',
  '.bz2': 'application/x-bzip2',
};

function normalizeOrigin(raw) {
  if (!raw) return null;
  let str = String(raw).trim().replace(/\/+$/, '');
  if (!str || str.includes('${')) return null;
  if (!/^https?:\/\//i.test(str)) {
    str = `https://${str}`;
  }
  try {
    return new URL(str).origin;
  } catch {
    return null;
  }
}

function generateDongleId(seed = null) {
  if (seed) {
    return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  }
  return crypto.randomBytes(8).toString('hex');
}

function parseVersionFromUserAgent(userAgent) {
  if (typeof userAgent !== 'string') return null;
  const match = userAgent.match(/openpilot-([0-9][^\s/;)]*)/i);
  return match ? match[1] : null;
}

export function createDriveServer(options = {}) {
  const JWT_SECRET = options.jwtSecret || process.env.JWT_SECRET || 'markenjaden-drive-super-secret-key-32b';
  const REQUIRE_2FA = options.require2fa ?? (process.env.REQUIRE_2FA !== 'false');
  const UPSTREAM_API_URL = options.upstreamApiUrl ?? process.env.UPSTREAM_API_URL ?? null;
  const CONFIGURED_ORIGIN = normalizeOrigin(options.appUrl ?? process.env.APP_URL);
  const HEARTBEAT_MS = options.heartbeatMs ?? 25000;
  const ATHENA_TIMEOUT_MS = options.athenaTimeoutMs ?? 15000;

  initDb();

  const app = express();
  const activeAthenaSockets = new Map();
  const pendingAthenaRequests = new Map();
  let nextWireId = 1;

  function getRequestOrigin(req) {
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
    const host = String(rawHost).split(',')[0].trim();
    if (CONFIGURED_ORIGIN && host && new URL(CONFIGURED_ORIGIN).host === host) {
      return CONFIGURED_ORIGIN;
    }
    const rawProto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const proto = String(rawProto).split(',')[0].trim() || 'http';
    if (host) {
      return `${proto}://${host}`;
    }
    return CONFIGURED_ORIGIN || 'http://localhost:4000';
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
      { expiresIn: '30d' },
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

  function extractAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const parts = String(authHeader).split(' ');
    if (parts.length !== 2 || !['JWT', 'Bearer'].includes(parts[0])) return null;
    return parts[1];
  }

  function authMiddleware(req, res, next) {
    const token = extractAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }
    try {
      req.user = verifyToken(token);
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function optionalAuthMiddleware(req, _res, next) {
    req.user = null;
    const token = extractAuthToken(req);
    if (token) {
      try {
        req.user = verifyToken(token);
      } catch {
        req.user = null;
      }
    }
    next();
  }

  function streamRequestToFile(req, targetPath) {
    return new Promise((resolve, reject) => {
      const parentDir = path.dirname(targetPath);
      fs.mkdirSync(parentDir, { recursive: true });
      const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
      const ws = fs.createWriteStream(tmpPath);
      let size = 0;
      let settled = false;

      const cleanupTmp = () => {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // Ignore cleanup errors
        }
      };

      const fail = (err) => {
        if (settled) return;
        settled = true;
        ws.destroy();
        cleanupTmp();
        reject(err);
      };

      req.on('data', (chunk) => {
        size += chunk.length;
      });
      req.on('aborted', () => fail(new Error('Upload aborted')));
      req.on('error', fail);
      ws.on('error', fail);
      ws.on('finish', () => {
        if (settled) return;
        try {
          fs.renameSync(tmpPath, targetPath);
          settled = true;
          resolve(size);
        } catch (err) {
          fail(err);
        }
      });

      req.pipe(ws);
    });
  }

  app.use(cors());

  // ---------------- Streaming Upload Endpoints (BEFORE express.json) ----------------

  app.put('/v1/storage/upload/:dongleId/:routeId/:segNum/:filename', async (req, res) => {
    const { dongleId, routeId, segNum, filename } = req.params;
    const parsed = parseUploadKey(`${routeId}/${segNum}/${filename}`);
    if (!parsed || parsed.kind !== 'segment') {
      return res.status(400).json({ error: 'Invalid segment upload key' });
    }

    const keyPath = canonicalKeyPath(parsed);
    if (!verifyStorageToken(dongleId, keyPath, req.query.exp, req.query.sig, JWT_SECRET)) {
      return res.status(403).json({ error: 'Invalid or expired upload signature' });
    }

    let targetPath;
    try {
      targetPath = getUploadFilePath(dongleId, parsed);
    } catch {
      return res.status(400).json({ error: 'Invalid storage path' });
    }

    try {
      const size = await streamRequestToFile(req, targetPath);
      let durationSeconds = null;
      if (parsed.filename === 'qcamera.ts') {
        durationSeconds = await probeDurationSeconds(targetPath);
        const spritePath = path.join(path.dirname(targetPath), 'sprite.jpg');
        generateSpriteAsync(targetPath, spritePath).catch(() => {});
      }

      const dev = getDevice(dongleId);
      upsertSegmentFile({
        dongleId,
        routeId: parsed.routeId,
        segNum: parsed.segNum,
        filename: parsed.filename,
        size,
        durationSeconds,
        deviceMeta: dev,
      });
      if (dev) {
        dev.fetched_at = Math.floor(Date.now() / 1000);
        saveDevice(dev);
      }
      return res.status(201).json({ ok: true, size });
    } catch (err) {
      console.error(`[Upload] Failed ${dongleId}/${keyPath}:`, err.message);
      return res.status(500).json({ error: 'Upload failed' });
    }
  });

  app.put('/v1/storage/upload-misc/:dongleId/:category/:filename', async (req, res) => {
    const { dongleId, category, filename } = req.params;
    const parsed = parseUploadKey(`${category}/${filename}`);
    if (!parsed || parsed.kind !== 'misc') {
      return res.status(400).json({ error: 'Invalid misc upload key' });
    }

    const keyPath = canonicalKeyPath(parsed);
    if (!verifyStorageToken(dongleId, keyPath, req.query.exp, req.query.sig, JWT_SECRET)) {
      return res.status(403).json({ error: 'Invalid or expired upload signature' });
    }

    let targetPath;
    try {
      targetPath = getUploadFilePath(dongleId, parsed);
    } catch {
      return res.status(400).json({ error: 'Invalid storage path' });
    }

    try {
      const size = await streamRequestToFile(req, targetPath);
      recordMiscLog(dongleId, parsed.category, parsed.filename, size);
      return res.status(201).json({ ok: true, size });
    } catch (err) {
      console.error(`[UploadMisc] Failed ${dongleId}/${keyPath}:`, err.message);
      return res.status(500).json({ error: 'Misc upload failed' });
    }
  });

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // ---------------- Health & Auth Endpoints ----------------

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'drive-companion-api', timestamp: new Date().toISOString() });
  });

  app.get('/api/auth/status', (_req, res) => {
    const users = getUsers();
    res.json({
      initialized: users.length > 0,
      allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
      require2fa: REQUIRE_2FA,
    });
  });

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
        { expiresIn: '15m' },
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

  app.post('/api/auth/2fa/setup', (req, res) => {
    const token = extractAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

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
    const otpauth = authenticator.keyuri(user.email || user.username, 'MarkenJaden Drive', secret);

    QRCode.toDataURL(otpauth, (err, qrCodeUrl) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to generate QR code' });
      }
      return res.json({ secret, qrCodeUrl });
    });
  });

  app.post('/api/auth/2fa/verify', (req, res) => {
    const { code, secret } = req.body;
    const token = extractAuthToken(req);

    if (!code || !secret || !token) {
      return res.status(400).json({ error: 'Code, secret and authorization required' });
    }

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
    return res.json({
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

  app.get('/v1/me/turn', authMiddleware, (_req, res) => {
    res.json(null);
  });

  app.get('/v1/referrals', authMiddleware, (_req, res) => {
    res.json({
      code: 'SELFHOST',
      cash: { available: 0, claimed: 0, pending: 0 },
      referrals: [],
    });
  });

  app.post('/v1/me/notifications/subscribe', authMiddleware, (_req, res) => {
    res.json({ success: true });
  });

  app.delete('/v1/me/notifications/subscribe', authMiddleware, (_req, res) => {
    res.json({ success: true });
  });

  app.get('/v1/me/devices/', authMiddleware, (req, res) => {
    const devices = getDevices(req.user.identity).map((d) => ({
      ...d,
      is_paired: true,
      is_owner: true,
      prime: true,
      prime_type: 1,
      online: activeAthenaSockets.has(d.dongle_id),
    }));
    res.json(devices);
  });

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

    const uaVersion = parseVersionFromUserAgent(req.headers['user-agent']);
    const existing = getDeviceBySerialOrKey(serial, publicKey);
    if (existing) {
      existing.public_key = publicKey;
      if (serial) existing.serial = serial;
      if (imei) existing.imei = imei;
      if (uaVersion) existing.openpilot_version = uaVersion;
      existing.is_paired = true;
      existing.is_owner = true;
      existing.prime = true;
      existing.prime_type = 1;
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
      is_paired: true,
      is_owner: true,
      prime: true,
      prime_type: 1,
      openpilot_version: uaVersion,
      last_athena_ping: Math.floor(Date.now() / 1000),
      fetched_at: Math.floor(Date.now() / 1000),
    };
    saveDevice(newDevice);
    return res.json({ dongle_id: dongleId });
  });

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
        existing.is_paired = true;
        existing.is_owner = true;
        existing.prime = true;
        existing.prime_type = 1;
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
      is_paired: true,
      is_owner: true,
      prime: true,
      prime_type: 1,
      last_athena_ping: Math.floor(Date.now() / 1000),
      fetched_at: Math.floor(Date.now() / 1000),
      pair_token: pair_token || null,
    };
    saveDevice(newDevice);
    return res.json({ dongle_id: dongleId, first_pair: true });
  });

  app.get('/v1.1/devices/:dongleId/stats', authMiddleware, (req, res) => {
    res.json(getDeviceStats(req.params.dongleId));
  });

  app.get('/v1/devices/:dongleId/firehose_stats', authMiddleware, (req, res) => {
    res.json({ segment_count: getFirehoseCount(req.params.dongleId) });
  });

  function handleGetDevice(req, res) {
    const { dongleId } = req.params;
    const uaVersion = parseVersionFromUserAgent(req.headers['user-agent']);
    const dev = getDevice(dongleId);
    if (dev) {
      if (uaVersion && dev.openpilot_version !== uaVersion) {
        dev.openpilot_version = uaVersion;
        saveDevice(dev);
      }
      return res.json({
        ...dev,
        is_paired: true,
        is_owner: true,
        prime: true,
        prime_type: 1,
        online: activeAthenaSockets.has(dongleId),
      });
    }
    return res.json({
      dongle_id: dongleId,
      alias: 'IoniqPilot',
      device_type: 'three',
      is_paired: true,
      is_owner: true,
      prime: true,
      prime_type: 1,
      openpilot_version: uaVersion,
      online: activeAthenaSockets.has(dongleId),
      last_athena_ping: Math.floor(Date.now() / 1000),
      fetched_at: Math.floor(Date.now() / 1000),
    });
  }

  app.get(['/v1.1/devices/:dongleId/', '/v1.1/devices/:dongleId'], authMiddleware, handleGetDevice);
  app.get(['/v1/devices/:dongleId/', '/v1/devices/:dongleId'], authMiddleware, handleGetDevice);

  app.get('/v1/devices/:dongleId/owner', authMiddleware, (req, res) => {
    const dev = getDevice(req.params.dongleId);
    const ownerId = dev?.owner_id || req.user.identity || 'admin-1';
    const user = getUserById(ownerId) || getUserById(req.user.identity);
    const idStr = `drive_${user?.id || ownerId}`;
    res.json({
      id: idStr,
      user_id: idStr,
      username: user?.username || req.user.username || 'admin',
      email: user?.email || req.user.email || 'admin@markenjaden.de',
    });
  });

  app.get('/v1/devices/:dongleId/location', authMiddleware, (req, res) => {
    const dev = getDevice(req.params.dongleId);
    if (dev?.last_location) {
      return res.json(dev.last_location);
    }
    return res.json({ error: 'no_segments_uploaded' });
  });

  // ---------------- Upload URL Issuance ----------------

  function buildSignedUploadEntry(dongleId, rawPath, origin, expiryDays = 7) {
    const parsed = parseUploadKey(rawPath);
    if (!parsed) return null;
    const keyPath = canonicalKeyPath(parsed);
    const ttlSeconds = Math.max(60, Math.round((Number(expiryDays) || 7) * 86400));
    const { exp, sig } = signStorageToken(dongleId, keyPath, JWT_SECRET, ttlSeconds);
    const cleanOrigin = origin.replace(/\/$/, '');
    const q = `exp=${encodeURIComponent(exp)}&sig=${encodeURIComponent(sig)}`;

    const url = parsed.kind === 'segment'
      ? `${cleanOrigin}/v1/storage/upload/${dongleId}/${parsed.routeId}/${parsed.segNum}/${parsed.filename}?${q}`
      : `${cleanOrigin}/v1/storage/upload-misc/${dongleId}/${parsed.category}/${parsed.filename}?${q}`;

    return { url, headers: {} };
  }

  app.get(['/v1.4/:dongleId/upload_url/', '/v1.4/:dongleId/upload_url'], authMiddleware, (req, res) => {
    const { dongleId } = req.params;
    const rawPath = req.query.path;
    const expiryDays = req.query.expiry_days ?? 1;
    const entry = buildSignedUploadEntry(dongleId, rawPath, getRequestOrigin(req), expiryDays);
    if (!entry) {
      return res.status(400).json({ error: 'Invalid upload path' });
    }
    return res.json(entry);
  });

  app.post(['/v1/:dongleId/upload_urls/', '/v1/:dongleId/upload_urls'], authMiddleware, (req, res) => {
    const { dongleId } = req.params;
    const { paths, expiry_days: expiryDays = 7 } = req.body || {};
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'paths array required' });
    }

    const origin = getRequestOrigin(req);
    const results = [];
    for (const p of paths) {
      const entry = buildSignedUploadEntry(dongleId, p, origin, expiryDays);
      if (!entry) {
        return res.status(400).json({ error: `Invalid upload path: ${p}` });
      }
      results.push(entry);
    }
    return res.json(results);
  });

  // ---------------- Routes, Files & Media Streaming ----------------

  app.get('/v1/devices/:dongleId/routes_segments', optionalAuthMiddleware, (req, res) => {
    const { dongleId } = req.params;
    const { start, end, limit, route_str: routeStr } = req.query;
    const includePrivate = Boolean(req.user);
    if (!includePrivate && !routeStr) {
      return res.json([]);
    }
    const routes = getDeviceRoutes(dongleId, {
      start,
      end,
      limit,
      routeStr,
      includePrivate,
      origin: getRequestOrigin(req),
      secret: JWT_SECRET,
    });
    return res.json(routes);
  });

  app.get('/v1/devices/:dongleId/routes/preserved', authMiddleware, (req, res) => {
    const routes = getDeviceRoutes(req.params.dongleId, {
      includePrivate: true,
      origin: getRequestOrigin(req),
      secret: JWT_SECRET,
    }).filter((r) => r.is_preserved);
    res.json(routes);
  });

  app.post('/v1/route/:routeName/preserve', authMiddleware, (req, res) => {
    const routeName = decodeURIComponent(req.params.routeName);
    const updated = updateRouteFlags(routeName, { is_preserved: true });
    if (!updated) return res.status(404).json({ error: 'Route not found' });
    return res.json({ success: true, is_preserved: true });
  });

  app.delete('/v1/route/:routeName/preserve', authMiddleware, (req, res) => {
    const routeName = decodeURIComponent(req.params.routeName);
    const updated = updateRouteFlags(routeName, { is_preserved: false });
    if (!updated) return res.status(404).json({ error: 'Route not found' });
    return res.json({ success: true, is_preserved: false });
  });

  app.patch(['/v1/route/:routeName/', '/v1/route/:routeName'], authMiddleware, (req, res) => {
    const routeName = decodeURIComponent(req.params.routeName);
    const updated = updateRouteFlags(routeName, { is_public: Boolean(req.body?.is_public) });
    if (!updated) return res.status(404).json({ error: 'Route not found' });
    return res.json({ success: true, is_public: Boolean(updated.is_public) });
  });

  app.get('/v1/route/:routeName/files', optionalAuthMiddleware, (req, res) => {
    const routeName = decodeURIComponent(req.params.routeName);
    const [dongleId, logId] = routeName.split('|');
    if (!dongleId || !logId) {
      return res.status(400).json({ error: 'Invalid route name' });
    }
    const route = getRoute(routeName);
    if (!route) {
      return res.json({ cameras: [], dcameras: [], ecameras: [], logs: [], qcameras: [], qlogs: [] });
    }
    if (!req.user && !route.is_public) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.json(getRouteFilesForConnect(dongleId, logId, getRequestOrigin(req), JWT_SECRET));
  });

  app.get('/v1/route/:routeName/qcamera.m3u8', optionalAuthMiddleware, (req, res) => {
    const routeName = decodeURIComponent(req.params.routeName);
    const [dongleId, logId] = routeName.split('|');
    if (!dongleId || !logId) {
      return res.status(400).json({ error: 'Invalid route name' });
    }
    const route = getRoute(routeName);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const validQuerySig = verifyRouteAccess(dongleId, logId, req.query.exp, req.query.sig, JWT_SECRET);
    if (!req.user && !route.is_public && !validQuerySig) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const creds = validQuerySig
      ? { exp: String(req.query.exp), sig: String(req.query.sig) }
      : signRouteAccess(dongleId, logId, JWT_SECRET);

    const playlist = buildQcameraM3u8(route, getRequestOrigin(req), creds.exp, creds.sig);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(playlist);
  });

  app.get('/v1/storage/r/:exp/:sig/:dongleId/:logId/:segNum/:filename', (req, res) => {
    const { exp, sig, dongleId, logId, segNum, filename } = req.params;
    if (!verifyRouteAccess(dongleId, logId, exp, sig, JWT_SECRET)) {
      return res.status(403).json({ error: 'Invalid or expired route signature' });
    }

    const parsed = parseUploadKey(`${logId}/${segNum}/${filename}`);
    if (!parsed || parsed.kind !== 'segment') {
      return res.status(400).json({ error: 'Invalid segment asset path' });
    }

    let filePath;
    try {
      filePath = getUploadFilePath(dongleId, parsed);
    } catch {
      return res.status(400).json({ error: 'Invalid storage path' });
    }

    if (!fs.existsSync(filePath)) {
      if (parsed.filename === 'events.json' || parsed.filename === 'coords.json') {
        return res.json([]);
      }
      return res.status(404).json({ error: 'Asset not found' });
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const ext = path.extname(parsed.filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      const m = String(rangeHeader).match(/^bytes=(\d*)-(\d*)$/);
      if (!m) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      const start = m[1] === '' ? Math.max(0, totalSize - Number(m[2])) : Number(m[1]);
      const end = m[2] === '' || m[1] === '' ? Math.max(0, totalSize - 1) : Math.min(totalSize - 1, Number(m[2]));
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalSize) {
        res.setHeader('Content-Range', `bytes */${totalSize}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(end - start + 1));
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', String(totalSize));
    return fs.createReadStream(filePath).pipe(res);
  });

  app.get('/v1/devices/:dongleId/athena_offline_queue', authMiddleware, (_req, res) => {
    res.json([]);
  });

  app.patch(['/v1/devices/:dongleId/', '/v1/devices/:dongleId'], authMiddleware, (req, res) => {
    const { alias } = req.body;
    const dev = getDevice(req.params.dongleId) || { dongle_id: req.params.dongleId, owner_id: req.user.identity };
    dev.alias = alias;
    saveDevice(dev);
    res.json(dev);
  });

  app.post('/v1/devices/:dongleId/unpair', authMiddleware, (req, res) => {
    deleteDevice(req.params.dongleId);
    res.json({ success: true });
  });

  // ---------------- Ioniq Telemetry, Fuel & Device Logs ----------------

  app.post('/v1/devices/:dongleId/ioniq/sync', authMiddleware, (req, res) => {
    const { dongleId } = req.params;
    try {
      const overview = mergeIoniqSync(dongleId, req.body || {});
      const dev = getDevice(dongleId);
      if (dev) {
        if (req.body?.location && typeof req.body.location.lat === 'number' && typeof req.body.location.lng === 'number') {
          dev.last_location = req.body.location;
        }
        if (req.body?.openpilot?.version) dev.openpilot_version = req.body.openpilot.version;
        if (req.body?.openpilot?.branch) dev.git_branch = req.body.openpilot.branch;
        dev.fetched_at = Math.floor(Date.now() / 1000);
        saveDevice(dev);
      }
      return res.json({ ok: true, syncedAt: overview.syncedAt });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/v1/devices/:dongleId/route_meta', authMiddleware, (req, res) => {
    const { dongleId } = req.params;
    const body = req.body || {};
    const parsed = parseUploadKey(`${body.route_id}/${body.segment_num}/coords.json`);
    if (!parsed || parsed.kind !== 'segment') {
      return res.status(400).json({ error: 'Invalid route_id or segment_num' });
    }

    try {
      const route = upsertSegmentMeta({
        dongleId,
        routeId: parsed.routeId,
        segNum: parsed.segNum,
        startTimeMs: body.start_time_utc_millis,
        endTimeMs: body.end_time_utc_millis,
        distanceMeters: body.distance_meters,
        startLat: body.start_lat,
        startLng: body.start_lng,
        endLat: body.end_lat,
        endLng: body.end_lng,
        coords: body.coords,
        events: body.events,
        ioniqTripSummary: body.ioniq_trip_summary,
      });

      if (typeof body.end_lat === 'number' && typeof body.end_lng === 'number') {
        const dev = getDevice(dongleId);
        if (dev) {
          const lastCoord = Array.isArray(body.coords) && body.coords.length ? body.coords[body.coords.length - 1] : null;
          dev.last_location = {
            lat: body.end_lat,
            lng: body.end_lng,
            speed: lastCoord?.speed ?? 0,
            bearing: 0,
            time: Math.floor((body.end_time_utc_millis || Date.now()) / 1000),
          };
          saveDevice(dev);
        }
      }

      return res.json({ ok: true, fullname: route.fullname });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/ioniq/:dongleId/overview', authMiddleware, (req, res) => {
    try {
      const overview = getIoniqOverview(req.params.dongleId);
      if (!overview) {
        return res.json({
          schemaVersion: 1,
          dongleId: req.params.dongleId,
          syncedAt: null,
          config: {},
          fuel: null,
          diagnostics: null,
          recordings: [],
          discovery: { active: false, captures: [] },
          openpilot: {},
        });
      }
      return res.json(overview);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/ioniq/:dongleId/recordings/:recId', authMiddleware, (req, res) => {
    try {
      const bundle = getIoniqRecording(req.params.dongleId, req.params.recId);
      if (!bundle) {
        return res.status(404).json({ error: 'Recording bundle not found' });
      }
      return res.json(bundle);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/ioniq/:dongleId/refuel', authMiddleware, (req, res) => {
    try {
      const result = addDriveRefuel(req.params.dongleId, req.body || {});
      return res.status(201).json({ ok: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/logs/:dongleId', authMiddleware, (req, res) => {
    try {
      return res.json(getDeviceLogs(req.params.dongleId));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/logs/:dongleId/download/:category/:filename', authMiddleware, (req, res) => {
    const { dongleId, category, filename } = req.params;
    const parsed = parseUploadKey(`${category}/${filename}`);
    if (!parsed || parsed.kind !== 'misc') {
      return res.status(400).json({ error: 'Invalid log category or filename' });
    }
    let filePath;
    try {
      filePath = getUploadFilePath(dongleId, parsed);
    } catch {
      return res.status(400).json({ error: 'Invalid path' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    return res.download(filePath, parsed.filename);
  });

  // ---------------- Prime / Subscription Status ----------------

  app.get('/v1/prime/subscription', authMiddleware, (_req, res) => {
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

  app.post('/athena/:dongleId', authMiddleware, (req, res) => {
    const { dongleId } = req.params;
    const ws = activeAthenaSockets.get(dongleId);
    if (!ws || ws.readyState !== 1) {
      return res.status(404).json({ error: 'Device not connected to Athena' });
    }

    const clientId = req.body?.id ?? 0;
    const wireId = nextWireId;
    nextWireId += 1;
    const payload = { jsonrpc: '2.0', ...req.body, id: wireId };
    const key = `${dongleId}:${wireId}`;

    const timer = setTimeout(() => {
      pendingAthenaRequests.delete(key);
      if (!res.headersSent) {
        res.status(504).json({ error: 'Athena request timed out' });
      }
    }, ATHENA_TIMEOUT_MS);

    pendingAthenaRequests.set(key, { res, timer, clientId, dongleId });
    ws.send(JSON.stringify(payload));
  });

  if (UPSTREAM_API_URL) {
    app.use(async (req, res) => {
      try {
        const targetUrl = `${UPSTREAM_API_URL.replace(/\/$/, '')}${req.originalUrl}`;
        const opts = {
          method: req.method,
          headers: { ...req.headers, host: new URL(UPSTREAM_API_URL).host },
        };
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
          opts.body = JSON.stringify(req.body);
        }
        const response = await fetch(targetUrl, opts);
        const data = await response.text();
        res.status(response.status).send(data);
      } catch {
        res.status(502).json({ error: 'Failed to proxy request to upstream API' });
      }
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        client.terminate();
      }
    }
  }, HEARTBEAT_MS);
  if (typeof heartbeatInterval.unref === 'function') {
    heartbeatInterval.unref();
  }

  server.on('upgrade', (req, socket, head) => {
    const match = req.url?.match(/^\/ws\/v2\/([a-f0-9]{16})\/?(?:\?.*)?$/);
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
    ws.isAlive = true;
    activeAthenaSockets.set(dongleId, ws);

    const updatePing = () => {
      const dev = getDevice(dongleId);
      if (dev) {
        dev.last_athena_ping = Math.floor(Date.now() / 1000);
        saveDevice(dev);
      }
    };
    updatePing();

    ws.on('pong', () => {
      ws.isAlive = true;
      updatePing();
    });

    ws.on('message', (raw) => {
      ws.isAlive = true;
      updatePing();
      try {
        const msg = JSON.parse(raw.toString());

        if (msg?.method === 'forwardLogs') {
          const logs = msg?.params?.logs ?? msg?.params ?? [];
          try {
            appendSwaglogs(dongleId, logs);
          } catch (err) {
            console.error(`[Athena] Failed saving forwardLogs for ${dongleId}:`, err.message);
          }
          if (msg.id !== undefined) {
            ws.send(JSON.stringify({ jsonrpc: '2.0', result: { success: 1 }, id: msg.id }));
          }
          return;
        }

        if (msg?.id !== undefined && !msg?.method) {
          const key = `${dongleId}:${msg.id}`;
          const pending = pendingAthenaRequests.get(key);
          if (pending) {
            clearTimeout(pending.timer);
            pendingAthenaRequests.delete(key);
            if (!pending.res.headersSent) {
              pending.res.json({ ...msg, id: pending.clientId });
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
      for (const [key, pending] of pendingAthenaRequests.entries()) {
        if (pending.dongleId === dongleId) {
          clearTimeout(pending.timer);
          pendingAthenaRequests.delete(key);
          if (!pending.res.headersSent) {
            pending.res.status(503).json({ error: 'Athena connection closed' });
          }
        }
      }
    });
  });

  function close() {
    clearInterval(heartbeatInterval);
    for (const [, pending] of pendingAthenaRequests.entries()) {
      clearTimeout(pending.timer);
    }
    pendingAthenaRequests.clear();
    return new Promise((resolve) => {
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // ignore
        }
      }
      wss.close(() => {
        if (server.listening) {
          server.close(() => resolve());
        } else {
          resolve();
        }
      });
    });
  }

  return { app, server, wss, close };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const PORT = process.env.PORT || 4000;
  const instance = createDriveServer();
  instance.server.listen(PORT, () => {
    console.log(`[Drive Companion API] Running on port ${PORT}`);
  });
}
