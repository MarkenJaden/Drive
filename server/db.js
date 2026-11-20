import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

export function getDataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function getUsersFile() {
  return path.join(getDataDir(), 'users.json');
}

function getDevicesFile() {
  return path.join(getDataDir(), 'devices.json');
}

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
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

export function initDb() {
  const dataDir = getDataDir();
  const usersFile = getUsersFile();
  const devicesFile = getDevicesFile();
  ensureDirectoryExists(dataDir);

  let users = readJson(usersFile, []);
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
    writeJson(usersFile, users);
    console.log(`[DB] Created initial administrator account '${adminUsername}'`);
  }

  readJson(devicesFile, []);
}

export function getUsers() {
  return readJson(getUsersFile(), []);
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
  const usersFile = getUsersFile();
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    users[idx] = user;
  } else {
    users.push(user);
  }
  writeJson(usersFile, users);
  return user;
}

export function getDevices(userId = null) {
  const devices = readJson(getDevicesFile(), []);
  if (userId) {
    return devices.filter((d) => d.owner_id === userId || d.is_owner);
  }
  return devices;
}

export function getDevice(dongleId) {
  const devices = readJson(getDevicesFile(), []);
  return devices.find((d) => d.dongle_id === dongleId) || null;
}

export function getDeviceBySerialOrKey(serial, publicKey) {
  const devices = readJson(getDevicesFile(), []);
  return (
    devices.find(
      (d) =>
        (serial && d.serial && d.serial === serial) ||
        (publicKey && d.public_key && d.public_key === publicKey)
    ) || null
  );
}

export function saveDevice(device) {
  const devicesFile = getDevicesFile();
  const devices = readJson(devicesFile, []);
  const idx = devices.findIndex((d) => d.dongle_id === device.dongle_id);
  if (idx >= 0) {
    devices[idx] = { ...devices[idx], ...device };
  } else {
    devices.push(device);
  }
  writeJson(devicesFile, devices);
  return device;
}

export function deleteDevice(dongleId) {
  const devicesFile = getDevicesFile();
  let devices = readJson(devicesFile, []);
  devices = devices.filter((d) => d.dongle_id !== dongleId);
  writeJson(devicesFile, devices);
}
