import React from 'react';
import { UserProfile } from '../types.js';
import { NavScreen } from './NavigationMenu.js';
import { Menu, CheckCircle2, Settings } from 'lucide-react';
import { hapticSelection } from '../utils/telegram.js';

interface TopNavProps {
  user: UserProfile | null;
  currentScreen: NavScreen;
  onSelectScreen: (screen: NavScreen) => void;
  onOpenMenu: () => void;
  onOpenTasks: () => void;
  onOpenSettings: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  user,
  currentScreen,
  onSelectScreen,
  onOpenMenu,
  onOpenTasks,
  onOpenSettings,
}) => {
  const coins = user?.coins ?? 1500;
  const level = user?.level ?? 1;
  const tasksProgress = user?.tasksProgress ?? '0 из 3 заданий';

  return (
    <header className="w-full border-b border-white/5 bg-[#08090C]/90 backdrop-blur-md sticky top-0 z-40 select-none">
      {/* Clean, Non-overloaded Single Bar: Menu on Left, Balance Dead Center, Settings/Avatar on Right */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between py-2 px-3 sm:px-4 relative h-14">
        {/* Left: Menu Burger Button [☰] */}
        <div className="flex items-center gap-2 z-10 shrink-0">
          <button
            onClick={() => {
              hapticSelection();
              onOpenMenu();
            }}
            className="p-2.5 rounded-2xl bg-[#141722] border border-white/10 hover:border-white/20 active:scale-95 transition-all text-white/90 shadow-sm flex items-center gap-2"
            aria-label="Меню"
          >
            <Menu className="w-5 h-5 text-white" />
            <span className="text-xs font-mono font-bold text-white/80 hidden xs:inline">Меню</span>
          </button>
        </div>

        {/* Center: Prominent Minimal Ruble Balance (Dead-Centered via Absolute Position) */}
        <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center text-center pointer-events-auto">
          <div className="flex items-baseline gap-1 bg-[#131622]/95 border border-white/10 px-4 py-1 rounded-2xl shadow-inner backdrop-blur-sm">
            <span className="font-mono font-black text-base sm:text-lg tracking-tight text-white drop-shadow-sm">
              {coins.toLocaleString('ru-RU')}
            </span>
            <span className="text-sm font-black text-amber-400 font-mono">₽</span>
          </div>

          {/* Compact tasks indicator */}
          <button
            onClick={() => {
              hapticSelection();
              onOpenTasks();
            }}
            className="flex items-center gap-1 text-[10px] font-medium text-emerald-400/90 hover:text-emerald-300 transition-colors mt-0.5"
          >
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span className="font-mono">{tasksProgress}</span>
          </button>
        </div>

        {/* Right: Settings [⚙️] & Compact Profile Avatar */}
        {/* Right: Prefix Badge, Settings [⚙️] & Compact Profile Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2 z-10 shrink-0">
          {user?.prefix && (
            <span className="px-1.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono font-bold tracking-wider">
              {user.prefix}
            </span>
          )}
          <button
            onClick={() => {
              hapticSelection();
              onOpenSettings();
            }}
            className="p-2 rounded-2xl bg-[#141722] border border-white/10 hover:border-white/20 active:scale-95 transition-all text-white/80 shadow-sm"
            aria-label="Настройки"
          >
            <Settings className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            onClick={() => {
              hapticSelection();
              onSelectScreen('profile');
            }}
            className="relative"
            aria-label="Профиль"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-neutral-800 to-neutral-700 border border-white/20 flex items-center justify-center font-bold text-[10px] text-white uppercase overflow-hidden shadow-sm">
              {user?.photoUrl ? (
                <img src={user.photoUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                user?.username?.slice(0, 2) || 'CD'
              )}
            </div>
            {/* Level indicator pill */}
            <div className="absolute -bottom-1 -right-1 px-1 rounded-full bg-[#1E2330] border border-white/20 text-[8px] font-mono font-bold text-amber-400">
              {level}
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
