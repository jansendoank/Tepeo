import React, { useEffect, useState } from 'react';
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Flame,
  Key,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Smartphone,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AuthSession, LicenseKey, TelegramConfig, UserRole } from '../types/auth';

interface KeyManagerModalProps {
  session: AuthSession;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const KeyManagerModal: React.FC<KeyManagerModalProps> = ({
  session,
  onClose,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'list' | 'telegram'>('generate');
  const [keys, setKeys] = useState<LicenseKey[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate Form State
  const [targetRole, setTargetRole] = useState<UserRole>(
    session.role === 'reseller' ? 'user' : 'user'
  );
  const [durationOption, setDurationOption] = useState<string>('7'); // '1h', '1', '7', '30', 'lifetime'
  const [noteInput, setNoteInput] = useState('');
  const [generatedKeyResult, setGeneratedKeyResult] = useState<LicenseKey | null>(null);

  // Telegram Config State
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    botToken: '',
    adminChatId: '',
    enabled: false,
  });

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/keys', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (data.success) {
        setKeys(data.keys || []);
      }
    } catch {
      onShowToast('Gagal memuat daftar key.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTelegramConfig = async () => {
    if (session.role !== 'admin') return;
    try {
      const res = await fetch('/api/auth/telegram/config', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const data = await res.json();
      if (data.success && data.config) {
        setTelegramConfig(data.config);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchKeys();
    if (session.role === 'admin') {
      fetchTelegramConfig();
    }
  }, []);

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGeneratedKeyResult(null);

    let durationValue = 7;
    let unit: 'minute' | 'hour' | 'day' | 'month' | 'lifetime' = 'day';

    if (durationOption === '30m') {
      durationValue = 30;
      unit = 'minute';
    } else if (durationOption === '1h') {
      durationValue = 1;
      unit = 'hour';
    } else if (durationOption === '2h') {
      durationValue = 2;
      unit = 'hour';
    } else if (durationOption === 'lifetime') {
      durationValue = -1;
      unit = 'lifetime';
    } else {
      durationValue = Number(durationOption) || 7;
      unit = 'day';
    }

    try {
      const res = await fetch('/api/auth/keys/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          role: targetRole,
          duration: durationValue,
          unit,
          note: noteInput.trim(),
        }),
      });

      const data = await res.json();
      if (data.success && data.key) {
        setGeneratedKeyResult(data.key);
        onShowToast(`Key ${data.key.key} berhasil dibuat!`, 'success');
        setNoteInput('');
        fetchKeys();
      } else {
        onShowToast(data.message || 'Gagal membuat key.', 'error');
      }
    } catch {
      onShowToast('Gagal menghubungi server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (
    targetKey: string,
    action: 'ban' | 'unban' | 'reset_ip' | 'delete' | 'extend',
    extendDays: number = 7
  ) => {
    try {
      const res = await fetch('/api/auth/keys/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ targetKey, action, extendDays }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(data.message, 'success');
        fetchKeys();
      } else {
        onShowToast(data.message || 'Gagal memproses aksi.', 'error');
      }
    } catch {
      onShowToast('Gagal menghubungi server.', 'error');
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/telegram/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(telegramConfig),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast('Konfigurasi bot Telegram berhasil disimpan!', 'success');
      } else {
        onShowToast(data.message || 'Gagal menyimpan.', 'error');
      }
    } catch {
      onShowToast('Gagal menyimpan Telegram config.', 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onShowToast('Tersalin ke clipboard!', 'success');
  };

  // Determine which roles this user can create
  const allowedRolesToCreate: UserRole[] =
    session.role === 'admin'
      ? ['user', 'reseller', 'partner', 'admin']
      : session.role === 'partner'
        ? ['user', 'reseller']
        : ['user'];

  return (
    <div id="key-manager-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="relative w-full max-w-3xl bg-[#0b101b] border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Key className="w-5 h-5 text-black font-black" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
                Panel Manajemen License Key
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  {session.role.toUpperCase()}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Generate key multi-role, atur durasi, reset device, & bot Telegram
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'generate'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                : 'bg-[#060a12] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Buat Key Baru</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('list');
              fetchKeys();
            }}
            className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'list'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                : 'bg-[#060a12] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Daftar Key ({keys.length})</span>
          </button>

          {session.role === 'admin' && (
            <button
              onClick={() => setActiveTab('telegram')}
              className={`flex-1 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                activeTab === 'telegram'
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                  : 'bg-[#060a12] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Send className="w-4 h-4" />
              <span>Bot Telegram</span>
            </button>
          )}
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto pr-1">
          {/* TAB 1: GENERATE KEY */}
          {activeTab === 'generate' && (
            <form onSubmit={handleGenerateKey} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Role Target */}
                <div>
                  <label className="block text-xs font-bold text-amber-200 uppercase tracking-wider mb-2">
                    Tingkat Akses / Role
                  </label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as UserRole)}
                    className="w-full bg-[#050810] border border-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-amber-100 font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {allowedRolesToCreate.map((r) => (
                      <option key={r} value={r} className="bg-[#0b101b] text-slate-200">
                        Level: {r.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-bold text-amber-200 uppercase tracking-wider mb-2">
                    Masa Aktif / Durasi
                  </label>
                  <select
                    value={durationOption}
                    onChange={(e) => setDurationOption(e.target.value)}
                    className="w-full bg-[#050810] border border-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-amber-100 font-bold focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="30m" className="bg-[#0b101b]">⚡ 30 Menit (Tes / Quick Trial)</option>
                    <option value="1h" className="bg-[#0b101b]">⚡ 1 Jam (Trial / Tes)</option>
                    <option value="2h" className="bg-[#0b101b]">⚡ 2 Jam (Trial)</option>
                    <option value="1" className="bg-[#0b101b]">📅 1 Hari (24 Jam)</option>
                    <option value="7" className="bg-[#0b101b]">📅 7 Hari (1 Minggu)</option>
                    <option value="30" className="bg-[#0b101b]">📅 30 Hari (1 Bulan)</option>
                    {session.role === 'admin' && (
                      <option value="lifetime" className="bg-[#0b101b]">👑 Permanen / Lifetime</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Note / Customer Name */}
              <div>
                <label className="block text-xs font-bold text-amber-200 uppercase tracking-wider mb-2">
                  Catatan / Nama Pembeli (Opsional)
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Contoh: Pembeli VIP WA - Budi Santoso"
                  className="w-full bg-[#050810] border border-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
              >
                <Key className="w-4 h-4 fill-black" />
                <span>GENERATE LICENSE KEY</span>
              </button>

              {/* Result Showcase */}
              {generatedKeyResult && (
                <div className="mt-4 p-4 bg-amber-950/30 border border-amber-500/60 rounded-2xl animate-in fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Key Berhasil Dibuat!
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded">
                      Role: {generatedKeyResult.role.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-black/60 border border-amber-500/40 rounded-xl p-3">
                    <span className="font-mono font-bold text-sm text-amber-200 tracking-wider">
                      {generatedKeyResult.key}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(generatedKeyResult.key)}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-xs font-black flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>SALIN</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 font-mono">
                    Berlaku sampai: {generatedKeyResult.expiresAt ? new Date(generatedKeyResult.expiresAt).toLocaleString('id-ID') : 'Selamanya (Lifetime)'}
                  </p>
                </div>
              )}
            </form>
          )}

          {/* TAB 2: LIST KEYS */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {loading && <p className="text-xs text-amber-300">Memuat data key...</p>}
              {!loading && keys.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-8">Belum ada key yang dibuat.</p>
              )}
              {keys.map((k) => {
                const isExpired = k.expiresAt !== null && Date.now() > k.expiresAt;
                return (
                  <div
                    key={k.key}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      k.isBanned
                        ? 'bg-red-950/20 border-red-800/40 opacity-75'
                        : isExpired
                          ? 'bg-slate-900/40 border-slate-800 opacity-60'
                          : 'bg-[#060a12] border-amber-500/20 hover:border-amber-500/40'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-amber-200">
                          {k.key}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(k.key)}
                          className="text-slate-400 hover:text-amber-400 p-1"
                          title="Salin Key"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {k.role.toUpperCase()}
                        </span>
                        {k.isBanned ? (
                          <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
                            BANNED
                          </span>
                        ) : isExpired ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                            EXPIRED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                            AKTIF
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono gap-2 border-t border-slate-800/80 pt-2">
                      <div>
                        <span>Exp: {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('id-ID') : 'Lifetime'}</span>
                        {k.boundIp && <span className="ml-2 text-amber-400/80">IP: {k.boundIp}</span>}
                        {k.note && <span className="ml-2 text-slate-400">({k.note})</span>}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {k.boundIp && (
                          <button
                            type="button"
                            onClick={() => handleAction(k.key, 'reset_ip')}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-[10px] cursor-pointer"
                            title="Reset Binding Device/IP"
                          >
                            Reset Device
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAction(k.key, 'extend', 7)}
                          className="px-2 py-1 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-800/40 rounded text-[10px] cursor-pointer"
                          title="Perpanjang 7 Hari"
                        >
                          +7 Hari
                        </button>
                        {k.isBanned ? (
                          <button
                            type="button"
                            onClick={() => handleAction(k.key, 'unban')}
                            className="px-2 py-1 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800 rounded text-[10px] cursor-pointer"
                          >
                            Unban
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAction(k.key, 'ban')}
                            className="px-2 py-1 bg-red-950/50 hover:bg-red-900/60 text-red-300 border border-red-800 rounded text-[10px] cursor-pointer"
                          >
                            Ban
                          </button>
                        )}
                        {session.role === 'admin' && k.key !== 'SPAMMER-ADMIN-MASTER-VIP' && (
                          <button
                            type="button"
                            onClick={() => handleAction(k.key, 'delete')}
                            className="p-1 text-slate-500 hover:text-red-400 cursor-pointer"
                            title="Hapus Key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: TELEGRAM BOT */}
          {activeTab === 'telegram' && session.role === 'admin' && (
            <form onSubmit={handleSaveTelegram} className="space-y-4">
              <div className="p-3.5 bg-blue-950/20 border border-blue-800/40 rounded-xl text-xs text-blue-200 flex items-start gap-2">
                <Send className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Integrasi Bot Telegram Auto-Generate Key</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Dapatkan token bot dari <b>@BotFather</b> dan masukkan Admin Chat ID Anda dari <b>@userinfobot</b>.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-200 uppercase tracking-wider mb-2">
                  Bot Token Telegram
                </label>
                <input
                  type="text"
                  value={telegramConfig.botToken}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full bg-[#050810] border border-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-200 uppercase tracking-wider mb-2">
                  Admin Chat ID Telegram
                </label>
                <input
                  type="text"
                  value={telegramConfig.adminChatId}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, adminChatId: e.target.value })}
                  placeholder="Contoh: 1234567890"
                  className="w-full bg-[#050810] border border-amber-500/30 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enable-telegram"
                  checked={telegramConfig.enabled}
                  onChange={(e) => setTelegramConfig({ ...telegramConfig, enabled: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
                <label htmlFor="enable-telegram" className="text-xs font-bold text-amber-200">
                  Aktifkan Polling Bot Telegram
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-amber-500/20"
              >
                SIMPAN KONFIGURASI TELEGRAM
              </button>

              <div className="p-3 bg-[#060a12] border border-slate-800 rounded-xl text-[11px] text-slate-400 font-mono space-y-1">
                <p className="text-amber-300 font-bold">Daftar Perintah Bot Telegram:</p>
                <p>• <code>/genkey user 7 Catatan</code> - Buat key user 7 hari</p>
                <p>• <code>/genkey reseller 30</code> - Buat key reseller 30 hari</p>
                <p>• <code>/cekkey &lt;key&gt;</code> - Cek masa aktif & info key</p>
                <p>• <code>/extend &lt;key&gt; 7</code> - Tambah 7 hari masa aktif</p>
                <p>• <code>/resetkey &lt;key&gt;</code> - Reset bind IP/Device</p>
                <p>• <code>/bankey &lt;key&gt;</code> - Blokir key</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
