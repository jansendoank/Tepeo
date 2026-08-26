import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Globe,
  Radio,
  Server,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  X,
  Activity,
} from 'lucide-react';
import { AuthSession } from '../types/auth';

interface ProxyConfig {
  enabled: boolean;
  mode: 'auto' | 'custom';
  customProxies: string[];
}

interface ProxyManagerModalProps {
  session: AuthSession;
  onClose: () => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  proxyConfig: ProxyConfig;
  onUpdateConfig: (newConfig: ProxyConfig) => void;
}

export function ProxyManagerModal({
  session,
  onClose,
  onShowToast,
  proxyConfig,
  onUpdateConfig,
}: ProxyManagerModalProps) {
  const [enabled, setEnabled] = useState(proxyConfig.enabled);
  const [mode, setMode] = useState<'auto' | 'custom'>(proxyConfig.mode);
  const [customProxiesText, setCustomProxiesText] = useState(
    proxyConfig.customProxies.join('\n')
  );
  const [testUrl, setTestUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency: number;
    ip?: string;
    error?: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const customList = customProxiesText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    try {
      const res = await fetch('/api/proxy/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          enabled,
          mode,
          customProxies: customList,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onUpdateConfig({
          enabled,
          mode,
          customProxies: customList,
        });
        onShowToast(
          enabled
            ? '🛡️ Proxy Rotator Anti-Banned IP AKTIF!'
            : 'Proxy Rotator dimatikan (Koneksi Direct).',
          'success'
        );
        onClose();
      } else {
        onShowToast(data.message || 'Gagal menyimpan konfigurasi.', 'error');
      }
    } catch {
      onShowToast('Gagal terhubung ke server proxy.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestProxy = async () => {
    if (!testUrl.trim()) {
      onShowToast('Masukkan URL Proxy untuk diuji (contoh: http://103.152.112.162:80)', 'info');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/proxy/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ proxyUrl: testUrl.trim() }),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        onShowToast(`✅ Proxy Terhubung! IP: ${data.ip || 'OK'} (${data.latency}ms)`, 'success');
      } else {
        onShowToast(`❌ Proxy Offline: ${data.error}`, 'error');
      }
    } catch {
      onShowToast('Gagal menguji proxy.', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div
      id="proxy-manager-overlay"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in"
    >
      <div
        id="proxy-manager-dialog"
        className="w-full max-w-lg bg-[#0b101b] border border-amber-500/30 rounded-3xl p-6 shadow-2xl shadow-black/90 relative text-slate-100 my-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
                Proxy Rotator Anti-Banned
              </h2>
              <p className="text-xs text-slate-400">
                Rotasi IP otomatis untuk mencegah rate-limit & blokir
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Enable Switch */}
        <div className="mt-5 p-4 rounded-2xl bg-[#070c16] border border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                enabled
                  ? 'bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse'
                  : 'bg-slate-600'
              }`}
            />
            <div>
              <p className="text-sm font-bold text-slate-200">
                Status Rotator IP
              </p>
              <p className="text-xs text-slate-400">
                {enabled ? '🛡️ Aktif — Request berputar lewat proxy' : 'Direct Server IP (Bawaan)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
              enabled
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 font-black'
                : 'bg-slate-800 border border-slate-700 text-slate-300'
            }`}
          >
            {enabled ? 'AKTIF' : 'NONAKTIF'}
          </button>
        </div>

        {/* Mode Selector */}
        <div className="mt-4">
          <label className="block text-xs font-bold text-amber-200/90 uppercase tracking-wider mb-2">
            Pilihan Mode Proxy
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('auto')}
              className={`p-3 rounded-xl border text-left transition-all ${
                mode === 'auto'
                  ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-md shadow-amber-500/10'
                  : 'bg-[#070c16] border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Auto Pool (Built-in)</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Rotasi otomatis pool node publik berkecepatan tinggi
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`p-3 rounded-xl border text-left transition-all ${
                mode === 'custom'
                  ? 'bg-amber-500/15 border-amber-400 text-amber-200 shadow-md shadow-amber-500/10'
                  : 'bg-[#070c16] border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                <Server className="w-4 h-4 text-amber-400" />
                <span>Custom Proxy List</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Gunakan daftar proxy HTTP / HTTPS / SOCKS5 sendiri
              </p>
            </button>
          </div>
        </div>

        {/* Custom Proxy Textarea if custom mode */}
        {mode === 'custom' && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-amber-200/90 uppercase tracking-wider">
                Daftar Custom Proxy (1 baris per proxy)
              </label>
              <span className="text-[11px] text-slate-400">
                {customProxiesText.split('\n').filter((s) => s.trim()).length} Proxy Terisi
              </span>
            </div>
            <textarea
              rows={4}
              value={customProxiesText}
              onChange={(e) => setCustomProxiesText(e.target.value)}
              placeholder="http://103.152.112.162:80&#10;socks5://user:pass@ip:port&#10;http://198.59.191.234:8080"
              className="w-full bg-[#070c16] border border-amber-500/30 rounded-xl p-3 text-xs font-mono text-amber-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        )}

        {/* Proxy Tester Tool */}
        <div className="mt-4 p-3.5 bg-[#070c16] border border-slate-800 rounded-2xl">
          <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            Uji Ping & Latency Proxy
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="http://103.152.112.162:80"
              className="flex-1 bg-[#0b101b] border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={handleTestProxy}
              disabled={isTesting}
              className="px-3.5 py-2 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isTesting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Radio className="w-3.5 h-3.5" />
              )}
              <span>Test</span>
            </button>
          </div>

          {testResult && (
            <div
              className={`mt-2.5 p-2.5 rounded-xl border text-[11px] font-mono flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/40 text-red-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <div className="flex-1 overflow-hidden truncate">
                {testResult.success ? (
                  <span>
                    Status: OK | Latency: {testResult.latency}ms | IP Keluar: {testResult.ip || 'Masked'}
                  </span>
                ) : (
                  <span>Gagal: {testResult.error}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-amber-500/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black text-xs font-black rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin text-black" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-black" />
            )}
            <span>Simpan Konfigurasi</span>
          </button>
        </div>
      </div>
    </div>
  );
}
