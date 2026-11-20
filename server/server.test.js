import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';
import { createDriveServer } from './index.js';

const TEST_SECRET = 'test-drive-secret-for-unit-tests-only';

describe('Drive Companion Server', () => {
  let tmpDir;
  let srv;
  let baseUrl;
  let wsBaseUrl;
  let userJwt;
  let deviceKeyPair;
  let dongleId;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-srv-test-'));
    process.env.DATA_DIR = tmpDir;
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD = 'password123';
    process.env.REQUIRE_2FA = 'false';

    srv = createDriveServer({
      jwtSecret: TEST_SECRET,
      require2fa: false,
      heartbeatMs: 60000,
      athenaTimeoutMs: 2500,
      appUrl: '',
    });

    await new Promise((resolve) => {
      srv.server.listen(0, '127.0.0.1', resolve);
    });
    const addr = srv.server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    wsBaseUrl = `ws://127.0.0.1:${addr.port}`;

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    userJwt = loginBody.access_token;
    assert.ok(userJwt);

    deviceKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  });

  after(async () => {
    await srv.close();
    delete process.env.DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function signDeviceToken(id) {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { identity: id, nbf: now - 10, iat: now, exp: now + 3600 },
      deviceKeyPair.privateKey,
      { algorithm: 'RS256' },
    );
  }

  test('device registration, pairing, owner, and auxiliary endpoints', async () => {
    const now = Math.floor(Date.now() / 1000);
    const regToken = jwt.sign(
      { register: true, exp: now + 300 },
      deviceKeyPair.privateKey,
      { algorithm: 'RS256' },
    );
    const regRes = await fetch(`${baseUrl}/v2/pilotauth/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'openpilot-0.9.8-ioniq',
      },
      body: new URLSearchParams({
        imei: '123456789012345',
        serial: 'serial-ioniq-01',
        public_key: deviceKeyPair.publicKey,
        register_token: regToken,
      }),
    });
    assert.equal(regRes.status, 200);
    const regBody = await regRes.json();
    dongleId = regBody.dongle_id;
    assert.match(dongleId, /^[a-f0-9]{16}$/);

    const pairToken = jwt.sign({ identity: dongleId }, TEST_SECRET, { expiresIn: '5m' });
    const pairRes = await fetch(`${baseUrl}/v2/pilotpair/`, {
      method: 'POST',
      headers: {
        Authorization: `JWT ${userJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pair_token: pairToken }),
    });
    assert.equal(pairRes.status, 200);

    const devRes = await fetch(`${baseUrl}/v1.1/devices/${dongleId}/`, {
      headers: { Authorization: `JWT ${signDeviceToken(dongleId)}` },
    });
    assert.equal(devRes.status, 200);
    const devBody = await devRes.json();
    assert.equal(devBody.is_paired, true);
    assert.equal(devBody.prime, true);
    assert.equal(devBody.prime_type, 1);
    assert.equal(devBody.openpilot_version, '0.9.8-ioniq');

    const ownerRes = await fetch(`${baseUrl}/v1/devices/${dongleId}/owner`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    assert.equal(ownerRes.status, 200);
    const ownerBody = await ownerRes.json();
    assert.ok(ownerBody.user_id.startsWith('drive_'));

    const turnRes = await fetch(`${baseUrl}/v1/me/turn`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    assert.equal(turnRes.status, 200);
    assert.equal(await turnRes.json(), null);
  });

  test('upload URL issuance, streaming PUT, HLS playlist, Range streaming, and stats', async () => {
    const devToken = signDeviceToken(dongleId);
    const routeId = '2026-11-20--12-00-00';

    const u1Res = await fetch(
      `${baseUrl}/v1.4/${dongleId}/upload_url/?path=${encodeURIComponent(`${routeId}--0/qcamera.ts`)}`,
      { headers: { Authorization: `JWT ${devToken}` } },
    );
    assert.equal(u1Res.status, 200);
    const { url: putUrl } = await u1Res.json();
    assert.ok(putUrl.startsWith(`${baseUrl}/v1/storage/upload/${dongleId}/${routeId}/0/qcamera.ts?`));

    // Tampered signature rejected
    const badPut = await fetch(`${putUrl}deadbeef`, {
      method: 'PUT',
      body: Buffer.from('bad'),
    });
    assert.equal(badPut.status, 403);

    // Traversal rejected on URL request
    const travRes = await fetch(
      `${baseUrl}/v1.4/${dongleId}/upload_url/?path=${encodeURIComponent('../../etc/passwd')}`,
      { headers: { Authorization: `JWT ${devToken}` } },
    );
    assert.equal(travRes.status, 400);

    // Valid binary segment upload
    const payloadBytes = Buffer.from('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    const putOk = await fetch(putUrl, { method: 'PUT', body: payloadBytes });
    assert.equal(putOk.status, 201);

    // Batch upload_urls matches files.js URL tail expectation
    const batchRes = await fetch(`${baseUrl}/v1/${dongleId}/upload_urls/`, {
      method: 'POST',
      headers: {
        Authorization: `JWT ${userJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paths: [`${routeId}/0/rlog.zst`], expiry_days: 7 }),
    });
    assert.equal(batchRes.status, 200);
    const batchBody = await batchRes.json();
    assert.equal(batchBody.length, 1);
    const tail = batchBody[0].url.split('?')[0].split('/').slice(-4);
    assert.deepEqual(tail, [dongleId, routeId, '0', 'rlog.zst']);

    // Route files response
    const filesRes = await fetch(`${baseUrl}/v1/route/${encodeURIComponent(`${dongleId}|${routeId}`)}/files`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    assert.equal(filesRes.status, 200);
    const filesBody = await filesRes.json();
    assert.equal(filesBody.qcameras.length, 1);
    assert.ok(filesBody.qcameras[0].includes(`/${dongleId}/${routeId}/0/qcamera.ts`));

    // HLS playlist & 206 Range request
    const m3u8Res = await fetch(`${baseUrl}/v1/route/${encodeURIComponent(`${dongleId}|${routeId}`)}/qcamera.m3u8`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    assert.equal(m3u8Res.status, 200);
    const m3u8Text = await m3u8Res.text();
    assert.ok(m3u8Text.includes('#EXTM3U'));
    assert.ok(m3u8Text.includes('#EXT-X-ENDLIST'));
    const segUrl = m3u8Text.split('\n').find((l) => l.startsWith('http'));
    assert.ok(segUrl);

    const rangeRes = await fetch(segUrl, { headers: { Range: 'bytes=10-19' } });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range'), `bytes 10-19/${payloadBytes.length}`);
    assert.equal(await rangeRes.text(), 'ABCDEFGHIJ');

    // Missing events.json returns empty JSON array (200 [])
    const missingEventsUrl = segUrl.replace('/qcamera.ts', '/events.json');
    const evRes = await fetch(missingEventsUrl);
    assert.equal(evRes.status, 200);
    assert.deepEqual(await evRes.json(), []);

    // Misc bootlog upload & download
    const bootUrlRes = await fetch(
      `${baseUrl}/v1.4/${dongleId}/upload_url/?path=${encodeURIComponent('boot/boot-01.zst')}`,
      { headers: { Authorization: `JWT ${devToken}` } },
    );
    const { url: bootPutUrl } = await bootUrlRes.json();
    const bootPut = await fetch(bootPutUrl, { method: 'PUT', body: Buffer.from('boot-zst-data') });
    assert.equal(bootPut.status, 201);

    const logsRes = await fetch(`${baseUrl}/api/logs/${dongleId}`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    const logsBody = await logsRes.json();
    assert.equal(logsBody.bootlogs.length, 1);

    const dlRes = await fetch(`${baseUrl}/api/logs/${dongleId}/download/boot/boot-01.zst`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    assert.equal(dlRes.status, 200);
    assert.equal(await dlRes.text(), 'boot-zst-data');
  });

  test('Athena WS handles concurrent id=0 RPCs and forwardLogs', async () => {
    const devToken = signDeviceToken(dongleId);
    const ws = new WebSocket(`${wsBaseUrl}/ws/v2/${dongleId}`, {
      headers: { Authorization: `JWT ${devToken}` },
    });

    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    const serverAckPromise = new Promise((resolve) => {
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.method) {
          // Reverse RPC from browser -> delay slightly to ensure both are in flight concurrently
          setTimeout(() => {
            ws.send(JSON.stringify({ jsonrpc: '2.0', result: { echoedMethod: msg.method }, id: msg.id }));
          }, msg.method === 'getVersion' ? 40 : 10);
        } else if (msg.id === 999) {
          resolve(msg);
        }
      });
    });

    const [rpcA, rpcB] = await Promise.all([
      fetch(`${baseUrl}/athena/${dongleId}`, {
        method: 'POST',
        headers: { Authorization: `JWT ${userJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 0, jsonrpc: '2.0', method: 'getVersion' }),
      }).then((r) => r.json()),
      fetch(`${baseUrl}/athena/${dongleId}`, {
        method: 'POST',
        headers: { Authorization: `JWT ${userJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 0, jsonrpc: '2.0', method: 'listUploadQueue' }),
      }).then((r) => r.json()),
    ]);

    assert.equal(rpcA.id, 0);
    assert.equal(rpcB.id, 0);
    assert.equal(rpcA.result.echoedMethod, 'getVersion');
    assert.equal(rpcB.result.echoedMethod, 'listUploadQueue');

    // Device-initiated forwardLogs
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'forwardLogs',
      params: { logs: [JSON.stringify({ levelname: 'WARNING', msg: 'Ioniq test swaglog', ctx: { daemon: 'ioniqd' } })] },
      id: 999,
    }));
    const ack = await serverAckPromise;
    assert.deepEqual(ack.result, { success: 1 });

    const logsRes = await fetch(`${baseUrl}/api/logs/${dongleId}`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    const logsBody = await logsRes.json();
    assert.ok(logsBody.swaglogs.some((e) => e.message === 'Ioniq test swaglog' && e.daemon === 'ioniqd'));

    ws.close();
    await new Promise((resolve) => ws.once('close', resolve));
  });

  test('Ioniq sync, route_meta distance/coords/events, stats, and Drive refuel preservation', async () => {
    const devToken = signDeviceToken(dongleId);
    const routeId = '2026-11-20--12-00-00';
    const routeStartMs = Date.UTC(2026, 10, 20, 12, 0, 0);

    const metaRes = await fetch(`${baseUrl}/v1/devices/${dongleId}/route_meta`, {
      method: 'POST',
      headers: { Authorization: `JWT ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route_id: routeId,
        segment_num: 0,
        start_time_utc_millis: routeStartMs,
        end_time_utc_millis: routeStartMs + 60_000,
        distance_meters: 1609.344,
        start_lat: 50.875,
        start_lng: 8.016,
        end_lat: 50.885,
        end_lng: 8.026,
        coords: [{ t: 0, lat: 50.875, lng: 8.016, speed: 12.5, dist: 0 }],
        events: [{ type: 'state', route_offset_millis: 1000, route_offset_nanos: 0, data: { enabled: true, state: 'enabled', alertStatus: 'normal' } }],
      }),
    });
    assert.equal(metaRes.status, 200);

    const syncRes = await fetch(`${baseUrl}/v1/devices/${dongleId}/ioniq/sync`, {
      method: 'POST',
      headers: { Authorization: `JWT ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        syncedAt: Math.floor(Date.now() / 1000),
        fuel: {
          trips: [
            {
              id: 'trip-1',
              startedAt: Math.floor(routeStartMs / 1000),
              endedAt: Math.floor(routeStartMs / 1000) + 120,
              distanceKm: 1.6,
              fuelLiters: 0.08,
              avgLPer100Km: 5.0,
              evDistancePct: 62.0,
              evTimePct: 68.0,
              estimatedCostEur: 0.14,
              sourceMode: 'fco_can',
            },
          ],
          refuelLog: [
            { id: 'dev_1', loggedAt: 1700000000, liters: 36.2, costEur: 63.35, fullTank: true },
          ],
        },
        diagnostics: { liveEcus: [{ ecuId: 'HCU', name: 'Hybrid-Steuergerät', online: true, bus: 0, framesSeen: 100 }] },
        recordings: [{ id: 'rec_1', trigger: 'manual', label: 'Test', startedAt: 1700000100, durationS: 10, sampleCount: 2 }],
        newRecordingBundles: [{ id: 'rec_1', trigger: 'manual', samples: [{ t: 0, speedKph: 50 }] }],
      }),
    });
    assert.equal(syncRes.status, 200);

    // Add manual Drive refuel
    const refuelRes = await fetch(`${baseUrl}/api/ioniq/${dongleId}/refuel`, {
      method: 'POST',
      headers: { Authorization: `JWT ${userJwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ liters: 38.4, pricePerLiter: 1.72, notes: 'Aral' }),
    });
    assert.equal(refuelRes.status, 201);

    // Re-sync from device without Drive refuel -> Drive refuel must be preserved
    const resyncRes = await fetch(`${baseUrl}/v1/devices/${dongleId}/ioniq/sync`, {
      method: 'POST',
      headers: { Authorization: `JWT ${devToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1,
        syncedAt: Math.floor(Date.now() / 1000) + 5,
        fuel: {
          refuelLog: [{ id: 'dev_1', loggedAt: 1700000000, liters: 36.2, costEur: 63.35, fullTank: true }],
        },
      }),
    });
    assert.equal(resyncRes.status, 200);

    const overviewRes = await fetch(`${baseUrl}/api/ioniq/${dongleId}/overview`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    const overview = await overviewRes.json();
    assert.equal(overview.fuel.refuelLog.length, 2);
    assert.ok(overview.fuel.refuelLog.some((r) => r.source === 'drive' && r.liters === 38.4));

    const recRes = await fetch(`${baseUrl}/api/ioniq/${dongleId}/recordings/rec_1`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    assert.equal(recRes.status, 200);
    const rec = await recRes.json();
    assert.equal(rec.samples.length, 1);

    // Verify routes_segments distance in miles, absolute url, linked ioniq, and stats
    const routesRes = await fetch(`${baseUrl}/v1/devices/${dongleId}/routes_segments`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    const routes = await routesRes.json();
    assert.equal(routes.length, 1);
    assert.equal(routes[0].distance, 1);
    assert.ok(routes[0].url.startsWith(`${baseUrl}/v1/storage/r/`));
    assert.equal(routes[0].ioniq.avgLPer100Km, 5.0);

    const coordsRes = await fetch(`${routes[0].url}/0/coords.json`);
    assert.equal(coordsRes.status, 200);
    const coords = await coordsRes.json();
    assert.equal(coords[0].lat, 50.875);

    const statsRes = await fetch(`${baseUrl}/v1.1/devices/${dongleId}/stats`, {
      headers: { Authorization: `JWT ${userJwt}` },
    });
    const stats = await statsRes.json();
    assert.equal(stats.all.routes, 1);
    assert.equal(stats.all.count, 1);
    assert.equal(stats.all.distance, 1);
  });
});
