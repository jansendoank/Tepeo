import React from 'react';
import { Flame, Key, LogOut } from 'lucide-react';
import { AuthSession } from '../types/auth';

interface NavbarProps {
  session: AuthSession | null;
  isRunning?: boolean;
  countdown?: number | null;
  currentRound?: number;
  onOpenKeyManager: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  session,
  isRunning = false,
  countdown = null,
  currentRound = 0,
  onOpenKeyManager,
  onLogout,
}) => {
  return (
    <header
      id="main-navbar"
      className="border-b border-amber-500/20 bg-[#0c121e]/90 backdrop-blur-md sticky top-0 z-40 shadow-xl shadow-black/40"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Role */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-amber-500/25 ring-1 ring-amber-300/40">
            <Flame className="w-5 h-5 text-black font-black animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-widest text-lg sm:text-xl uppercase bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 bg-clip-text text-transparent drop-shadow">
                spammer
              </span>
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono font-bold uppercase tracking-wider shadow-sm">
                {session ? session.role : 'PRO VIP'}
              </span>
            </div>
          </div>
        </div>

        {/* Controls / Status */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs font-mono">
          {session && ['admin', 'partner', 'reseller'].includes(session.role) && (
            <button
              id="btn-open-key-manager"
              type="button"
              onClick={onOpenKeyManager}
              className="bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 text-amber-300 rounded-lg px-3 py-1.5 flex items-center gap-1.5 font-bold transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>KELOLA KEY</span>
            </button>
          )}

          <div
            id="status-indicator-badge"
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wide flex items-center gap-2 border ${
              isRunning
                ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-sm shadow-red-500/20'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning ? 'bg-red-400 animate-ping' : 'bg-emerald-400'
              }`}
            />
            <span>{isRunning ? (countdown ? `JEDA (${countdown}s)` : `AKTIF (R-${currentRound})`) : 'SIAP'}</span>
          </div>

          {session && (
            <button
              id="btn-logout"
              type="button"
              onClick={onLogout}
              title="Keluar / Logout"
              className="bg-red-950/40 border border-red-800/60 hover:bg-red-900/60 text-red-300 rounded-lg p-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
