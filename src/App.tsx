import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Cpu,
  Globe,
  HelpCircle,
  Info,
  Layers,
  PauseCircle,
  Play,
  Radio,
  RefreshCw,
  Server,
  ShieldAlert,
  Sliders,
  Smartphone,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  Zap,
} from 'lucide-react';

interface PlatformItem {
  id: number;
  name: string;
  category?: string;
}

interface LogEntry {
  id: string;
  round: number;
  platform_id: number;
  platform_name: string;
  status: 'SUCCESS' | 'LIMIT' | 'FAIL' | 'TIMEOUT' | 'INFO';
  detail: string;
  timestamp: string;
}

interface Stats {
  total: number;
  success: number;
  limit: number;
  fail: number;
}

interface SystemInfo {
  os: string;
  node: string;
  python: string;
  cpu_cores: number;
  public_ip: string;
  ram: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    os: 'Linux x86_64',
    node: 'v22.x',
    python: '3.11 Port',
    cpu_cores: 4,
    public_ip: 'Memuat...',
    ram: 'Normal',
  });

  const [platforms, setPlatforms] = useState<PlatformItem[]>([
    { id: 1, name: 'Internet Rakyat', category: 'ISP' },
    { id: 2, name: 'HRS-BRE Career', category: 'Job Portal' },
    { id: 3, name: 'BonusBelanja', category: 'E-Commerce' },
    { id: 4, name: 'Matahari Store', category: 'Retail' },
    { id: 5, name: 'TuneUp ID', category: 'Automotive' },
    { id: 6, name: 'Rumah123', category: 'Property' },
    { id: 7, name: 'Paper.id', category: 'Fintech' },
    { id: 8, name: 'DuniaGames', category: 'Gaming' },
  ]);

  const [selectedPlatforms, setSelectedPlatforms] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mode, setMode] = useState<'single' | 'loop' | 'pick'>('single');
  const [delay, setDelay] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showVercelGuide, setShowVercelGuide] = useState(false);

  const [stats, setStats] = useState<Stats>({
    total: 0,
    success: 0,
    limit: 0,
    fail: 0,
  });

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      round: 0,
      platform_id: 0,
      platform_name: 'SYSTEM',
      status: 'INFO',
      detail: 'Valora OTP Console siap. Konfigurasi target lalu tekan "Jalankan Proses".',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    },
  ]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [liveTime, setLiveTime] = useState('');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Normalization logic
  const normalizedPhone = (() => {
    const val = phoneNumber.trim().replace(/\s+|-/g, '').replace(/^\+/, '');
    if (!val) return '';
    if (val.startsWith('08')) return '62' + val.substring(1);
    if (val.startsWith('8')) return '62' + val;
    if (val.startsWith('62')) return val;
    return '';
  })();

  const isValidPhone = normalizedPhone.length >= 10 && normalizedPhone.length <= 15;

  // Live clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLiveTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial system info
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch('/api/info');
        if (res.ok) {
          const data = await res.json();
          if (data.system) {
            setSystemInfo(data.system);
          }
          if (data.platforms && data.platforms.length > 0) {
            setPlatforms(data.platforms);
          }
          if (data.active) {
            setIsRunning(true);
            if (data.job) {
              setStats(data.job.stats || stats);
              setCurrentRound(data.job.current_round || 1);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch info:', err);
      }
    };
    fetchInfo();
  }, []);

  // SSE streaming listener
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const setupSSE = () => {
      eventSource = new EventSource('/api/spam/stream');

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'init') {
            if (payload.active) {
              setIsRunning(true);
              if (payload.job?.stats) setStats(payload.job.stats);
              if (payload.job?.current_round) setCurrentRound(payload.job.current_round);
            }
          } else if (payload.type === 'job_start') {
            setIsRunning(true);
            setCountdown(null);
            showToast(`Proses dimulai ke ${payload.job?.phone_fmt}`, 'info');
          } else if (payload.type === 'round_start') {
            setCurrentRound(payload.round);
            setCountdown(null);
          } else if (payload.type === 'log') {
            setLogs((prev) => [...prev.slice(-400), payload.entry]);
            if (payload.stats) setStats(payload.stats);
          } else if (payload.type === 'round_complete') {
            if (payload.stats) setStats(payload.stats);
          } else if (payload.type === 'countdown') {
            setCountdown(payload.remaining);
          } else if (payload.type === 'job_complete') {
            setIsRunning(false);
            setCountdown(null);
            if (payload.stats) setStats(payload.stats);
            showToast(`Proses selesai (${payload.status})`, 'success');
          } else if (payload.type === 'error') {
            showToast(`Error: ${payload.message}`, 'error');
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err);
        }
      };

      eventSource.onerror = () => {
        // SSE disconnected, will auto-reconnect
      };
    };

    setupSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleStart = async () => {
    if (!phoneNumber) {
      showToast('Masukkan nomor telepon target!', 'error');
      return;
    }

    if (!isValidPhone) {
      showToast('Format nomor belum valid. Gunakan 08xx / 62xx / +62xx', 'error');
      return;
    }

    if (selectedPlatforms.length === 0) {
      showToast('Pilih minimal 1 platform OTP!', 'error');
      return;
    }

    try {
      const res = await fetch('/api/spam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneNumber,
          mode,
          delay,
          platforms: selectedPlatforms,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsRunning(true);
        showToast(data.message, 'success');
      } else {
        showToast(data.message || 'Gagal memulai proses', 'error');
      }
    } catch {
      showToast('Gagal menghubungi server', 'error');
    }
  };

  const handleStop = async () => {
    try {
      const res = await fetch('/api/spam/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'info');
      } else {
        showToast(data.message || 'Gagal menghentikan', 'error');
      }
    } catch {
      showToast('Gagal mengirim sinyal stop', 'error');
    }
  };

  const togglePlatform = (id: number) => {
    setSelectedPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const selectAllPlatforms = (all: boolean) => {
    if (all) {
      setSelectedPlatforms(platforms.map((p) => p.id));
    } else {
      setSelectedPlatforms([]);
    }
  };

  const clearLogs = () => {
    setLogs([
      {
        id: Math.random().toString(),
        round: 0,
        platform_id: 0,
        platform_name: 'SYSTEM',
        status: 'INFO',
        detail: 'Log konsol telah dibersihkan.',
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      },
    ]);
  };

  const copyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [Round ${l.round}] [${l.platform_name}] [${l.status}] ${l.detail}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    showToast('Log berhasil disalin ke clipboard!', 'success');
  };

  const filteredLogs = logs.filter((log) => {
    if (filterStatus === 'ALL') return true;
    return log.status === filterStatus;
  });

  return (
    <div id="valora-app" className="min-h-screen bg-[#0b0d12] text-[#f8fafc] p-4 md:p-6 lg:p-8 selection:bg-blue-600 selection:text-white">
      {/* Toast Notifications */}
      <div id="toast-container" className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-sm font-medium border transition-all animate-in fade-in slide-in-from-bottom-2 ${
              toast.type === 'success'
                ? 'bg-[#131722] border-emerald-500/30 text-emerald-400 border-l-4 border-l-emerald-500'
                : toast.type === 'error'
                  ? 'bg-[#131722] border-rose-500/30 text-rose-400 border-l-4 border-l-rose-500'
                  : 'bg-[#131722] border-blue-500/30 text-blue-400 border-l-4 border-l-blue-500'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />}
            {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 text-blue-400" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto flex flex-col gap-5">
        {/* Top Navbar */}
        <header
          id="main-navbar"
          className="bg-[#131722] border border-white/10 rounded-2xl p-4 md:px-6 flex flex-wrap items-center justify-between gap-4 shadow-xl backdrop-blur-sm"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                  VALORA OTP <span className="text-xs font-mono font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">v2.4</span>
                </h1>
              </div>
              <p className="text-xs text-slate-400">OTP Engine Stress Testing & Security Console</p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 text-slate-300">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">IP:</span>
              <span className="font-mono font-semibold text-white">{systemInfo.public_ip}</span>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 text-slate-300">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">OS:</span>
              <span className="font-mono font-semibold text-white">{systemInfo.os.substring(0, 12)}</span>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Core:</span>
              <span className="font-mono font-semibold text-white">{systemInfo.cpu_cores} CPUs</span>
            </div>

            <div
              id="status-indicator-badge"
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wide flex items-center gap-2 border ${
                isRunning
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isRunning ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-400'
                }`}
              />
              <span>{isRunning ? (countdown ? `COOLDOWN (${countdown}s)` : `RUNNING (R-${currentRound})`) : 'IDLE'}</span>
            </div>
          </div>
        </header>

        {/* Welcome Hero Banner */}
        <div
          id="welcome-banner"
          className="relative overflow-hidden bg-gradient-to-r from-[#181d2a] via-[#131722] to-[#10141f] border border-white/10 rounded-2xl p-5 md:p-6 flex flex-wrap items-center justify-between gap-4 shadow-xl"
        >
          <div className="relative z-10 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2.5 py-0.5 rounded-full uppercase mb-2">
              <Activity className="w-3 h-3" />
              <span>Valora OTP Control Center</span>
            </div>
            <h2 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
              Selamat Datang di Valora OTP Console
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1 leading-relaxed">
              Tools Stress Testing Endpoint & Rate-Limiting Authentication OTP WhatsApp. Gunakan secara bijak dan bertanggung jawab untuk pengujian keamanan sistem.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            <div className="bg-[#0e111a] border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono font-semibold text-white flex items-center gap-2 shadow-inner">
              <Clock className="w-4 h-4 text-blue-400" />
              <span>{liveTime || '--:--:-- WIB'}</span>
            </div>

            <button
              id="btn-toggle-vercel-guide"
              onClick={() => setShowVercelGuide(!showVercelGuide)}
              className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Info Deploy Vercel</span>
              {showVercelGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Vercel Deployment & Architecture Insights (Toggleable) */}
        {showVercelGuide && (
          <div id="vercel-guide-section" className="bg-[#131722] border border-blue-500/30 rounded-2xl p-5 md:p-6 shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center gap-2 mb-3 text-blue-400">
              <Info className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Jawaban: Bisakah Langsung Di-Deploy ke Vercel?</h3>
            </div>
            <div className="space-y-3 text-xs md:text-sm text-slate-300 leading-relaxed">
              <p>
                <strong>1. File <code className="text-blue-300 font-mono bg-blue-950/50 px-1.5 py-0.5 rounded">vercel.json</code> pada Repo:</strong> Repo asli memang memiliki file <code className="text-blue-300 font-mono bg-blue-950/50 px-1.5 py-0.5 rounded">vercel.json</code> yang mengarahkan build ke <code className="text-blue-300 font-mono bg-blue-950/50 px-1.5 py-0.5 rounded">@vercel/python</code>.
              </p>
              <p>
                <strong>2. Limitasi Serverless Vercel untuk Tools Spam/Loop:</strong> Vercel menggunakan arsitektur <em>Serverless Function</em> tanpa server persisten. Ketika endpoint <code className="text-blue-300 font-mono bg-blue-950/50 px-1.5 py-0.5 rounded">/api/spam/start</code> membuat <code className="text-blue-300 font-mono bg-blue-950/50 px-1.5 py-0.5 rounded">threading.Thread</code> di Python dan langsung merespon 200, proses serverless Vercel langsung <strong>dihentikan (frozen/terminated)</strong>, sehingga background loop atau SSE streaming terputus setelah batas timeout (10-60 detik).
              </p>
              <p>
                <strong>3. Solusi Terbaik:</strong>
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li>Untuk mode <strong>Single Run</strong> (1x per request), Vercel dapat mengeksekusinya secara sinkron.</li>
                <li>Untuk mode <strong>Loop / Continuous Streaming</strong>, sangat disarankan menggunakan platform dengan runtime server aktif seperti <strong>Cloud Run, VPS, Railway, Render, atau Heroku</strong> (menggunakan <code className="text-blue-300 font-mono bg-blue-950/50 px-1.5 py-0.5 rounded">Procfile</code> / Docker / Node.js Express).</li>
                <li>Di lingkungan ini, aplikasi telah di-port ke server full-stack berkecepatan tinggi yang mendukung SSE streaming dan loop secara stabil!</li>
              </ul>
            </div>
          </div>
        )}

        {/* Main Grid: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Panel: Configuration (5 cols) */}
          <div id="panel-configuration" className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-400" />
                  <span>Parameter Konfigurasi</span>
                </h2>
                <span className="text-[11px] font-mono text-slate-400">Target Config</span>
              </div>

              {/* Quota & Telegram Info */}
              <div className="space-y-2.5 mb-5">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 flex items-start gap-2.5 leading-relaxed">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white">Ketentuan Pengujian:</span> Pastikan target adalah nomor uji milik sendiri atau telah memiliki izin tertulis untuk evaluasi rate-limiting.
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-amber-300">Official Repo Source:</span> Source code asli Valora/NEX-OTP oleh DuskCipher / YOGGS. Official Telegram: <a href="https://t.me/Riz_BuyX" target="_blank" rel="noreferrer" className="text-blue-400 underline font-semibold hover:text-blue-300">@Riz_BuyX</a>
                  </div>
                </div>
              </div>

              {/* Form Input: Phone Number */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <label htmlFor="phone-input" className="text-slate-300 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                    <span>Nomor Target (WhatsApp)</span>
                  </label>
                  <span
                    id="phone-norm-preview"
                    className={`font-mono text-[11px] font-semibold ${
                      isValidPhone ? 'text-emerald-400' : phoneNumber ? 'text-rose-400' : 'text-slate-500'
                    }`}
                  >
                    {normalizedPhone ? (isValidPhone ? `Target: +${normalizedPhone}` : 'Format belum valid') : 'Target: -'}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 text-slate-400 pointer-events-none">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <input
                    id="phone-input"
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="Contoh: 081234567890 / 62812..."
                    disabled={isRunning}
                    className="w-full bg-[#0e111a] border border-white/10 focus:border-blue-500 rounded-xl pl-10 pr-4 py-3 text-sm font-mono text-white placeholder:text-slate-600 outline-none transition-all focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Mode Selector Tabs */}
              <div className="mb-4">
                <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                  <span>Mode Pengiriman</span>
                  <span className="text-[11px] font-mono text-slate-500 uppercase">{mode} MODE</span>
                </div>
                <div id="mode-segmented-control" className="grid grid-cols-3 gap-1.5 bg-[#0e111a] p-1 rounded-xl border border-white/10">
                  <button
                    id="tab-mode-single"
                    type="button"
                    onClick={() => !isRunning && setMode('single')}
                    disabled={isRunning}
                    className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      mode === 'single'
                        ? 'bg-[#131722] text-white shadow-md border border-white/10'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Play className="w-3 h-3" />
                    <span>Single</span>
                  </button>

                  <button
                    id="tab-mode-loop"
                    type="button"
                    onClick={() => !isRunning && setMode('loop')}
                    disabled={isRunning}
                    className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      mode === 'loop'
                        ? 'bg-[#131722] text-white shadow-md border border-white/10'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Loop</span>
                  </button>

                  <button
                    id="tab-mode-pick"
                    type="button"
                    onClick={() => !isRunning && setMode('pick')}
                    disabled={isRunning}
                    className={`py-2 px-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      mode === 'pick'
                        ? 'bg-[#131722] text-white shadow-md border border-white/10'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Custom</span>
                  </button>
                </div>
              </div>

              {/* Interval Slider for Loop Mode */}
              {mode === 'loop' && (
                <div id="delay-config-box" className="mb-4 bg-white/[0.02] border border-white/10 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-400" />
                      <span>Interval Per Round</span>
                    </span>
                    <span className="font-mono text-blue-400 font-bold">{delay} detik</span>
                  </div>
                  <input
                    id="delay-slider"
                    type="range"
                    min={5}
                    max={300}
                    value={delay}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    disabled={isRunning}
                    className="w-full accent-blue-500 bg-[#0e111a] rounded-lg cursor-pointer h-1.5 disabled:opacity-50"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>5s (Cepat)</span>
                    <span>60s (Default)</span>
                    <span>300s (Lambat)</span>
                  </div>
                </div>
              )}

              {/* Platform Selector Grid */}
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">
                    Pilih Platform OTP ({selectedPlatforms.length}/{platforms.length})
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      id="btn-select-all-platforms"
                      type="button"
                      onClick={() => !isRunning && selectAllPlatforms(true)}
                      disabled={isRunning}
                      className="text-blue-400 hover:text-blue-300 text-[11px] font-semibold transition-colors disabled:opacity-50"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      id="btn-reset-platforms"
                      type="button"
                      onClick={() => !isRunning && selectAllPlatforms(false)}
                      disabled={isRunning}
                      className="text-slate-400 hover:text-slate-200 text-[11px] font-semibold transition-colors disabled:opacity-50"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div id="platforms-grid" className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {platforms.map((p) => {
                    const isSelected = selectedPlatforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        id={`platform-tag-${p.id}`}
                        type="button"
                        onClick={() => !isRunning && togglePlatform(p.id)}
                        disabled={isRunning}
                        className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                          isSelected
                            ? 'bg-blue-500/15 border-blue-500/40 text-white shadow-sm'
                            : 'bg-[#0e111a] border-white/10 text-slate-400 hover:border-white/20'
                        } ${isRunning ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-500 bg-transparent'
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-semibold block truncate">
                            {p.id}. {p.name}
                          </span>
                          {p.category && <span className="text-[10px] text-slate-500 block">{p.category}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                <button
                  id="btn-launch-process"
                  type="button"
                  onClick={handleStart}
                  disabled={isRunning || !isValidPhone}
                  className="col-span-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>JALANKAN PROSES</span>
                </button>

                <button
                  id="btn-stop-process"
                  type="button"
                  onClick={handleStop}
                  disabled={!isRunning}
                  className="bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 disabled:opacity-40 font-bold py-3 px-3 rounded-xl text-xs md:text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>STOP</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel: Live Monitor & Developer Terminal (7 cols) */}
          <div id="panel-monitoring" className="lg:col-span-7 flex flex-col gap-4">
            <div className="bg-[#131722] border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl flex flex-col h-full">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span>Live Monitor & Real-Time Stats</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">SSE Live Stream</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>

              {/* 4 Metric Cards */}
              <div id="metrics-overview-grid" className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-[#0e111a] border border-white/10 rounded-xl p-3 flex flex-col">
                  <span className="text-[10px] font-mono font-semibold uppercase text-slate-400 tracking-wider">Total Req</span>
                  <span id="metric-total" className="text-2xl font-mono font-bold text-white mt-1">
                    {stats.total}
                  </span>
                </div>

                <div className="bg-[#0e111a] border border-white/10 rounded-xl p-3 flex flex-col">
                  <span className="text-[10px] font-mono font-semibold uppercase text-emerald-400 tracking-wider">Sukses</span>
                  <span id="metric-success" className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                    {stats.success}
                  </span>
                </div>

                <div className="bg-[#0e111a] border border-white/10 rounded-xl p-3 flex flex-col">
                  <span className="text-[10px] font-mono font-semibold uppercase text-amber-400 tracking-wider">Rate Limit</span>
                  <span id="metric-limit" className="text-2xl font-mono font-bold text-amber-400 mt-1">
                    {stats.limit}
                  </span>
                </div>

                <div className="bg-[#0e111a] border border-white/10 rounded-xl p-3 flex flex-col">
                  <span className="text-[10px] font-mono font-semibold uppercase text-rose-400 tracking-wider">Gagal</span>
                  <span id="metric-fail" className="text-2xl font-mono font-bold text-rose-400 mt-1">
                    {stats.fail}
                  </span>
                </div>
              </div>

              {/* Terminal Console */}
              <div id="terminal-wrapper" className="flex flex-col flex-1 bg-[#08090d] border border-white/10 rounded-xl overflow-hidden min-h-[380px]">
                {/* Terminal Toolbar */}
                <div className="bg-[#0f121a] px-3.5 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                    <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
                    <span>~/valora-otp/live-stream</span>
                    {isRunning && <span className="text-emerald-400 animate-pulse text-[10px] font-bold">[ACTIVE]</span>}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Status filter buttons */}
                    <div className="flex items-center bg-[#08090d] border border-white/10 rounded-md p-0.5 text-[10px] font-mono">
                      {['ALL', 'SUCCESS', 'LIMIT', 'FAIL'].map((st) => (
                        <button
                          key={st}
                          id={`filter-btn-${st}`}
                          onClick={() => setFilterStatus(st)}
                          className={`px-2 py-0.5 rounded transition-colors ${
                            filterStatus === st ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>

                    <button
                      id="btn-copy-terminal-logs"
                      onClick={copyLogs}
                      title="Salin Log"
                      className="p-1.5 text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-md text-xs transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    <button
                      id="btn-clear-terminal-logs"
                      onClick={clearLogs}
                      title="Bersihkan Log"
                      className="p-1.5 text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-md text-xs transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Terminal Stream Body */}
                <div id="terminal-stream-body" className="p-3.5 flex-1 overflow-y-auto font-mono text-xs space-y-1.5 max-h-[380px]">
                  {filteredLogs.length === 0 ? (
                    <div className="text-slate-600 italic py-6 text-center">Tidak ada log untuk filter "{filterStatus}"</div>
                  ) : (
                    filteredLogs.map((log) => {
                      const isSys = log.platform_name === 'SYSTEM';
                      return (
                        <div
                          key={log.id}
                          className={`py-1 px-2 rounded flex flex-wrap items-baseline gap-2 leading-relaxed transition-colors hover:bg-white/[0.02] ${
                            isSys ? 'bg-blue-500/[0.07] border-l-2 border-blue-500' : ''
                          }`}
                        >
                          <span className="text-slate-500 text-[11px] shrink-0">{log.timestamp}</span>

                          {log.round > 0 && <span className="text-indigo-400 text-[11px] font-semibold shrink-0">R-{log.round}</span>}

                          <span className="text-slate-300 font-semibold min-w-[110px] shrink-0 truncate">
                            {log.platform_name}
                          </span>

                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                              log.status === 'SUCCESS'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : log.status === 'LIMIT'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : log.status === 'FAIL'
                                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                    : log.status === 'TIMEOUT'
                                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            {log.status}
                          </span>

                          <span className="text-slate-300 break-all flex-1">{log.detail}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
