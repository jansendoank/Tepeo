import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Flame,
  Key,
  Lock,
  Shield,
  Sparkles,
} from 'lucide-react';
import { AuthSession } from '../types/auth';

interface LoginPageProps {
  onLoginSuccess: (session: AuthSession) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [keyInput, setKeyInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      setErrorMsg('Masukkan License Key Anda!');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: keyInput.trim() }),
      });

      const data = await res.json();

      if (data.success && data.session) {
        setSuccessMsg(`Login Berhasil! Role: ${data.session.role.toUpperCase()}`);
        setTimeout(() => {
          onLoginSuccess(data.session);
        }, 500);
      } else {
        setErrorMsg(data.message || 'License key tidak valid atau kadaluarsa.');
      }
    } catch {
      setErrorMsg('Gagal menghubungi server autentikasi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-page-screen" className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden selection:bg-amber-400 selection:text-black">
      {/* Background Glows (Theme bcb88ong Luxury) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-600/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Main Login Card */}
      <div className="relative w-full max-w-md bg-[#0b101b]/95 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/90 backdrop-blur-xl z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          {/* Custom Header Video */}
          <div className="w-full max-w-[280px] h-40 sm:h-44 rounded-2xl overflow-hidden border border-amber-500/40 shadow-2xl shadow-amber-500/20 mb-3 relative bg-black">
            <video
              src="https://c.termai.cc/v140/J5OnSm.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0b101b] via-transparent to-transparent opacity-40 pointer-events-none" />
          </div>

          <h1 className="text-3xl font-black uppercase tracking-widest bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow">
            spammer
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono font-bold uppercase tracking-wider">
              VIP GATEWAY ACCESS
            </span>
          </div>
        </div>

        {/* Error / Success Alert */}
        {errorMsg && (
          <div className="mb-4 p-3.5 bg-red-950/50 border border-red-800/70 rounded-xl flex items-center gap-2.5 text-xs text-red-200 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3.5 bg-emerald-950/50 border border-emerald-800/70 rounded-xl flex items-center gap-2.5 text-xs text-emerald-200 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-amber-200/90 uppercase tracking-wider mb-2">
              Masukkan License Key
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-amber-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                id="login-license-key-input"
                type="text"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="SPAMMER-VIP-XXXX-XXXX"
                disabled={loading}
                className="w-full bg-[#050810] border border-amber-500/30 rounded-xl pl-10 pr-4 py-3.5 text-sm font-mono text-amber-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition-all uppercase tracking-wider shadow-inner"
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1.5 font-mono">
              <span>Sistem Single Device Lock</span>
              <span className="text-amber-400/90">1 Key = 1 IP</span>
            </div>
          </div>

          <button
            id="btn-login-submit"
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 active:from-amber-600 active:to-yellow-500 text-black font-black text-sm tracking-widest uppercase transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/30 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                MEMVERIFIKASI KEY...
              </span>
            ) : (
              <>
                <Lock className="w-4 h-4 fill-black" />
                <span>MASUK KE SISTEM</span>
              </>
            )}
          </button>
        </form>

        {/* Mandatory Disclaimer */}
        <div className="mt-5 p-3 bg-red-950/20 border border-red-800/40 rounded-xl text-[10px] text-red-300/90 text-center leading-relaxed font-medium">
          Note semua resiko di tanggung pengguna, admin, developer tidak bertanggung jawab atas apa yg kalian lakukan.
        </div>
      </div>
    </div>
  );
};
