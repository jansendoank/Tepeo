import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  ALL_PLATFORMS,
  evaluateVerdict,
  fmtplus,
  getPublicIp,
  JobState,
  LogEntry,
  normalizePhone,
} from './src/server/otpEngine.ts';
import {
  createLicenseKey,
  getAllKeysForRole,
  loadTelegramConfig,
  MASTER_ADMIN_KEY,
  saveTelegramConfig,
  updateKeyStatus,
  verifyAndLogin,
} from './src/server/licenseStore.ts';
import {
  getProxyConfig,
  getNextProxyUrl,
  setProxyConfig,
  testProxyLatency,
  ProxyConfig,
} from './src/server/proxyEngine.ts';
import { AuthSession, UserRole } from './src/types/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.SERVER_PORT) || Number(process.env.PORT) || 3000;

app.use(express.json());

// In-memory active tokens
const activeSessions: Map<string, AuthSession> = new Map();

function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

// Authentication Middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Masukkan token login.' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);

  if (!session) {
    return res.status(401).json({ success: false, message: 'Sesi login tidak valid atau kadaluarsa.' });
  }

  if (session.expiresAt && Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ success: false, message: 'Masa aktif license key telah habis.' });
  }

  (req as any).userSession = session;
  next();
}

// -------------------------------------------------------------
// MULTI-TASKING & PER-KEY SESSION ARCHITECTURE
// -------------------------------------------------------------

interface UserTaskState {
  active: boolean;
  stopRequested: boolean;
  job: JobState;
}

const userTasks: Map<string, UserTaskState> = new Map();
const sseClients: Map<string, express.Response[]> = new Map();

function getUserTask(sessionKey: string): UserTaskState {
  if (!userTasks.has(sessionKey)) {
    userTasks.set(sessionKey, {
      active: false,
      stopRequested: false,
      job: {
        status: 'idle',
        phone: '',
        phone_fmt: '',
        targets: [],
        currentTargetIndex: 0,
        totalTargets: 0,
        mode: 'single',
        delay: 60,
        selected_platforms: ALL_PLATFORMS.map((p) => p.id),
        current_round: 0,
        stats: {
          total: 0,
          success: 0,
          limit: 0,
          fail: 0,
        },
        logs: [],
      },
    });
  }
  return userTasks.get(sessionKey)!;
}

function broadcastToUser(sessionKey: string, data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  const clients = sseClients.get(sessionKey) || [];
  for (let i = clients.length - 1; i >= 0; i--) {
    const res = clients[i];
    try {
      res.write(payload);
    } catch {
      clients.splice(i, 1);
    }
  }
}

// Worker supporting Multi-Target Queues + Multi-Session
async function runWorkerForUser(
  sessionKey: string,
  phones: string[],
  mode: 'single' | 'loop' | 'pick',
  delay: number,
  chosenIds: number[]
) {
  const userState = getUserTask(sessionKey);
  userState.active = true;
  userState.stopRequested = false;

  const currentJob = userState.job;
  currentJob.status = 'running';
  currentJob.targets = phones;
  currentJob.totalTargets = phones.length;
  currentJob.currentTargetIndex = 1;
  currentJob.phone = phones[0] || '';
  currentJob.phone_fmt = fmtplus(phones[0] || '');
  currentJob.mode = mode;
  currentJob.delay = delay;
  currentJob.selected_platforms = chosenIds;
  currentJob.current_round = 0;
  currentJob.stats = { total: 0, success: 0, limit: 0, fail: 0 };
  currentJob.logs = [];

  const proxyConfig = getProxyConfig();

  broadcastToUser(sessionKey, {
    type: 'job_start',
    job: {
      phone_fmt: fmtplus(phones[0] || ''),
      targets: phones,
      total_targets: phones.length,
      mode,
      delay,
      total_platforms: chosenIds.length,
      proxy_enabled: proxyConfig.enabled,
    },
  });

  try {
    for (let tIdx = 0; tIdx < phones.length; tIdx++) {
      if (userState.stopRequested) break;

      const targetPhone = phones[tIdx];
      currentJob.currentTargetIndex = tIdx + 1;
      currentJob.phone = targetPhone;
      currentJob.phone_fmt = fmtplus(targetPhone);

      // Log target change if multiple targets
      if (phones.length > 1) {
        const queueEntry: LogEntry = {
          id: Math.random().toString(36).substring(2, 9),
          round: currentJob.current_round,
          platform_id: 0,
          platform_name: 'TARGET QUEUE',
          status: 'INFO',
          detail: `[Target ${tIdx + 1}/${phones.length}] Memproses antrian: ${fmtplus(targetPhone)}`,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          target: fmtplus(targetPhone),
        };
        currentJob.logs.push(queueEntry);
        broadcastToUser(sessionKey, {
          type: 'target_change',
          currentIndex: tIdx + 1,
          totalTargets: phones.length,
          phone: fmtplus(targetPhone),
          entry: queueEntry,
        });
      }

      let roundNo = 0;

      while (!userState.stopRequested) {
        roundNo += 1;
        currentJob.current_round = roundNo;

        const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        broadcastToUser(sessionKey, {
          type: 'round_start',
          round: roundNo,
          target: fmtplus(targetPhone),
          timestamp: nowStr,
        });

        let roundSuccess = 0;

        for (const idx of chosenIds) {
          if (userState.stopRequested) break;

          const platform = ALL_PLATFORMS.find((p) => p.id === idx);
          if (!platform) continue;

          let result;
          try {
            result = await platform.handler(targetPhone);
          } catch (err: any) {
            result = { status: 0, text: err?.message || 'Error' };
          }

          const { status: verdictStatus, detail } = evaluateVerdict(result.status, result.text);

          currentJob.stats.total += 1;
          if (verdictStatus === 'SUCCESS') {
            currentJob.stats.success += 1;
            roundSuccess += 1;
          } else if (verdictStatus === 'LIMIT') {
            currentJob.stats.limit += 1;
          } else {
            currentJob.stats.fail += 1;
          }

          const logEntry: LogEntry = {
            id: Math.random().toString(36).substring(2, 9),
            round: roundNo,
            platform_id: idx,
            platform_name: platform.name,
            status: verdictStatus,
            detail,
            timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            target: fmtplus(targetPhone),
          };

          currentJob.logs.push(logEntry);
          if (currentJob.logs.length > 500) {
            currentJob.logs.shift();
          }

          broadcastToUser(sessionKey, {
            type: 'log',
            entry: logEntry,
            stats: currentJob.stats,
          });

          await new Promise((r) => setTimeout(r, 600));
        }

        broadcastToUser(sessionKey, {
          type: 'round_complete',
          round: roundNo,
          round_success: roundSuccess,
          stats: currentJob.stats,
        });

        if (mode !== 'loop' || userState.stopRequested) {
          break;
        }

        // Countdown loop between rounds
        for (let elapsed = 0; elapsed < delay; elapsed++) {
          if (userState.stopRequested) break;
          broadcastToUser(sessionKey, {
            type: 'countdown',
            remaining: delay - elapsed,
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  } catch (err: any) {
    broadcastToUser(sessionKey, {
      type: 'error',
      message: err?.message || 'Unexpected worker error',
    });
  } finally {
    userState.active = false;
    currentJob.status = userState.stopRequested ? 'stopped' : 'completed';
    broadcastToUser(sessionKey, {
      type: 'job_complete',
      status: currentJob.status,
      stats: currentJob.stats,
    });
  }
}

// -------------------------------------------------------------
// AUTH & LICENSE KEY API ENDPOINTS
// -------------------------------------------------------------

// 1. Login with License Key
app.post('/api/auth/login', (req, res) => {
  const { key = '' } = req.body || {};
  if (!key.trim()) {
    return res.status(400).json({ success: false, message: 'Masukkan License Key!' });
  }

  const clientIp = getClientIp(req);
  const result = verifyAndLogin(key, clientIp);

  if (!result.success || !result.keyData) {
    return res.status(401).json({ success: false, message: result.message || 'Key tidak valid.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const session: AuthSession = {
    token,
    key: result.keyData.key,
    role: result.keyData.role,
    expiresAt: result.keyData.expiresAt,
    createdAt: Date.now(),
    clientIp,
  };

  activeSessions.set(token, session);

  res.json({
    success: true,
    message: `Login berhasil sebagai ${session.role.toUpperCase()}`,
    session,
  });
});

// 2. Verify Token (Heartbeat check for auto-kick)
app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ valid: false, message: 'No token' });
  }

  const token = authHeader.split(' ')[1];
  const session = activeSessions.get(token);

  if (!session) {
    return res.json({ valid: false, message: 'Sesi tidak ditemukan.' });
  }

  const clientIp = getClientIp(req);
  const check = verifyAndLogin(session.key, clientIp);

  if (!check.success) {
    activeSessions.delete(token);
    return res.json({ valid: false, message: check.message });
  }

  res.json({ valid: true, session });
});

// 3. Logout
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

// 4. Get Keys for Current User's Role
app.get('/api/auth/keys', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  const keys = getAllKeysForRole(session.role, session.key);
  res.json({ success: true, keys });
});

// 5. Generate Key
app.post('/api/auth/keys/generate', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  const { role = 'user', duration = 7, unit = 'day', note = '' } = req.body || {};

  const result = createLicenseKey(
    session.role,
    session.key,
    role as UserRole,
    Number(duration),
    unit,
    String(note)
  );

  if (!result.success) {
    return res.status(403).json(result);
  }

  res.json(result);
});

// 6. Action on Key (extend, ban, reset_ip, unban)
app.post('/api/auth/keys/action', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  const { targetKey, action, extendDays = 7 } = req.body || {};

  if (!targetKey || !action) {
    return res.status(400).json({ success: false, message: 'Parameter tidak lengkap.' });
  }

  const result = updateKeyStatus(
    session.role,
    session.key,
    String(targetKey),
    action,
    Number(extendDays)
  );

  if (!result.success) {
    return res.status(403).json(result);
  }

  res.json(result);
});

// 7. Telegram Bot Config
app.get('/api/auth/telegram/config', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  if (session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses terbatas untuk Admin.' });
  }
  const config = loadTelegramConfig();
  res.json({ success: true, config });
});

app.post('/api/auth/telegram/config', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  if (session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses terbatas untuk Admin.' });
  }

  const { botToken = '', adminChatId = '', enabled = false } = req.body || {};
  saveTelegramConfig({
    botToken: String(botToken).trim(),
    adminChatId: String(adminChatId).trim(),
    enabled: Boolean(enabled),
  });

  restartTelegramPolling();

  res.json({ success: true, message: 'Konfigurasi Bot Telegram tersimpan!' });
});

// -------------------------------------------------------------
// PROXY ROTATOR API ENDPOINTS (NOMOR 5)
// -------------------------------------------------------------

app.get('/api/proxy/config', requireAuth, (req, res) => {
  const config = getProxyConfig();
  res.json({ success: true, config });
});

app.post('/api/proxy/config', requireAuth, (req, res) => {
  const { enabled, mode, customProxies } = req.body || {};
  const updated = setProxyConfig({
    ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(customProxies !== undefined && Array.isArray(customProxies) ? { customProxies } : {}),
  });

  res.json({ success: true, message: 'Konfigurasi Proxy Rotator diperbarui', config: updated });
});

app.post('/api/proxy/test', requireAuth, async (req, res) => {
  const { proxyUrl } = req.body || {};
  if (!proxyUrl) {
    return res.status(400).json({ success: false, message: 'Masukkan URL Proxy (http://ip:port)' });
  }
  const result = await testProxyLatency(proxyUrl);
  res.json(result);
});

// -------------------------------------------------------------
// TELEGRAM BOT POLLING WORKER
// -------------------------------------------------------------

let telegramPollingInterval: any = null;
let lastUpdateId = 0;

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch {
    // ignore
  }
}

async function pollTelegramBot() {
  const config = loadTelegramConfig();
  if (!config.enabled || !config.botToken) return;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=3`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return;

    const data = (await res.json()) as any;
    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        if (config.adminChatId && chatId !== config.adminChatId) {
          await sendTelegramMessage(config.botToken, chatId, '⛔ <b>Akses Ditolak:</b> Akun Anda bukan Admin terdaftar.');
          continue;
        }

        await handleTelegramCommand(config.botToken, chatId, msg.text.trim());
      }
    }
  } catch {
    // timeout
  }
}

async function handleTelegramCommand(token: string, chatId: string, text: string) {
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    const reply = `👑 <b>SPAMMER PRO VIP - BOT ADMIN</b>\n\n` +
      `Gunakan perintah berikut untuk mengelola key:\n\n` +
      `• <code>/genkey [role] [durasi] [note]</code>\n` +
      `  <i>Contoh Durasi Menit & Jam:</i>\n` +
      `  - <code>/genkey user 30m PembeliTest</code> (30 Menit)\n` +
      `  - <code>/genkey user 1h Pembeli1Jam</code> (1 Jam)\n` +
      `  - <code>/genkey user 2h</code> (2 Jam)\n` +
      `  - <code>/genkey user 7d</code> / <code>/genkey user 7</code> (7 Hari)\n` +
      `  - <code>/genkey user 30d</code> / <code>/genkey user 1m</code> (1 Bulan)\n` +
      `  - <code>/genkey user -1</code> (Lifetime)\n\n` +
      `• <code>/cekkey [key]</code> - Cek masa aktif\n` +
      `• <code>/extend [key] [durasi]</code> - Tambah durasi (contoh: <code>/extend SPAMMER-XXX 1h</code> atau <code>7d</code>)\n` +
      `• <code>/resetkey [key]</code> - Reset IP/Device lock\n` +
      `• <code>/bankey [key]</code> - Blokir key`;
    await sendTelegramMessage(token, chatId, reply);
    return;
  }

  if (cmd === '/genkey') {
    const role = (parts[1] || 'user').toLowerCase() as UserRole;
    const rawDur = (parts[2] || '7').toLowerCase();
    const note = parts.slice(3).join(' ') || 'Via Bot Telegram';

    let durationValue = 7;
    let unit: 'minute' | 'hour' | 'day' | 'month' | 'lifetime' = 'day';
    let labelDurasi = '';

    if (rawDur.endsWith('m') && !rawDur.endsWith('mo') && !rawDur.includes('month')) {
      // e.g. 30m, 15m
      durationValue = parseInt(rawDur.replace('m', '')) || 30;
      unit = 'minute';
      labelDurasi = `${durationValue} Menit`;
    } else if (rawDur.endsWith('h') || rawDur.endsWith('jam')) {
      // e.g. 1h, 2h, 1jam
      durationValue = parseInt(rawDur.replace(/h|jam/g, '')) || 1;
      unit = 'hour';
      labelDurasi = `${durationValue} Jam`;
    } else if (rawDur.endsWith('mo') || rawDur.endsWith('bln') || rawDur.endsWith('bulan')) {
      // e.g. 1mo, 1bulan
      durationValue = parseInt(rawDur.replace(/mo|bln|bulan/g, '')) || 1;
      unit = 'month';
      labelDurasi = `${durationValue} Bulan`;
    } else if (rawDur === '-1' || rawDur === 'lifetime' || rawDur === 'perm') {
      durationValue = -1;
      unit = 'lifetime';
      labelDurasi = 'Lifetime (Permanen)';
    } else {
      // e.g. 7, 7d, 7hari
      durationValue = parseInt(rawDur.replace(/d|hari/g, '')) || 7;
      unit = 'day';
      labelDurasi = `${durationValue} Hari`;
    }

    const result = createLicenseKey('admin', 'TELEGRAM_BOT', role, durationValue, unit, note);
    if (result.success && result.key) {
      const expStr = result.key.expiresAt ? new Date(result.key.expiresAt).toLocaleString('id-ID') : 'Lifetime (Permanen)';
      const reply = `✅ <b>KEY BERHASIL DIBUAT!</b>\n\n` +
        `🔑 <b>Key:</b> <code>${result.key.key}</code>\n` +
        `👤 <b>Role:</b> <code>${result.key.role.toUpperCase()}</code>\n` +
        `⏳ <b>Masa Aktif:</b> ${labelDurasi}\n` +
        `📅 <b>Kedaluwarsa:</b> ${expStr}\n` +
        `📝 <b>Catatan:</b> ${result.key.note}\n\n` +
        `<i>Format Login: Masukkan key di halaman web spammer</i>`;
      await sendTelegramMessage(token, chatId, reply);
    } else {
      await sendTelegramMessage(token, chatId, `❌ Gagal: ${result.message}`);
    }
    return;
  }

  if (cmd === '/cekkey') {
    const targetKey = parts[1];
    if (!targetKey) {
      await sendTelegramMessage(token, chatId, '⚠️ Masukkan key! Format: <code>/cekkey SPAMMER-XXX</code>');
      return;
    }
    const check = verifyAndLogin(targetKey, '127.0.0.1');
    if (check.keyData) {
      const k = check.keyData;
      const exp = k.expiresAt ? new Date(k.expiresAt).toLocaleString('id-ID') : 'Lifetime';
      const reply = `🔍 <b>INFO LICENSE KEY:</b>\n\n` +
        `🔑 <b>Key:</b> <code>${k.key}</code>\n` +
        `👤 <b>Role:</b> <code>${k.role.toUpperCase()}</code>\n` +
        `📊 <b>Status:</b> ${k.isBanned ? '❌ BANNED' : '✅ AKTIF'}\n` +
        `⏳ <b>Expires:</b> ${exp}\n` +
        `📱 <b>Bound IP:</b> ${k.boundIp || 'Belum Login'}\n` +
        `📝 <b>Note:</b> ${k.note || '-'}`;
      await sendTelegramMessage(token, chatId, reply);
    } else {
      await sendTelegramMessage(token, chatId, `❌ Key tidak ditemukan / ${check.message}`);
    }
    return;
  }

  if (cmd === '/extend') {
    const targetKey = parts[1];
    const days = Number(parts[2]) || 7;
    const res = updateKeyStatus('admin', 'TELEGRAM_BOT', targetKey, 'extend', days);
    await sendTelegramMessage(token, chatId, res.success ? `✅ Key ${targetKey} diperpanjang +${days} hari.` : `❌ ${res.message}`);
    return;
  }

  if (cmd === '/resetkey') {
    const targetKey = parts[1];
    const res = updateKeyStatus('admin', 'TELEGRAM_BOT', targetKey, 'reset_ip');
    await sendTelegramMessage(token, chatId, res.success ? `✅ Device lock untuk key ${targetKey} berhasil di-reset.` : `❌ ${res.message}`);
    return;
  }

  if (cmd === '/bankey') {
    const targetKey = parts[1];
    const res = updateKeyStatus('admin', 'TELEGRAM_BOT', targetKey, 'ban');
    await sendTelegramMessage(token, chatId, res.success ? `🚫 Key ${targetKey} berhasil di-BANNED.` : `❌ ${res.message}`);
    return;
  }
}

function restartTelegramPolling() {
  if (telegramPollingInterval) {
    clearInterval(telegramPollingInterval);
    telegramPollingInterval = null;
  }
  const config = loadTelegramConfig();
  if (config.enabled && config.botToken) {
    telegramPollingInterval = setInterval(pollTelegramBot, 3500);
  }
}

// -------------------------------------------------------------
// OTP ENGINE REST APIS (MULTI-SESSION + MULTI-TARGET)
// -------------------------------------------------------------

app.get('/api/info', async (req, res) => {
  const authHeader = req.headers.authorization;
  let sessionKey = 'default';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const sess = activeSessions.get(token);
    if (sess) sessionKey = sess.key;
  }

  const userState = getUserTask(sessionKey);
  const platformsMeta = ALL_PLATFORMS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
  }));

  const proxyConfig = getProxyConfig();

  return res.json({
    platforms: platformsMeta,
    active: userState.active,
    job_status: userState.job.status,
    job: userState.job,
    proxy_config: proxyConfig,
  });
});

app.post('/api/spam/start', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  const userState = getUserTask(session.key);

  if (userState.active) {
    return res.status(400).json({ success: false, message: 'Proses Anda masih berjalan!' });
  }

  const { phone = '', phones = [], mode = 'single', delay = 60, platforms = [] } = req.body || {};

  // Support both single phone string and multiple phones array
  const rawList: string[] = [];
  if (Array.isArray(phones) && phones.length > 0) {
    rawList.push(...phones);
  } else if (typeof phone === 'string' && phone.trim()) {
    // Parse line breaks or commas
    const split = phone.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    rawList.push(...split);
  }

  const normalizedList = rawList.map(normalizePhone).filter((p) => p.length >= 10 && p.length <= 15);

  if (normalizedList.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Format nomor telepon tidak valid. Masukkan nomor (08xx / 62xx).',
    });
  }

  const validDelay = Math.max(5, Number(delay) || 60);

  let chosenIds: number[] = [];
  if (Array.isArray(platforms) && platforms.length > 0) {
    chosenIds = platforms.map(Number).filter((id) => ALL_PLATFORMS.some((p) => p.id === id));
  }
  if (chosenIds.length === 0) {
    chosenIds = ALL_PLATFORMS.map((p) => p.id);
  }

  runWorkerForUser(session.key, normalizedList, mode as any, validDelay, chosenIds);

  res.json({
    success: true,
    message: `Proses dimulai ke ${normalizedList.length} target nomor.`,
    targets: normalizedList.map(fmtplus),
    mode,
    platforms_count: chosenIds.length,
  });
});

app.post('/api/spam/stop', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  const userState = getUserTask(session.key);

  if (!userState.active) {
    return res.status(400).json({ success: false, message: 'Tidak ada proses aktif pada akun Anda.' });
  }
  userState.stopRequested = true;
  res.json({ success: true, message: 'Sinyal pemberhentian proses Anda telah dikirim!' });
});

app.get('/api/spam/stream', (req, res) => {
  const tokenQuery = (req.query.token as string) || '';
  let sessionKey = 'default';
  if (tokenQuery) {
    const sess = activeSessions.get(tokenQuery);
    if (sess) sessionKey = sess.key;
  } else {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const sess = activeSessions.get(token);
      if (sess) sessionKey = sess.key;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const userState = getUserTask(sessionKey);
  const initPayload = JSON.stringify({
    type: 'init',
    job: userState.job,
    active: userState.active,
    proxy: getProxyConfig(),
  });
  res.write(`data: ${initPayload}\n\n`);

  if (!sseClients.has(sessionKey)) {
    sseClients.set(sessionKey, []);
  }
  const clientList = sseClients.get(sessionKey)!;
  clientList.push(res);

  req.on('close', () => {
    const list = sseClients.get(sessionKey);
    if (!list) return;
    const idx = list.indexOf(res);
    if (idx !== -1) {
      list.splice(idx, 1);
    }
  });
});

// Vite middleware & Production static serving
async function setupServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  restartTelegramPolling();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] SPAMMER PRO VIP Server running at http://0.0.0.0:${PORT}`);
  });
}

setupServer();
