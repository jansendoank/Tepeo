import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LicenseKey, UserRole, TelegramConfig } from '../types/auth';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const KEYS_FILE = path.join(DATA_DIR, 'license_keys.json');
const TELEGRAM_FILE = path.join(DATA_DIR, 'telegram_config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Master Admin Key Default
export const MASTER_ADMIN_KEY = 'SPAMMER-ADMIN-MASTER-VIP';

function loadKeys(): LicenseKey[] {
  try {
    if (!fs.existsSync(KEYS_FILE)) {
      const defaultKeys: LicenseKey[] = [
        {
          key: MASTER_ADMIN_KEY,
          role: 'admin',
          createdBy: 'system',
          createdAt: Date.now(),
          expiresAt: null, // Lifetime
          durationDays: -1,
          isBanned: false,
          note: 'Master Admin Owner Key',
        },
      ];
      fs.writeFileSync(KEYS_FILE, JSON.stringify(defaultKeys, null, 2), 'utf8');
      return defaultKeys;
    }
    const raw = fs.readFileSync(KEYS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    // Ensure master key always exists
    if (!parsed.some((k) => k.key === MASTER_ADMIN_KEY)) {
      parsed.unshift({
        key: MASTER_ADMIN_KEY,
        role: 'admin',
        createdBy: 'system',
        createdAt: Date.now(),
        expiresAt: null,
        durationDays: -1,
        isBanned: false,
        note: 'Master Admin Owner Key',
      });
      fs.writeFileSync(KEYS_FILE, JSON.stringify(parsed, null, 2), 'utf8');
    }
    return parsed;
  } catch (err) {
    console.error('[!] Error reading keys file:', err);
    return [];
  }
}

function saveKeys(keys: LicenseKey[]) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8');
  } catch (err) {
    console.error('[!] Error saving keys:', err);
  }
}

export function loadTelegramConfig(): TelegramConfig {
  try {
    if (!fs.existsSync(TELEGRAM_FILE)) {
      const def: TelegramConfig = { botToken: '', adminChatId: '', enabled: false };
      fs.writeFileSync(TELEGRAM_FILE, JSON.stringify(def, null, 2), 'utf8');
      return def;
    }
    const raw = fs.readFileSync(TELEGRAM_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { botToken: '', adminChatId: '', enabled: false };
  }
}

export function saveTelegramConfig(config: TelegramConfig) {
  try {
    fs.writeFileSync(TELEGRAM_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[!] Error saving telegram config:', err);
  }
}

export function generateRandomKey(prefix: string = 'SPAMMER'): string {
  const seg1 = Math.random().toString(36).substring(2, 6).toUpperCase();
  const seg2 = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${seg1}-${seg2}`;
}

export function createLicenseKey(
  creatorRole: UserRole,
  creatorKey: string,
  targetRole: UserRole,
  durationHoursOrDays: number, // e.g. 1 (hour), 1 (day), 7 (days), 30 (days), -1 (lifetime)
  isHours: boolean = false,
  note?: string
): { success: boolean; key?: LicenseKey; message?: string } {
  // Check permission hierarchy
  if (creatorRole === 'reseller' && targetRole !== 'user') {
    return { success: false, message: 'Reseller hanya boleh membuat key untuk level User!' };
  }
  if (creatorRole === 'partner' && !['user', 'reseller'].includes(targetRole)) {
    return { success: false, message: 'Partner hanya boleh membuat key untuk User dan Reseller!' };
  }
  if (creatorRole === 'user') {
    return { success: false, message: 'User biasa tidak diizinkan membuat key!' };
  }

  const keys = loadKeys();
  const prefix = targetRole.toUpperCase();
  const newKeyCode = generateRandomKey(`SPAMMER-${prefix}`);

  const now = Date.now();
  let expiresAt: number | null = null;

  if (durationHoursOrDays === -1) {
    expiresAt = null; // Lifetime
  } else if (isHours) {
    expiresAt = now + durationHoursOrDays * 60 * 60 * 1000;
  } else {
    expiresAt = now + durationHoursOrDays * 24 * 60 * 60 * 1000;
  }

  const newKey: LicenseKey = {
    key: newKeyCode,
    role: targetRole,
    createdBy: creatorKey,
    createdAt: now,
    expiresAt,
    durationDays: isHours ? 0 : durationHoursOrDays,
    isBanned: false,
    note: note || `Dibuat oleh ${creatorRole.toUpperCase()}`,
  };

  keys.push(newKey);
  saveKeys(keys);

  return { success: true, key: newKey };
}

export function verifyAndLogin(keyCode: string, clientIp: string): { success: boolean; keyData?: LicenseKey; message?: string } {
  const keys = loadKeys();
  const cleanCode = keyCode.trim().toUpperCase();
  const found = keys.find((k) => k.key.toUpperCase() === cleanCode);

  if (!found) {
    return { success: false, message: 'License key tidak ditemukan di sistem!' };
  }

  if (found.isBanned) {
    return { success: false, message: 'License key ini telah di-BANNED oleh admin.' };
  }

  const now = Date.now();
  if (found.expiresAt !== null && now > found.expiresAt) {
    return { success: false, message: 'Masa aktif license key telah habis (EXPIRED).' };
  }

  // Device / IP lock check (except master admin key)
  if (found.key !== MASTER_ADMIN_KEY) {
    if (!found.boundIp) {
      // First login: bind to this IP
      found.boundIp = clientIp;
    } else if (found.boundIp !== clientIp && clientIp !== '127.0.0.1') {
      // Different IP
      return {
        success: false,
        message: `Key terikat pada perangkat lain (IP: ${found.boundIp}). Hubungi penjual untuk reset device.`,
      };
    }
  }

  found.lastUsedAt = now;
  saveKeys(keys);

  return { success: true, keyData: found };
}

export function getAllKeysForRole(userRole: UserRole, userKey: string): LicenseKey[] {
  const keys = loadKeys();
  if (userRole === 'admin') {
    return keys;
  }
  if (userRole === 'partner') {
    return keys.filter((k) => k.createdBy === userKey || k.key === userKey);
  }
  if (userRole === 'reseller') {
    return keys.filter((k) => k.createdBy === userKey || k.key === userKey);
  }
  return [];
}

export function updateKeyStatus(
  adminRole: UserRole,
  adminKey: string,
  targetKey: string,
  action: 'ban' | 'unban' | 'reset_ip' | 'delete' | 'extend',
  extendDays?: number
): { success: boolean; message: string } {
  const keys = loadKeys();
  const idx = keys.findIndex((k) => k.key.toUpperCase() === targetKey.toUpperCase());

  if (idx === -1) {
    return { success: false, message: 'Key tidak ditemukan.' };
  }

  const target = keys[idx];

  // Permissions check
  if (adminRole === 'reseller' && target.createdBy !== adminKey) {
    return { success: false, message: 'Reseller hanya dapat mengelola key yang dibuatnya sendiri.' };
  }
  if (adminRole === 'partner' && target.createdBy !== adminKey && adminKey !== target.key) {
    return { success: false, message: 'Partner hanya dapat mengelola key di bawah jaringannya.' };
  }
  if (target.key === MASTER_ADMIN_KEY && action === 'delete') {
    return { success: false, message: 'Master Admin Key tidak boleh dihapus!' };
  }

  if (action === 'ban') {
    target.isBanned = true;
  } else if (action === 'unban') {
    target.isBanned = false;
  } else if (action === 'reset_ip') {
    delete target.boundIp;
    delete target.boundDevice;
  } else if (action === 'delete') {
    keys.splice(idx, 1);
  } else if (action === 'extend' && extendDays) {
    const baseTime = target.expiresAt && target.expiresAt > Date.now() ? target.expiresAt : Date.now();
    target.expiresAt = baseTime + extendDays * 24 * 60 * 60 * 1000;
  }

  saveKeys(keys);
  return { success: true, message: `Aksi ${action} berhasil diterapkan.` };
}
