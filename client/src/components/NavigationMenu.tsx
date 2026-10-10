import React from 'react';
import { X, CreditCard, Layers, BookOpen, Gift, ShoppingBag, User, Sparkles } from 'lucide-react';
import { hapticSelection } from '../utils/telegram.js';

export type NavScreen = 'mint' | 'collection' | 'albums' | 'tasks' | 'shop' | 'profile';

interface NavigationMenuProps {
  currentScreen: NavScreen;
  onSelectScreen: (screen: NavScreen) => void;
  onClose: () => void;
}

export const NavigationMenu: React.FC<NavigationMenuProps> = ({
  currentScreen,
  onSelectScreen,
  onClose,
}) => {
  const menuItems: { id: NavScreen; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'mint', label: 'Выпуск карт', icon: <CreditCard className="w-5 h-5 text-emerald-400" /> },
    { id: 'collection', label: 'Коллекция', icon: <Layers className="w-5 h-5 text-cyan-400" /> },
    { id: 'albums', label: 'Альбомы', icon: <BookOpen className="w-5 h-5 text-amber-400" /> },
    { id: 'tasks', label: 'Задания', icon: <Gift className="w-5 h-5 text-purple-400" />, badge: '500 C' },
    { id: 'shop', label: 'Магазин Stars', icon: <ShoppingBag className="w-5 h-5 text-amber-300" />, badge: 'VIP' },
    { id: 'profile', label: 'Профиль и Рейтинг', icon: <User className="w-5 h-5 text-blue-400" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#12151D] border border-white/15 p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider font-mono">
              CardDrop Навигация
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          {menuItems.map((item) => {
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  hapticSelection();
                  onSelectScreen(item.id);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all ${
                  isActive
                    ? 'bg-white/15 text-white border border-white/20 shadow-md'
                    : 'text-white/70 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-xl bg-white/5">{item.icon}</div>
                  <span className="font-bold text-sm">{item.label}</span>
                </div>

                {item.badge && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
