import React from 'react';
import { X, BookOpen, ShieldCheck, Zap, Sparkles } from 'lucide-react';

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn select-none">
      <div className="w-full max-w-sm rounded-3xl bg-[#12151D] border border-white/15 p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm text-white">Правила игры CardDrop</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-white/50 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-white/80 leading-relaxed font-sans">
          <div>
            <h4 className="font-bold text-amber-300 flex items-center gap-1 mb-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> 1. Выпуск карт
            </h4>
            <p className="text-white/60">
              Стандартный выпуск стоит <strong>500 Coins</strong>. Карта генерируется случайным образом: 5 банков, 6 материалов (от Classic Plastic до Holographic) и 7 категорий номеров (Пара, Тройка, Каре, Стрит, Зеркало).
            </p>
          </div>

          <div>
            <h4 className="font-bold text-emerald-400 flex items-center gap-1 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> 2. Бесплатный режим («БОМЖ»)
            </h4>
            <p className="text-white/60">
              Если баланс падает ниже 500 Coins, активируется бесплатный режим: до <strong>150 выпусков в сутки</strong> с кулдауном 30 секунд. Карты бесплатного режима нельзя продать скупщику Авите.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-amber-400 flex items-center gap-1 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> 3. Скупщик «Авита»
            </h4>
            <p className="text-white/60">
              Виртуальный торговец покупает карты за Coins. Оценка зависит от материала, редкости и рейтинга. Доступен торг до 3 раундов. При срыве сделки или чрезмерных требованиях Авита блокирует торг на <strong>120 секунд</strong> (таймер сохраняется на сервере).
            </p>
          </div>

          <div>
            <h4 className="font-bold text-cyan-400 flex items-center gap-1 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> 4. Telegram Stars
            </h4>
            <p className="text-white/60">
              Звёзды используются исключительно для косметических предметов профиля (холдеры, рамки, эффекты выпадения). Покупки не влияют на баланс монет и игровой процесс.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-2 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider transition-all"
        >
          Понятно
        </button>
      </div>
    </div>
  );
};
