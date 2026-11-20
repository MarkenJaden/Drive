import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDataDir } from './db.js';

const SEGMENT_SLASH_RE = /^([a-f0-9]{8}--[a-f0-9]{10}|[0-9]{4}-[0-9]{2}-[0-9]{2}--[0-9]{2}-[0-9]{2}-[0-9]{2})\/([0-9]+)\/([a-zA-Z0-9._-]+)$/;
const SEGMENT_DASH_RE = /^([a-f0-9]{8}--[a-f0-9]{10}|[0-9]{4}-[0-9]{2}-[0-9]{2}--[0-9]{2}-[0-9]{2}-[0-9]{2})--([0-9]+)\/([a-zA-Z0-9._-]+)$/;
const MISC_RE = /^(boot|crash)\/([a-zA-Z0-9._-]+)$/;
const DATE_ROUTE_RE = /^(\d{4})-(\d{2})-(\d{2})--(\d{2})-(\d{2})-(\d{2})$/;

const METERS_PER_MILE = 1609.344;
const MAX_SWAGLOG_BATCHES = 200;
const MAX_SWAGLOG_ENTRIES = 1000;
const MAX_MISC_LOGS = 200;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err) {
    console.error(`[Storage] Failed reading ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function safeJoin(baseDir, ...segments) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, ...segments);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path traversal rejected');
  }
  return resolvedTarget;
}

function assertSafeDongleId(dongleId) {
  if (typeof dongleId !== 'string' || !/^[a-zA-Z0-9_-]{4,64}$/.test(dongleId)) {
    throw new Error('Invalid dongle_id');
  }
  return dongleId;
}

function getRoutesFile() {
  return path.join(getDataDir(), 'routes.json');
}

function getLogsFile(dongleId) {
  assertSafeDongleId(dongleId);
  return safeJoin(path.join(getDataDir(), 'logs'), `${dongleId}.json`);
}

function getIoniqFile(dongleId) {
  assertSafeDongleId(dongleId);
  return safeJoin(path.join(getDataDir(), 'ioniq'), `${dongleId}.json`);
}

function getIoniqRecordingsDir(dongleId) {
  assertSafeDongleId(dongleId);
  return safeJoin(path.join(getDataDir(), 'ioniq'), dongleId, 'recordings');
}

export function parseUploadKey(rawPath) {
  if (typeof rawPath !== 'string') return null;
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized || normalized.includes('..') || normalized.includes('\0')) {
    return null;
  }

  let m = normalized.match(SEGMENT_DASH_RE);
  if (m) {
    const filename = m[3];
    if (filename === '.' || filename === '..') return null;
    return { kind: 'segment', routeId: m[1], segNum: Number(m[2]), filename };
  }

  m = normalized.match(SEGMENT_SLASH_RE);
  if (m) {
    const filename = m[3];
    if (filename === '.' || filename === '..') return null;
    return { kind: 'segment', routeId: m[1], segNum: Number(m[2]), filename };
  }

  m = normalized.match(MISC_RE);
  if (m) {
    const filename = m[2];
    if (filename === '.' || filename === '..') return null;
    return { kind: 'misc', category: m[1], filename };
  }

  return null;
}

export function canonicalKeyPath(parsed) {
  if (!parsed) return '';
  if (parsed.kind === 'segment') {
    return `${parsed.routeId}/${parsed.segNum}/${parsed.filename}`;
  }
  if (parsed.kind === 'misc') {
    return `${parsed.category}/${parsed.filename}`;
  }
  return '';
}

function hmacHex(secret, message) {
  return crypto.createHmac('sha256', String(secret)).update(message).digest('hex');
}

function constantTimeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

export function signStorageToken(dongleId, keyPath, secret, expiresInSeconds = 7 * 86400) {
  const ttl = Math.max(60, Number(expiresInSeconds) || 7 * 86400);
  const exp = String(Math.floor(Date.now() / 1000) + ttl);
  const sig = hmacHex(secret, `put:${dongleId}:${keyPath}:${exp}`);
  return { exp, sig };
}

export function verifyStorageToken(dongleId, keyPath, exp, sig, secret) {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum <= Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = hmacHex(secret, `put:${dongleId}:${keyPath}:${String(exp)}`);
  return constantTimeHexEqual(String(sig || ''), expected);
}

export function signRouteAccess(dongleId, logId, secret, expiresInSeconds = 7 * 86400) {
  const ttl = Math.max(60, Number(expiresInSeconds) || 7 * 86400);
  const exp = String(Math.floor(Date.now() / 1000) + ttl);
  const sig = hmacHex(secret, `route:${dongleId}:${logId}:${exp}`);
  return { exp, sig };
}

export function verifyRouteAccess(dongleId, logId, exp, sig, secret) {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum <= Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = hmacHex(secret, `route:${dongleId}:${logId}:${String(exp)}`);
  return constantTimeHexEqual(String(sig || ''), expected);
}

export function getUploadFilePath(dongleId, parsed) {
  assertSafeDongleId(dongleId);
  const baseDir = safeJoin(getDataDir(), 'uploads', dongleId);
  if (parsed.kind === 'segment') {
    return safeJoin(baseDir, parsed.routeId, String(parsed.segNum), parsed.filename);
  }
  if (parsed.kind === 'misc') {
    return safeJoin(baseDir, parsed.category, parsed.filename);
  }
  throw new Error('Unsupported upload key kind');
}

function parseRouteStartMillis(routeId) {
  const m = String(routeId || '').match(DATE_ROUTE_RE);
  if (!m) return null;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
}

function loadRoutesMap() {
  const data = readJson(getRoutesFile(), {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function saveRoutesMap(routesMap) {
  writeJsonAtomic(getRoutesFile(), routesMap);
}

function maxSegmentWithFile(segEntries, filenames) {
  let maxSeg = -1;
  for (const [segNum, seg] of segEntries) {
    const files = seg.files || {};
    if (filenames.some((name) => Boolean(files[name]))) {
      maxSeg = Math.max(maxSeg, segNum);
    }
  }
  return maxSeg;
}

function recomputeRouteAggregates(route) {
  const segEntries = Object.entries(route.segments || {})
    .map(([k, v]) => [Number(k), v])
    .filter(([n, v]) => Number.isFinite(n) && v && typeof v === 'object')
    .sort((a, b) => a[0] - b[0]);

  if (segEntries.length === 0) {
    return route;
  }

  let inferredStart = parseRouteStartMillis(route.log_id);
  if (inferredStart == null) {
    const explicitStarts = segEntries
      .map(([n, s]) => (typeof s.start_time_utc_millis === 'number' ? s.start_time_utc_millis - n * 60_000 : null))
      .filter((t) => typeof t === 'number' && Number.isFinite(t));
    inferredStart = explicitStarts.length ? explicitStarts[0] : (route.start_time_utc_millis || Date.now());
  }

  const segmentNumbers = [];
  const segmentStartTimes = [];
  const segmentEndTimes = [];
  let totalDistanceMeters = 0;
  let startLat = null;
  let startLng = null;
  let endLat = null;
  let endLng = null;

  for (const [segNum, seg] of segEntries) {
    const segStart = typeof seg.start_time_utc_millis === 'number'
      ? seg.start_time_utc_millis
      : inferredStart + segNum * 60_000;
    let durationMs = 60_000;
    if (typeof seg.duration_s === 'number' && seg.duration_s > 0) {
      durationMs = Math.max(1000, Math.round(seg.duration_s * 1000));
    } else if (typeof seg.end_time_utc_millis === 'number' && seg.end_time_utc_millis > segStart) {
      durationMs = seg.end_time_utc_millis - segStart;
    }
    const segEnd = segStart + durationMs;

    segmentNumbers.push(segNum);
    segmentStartTimes.push(segStart);
    segmentEndTimes.push(segEnd);

    if (typeof seg.distance_meters === 'number' && Number.isFinite(seg.distance_meters)) {
      totalDistanceMeters += Math.max(0, seg.distance_meters);
    }
    if (startLat == null && typeof seg.start_lat === 'number' && typeof seg.start_lng === 'number') {
      startLat = seg.start_lat;
      startLng = seg.start_lng;
    }
    if (typeof seg.end_lat === 'number' && typeof seg.end_lng === 'number') {
      endLat = seg.end_lat;
      endLng = seg.end_lng;
    }
  }

  route.start_time_utc_millis = segmentStartTimes[0];
  route.end_time_utc_millis = segmentEndTimes[segmentEndTimes.length - 1];
  route.create_time = route.create_time || Math.floor(route.start_time_utc_millis / 1000);
  route.segment_numbers = segmentNumbers;
  route.segment_start_times = segmentStartTimes;
  route.segment_end_times = segmentEndTimes;
  route.distance_meters = Number(totalDistanceMeters.toFixed(1));
  if (startLat != null && startLng != null) {
    route.start_lat = startLat;
    route.start_lng = startLng;
  }
  if (endLat != null && endLng != null) {
    route.end_lat = endLat;
    route.end_lng = endLng;
  }

  route.maxqlog = maxSegmentWithFile(segEntries, ['qlog.zst', 'qlog.bz2', 'coords.json', 'events.json']);
  route.maxqcamera = maxSegmentWithFile(segEntries, ['qcamera.ts']);
  route.maxlog = maxSegmentWithFile(segEntries, ['rlog.zst', 'rlog.bz2']);
  route.maxcamera = maxSegmentWithFile(segEntries, ['fcamera.hevc']);
  route.maxdcamera = maxSegmentWithFile(segEntries, ['dcamera.hevc']);
  route.maxecamera = maxSegmentWithFile(segEntries, ['ecamera.hevc']);
  route.proclog = route.maxqlog;
  return route;
}

function summarizeTripForRoute(trip) {
  if (!trip || typeof trip !== 'object') return null;
  return {
    id: trip.id ?? null,
    distanceKm: trip.distanceKm ?? null,
    fuelLiters: trip.fuelLiters ?? null,
    avgLPer100Km: trip.avgLPer100Km ?? null,
    evDistancePct: trip.evDistancePct ?? null,
    evTimePct: trip.evTimePct ?? null,
    estimatedCostEur: trip.estimatedCostEur ?? null,
    sourceMode: trip.sourceMode ?? null,
  };
}

export function upsertSegmentFile({
  dongleId,
  routeId,
  segNum,
  filename,
  size = 0,
  durationSeconds = null,
  deviceMeta = null,
}) {
  assertSafeDongleId(dongleId);
  const fullname = `${dongleId}|${routeId}`;
  const routes = loadRoutesMap();
  const route = routes[fullname] || {
    fullname,
    dongle_id: dongleId,
    log_id: routeId,
    is_public: false,
    is_preserved: false,
    platform: 'HYUNDAI_IONIQ_HEV',
    version: deviceMeta?.openpilot_version || null,
    git_branch: deviceMeta?.git_branch || null,
    segments: {},
    ioniq: null,
  };

  if (deviceMeta?.openpilot_version) route.version = deviceMeta.openpilot_version;
  if (deviceMeta?.git_branch) route.git_branch = deviceMeta.git_branch;

  const segKey = String(segNum);
  const seg = route.segments[segKey] || { files: {} };
  seg.files = seg.files || {};
  seg.files[filename] = {
    size: Number(size) || 0,
    uploaded_at: new Date().toISOString(),
  };
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    seg.duration_s = Number(durationSeconds.toFixed(3));
  }
  route.segments[segKey] = seg;

  recomputeRouteAggregates(route);
  routes[fullname] = route;
  saveRoutesMap(routes);
  return route;
}

export function upsertSegmentMeta({
  dongleId,
  routeId,
  segNum,
  startTimeMs = null,
  endTimeMs = null,
  distanceMeters = null,
  startLat = null,
  startLng = null,
  endLat = null,
  endLng = null,
  coords = null,
  events = null,
  ioniqTripSummary = null,
}) {
  assertSafeDongleId(dongleId);
  const fullname = `${dongleId}|${routeId}`;
  const routes = loadRoutesMap();
  const route = routes[fullname] || {
    fullname,
    dongle_id: dongleId,
    log_id: routeId,
    is_public: false,
    is_preserved: false,
    platform: 'HYUNDAI_IONIQ_HEV',
    segments: {},
    ioniq: null,
  };

  const segKey = String(segNum);
  const seg = route.segments[segKey] || { files: {} };
  seg.files = seg.files || {};

  if (typeof startTimeMs === 'number' && Number.isFinite(startTimeMs)) {
    seg.start_time_utc_millis = startTimeMs;
  }
  if (typeof endTimeMs === 'number' && Number.isFinite(endTimeMs)) {
    seg.end_time_utc_millis = endTimeMs;
    if (typeof seg.start_time_utc_millis === 'number' && endTimeMs > seg.start_time_utc_millis && !seg.duration_s) {
      seg.duration_s = Number(((endTimeMs - seg.start_time_utc_millis) / 1000).toFixed(3));
    }
  }
  if (typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)) {
    seg.distance_meters = Math.max(0, Number(distanceMeters));
  }
  if (typeof startLat === 'number' && typeof startLng === 'number') {
    seg.start_lat = startLat;
    seg.start_lng = startLng;
  }
  if (typeof endLat === 'number' && typeof endLng === 'number') {
    seg.end_lat = endLat;
    seg.end_lng = endLng;
  }

  if (Array.isArray(coords)) {
    const coordsPath = getUploadFilePath(dongleId, { kind: 'segment', routeId, segNum, filename: 'coords.json' });
    writeJsonAtomic(coordsPath, coords);
    seg.files['coords.json'] = {
      size: fs.statSync(coordsPath).size,
      uploaded_at: new Date().toISOString(),
    };
  }
  if (Array.isArray(events)) {
    const eventsPath = getUploadFilePath(dongleId, { kind: 'segment', routeId, segNum, filename: 'events.json' });
    writeJsonAtomic(eventsPath, events);
    seg.files['events.json'] = {
      size: fs.statSync(eventsPath).size,
      uploaded_at: new Date().toISOString(),
    };
  }

  if (ioniqTripSummary && typeof ioniqTripSummary === 'object') {
    route.ioniq = summarizeTripForRoute(ioniqTripSummary);
  }

  route.segments[segKey] = seg;
  recomputeRouteAggregates(route);
  routes[fullname] = route;
  saveRoutesMap(routes);
  return route;
}

export function formatRouteForConnect(route, origin, secret) {
  const { exp, sig } = signRouteAccess(route.dongle_id, route.log_id, secret);
  const cleanOrigin = String(origin || 'http://localhost:4000').replace(/\/$/, '');
  const segNumbers = Array.isArray(route.segment_numbers) && route.segment_numbers.length ? route.segment_numbers : [0];
  const segStarts = Array.isArray(route.segment_start_times) && route.segment_start_times.length
    ? route.segment_start_times
    : [route.start_time_utc_millis || Date.now()];
  const segEnds = Array.isArray(route.segment_end_times) && route.segment_end_times.length
    ? route.segment_end_times
    : [segStarts[0] + 60_000];
  const startMs = route.start_time_utc_millis || segStarts[0];
  const endMs = route.end_time_utc_millis || segEnds[segEnds.length - 1];

  return {
    fullname: route.fullname,
    dongle_id: route.dongle_id,
    log_id: route.log_id,
    create_time: route.create_time || Math.floor(startMs / 1000),
    start_time_utc_millis: startMs,
    end_time_utc_millis: endMs,
    duration: Math.max(1000, endMs - startMs),
    distance: Number((((route.distance_meters || 0)) / METERS_PER_MILE).toFixed(3)),
    start_lat: route.start_lat ?? 0,
    start_lng: route.start_lng ?? 0,
    end_lat: route.end_lat ?? route.start_lat ?? 0,
    end_lng: route.end_lng ?? route.start_lng ?? 0,
    is_public: Boolean(route.is_public),
    is_preserved: Boolean(route.is_preserved),
    maxqlog: typeof route.maxqlog === 'number' ? route.maxqlog : -1,
    maxqcamera: typeof route.maxqcamera === 'number' ? route.maxqcamera : -1,
    maxlog: typeof route.maxlog === 'number' ? route.maxlog : -1,
    maxcamera: typeof route.maxcamera === 'number' ? route.maxcamera : -1,
    maxdcamera: typeof route.maxdcamera === 'number' ? route.maxdcamera : -1,
    maxecamera: typeof route.maxecamera === 'number' ? route.maxecamera : -1,
    proclog: typeof route.maxqlog === 'number' ? route.maxqlog : -1,
    platform: route.platform || 'HYUNDAI_IONIQ_HEV',
    version: route.version || null,
    git_branch: route.git_branch || null,
    segment_numbers: segNumbers,
    segment_start_times: segStarts,
    segment_end_times: segEnds,
    url: `${cleanOrigin}/v1/storage/r/${exp}/${sig}/${route.dongle_id}/${route.log_id}`,
    share_exp: exp,
    share_sig: sig,
    ioniq: route.ioniq || null,
  };
}

export function getRoute(routeName) {
  const routes = loadRoutesMap();
  return routes[routeName] || null;
}

export function getDeviceRoutes(
  dongleId,
  { start = null, end = null, limit = null, routeStr = null, includePrivate = true, origin = '', secret = '' } = {},
) {
  const routesMap = loadRoutesMap();
  let list = Object.values(routesMap).filter((r) => r.dongle_id === dongleId);

  if (!includePrivate) {
    list = list.filter((r) => Boolean(r.is_public));
  }
  if (routeStr) {
    list = list.filter((r) => r.fullname === routeStr || r.log_id === routeStr || r.fullname === `${dongleId}|${routeStr}`);
  }
  if (start != null && start !== '') {
    const startMs = Number(start);
    if (Number.isFinite(startMs)) {
      list = list.filter((r) => (r.end_time_utc_millis || 0) >= startMs);
    }
  }
  if (end != null && end !== '') {
    const endMs = Number(end);
    if (Number.isFinite(endMs)) {
      list = list.filter((r) => (r.start_time_utc_millis || 0) <= endMs);
    }
  }

  list.sort((a, b) => (b.start_time_utc_millis || 0) - (a.start_time_utc_millis || 0));

  const limitNum = Number(limit);
  if (limit != null && limit !== '' && Number.isFinite(limitNum) && limitNum > 0) {
    list = list.slice(0, limitNum);
  }

  return list.map((r) => formatRouteForConnect(r, origin, secret));
}

export function updateRouteFlags(routeName, patch) {
  const routes = loadRoutesMap();
  const route = routes[routeName];
  if (!route) return null;
  if (typeof patch.is_public === 'boolean') route.is_public = patch.is_public;
  if (typeof patch.is_preserved === 'boolean') route.is_preserved = patch.is_preserved;
  routes[routeName] = route;
  saveRoutesMap(routes);
  return route;
}

export function getRouteFilesForConnect(dongleId, logId, origin, secret) {
  const fullname = `${dongleId}|${logId}`;
  const route = getRoute(fullname);
  const empty = { cameras: [], dcameras: [], ecameras: [], logs: [], qcameras: [], qlogs: [] };
  if (!route) return empty;

  const { exp, sig } = signRouteAccess(dongleId, logId, secret);
  const cleanOrigin = String(origin || 'http://localhost:4000').replace(/\/$/, '');
  const segEntries = Object.entries(route.segments || {})
    .map(([k, v]) => [Number(k), v])
    .filter(([n]) => Number.isFinite(n))
    .sort((a, b) => a[0] - b[0]);

  for (const [segNum, seg] of segEntries) {
    const files = seg.files || {};
    for (const filename of Object.keys(files)) {
      const assetUrl = `${cleanOrigin}/v1/storage/r/${exp}/${sig}/${dongleId}/${logId}/${segNum}/${filename}`;
      if (filename === 'fcamera.hevc') empty.cameras.push(assetUrl);
      else if (filename === 'dcamera.hevc') empty.dcameras.push(assetUrl);
      else if (filename === 'ecamera.hevc') empty.ecameras.push(assetUrl);
      else if (filename === 'qcamera.ts') empty.qcameras.push(assetUrl);
      else if (filename === 'rlog.zst' || filename === 'rlog.bz2') empty.logs.push(assetUrl);
      else if (filename === 'qlog.zst' || filename === 'qlog.bz2') empty.qlogs.push(assetUrl);
    }
  }
  return empty;
}

export function getDeviceStats(dongleId) {
  const routes = Object.values(loadRoutesMap()).filter((r) => r.dongle_id === dongleId);
  const weekCutoffMs = Date.now() - 7 * 86400 * 1000;

  const calc = (items) => {
    let meters = 0;
    let millis = 0;
    for (const r of items) {
      meters += r.distance_meters || 0;
      millis += Math.max(0, (r.end_time_utc_millis || 0) - (r.start_time_utc_millis || 0));
    }
    return {
      distance: Number((meters / METERS_PER_MILE).toFixed(2)),
      routes: items.length,
      count: items.length,
      minutes: Math.round(millis / 60_000),
    };
  };

  return {
    all: calc(routes),
    week: calc(routes.filter((r) => (r.start_time_utc_millis || 0) >= weekCutoffMs)),
  };
}

export function getFirehoseCount(dongleId) {
  const routes = Object.values(loadRoutesMap()).filter((r) => r.dongle_id === dongleId);
  return routes.reduce((acc, r) => acc + Object.keys(r.segments || {}).length, 0);
}

// ---------------- Logs Storage (Swaglogs / Boot / Crash) ----------------

function loadLogsDoc(dongleId) {
  const doc = readJson(getLogsFile(dongleId), null);
  if (doc && typeof doc === 'object') {
    return {
      batches: Array.isArray(doc.batches) ? doc.batches : [],
      swaglogs: Array.isArray(doc.swaglogs) ? doc.swaglogs : [],
      bootlogs: Array.isArray(doc.bootlogs) ? doc.bootlogs : [],
      crashlogs: Array.isArray(doc.crashlogs) ? doc.crashlogs : [],
    };
  }
  return { batches: [], swaglogs: [], bootlogs: [], crashlogs: [] };
}

function normalizeSwaglogEntry(raw, receivedAt) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { timestamp: receivedAt, level: 'INFO', message: raw };
    }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { timestamp: receivedAt, level: 'INFO', message: String(parsed ?? '') };
  }
  const msg = parsed.msg ?? parsed.message ?? parsed;
  return {
    timestamp: parsed.created ? new Date(Number(parsed.created) * 1000).toISOString() : (parsed.timestamp || receivedAt),
    level: String(parsed.levelname || parsed.level || parsed.levelno || 'INFO').toUpperCase(),
    daemon: parsed.ctx?.daemon || parsed.daemon || parsed.filename || null,
    message: typeof msg === 'string' ? msg : JSON.stringify(msg),
    raw: parsed,
  };
}

export function appendSwaglogs(dongleId, entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (!list.length) return 0;

  const doc = loadLogsDoc(dongleId);
  const receivedAt = new Date().toISOString();
  const normalized = list.map((item) => normalizeSwaglogEntry(item, receivedAt));

  doc.batches.unshift({ receivedAt, count: normalized.length });
  doc.batches = doc.batches.slice(0, MAX_SWAGLOG_BATCHES);

  doc.swaglogs = [...normalized.reverse(), ...doc.swaglogs].slice(0, MAX_SWAGLOG_ENTRIES);
  writeJsonAtomic(getLogsFile(dongleId), doc);
  return normalized.length;
}

export function recordMiscLog(dongleId, category, filename, size = 0) {
  const doc = loadLogsDoc(dongleId);
  const listKey = category === 'boot' ? 'bootlogs' : 'crashlogs';
  const entry = {
    category,
    filename,
    size: Number(size) || 0,
    uploadedAt: new Date().toISOString(),
  };
  doc[listKey] = [entry, ...doc[listKey].filter((item) => item.filename !== filename)].slice(0, MAX_MISC_LOGS);
  writeJsonAtomic(getLogsFile(dongleId), doc);
  return entry;
}

export function getDeviceLogs(dongleId) {
  const doc = loadLogsDoc(dongleId);
  const routes = Object.values(loadRoutesMap()).filter((r) => r.dongle_id === dongleId);
  let segmentCount = 0;
  let totalBytes = 0;
  for (const r of routes) {
    const segs = Object.values(r.segments || {});
    segmentCount += segs.length;
    for (const seg of segs) {
      for (const f of Object.values(seg.files || {})) {
        totalBytes += Number(f?.size || 0);
      }
    }
  }
  for (const b of doc.bootlogs) totalBytes += Number(b.size || 0);
  for (const c of doc.crashlogs) totalBytes += Number(c.size || 0);

  return {
    swaglogs: doc.swaglogs,
    bootlogs: doc.bootlogs,
    crashlogs: doc.crashlogs,
    batches: doc.batches.slice(0, 30),
    storage: {
      routeCount: routes.length,
      segmentCount,
      totalBytes,
    },
  };
}

// ---------------- Ioniq Telemetry & Fuel Storage ----------------

export function linkIoniqTripToRoutes(dongleId, trips) {
  const validTrips = (Array.isArray(trips) ? trips : []).filter(
    (t) => t && typeof t === 'object' && typeof t.startedAt === 'number',
  );
  if (!validTrips.length) return 0;

  const routes = loadRoutesMap();
  let updated = 0;
  const padMs = 120_000;

  for (const [key, route] of Object.entries(routes)) {
    if (route.dongle_id !== dongleId) continue;
    const rStart = route.start_time_utc_millis || 0;
    const rEnd = route.end_time_utc_millis || (rStart + 60_000);
    let bestTrip = null;
    let bestOverlap = 0;

    for (const trip of validTrips) {
      const tStart = trip.startedAt * 1000 - padMs;
      const tEnd = (typeof trip.endedAt === 'number' ? trip.endedAt * 1000 : Date.now()) + padMs;
      const overlap = Math.min(rEnd, tEnd) - Math.max(rStart, tStart);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestTrip = trip;
      }
    }

    if (bestTrip) {
      routes[key] = { ...route, ioniq: summarizeTripForRoute(bestTrip) };
      updated += 1;
    }
  }

  if (updated > 0) {
    saveRoutesMap(routes);
  }
  return updated;
}

function recalculateRefuelTotals(fuel) {
  const refuels = Array.isArray(fuel.refuelLog) ? fuel.refuelLog : [];
  fuel.totalLoggedLiters = Number(refuels.reduce((s, r) => s + Number(r.liters || 0), 0).toFixed(2));
  fuel.totalLoggedCostEur = Number(refuels.reduce((s, r) => s + Number(r.costEur || 0), 0).toFixed(2));
}

export function mergeIoniqSync(dongleId, payload) {
  assertSafeDongleId(dongleId);
  const filePath = getIoniqFile(dongleId);
  const prev = readJson(filePath, {});
  const prevRefuels = Array.isArray(prev?.fuel?.refuelLog) ? prev.fuel.refuelLog : [];
  const driveRefuels = prevRefuels.filter((r) => r?.source === 'drive');

  const incomingFuel = payload?.fuel && typeof payload.fuel === 'object' ? { ...payload.fuel } : { ...(prev.fuel || {}) };
  const deviceRefuels = Array.isArray(incomingFuel.refuelLog) ? incomingFuel.refuelLog : [];
  const seenIds = new Set(deviceRefuels.map((r) => r?.id).filter(Boolean));
  const mergedRefuels = [
    ...driveRefuels.filter((r) => r?.id && !seenIds.has(r.id)),
    ...deviceRefuels,
  ].sort((a, b) => Number(b.loggedAt || 0) - Number(a.loggedAt || 0));

  incomingFuel.refuelLog = mergedRefuels;
  recalculateRefuelTotals(incomingFuel);

  const overview = {
    schemaVersion: payload?.schemaVersion ?? 1,
    dongleId,
    syncedAt: payload?.syncedAt ?? Math.floor(Date.now() / 1000),
    serverReceivedAt: new Date().toISOString(),
    config: payload?.config ?? prev.config ?? {},
    fuel: incomingFuel,
    diagnostics: payload?.diagnostics ?? prev.diagnostics ?? {},
    recordings: Array.isArray(payload?.recordings) ? payload.recordings : (prev.recordings || []),
    discovery: payload?.discovery ?? prev.discovery ?? { active: false, captures: [] },
    openpilot: payload?.openpilot ?? prev.openpilot ?? {},
    location: payload?.location ?? prev.location ?? null,
  };

  if (Array.isArray(payload?.newRecordingBundles) && payload.newRecordingBundles.length) {
    const recDir = getIoniqRecordingsDir(dongleId);
    ensureDir(recDir);
    for (const bundle of payload.newRecordingBundles) {
      const safeId = String(bundle?.id || '').replace(/[^a-zA-Z0-9._-]/g, '');
      if (!safeId) continue;
      writeJsonAtomic(safeJoin(recDir, `${safeId}.json`), bundle);
    }
  }

  writeJsonAtomic(filePath, overview);

  const tripsToLink = [];
  if (incomingFuel.activeTrip) tripsToLink.push(incomingFuel.activeTrip);
  if (Array.isArray(incomingFuel.trips)) tripsToLink.push(...incomingFuel.trips);
  linkIoniqTripToRoutes(dongleId, tripsToLink);

  return overview;
}

export function addDriveRefuel(dongleId, body = {}) {
  assertSafeDongleId(dongleId);
  const liters = Number(body.liters);
  if (!Number.isFinite(liters) || liters < 0.1 || liters > 90) {
    throw new Error('liters must be between 0.1 and 90');
  }

  const filePath = getIoniqFile(dongleId);
  const overview = readJson(filePath, {
    schemaVersion: 1,
    dongleId,
    syncedAt: null,
    config: {},
    fuel: {
      activeTrip: null,
      trips: [],
      currentTank: null,
      tankHistory: [],
      refuelLog: [],
      refuelAlert: null,
    },
    diagnostics: {},
    recordings: [],
    discovery: { active: false, captures: [] },
    openpilot: {},
  });

  const defaultPrice = Number(overview?.config?.fuelPriceEurPerLiter || 1.75);
  let pricePerLiter = body.pricePerLiter != null && Number(body.pricePerLiter) > 0
    ? Number(body.pricePerLiter)
    : defaultPrice;
  let costEur = body.costEur != null && Number(body.costEur) > 0
    ? Number(body.costEur)
    : Number((liters * pricePerLiter).toFixed(2));
  if (body.costEur != null && Number(body.costEur) > 0 && !(body.pricePerLiter != null && Number(body.pricePerLiter) > 0)) {
    pricePerLiter = Number((costEur / liters).toFixed(3));
  }

  const entry = {
    id: `drive_${Date.now()}`,
    source: 'drive',
    loggedAt: Math.floor(Date.now() / 1000),
    liters: Number(liters.toFixed(2)),
    pricePerLiter: Number(pricePerLiter.toFixed(3)),
    costEur: Number(costEur.toFixed(2)),
    odometerKm: body.odometerKm != null && Number.isFinite(Number(body.odometerKm)) ? Number(Number(body.odometerKm).toFixed(1)) : null,
    fullTank: body.fullTank !== false,
    notes: String(body.notes || '').trim().slice(0, 120),
  };

  overview.fuel = overview.fuel || {};
  overview.fuel.refuelLog = [entry, ...(Array.isArray(overview.fuel.refuelLog) ? overview.fuel.refuelLog : [])];
  recalculateRefuelTotals(overview.fuel);
  writeJsonAtomic(filePath, overview);
  return { entry, overview };
}

export function getIoniqOverview(dongleId) {
  assertSafeDongleId(dongleId);
  return readJson(getIoniqFile(dongleId), null);
}

export function getIoniqRecording(dongleId, recId) {
  const safeId = String(recId || '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safeId || safeId !== recId) return null;
  const target = safeJoin(getIoniqRecordingsDir(dongleId), `${safeId}.json`);
  return readJson(target, null);
}
