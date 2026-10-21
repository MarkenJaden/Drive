import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJson(filePath, data) {
  ensureDirectoryExists(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function initDb() {
  ensureDirectoryExists(DATA_DIR);

  let users = readJson(USERS_FILE, []);
  const adminUsername = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const adminEmail = process.env.ADMIN_EMAIL || `${adminUsername}@markenjaden.de`;

  let adminUser = users.find((u) => u.username.toLowerCase() === adminUsername.toLowerCase());
  if (!adminUser) {
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(adminPassword, salt);
    adminUser = {
      id: 'admin-1',
      username: adminUsername,
      email: adminEmail,
      passwordHash,
      superuser: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      createdAt: new Date().toISOString(),
    };
    users.push(adminUser);
    writeJson(USERS_FILE, users);
    console.log(`[DB] Created initial administrator account '${adminUsername}'`);
  }

  readJson(DEVICES_FILE, []);
}

export function getUsers() {
  return readJson(USERS_FILE, []);
}

export function getUserById(id) {
  const users = getUsers();
  return users.find((u) => u.id === id) || null;
}

export function getUserByUsername(username) {
  const users = getUsers();
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase() || u.email?.toLowerCase() === username.toLowerCase()) || null;
}

export function saveUser(user) {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  writeJson(USERS_FILE, users);
  return user;
}

export function getDevices(userId = null) {
  const devices = readJson(DEVICES_FILE, []);
  if (userId) {
    return devices.filter((d) => d.owner_id === userId || d.is_owner);
  }
  return devices;
}

export function getDevice(dongleId) {
  const devices = readJson(DEVICES_FILE, []);
  return devices.find((d) => d.dongle_id === dongleId) || null;
}

export function saveDevice(device) {
  const devices = readJson(DEVICES_FILE, []);
  const idx = devices.findIndex((d) => d.dongle_id === device.dongle_id);
  if (idx >= 0) {
    devices[idx] = { ...devices[idx], ...device };
  } else {
    devices.push(device);
  }
  writeJson(DEVICES_FILE, devices);
  return device;
}

export function deleteDevice(dongleId) {
  let devices = readJson(DEVICES_FILE, []);
  devices = devices.filter((d) => d.dongle_id !== dongleId);
  writeJson(DEVICES_FILE, devices);
}
