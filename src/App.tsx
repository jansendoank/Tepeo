import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Layers,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  Smartphone,
  Square,
  Zap,
} from 'lucide-react';
import { KeyManagerModal } from './components/KeyManagerModal';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { LogEntry, TerminalView } from './components/TerminalView';
import { AuthSession } from './types/auth';

interface PlatformItem {
  id: number;
  name: string;
  category?: string;
}

interface Stats {
  total: number;
  success: number;
  limit: number;
  fail: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const saved = localStorage.getItem('spammer_vip_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [showKeyManager, setShowKeyManager] = useState(false);

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
      detail: 'spammer Engine siap. Masukkan nomor target WhatsApp.',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    },
  ]);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleLoginSuccess = (newSession: AuthSession) => {
    setSession(newSession);
    localStorage.setItem('spammer_vip_session', JSON.stringify(newSession));
    showToast(`Selamat datang! Akses: ${newSession.role.toUpperCase()}`, 'success');
  };

  const handleLogout = async () => {
    if (session?.token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        });
      } catch {
        // ignore
      }
    }
    setSession(null);
    localStorage.removeItem('spammer_vip_session');
    showToast('Anda telah keluar.', 'info');
  };

  // Heartbeat verification: Auto-kick if expired or banned
  useEffect(() => {
    if (!session?.token) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const data = await res.json();
        if (!data.valid) {
          showToast(data.message || 'Masa aktif key telah habis! Anda dikeluarkan.', 'error');
          setSession(null);
          localStorage.removeItem('spammer_vip_session');
        }
      } catch {
        // network issue
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [session]);

  const normalizePhone = (num: string): string => {
    let clean = num.replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      clean = '62' + clean;
    }
    return clean;
  };

  const normalizedPhone = normalizePhone(phoneNumber);
  const isValidPhone = normalizedPhone.length >= 10 && normalizedPhone.length <= 15 && normalizedPhone.startsWith('62');

  // Fetch initial info
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch('/api/info');
        if (res.ok) {
          const data = await res.json();
          if (data.platforms && Array.isArray(data.platforms) && data.platforms.length > 0) {
            setPlatforms(data.platforms);
            setSelectedPlatforms(data.platforms.map((p: any) => p.id));
          }
          if (data.active !== undefined) {
            setIsRunning(data.active);
          }
          if (data.job) {
            if (data.job.stats) setStats(data.job.stats);
            if (data.job.current_round) setCurrentRound(data.job.current_round);
            if (data.job.logs && data.job.logs.length > 0) setLogs(data.job.logs);
          }
        }
      } catch {
        // Dev / initial offline
      }
    };

    fetchInfo();
  }, []);

  // SSE Stream
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource('/api/spam/stream');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            setIsRunning(data.active);
            if (data.job?.stats) setStats(data.job.stats);
            if (data.job?.current_round) setCurrentRound(data.job.current_round);
          } else if (data.type === 'job_start') {
            setIsRunning(true);
            setCountdown(null);
            showToast(`Memulai proses ke target ${data.job.phone_fmt}`, 'info');
          } else if (data.type === 'round_start') {
            setCurrentRound(data.round);
            setCountdown(null);
          } else if (data.type === 'log') {
            setLogs((prev) => [...prev.slice(-400), data.entry]);
            if (data.stats) setStats(data.stats);
          } else if (data.type === 'countdown') {
            setCountdown(data.remaining);
          } else if (data.type === 'round_complete') {
            if (data.stats) setStats(data.stats);
          } else if (data.type === 'job_complete') {
            setIsRunning(false);
            setCountdown(null);
            if (data.stats) setStats(data.stats);
            showToast(`Proses selesai. Status: ${data.status}`, data.status === 'stopped' ? 'info' : 'success');
          }
        } catch {
          // ignore
        }
      };

      eventSource.onerror = () => {
        // reconnect
      };
    } catch {
      // ignore
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

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

  // If user is not logged in, render dedicated full-screen Login Page
  if (!session) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div id="spammer-app" className="min-h-screen bg-[#070b12] text-slate-100 font-sans selection:bg-amber-400 selection:text-black flex flex-col relative overflow-x-hidden">
      {/* Background Glow Accents (bcb88ong theme) */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-10 w-80 h-80 bg-red-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 left-1/3 w-96 h-96 bg-amber-600/5 rounded-full blur-[150px]" />
      </div>

      {/* Key Management Modal */}
      {showKeyManager && (
        <KeyManagerModal
          session={session}
          onClose={() => setShowKeyManager(false)}
          onShowToast={showToast}
        />
      )}

      {/* Toast Notifications */}
      <div id="toast-container" className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold border transition-all animate-in fade-in slide-in-from-bottom-2 ${
              toast.type === 'success'
                ? 'bg-[#0f172a] border-amber-500 text-amber-300 shadow-amber-500/10'
                : toast.type === 'error'
                  ? 'bg-red-950/90 border-red-700 text-red-200 shadow-red-950/40'
                  : 'bg-[#111928] border-amber-500/30 text-slate-200'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-400" />}
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />}
            {toast.type === 'info' && <Info className="w-4 h-4 shrink-0 text-amber-400" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Navbar Component (Clean: No CPU/RAM/IP specs) */}
      <Navbar
        session={session}
        isRunning={isRunning}
        countdown={countdown}
        currentRound={currentRound}
        onOpenKeyManager={() => setShowKeyManager(true)}
        onLogout={handleLogout}
      />

      {/* Main Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        {/* Left Column: Parameter Configuration (5 cols) */}
        <div id="panel-configuration" className="lg:col-span-5 flex flex-col gap-6">
          {/* Target Settings Box */}
          <div className="bg-[#0f172a]/90 border border-amber-500/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden backdrop-blur-md">
            <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h2 className="font-black text-base text-amber-300 tracking-wider uppercase">
                  Parameter Target
                </h2>
              </div>
              {isRunning && (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  EKSEKUSI AKTIF
                </span>
              )}
            </div>

            {/* Target Phone Input */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-amber-200/90 uppercase tracking-wider mb-2">
                Nomor WhatsApp Target
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                </div>
                <input
                  id="phone-input"
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isRunning}
                  placeholder="08xxxxxxxxxx atau 628xxxxxxxxxx"
                  className="w-full bg-[#070c16] border border-amber-500/30 rounded-xl pl-10 pr-4 py-3 text-sm sm:text-base font-mono text-amber-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all shadow-inner disabled:opacity-60"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <span className="text-amber-400">✓</span> Format otomatis disesuaikan (08xx / 62xx / +62xx)
              </p>
            </div>

            {/* Mode Selector */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-amber-200/90 uppercase tracking-wider mb-2">
                Mode Pengiriman
              </label>
              <div id="mode-segmented-control" className="grid grid-cols-3 gap-2">
                <button
                  id="tab-mode-single"
                  type="button"
                  onClick={() => !isRunning && setMode('single')}
                  disabled={isRunning}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                    mode === 'single'
                      ? 'bg-gradient-to-b from-amber-500/25 to-amber-600/10 border-amber-400 text-amber-300 shadow-lg shadow-amber-500/20'
                      : 'bg-[#0b101b] border-slate-800 text-slate-400 hover:border-amber-500/30 hover:text-slate-200'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>Single (1x)</span>
                </button>

                <button
                  id="tab-mode-loop"
                  type="button"
                  onClick={() => !isRunning && setMode('loop')}
                  disabled={isRunning}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                    mode === 'loop'
                      ? 'bg-gradient-to-b from-red-500/25 to-red-600/10 border-red-500 text-red-300 shadow-lg shadow-red-500/20'
                      : 'bg-[#0b101b] border-slate-800 text-slate-400 hover:border-amber-500/30 hover:text-slate-200'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Loop (Nonstop)</span>
                </button>

                <button
                  id="tab-mode-pick"
                  type="button"
                  onClick={() => !isRunning && setMode('pick')}
                  disabled={isRunning}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1 ${
                    mode === 'pick'
                      ? 'bg-gradient-to-b from-yellow-500/25 to-yellow-600/10 border-yellow-400 text-yellow-300 shadow-lg shadow-yellow-500/20'
                      : 'bg-[#0b101b] border-slate-800 text-slate-400 hover:border-amber-500/30 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>Custom Pick</span>
                </button>
              </div>
            </div>

            {/* Delay Slider for Loop Mode */}
            {mode === 'loop' && (
              <div id="delay-config-box" className="mb-4 bg-red-950/20 border border-red-800/40 rounded-xl p-3.5">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Jeda Waktu Loop Antar-Putaran:
                  </span>
                  <span className="font-mono font-bold text-amber-400 bg-black/50 px-2 py-0.5 rounded border border-amber-700/60">
                    {delay} Detik
                  </span>
                </div>
                <input
                  id="delay-slider"
                  type="range"
                  min="5"
                  max="300"
                  step="5"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  disabled={isRunning}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                  <span>5s (Agresif)</span>
                  <span>60s (Direkomendasikan)</span>
                  <span>300s (Slow)</span>
                </div>
              </div>
            )}

            {/* Platform Selector Grid */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-amber-200">
                  Pilih Gateway API ({selectedPlatforms.length}/{platforms.length})
                </span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    id="btn-select-all-platforms"
                    type="button"
                    onClick={() => !isRunning && selectAllPlatforms(true)}
                    disabled={isRunning}
                    className="text-amber-400 hover:text-amber-300 text-[11px] font-semibold transition-colors disabled:opacity-50"
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
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-100 shadow-sm'
                          : 'bg-[#0e111a] border-white/10 text-slate-400 hover:border-amber-500/20'
                      } ${isRunning ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                          isSelected ? 'bg-amber-500 border-amber-500' : 'border-slate-500 bg-transparent'
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-black font-black" />}
                      </div>
                      <div className="truncate">
                        <span className="text-xs font-semibold block truncate">
                          {p.name}
                        </span>
                        {p.category && <span className="text-[10px] text-slate-500 block">{p.category}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-2">
              {isRunning ? (
                <button
                  id="btn-stop-process"
                  type="button"
                  onClick={handleStop}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>HENTIKAN PROSES</span>
                </button>
              ) : (
                <button
                  id="btn-launch-process"
                  type="button"
                  onClick={handleStart}
                  disabled={!isValidPhone}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 active:from-amber-600 active:to-yellow-500 text-black font-black text-sm tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-black" />
                  <span>JALANKAN PROSES</span>
                </button>
              )}
            </div>

            {/* Disclaimer */}
            <div className="mt-4 p-3.5 bg-red-950/30 border border-red-800/50 rounded-xl flex items-start gap-2.5 text-xs text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">
                Note semua resiko di tanggung pengguna, admin, developer tidak bertanggung jawab atas apa yg kalian lakukan.
              </p>
            </div>
          </div>

          {/* Stats Box */}
          <div className="bg-[#0f172a]/90 border border-amber-500/30 rounded-2xl p-5 shadow-xl">
            <h3 className="font-bold text-xs text-amber-300 uppercase tracking-wider mb-3.5 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Statistik Pengujian Real-Time
            </h3>
            <div id="metrics-overview-grid" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#070c16] border border-slate-800 rounded-xl p-3 text-center">
                <span className="text-[10px] text-slate-400 block font-mono">TOTAL REQ</span>
                <span id="metric-total" className="text-xl font-mono font-black text-amber-200">{stats.total}</span>
              </div>
              <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-xl p-3 text-center">
                <span className="text-[10px] text-emerald-300 block font-mono">SUCCESS</span>
                <span id="metric-success" className="text-xl font-mono font-black text-emerald-300">{stats.success}</span>
              </div>
              <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-3 text-center">
                <span className="text-[10px] text-amber-400 block font-mono">LIMIT</span>
                <span id="metric-limit" className="text-xl font-mono font-black text-amber-400">{stats.limit}</span>
              </div>
              <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-3 text-center">
                <span className="text-[10px] text-red-400 block font-mono">FAILED</span>
                <span id="metric-fail" className="text-xl font-mono font-black text-red-400">{stats.fail}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Full Terminal Stream (7 cols) - NO Spesifikasi Mesin Server */}
        <div id="panel-monitoring" className="lg:col-span-7 flex flex-col gap-6">
          <TerminalView
            logs={logs}
            isRunning={isRunning}
            currentRound={currentRound}
            countdown={countdown}
            onClearLogs={clearLogs}
            onCopyLogs={copyLogs}
            terminalEndRef={terminalEndRef}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-amber-500/20 bg-[#060a12] py-4 mt-auto relative z-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>
              spammer — Note semua resiko di tanggung pengguna, admin, developer tidak bertanggung jawab atas apa yg kalian lakukan.
            </span>
          </div>
          <div className="font-mono text-amber-400 font-bold uppercase">
            spammer v2.4
          </div>
        </div>
      </footer>
    </div>
  );
}
