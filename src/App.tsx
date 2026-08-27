import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Info,
  Layers,
  ListPlus,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Square,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { KeyManagerModal } from './components/KeyManagerModal';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { ProxyManagerModal } from './components/ProxyManagerModal';
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

interface ProxyConfig {
  enabled: boolean;
  mode: 'auto' | 'custom';
  customProxies: string[];
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
  const [showProxyModal, setShowProxyModal] = useState(false);

  const [proxyConfig, setProxyConfig] = useState<ProxyConfig>({
    enabled: false,
    mode: 'auto',
    customProxies: [],
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
    { id: 9, name: 'Gojek', category: 'Ride / Food' },
    { id: 10, name: 'Grab', category: 'Ride / Food' },
    { id: 11, name: 'Shopee', category: 'E-Commerce' },
    { id: 12, name: 'Tokopedia', category: 'E-Commerce' },
    { id: 13, name: 'WhatsApp', category: 'Messaging' },
    { id: 14, name: 'Telegram', category: 'Messaging' },
    { id: 15, name: 'Instagram', category: 'Social Media' },
    { id: 16, name: 'Twitter (X)', category: 'Social Media' },
    { id: 17, name: 'Google / Gmail', category: 'Big Tech' },
    { id: 18, name: 'Microsoft', category: 'Big Tech' },
  ]);

  const [selectedPlatforms, setSelectedPlatforms] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);

  // Target Input States (Single vs Batch)
  const [targetType, setTargetType] = useState<'single' | 'batch'>('single');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [batchText, setBatchText] = useState('');

  const [mode, setMode] = useState<'single' | 'loop' | 'pick'>('single');
  const [delay, setDelay] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Multi-target progress state
  const [targetProgress, setTargetProgress] = useState<{ current: number; total: number; activePhone?: string }>({
    current: 1,
    total: 1,
  });

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
      detail: 'spammer Engine siap. Masukkan nomor target WhatsApp atau aktifkan Multi-Target batch.',
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

  // Helper to extract and validate batch phone numbers
  const getParsedBatchPhones = (): string[] => {
    const rawLines = batchText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const cleaned = rawLines.map(normalizePhone).filter((p) => p.length >= 10 && p.length <= 15);
    return Array.from(new Set(cleaned)); // unique list
  };

  const parsedBatch = getParsedBatchPhones();
  const normalizedSingle = normalizePhone(phoneNumber);
  const isValidSingle = normalizedSingle.length >= 10 && normalizedSingle.length <= 15 && normalizedSingle.startsWith('62');

  const hasValidTargets = targetType === 'single' ? isValidSingle : parsedBatch.length > 0;

  // Fetch initial info & proxy config
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch('/api/info', {
          headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.platforms && Array.isArray(data.platforms) && data.platforms.length > 0) {
            setPlatforms(data.platforms);
            setSelectedPlatforms(data.platforms.map((p: any) => p.id));
          }
          if (data.active !== undefined) {
            setIsRunning(data.active);
          }
          if (data.proxy_config) {
            setProxyConfig(data.proxy_config);
          }
          if (data.job) {
            if (data.job.stats) setStats(data.job.stats);
            if (data.job.current_round) setCurrentRound(data.job.current_round);
            if (data.job.logs && data.job.logs.length > 0) setLogs(data.job.logs);
            if (data.job.totalTargets && data.job.totalTargets > 0) {
              setTargetProgress({
                current: data.job.currentTargetIndex || 1,
                total: data.job.totalTargets || 1,
                activePhone: data.job.phone_fmt,
              });
            }
          }
        }
      } catch {
        // Dev / initial offline
      }
    };

    fetchInfo();
  }, [session]);

  // SSE Stream (Isolated per User Session Token)
  useEffect(() => {
    if (!session?.token) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/spam/stream?token=${encodeURIComponent(session.token)}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            setIsRunning(data.active);
            if (data.proxy) setProxyConfig(data.proxy);
            if (data.job?.stats) setStats(data.job.stats);
            if (data.job?.logs && data.job.logs.length > 0) setLogs(data.job.logs);
            if (data.job?.current_round) setCurrentRound(data.job.current_round);
            if (data.job?.totalTargets) {
              setTargetProgress({
                current: data.job.currentTargetIndex || 1,
                total: data.job.totalTargets || 1,
                activePhone: data.job.phone_fmt,
              });
            }
          } else if (data.type === 'job_start') {
            setIsRunning(true);
            setCountdown(null);
            setStats({ total: 0, success: 0, limit: 0, fail: 0 });
            setLogs([]);
            if (data.job?.total_targets) {
              setTargetProgress({
                current: 1,
                total: data.job.total_targets,
                activePhone: data.job.phone_fmt,
              });
            }
          } else if (data.type === 'target_change') {
            setTargetProgress({
              current: data.currentIndex,
              total: data.totalTargets,
              activePhone: data.phone,
            });
            if (data.entry) {
              setLogs((prev) => [...prev.slice(-350), data.entry]);
            }
          } else if (data.type === 'round_start') {
            setCurrentRound(data.round);
            setCountdown(null);
          } else if (data.type === 'log') {
            setLogs((prev) => [...prev.slice(-350), data.entry]);
            if (data.stats) setStats(data.stats);
          } else if (data.type === 'countdown') {
            setCountdown(data.remaining);
          } else if (data.type === 'round_complete') {
            if (data.stats) setStats(data.stats);
          } else if (data.type === 'job_complete') {
            setIsRunning(false);
            setCountdown(null);
            if (data.stats) setStats(data.stats);
          }
        } catch {
          // ignore parsing err
        }
      };

      eventSource.onerror = () => {
        // SSE auto-reconnects
      };
    } catch {
      // ignore
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [session]);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleStart = async () => {
    if (!hasValidTargets) {
      showToast(
        targetType === 'single'
          ? 'Masukkan nomor telepon WhatsApp yang valid!'
          : 'Masukkan minimal 1 nomor target yang valid!',
        'error'
      );
      return;
    }
    if (selectedPlatforms.length === 0) {
      showToast('Pilih minimal 1 Gateway Platform!', 'error');
      return;
    }

    const payload: any = {
      mode,
      delay,
      platforms: selectedPlatforms,
    };

    if (targetType === 'single') {
      payload.phone = phoneNumber;
    } else {
      payload.phones = parsedBatch;
    }

    try {
      const res = await fetch('/api/spam/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token || ''}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        showToast(
          targetType === 'single'
            ? `Proses dimulai ke ${data.target || phoneNumber}!`
            : `Antrian dimulai ke ${parsedBatch.length} nomor target!`,
          'success'
        );
        setIsRunning(true);
      } else {
        showToast(data.message || 'Gagal memulai proses', 'error');
      }
    } catch {
      showToast('Gagal menghubungi server.', 'error');
    }
  };

  const handleStop = async () => {
    try {
      const res = await fetch('/api/spam/stop', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.token || ''}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'info');
      } else {
        showToast(data.message || 'Gagal menghentikan proses', 'error');
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

  const fillSampleBatch = () => {
    setBatchText('081234567890\n085712345678\n089698765432');
    showToast('Contoh 3 nomor target dimasukkan!', 'info');
  };

  const removeBatchNumber = (numToRemove: string) => {
    const remaining = parsedBatch.filter((num) => num !== numToRemove);
    setBatchText(remaining.map((n) => '0' + n.slice(2)).join('\n'));
  };

  // Quick toggle proxy
  const toggleProxyRotator = async () => {
    const nextState = !proxyConfig.enabled;
    try {
      const res = await fetch('/api/proxy/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token || ''}`,
        },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        setProxyConfig(data.config);
        showToast(
          nextState ? '🛡️ Proxy Rotator Anti-Banned Diaktifkan!' : 'Proxy Rotator Dimatikan (Direct IP)',
          'info'
        );
      }
    } catch {
      showToast('Gagal mengubah status proxy', 'error');
    }
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

      {/* Proxy Rotator Modal (Nomor 5) */}
      {showProxyModal && (
        <ProxyManagerModal
          session={session}
          proxyConfig={proxyConfig}
          onClose={() => setShowProxyModal(false)}
          onShowToast={showToast}
          onUpdateConfig={(cfg) => setProxyConfig(cfg)}
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

      {/* Navbar Component */}
      <Navbar
        session={session}
        isRunning={isRunning}
        countdown={countdown}
        currentRound={currentRound}
        proxyConfig={proxyConfig}
        onOpenProxyManager={() => setShowProxyModal(true)}
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

            {/* Target Type Selector (Nomor 3: Multi-Target Mode) */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-amber-200/90 uppercase tracking-wider">
                  Metode Input Target
                </label>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  Multi-Target Support
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => !isRunning && setTargetType('single')}
                  disabled={isRunning}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    targetType === 'single'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                      : 'bg-[#070c16] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Single Target</span>
                </button>

                <button
                  type="button"
                  onClick={() => !isRunning && setTargetType('batch')}
                  disabled={isRunning}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    targetType === 'batch'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                      : 'bg-[#070c16] border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ListPlus className="w-4 h-4" />
                  <span>Multi-Target (Batch)</span>
                </button>
              </div>
            </div>

            {/* Single Target Phone Input */}
            {targetType === 'single' ? (
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
            ) : (
              /* Multi-Target Batch Textarea (Nomor 3) */
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-amber-200/90 uppercase tracking-wider">
                    Daftar Nomor Target (1 baris per nomor)
                  </label>
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      parsedBatch.length > 0
                        ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    {parsedBatch.length} Nomor Valid
                  </span>
                </div>
                <textarea
                  id="batch-phone-input"
                  rows={4}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  disabled={isRunning}
                  placeholder="081234567890&#10;085712345678&#10;628998877665"
                  className="w-full bg-[#070c16] border border-amber-500/30 rounded-xl p-3 text-xs sm:text-sm font-mono text-amber-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-inner disabled:opacity-60"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <button
                    type="button"
                    onClick={fillSampleBatch}
                    disabled={isRunning}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline disabled:opacity-50"
                  >
                    + Contoh List Target (3 Nomor)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchText('')}
                    disabled={isRunning || !batchText}
                    className="text-[11px] text-slate-400 hover:text-red-300 disabled:opacity-40"
                  >
                    Bersihkan
                  </button>
                </div>

                {/* Parsed Target Chips Preview */}
                {parsedBatch.length > 0 && (
                  <div className="mt-2.5 p-2.5 bg-[#070c16] border border-slate-800 rounded-xl max-h-24 overflow-y-auto">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-bold">
                      Antrian Target Terdeteksi ({parsedBatch.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsedBatch.map((num, idx) => (
                        <span
                          key={num}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] font-mono text-amber-300"
                        >
                          <span>#{idx + 1} +{num}</span>
                          {!isRunning && (
                            <button
                              type="button"
                              onClick={() => removeBatchNumber(num)}
                              className="text-slate-400 hover:text-red-400"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Proxy Rotator Anti-Banned Widget (Nomor 5) */}
            <div className="mb-4 p-3.5 rounded-xl bg-[#070c16] border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                    proxyConfig.enabled
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 shadow-sm shadow-emerald-500/20'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200">
                      Anti-Banned Proxy Rotator
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        proxyConfig.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {proxyConfig.enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {proxyConfig.enabled
                      ? `Mode ${proxyConfig.mode === 'auto' ? 'Auto-Pool' : 'Custom'} Aktif`
                      : 'Koneksi Langsung (Direct)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleProxyRotator}
                  disabled={isRunning}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    proxyConfig.enabled
                      ? 'bg-amber-500 text-black font-black shadow-sm'
                      : 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {proxyConfig.enabled ? 'Aktif' : 'Nyalakan'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowProxyModal(true)}
                  className="p-1.5 bg-slate-900 border border-slate-700 hover:border-amber-500/40 text-amber-300 rounded-lg text-xs transition-colors"
                  title="Buka Pengaturan Proxy Lengkap"
                >
                  ⚙️
                </button>
              </div>
            </div>

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
                  id="btn-start-process"
                  type="button"
                  onClick={handleStart}
                  disabled={!hasValidTargets || selectedPlatforms.length === 0}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.99] text-black font-black text-sm tracking-wider uppercase transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-black text-black" />
                  <span>
                    {targetType === 'single'
                      ? 'JALANKAN PROSES'
                      : `JALANKAN (${parsedBatch.length} TARGET)`}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Analytics & Live Logs (7 cols) */}
        <div id="panel-analytics-terminal" className="lg:col-span-7 flex flex-col gap-6">
          {/* Active Target Banner when Batch Running */}
          {isRunning && targetProgress.total > 1 && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-between shadow-lg shadow-amber-500/10 backdrop-blur-md animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center">
                  <Users className="w-5 h-5 text-amber-400 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Sedang Memproses Target:
                    </span>
                    <span className="text-xs font-mono font-black text-amber-200 bg-amber-950/80 border border-amber-600 px-2 py-0.5 rounded">
                      {targetProgress.current} dari {targetProgress.total} Target
                    </span>
                  </div>
                  <p className="text-sm font-mono font-bold text-white mt-0.5">
                    {targetProgress.activePhone || 'Memuat...'}
                  </p>
                </div>
              </div>
              <div className="text-right font-mono text-xs text-amber-300">
                <span>{Math.round((targetProgress.current / targetProgress.total) * 100)}% Selesai</span>
              </div>
            </div>
          )}

          {/* Stats Bar */}
          <div
            id="metrics-dashboard"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#0f172a]/90 border border-amber-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md"
          >
            <div className="bg-[#070c16] border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider block uppercase mb-1">
                Total Request
              </span>
              <span className="text-xl sm:text-2xl font-mono font-black text-slate-100">
                {stats.total}
              </span>
            </div>

            <div className="bg-[#070c16] border border-emerald-900/40 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-emerald-400 tracking-wider block uppercase mb-1">
                Berhasil / OK
              </span>
              <span className="text-xl sm:text-2xl font-mono font-black text-emerald-400">
                {stats.success}
              </span>
            </div>

            <div className="bg-[#070c16] border border-amber-900/40 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-amber-400 tracking-wider block uppercase mb-1">
                Rate Limit
              </span>
              <span className="text-xl sm:text-2xl font-mono font-black text-amber-400">
                {stats.limit}
              </span>
            </div>

            <div className="bg-[#070c16] border border-red-900/40 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-red-400 tracking-wider block uppercase mb-1">
                Gagal / Error
              </span>
              <span className="text-xl sm:text-2xl font-mono font-black text-red-400">
                {stats.fail}
              </span>
            </div>
          </div>

          {/* Real-time Streaming Terminal */}
          <TerminalView
            logs={logs}
            isRunning={isRunning}
            currentRound={currentRound}
            countdown={countdown}
            currentTarget={phoneNumber}
            targetProgress={targetProgress}
            proxyEnabled={proxyConfig.enabled}
            onClearLogs={clearLogs}
            onCopyLogs={copyLogs}
            terminalEndRef={terminalEndRef}
          />
        </div>
      </main>
    </div>
  );
}
