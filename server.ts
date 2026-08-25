import express from 'express';
import os from 'os';
import path from 'path';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

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

        // Small delay between platform dispatches
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

// REST API Endpoints

app.get('/api/info', async (req, res) => {
  const ip = await getPublicIp();
  const userAgent = req.headers['user-agent'] || '';
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
  const isAndroid = userAgent.toLowerCase().includes('android');
  const isExternal = clientIp !== '127.0.0.1' && clientIp !== 'localhost' && clientIp !== '::1';

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPct = Math.round((usedMem / totalMem) * 100);

  const sysInfo = {
    os: `${os.type()} ${os.release()}`,
    node: process.version,
    python: '3.11 (Engine Node Port)',
    cpu_cores: os.cpus().length,
    public_ip: ip,
    ram: `${memPct}% (${(usedMem / 1024 ** 3).toFixed(1)}GB/${(totalMem / 1024 ** 3).toFixed(1)}GB)`,
  };

  const platformsMeta = ALL_PLATFORMS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
  }));

  res.json({
    system: sysInfo,
    platforms: platformsMeta,
    active: activeTask,
    job_status: currentJob.status,
    job: currentJob,
    client: {
      ip: clientIp,
      is_android: isAndroid,
      is_external: isExternal,
      is_limited: isAndroid || isExternal,
    },
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

  // Send init event
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

// Vite & Static file handling
async function setupServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[+] VALORA-OTP Server running at http://0.0.0.0:${PORT}`);
  });
}

setupServer();
