import React from 'react';
import { Flame, Key, LogOut, ShieldCheck, Globe } from 'lucide-react';
import { AuthSession } from '../types/auth';

interface ProxyConfig {
  enabled: boolean;
  mode: 'auto' | 'custom';
  customProxies: string[];
}

interface NavbarProps {
  session: AuthSession | null;
  isRunning?: boolean;
  countdown?: number | null;
  currentRound?: number;
  proxyConfig?: ProxyConfig;
  onOpenProxyManager?: () => void;
  onOpenKeyManager: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  session,
  isRunning = false,
  countdown = null,
  currentRound = 0,
  proxyConfig,
  onOpenProxyManager,
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
        <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
          {/* Proxy Rotator Button */}
          {onOpenProxyManager && (
            <button
              id="btn-open-proxy-manager"
              type="button"
              onClick={onOpenProxyManager}
              className={`border rounded-lg px-2.5 sm:px-3 py-1.5 flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                proxyConfig?.enabled
                  ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/40 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-slate-200'
              }`}
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 ${
                  proxyConfig?.enabled ? 'text-emerald-400' : 'text-slate-400'
                }`}
              />
              <span className="hidden sm:inline">
                {proxyConfig?.enabled ? 'PROXY ROTATOR' : 'DIRECT IP'}
              </span>
              <span className="sm:hidden">
                {proxyConfig?.enabled ? 'PROXY' : 'DIRECT'}
              </span>
            </button>
          )}

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
