import React from 'react';
import {
  X,
  CreditCard,
  Layers,
  BookOpen,
  Gift,
  ShoppingBag,
  User,
  Sparkles,
  Store,
  Shield,
  FileText,
  ChevronRight,
  Flame,
  Coins,
} from 'lucide-react';
import { hapticSelection } from '../utils/telegram.js';

export type NavScreen =
  | 'mint'
  | 'collection'
  | 'avita'
  | 'earn'
  | 'albums'
  | 'tasks'
  | 'shop'
  | 'profile';

interface NavigationMenuProps {
  currentScreen: NavScreen;
  onSelectScreen: (screen: NavScreen) => void;
  onClose: () => void;
  onOpenRules: () => void;
  onOpenPrivacy: () => void;
}

export const NavigationMenu: React.FC<NavigationMenuProps> = ({
  currentScreen,
  onSelectScreen,
  onClose,
  onOpenRules,
  onOpenPrivacy,
}) => {
  // Primary Core Sections (Featured at the top)
  const primaryItems: {
    id: NavScreen;
    title: string;
    subtitle: string;
    badge: string;
    icon: React.ReactNode;
    glowBorder: string;
    bgGradient: string;
    accentText: string;
  }[] = [
    {
      id: 'mint',
      title: 'Выпуск карт',
      subtitle: 'Терминал крутки • Кейсы от 0 ₽ до 5 000 ₽',
      badge: 'ГЛАВНАЯ',
      icon: <CreditCard className="w-5 h-5 text-emerald-400" />,
      glowBorder: 'border-emerald-500/40 hover:border-emerald-400 shadow-emerald-950/30',
      bgGradient: 'from-emerald-950/40 via-[#131722] to-[#10121A]',
      accentText: 'text-emerald-400',
    },
    {
      id: 'earn',
      title: 'Заработок ₽ (Кликер)',
      subtitle: '3D монета рубля • Энергия и прокачка',
      badge: 'ДОХОД',
      icon: <Coins className="w-5 h-5 text-yellow-400" />,
      glowBorder: 'border-yellow-500/40 hover:border-yellow-400 shadow-yellow-950/30',
      bgGradient: 'from-yellow-950/40 via-[#181720] to-[#10121A]',
      accentText: 'text-yellow-400',
    },
    {
      id: 'avita',
      title: '«Авита» (Скупщик)',
      subtitle: 'Продажа карт за рубли • Торг',
      badge: 'РЫНОК',
      icon: <Store className="w-5 h-5 text-amber-400" />,
      glowBorder: 'border-amber-500/40 hover:border-amber-400 shadow-amber-950/30',
      bgGradient: 'from-amber-950/40 via-[#161720] to-[#10121A]',
      accentText: 'text-amber-400',
    },
    {
      id: 'collection',
      title: 'Коллекция',
      subtitle: 'Все ваши карты, дубликаты и топ',
      badge: 'ИНВЕНТАРЬ',
      icon: <Layers className="w-5 h-5 text-cyan-400" />,
      glowBorder: 'border-cyan-500/40 hover:border-cyan-400 shadow-cyan-950/30',
      bgGradient: 'from-cyan-950/40 via-[#121622] to-[#10121A]',
      accentText: 'text-cyan-400',
    },
  ];

  // Secondary Sections
  const secondaryItems: {
    id: NavScreen;
    label: string;
    desc: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      id: 'albums',
      label: 'Альбомы',
      desc: 'Тематические сеты и награды',
      icon: <BookOpen className="w-4 h-4 text-amber-300" />,
    },
    {
      id: 'tasks',
      label: 'Задания',
      desc: 'Ежедневные бонусы за спины',
      icon: <Gift className="w-4 h-4 text-purple-400" />,
      badge: 'Награды',
    },
    {
      id: 'shop',
      label: 'Магазин Stars',
      desc: 'Пополнение баланса за Telegram Stars',
      icon: <ShoppingBag className="w-4 h-4 text-amber-400" />,
      badge: 'VIP',
    },
    {
      id: 'profile',
      label: 'Профиль и Рейтинг',
      desc: 'Статистика, уровень и лидерборд',
      icon: <User className="w-4 h-4 text-blue-400" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#10121A] border border-white/15 p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider font-mono">
              Навигация CardDrop
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TOP SECTION: Featured Core Actions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Главные разделы</span>
          </div>

          <div className="flex flex-col gap-2">
            {primaryItems.map((item) => {
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    hapticSelection();
                    onSelectScreen(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left relative overflow-hidden bg-gradient-to-r ${item.bgGradient} ${
                    isActive
                      ? `${item.glowBorder} ring-1 ring-white/30 shadow-lg`
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-white/10 border border-white/10 shadow-sm shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{item.title}</span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,1)]" />
                        )}
                      </div>
                      <span className="text-[11px] text-white/60 font-sans mt-0.5">
                        {item.subtitle}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-white/10 text-white/90 border border-white/15">
                      {item.badge}
                    </span>
                    <ChevronRight className="w-4 h-4 text-white/40" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* SECONDARY SECTION: Additional Features */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
          <span className="px-1 text-[11px] font-mono uppercase tracking-wider text-white/40 mb-1">
            Другие активности
          </span>

          <div className="grid grid-cols-1 gap-1">
            {secondaryItems.map((item) => {
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    hapticSelection();
                    onSelectScreen(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'text-white/70 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-lg bg-white/5 shrink-0">{item.icon}</div>
                    <div className="flex flex-col text-left">
                      <span className="font-semibold text-xs text-white">{item.label}</span>
                      <span className="text-[10px] text-white/40">{item.desc}</span>
                    </div>
                  </div>

                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Legal & Info Links */}
        <div className="flex items-center justify-around pt-3 border-t border-white/10 text-xs text-white/40">
          <button
            onClick={() => {
              onClose();
              onOpenRules();
            }}
            className="flex items-center gap-1 hover:text-amber-400 transition-colors py-1 px-2"
          >
            <FileText className="w-3.5 h-3.5" />
            Правила
          </button>
          <span>•</span>
          <button
            onClick={() => {
              onClose();
              onOpenPrivacy();
            }}
            className="flex items-center gap-1 hover:text-emerald-400 transition-colors py-1 px-2"
          >
            <Shield className="w-3.5 h-3.5" />
            Конфиденциальность
          </button>
        </div>
      </div>
    </div>
  );
};
