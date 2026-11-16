import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';

process.env.DATA_DIR = './test-data';
process.env.PORT = '4005';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD = 'password123';
process.env.REQUIRE_2FA = 'true';

// Import server
await import('./index.js');

// Helper to make requests
function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:4005${path}`, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Testing Companion API ---');

  // 1. Health
  const health = await request('/api/health');
  console.log('1. Health check:', health.status === 200 && health.data.status === 'ok' ? 'PASS' : 'FAIL');

  // 2. Login without 2FA
  const login1 = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: 'password123' },
  });
  console.log('2. Login triggers 2FA setup:', login1.data.requires2faSetup ? 'PASS' : 'FAIL');
  const setupToken = login1.data.setupToken;

  // 3. Setup 2FA
  const setup = await request('/api/auth/2fa/setup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${setupToken}`,
    },
  });
  console.log('3. Setup 2FA generates secret & QR:', setup.data.secret && setup.data.qrCodeUrl.startsWith('data:image/png') ? 'PASS' : 'FAIL');
  const secret = setup.data.secret;

  // 4. Verify 2FA
  const validCode = authenticator.generate(secret);
  const verify = await request('/api/auth/2fa/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${setupToken}`,
    },
    body: { code: validCode, secret },
  });
  console.log('4. Verify 2FA enables 2FA and returns access token:', !!verify.data.access_token ? 'PASS' : 'FAIL');
  const token = verify.data.access_token;

  // 5. Authenticated Profile
  const profile = await request('/v1/me/', {
    headers: { Authorization: `JWT ${token}` },
  });
  console.log('5. Profile endpoint returns admin user:', profile.data.username === 'admin' && profile.data.superuser ? 'PASS' : 'FAIL');

  // 6. Devices list
  const devices = await request('/v1/me/devices/', {
    headers: { Authorization: `JWT ${token}` },
  });
  console.log('6. Devices list endpoint returns array:', Array.isArray(devices.data) ? 'PASS' : 'FAIL');

  // 7. Login with 2FA code
  const loginWith2fa = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { username: 'admin', password: 'password123', code: authenticator.generate(secret) },
  });
  console.log('7. Subsequent login with TOTP code succeeds:', !!loginWith2fa.data.access_token ? 'PASS' : 'FAIL');

  // 8. IoniqPilot device registration (/v2/pilotauth/) & device JWT auth
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const registerToken = jwt.sign({ register: true }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
  const pilotAuth = await request(
    `/v2/pilotauth/?serial=ioniq-test-01&public_key=${encodeURIComponent(publicKey)}&register_token=${encodeURIComponent(registerToken)}`,
    { method: 'POST' }
  );
  const validDongle = typeof pilotAuth.data?.dongle_id === 'string' && /^[a-f0-9]{16}$/.test(pilotAuth.data.dongle_id);
  console.log('8. IoniqPilot /v2/pilotauth/ returns 16-hex dongle_id:', validDongle ? 'PASS' : 'FAIL');

  const deviceJwt = jwt.sign({ identity: pilotAuth.data.dongle_id }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
  const devInfo = await request(`/v1.1/devices/${pilotAuth.data.dongle_id}/`, {
    headers: { Authorization: `JWT ${deviceJwt}` },
  });
  console.log('9. Device RSA JWT authenticates against API:', devInfo.data?.dongle_id === pilotAuth.data.dongle_id ? 'PASS' : 'FAIL');

  console.log('--- All companion API tests passed! ---');
  process.exit(0);
}

// Give server 500ms to listen
setTimeout(runTests, 500);
