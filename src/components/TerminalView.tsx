import React from 'react';
import { Copy, Terminal as TerminalIcon } from 'lucide-react';

export interface LogEntry {
  id: string;
  round: number;
  platform_id: number;
  platform_name: string;
  status: 'SUCCESS' | 'LIMIT' | 'FAIL' | 'TIMEOUT' | 'INFO';
  detail: string;
  timestamp: string;
}

interface TerminalViewProps {
  logs: LogEntry[];
  isRunning: boolean;
  currentRound: number;
  countdown: number | null;
  onClearLogs: () => void;
  onCopyLogs: () => void;
  terminalEndRef: React.RefObject<HTMLDivElement | null>;
}

export const TerminalView: React.FC<TerminalViewProps> = ({
  logs,
  isRunning,
  currentRound,
  countdown,
  onClearLogs,
  onCopyLogs,
  terminalEndRef,
}) => {
  return (
    <div id="terminal-wrapper" className="bg-[#0b101b] border border-amber-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col flex-1 min-h-[560px]">
      {/* Header */}
      <div className="bg-[#060a12] px-4 py-3 border-b border-amber-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
          </div>
          <span className="text-xs font-mono text-slate-400 ml-2 font-medium flex items-center gap-1.5">
            <TerminalIcon className="w-3.5 h-3.5 text-amber-400" />
            spammer-live.log
          </span>
        </div>

        <div className="flex items-center gap-3">
          {countdown !== null && (
            <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded animate-pulse">
              Next Cycle: {countdown}s
            </span>
          )}
          {isRunning && (
            <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              Round #{currentRound}
            </span>
          )}
          <button
            id="btn-clear-logs"
            type="button"
            onClick={onClearLogs}
            className="text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors bg-slate-900 border border-slate-800 hover:border-slate-700 px-2 py-1 rounded cursor-pointer"
          >
            Clear
          </button>
          <button
            id="btn-copy-logs"
            type="button"
            onClick={onCopyLogs}
            className="text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors bg-slate-900 border border-slate-800 hover:border-slate-700 px-2 py-1 rounded cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logs Window */}
      <div
        id="terminal-stream-body"
        className="flex-1 p-4 bg-[#050810] font-mono text-xs overflow-y-auto space-y-1.5 min-h-[480px] max-h-[640px] select-text"
      >
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 py-24 text-center space-y-2">
            <TerminalIcon className="w-10 h-10 text-amber-500/30 animate-pulse" />
            <p className="text-xs">Terminal siap. Masukkan target & tekan tombol "JALANKAN PROSES".</p>
            <p className="text-[10px] text-slate-600">Real-time Server-Sent Events (SSE) aktif terhubung.</p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 leading-relaxed hover:bg-slate-900/60 px-2 py-1 rounded transition-colors"
            >
              <span className="text-slate-600 shrink-0 text-[10px] mt-0.5">[{log.timestamp}]</span>
              {log.round > 0 && <span className="text-amber-400 text-[10px] font-semibold shrink-0">R-{log.round}</span>}
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  log.status === 'SUCCESS'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : log.status === 'LIMIT'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : log.status === 'FAIL'
                        ? 'bg-red-950 text-red-400 border border-red-800'
                        : 'bg-blue-950 text-blue-400 border border-blue-800'
                }`}
              >
                {log.status}
              </span>
              <span className="text-slate-300 font-semibold shrink-0">
                {log.platform_name}:
              </span>
              <span
                className={`break-all ${
                  log.status === 'SUCCESS'
                    ? 'text-emerald-300'
                    : log.status === 'LIMIT'
                      ? 'text-amber-300'
                      : 'text-red-300'
                }`}
              >
                {log.detail}
              </span>
            </div>
          ))
        )}
        <div ref={terminalEndRef as any} />
      </div>
    </div>
  );
};
