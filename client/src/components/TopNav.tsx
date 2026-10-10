import React from 'react';
import { UserProfile } from '../types.js';
import { Menu, Coins, CheckCircle2 } from 'lucide-react';
import { hapticSelection } from '../utils/telegram.js';

interface TopNavProps {
  user: UserProfile | null;
  onOpenMenu: () => void;
  onOpenTasks: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ user, onOpenMenu, onOpenTasks }) => {
  const coins = user?.coins ?? 1500;
  const level = user?.level ?? 1;
  const tasksProgress = user?.tasksProgress ?? '0 из 3 заданий';

  return (
    <header className="w-full flex items-center justify-between py-3 px-4 sm:px-6 border-b border-white/5 bg-[#08090C]/80 backdrop-blur-md sticky top-0 z-40 select-none">
      {/* Left: Menu & User Avatar with Level */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            hapticSelection();
            onOpenMenu();
          }}
          className="p-2 rounded-xl bg-[#14171F] border border-white/10 hover:border-white/20 active:scale-95 transition-all text-white/90"
          aria-label="Меню"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-neutral-800 to-neutral-700 border border-white/20 flex items-center justify-center font-bold text-xs text-white uppercase overflow-hidden shadow-sm">
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                user?.username?.slice(0, 2) || 'VIP'
              )}
            </div>
            {/* Level indicator pill */}
            <div className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded-full bg-[#1E2330] border border-white/20 text-[9px] font-mono font-bold text-amber-400">
              {level}
            </div>
          </div>

          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white/90 truncate max-w-[100px] sm:max-w-[140px]">
              {user?.firstName || user?.username || 'VIP Игрок'}
            </span>
            <span className="text-[10px] text-white/40 font-mono">
              VIP Plastic
            </span>
          </div>
        </div>
      </div>

      {/* Right: Ruble Balance & Tasks progress pill (with safe margin for Telegram native buttons) */}
      <div className="flex flex-col items-end gap-1 pr-14 sm:pr-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 shadow-sm backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
          <span className="font-mono font-bold text-sm tracking-tight text-white">
            {coins.toLocaleString('ru-RU')}
          </span>
          <span className="text-xs font-semibold text-amber-300 font-mono">₽</span>
        </div>

        {/* Compact tasks progress */}
        <button
          onClick={() => {
            hapticSelection();
            onOpenTasks();
          }}
          className="flex items-center gap-1 text-[10px] font-medium text-emerald-400/90 hover:text-emerald-300 transition-colors pr-0.5"
        >
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
          <span>{tasksProgress}</span>
        </button>
      </div>
    </header>
  );
};
