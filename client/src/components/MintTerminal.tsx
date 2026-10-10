import React, { useState, useEffect } from 'react';
import { Card, UserProfile } from '../types.js';
import { CardPreview } from './CardPreview.js';
import { api } from '../utils/api.js';
import { hapticImpact, hapticNotification } from '../utils/telegram.js';
import confetti from 'canvas-confetti';
import { Play, RotateCw, AlertTriangle, Sparkles, SlidersHorizontal, X, FastForward } from 'lucide-react';

interface MintTerminalProps {
  user: UserProfile | null;
  onRefreshUser: () => void;
  onOpenCardDetails: (card: Card) => void;
}

export const MintTerminal: React.FC<MintTerminalProps> = ({
  user,
  onRefreshUser,
  onOpenCardDetails,
}) => {
  const [latestCard, setLatestCard] = useState<Card | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Free roll cooldown timer
  const [cooldown, setCooldown] = useState(user?.freeRollCooldownSeconds || 0);

  // Auto-roll state
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoSpinCount, setAutoSpinCount] = useState(10);
  const [isAutoRolling, setIsAutoRolling] = useState(false);
  const [autoSummary, setAutoSummary] = useState<{
    completed: number;
    cards: Card[];
    stoppedReason: string;
  } | null>(null);

  useEffect(() => {
    if (user?.freeRollCooldownSeconds !== undefined) {
      setCooldown(user.freeRollCooldownSeconds);
    }
  }, [user?.freeRollCooldownSeconds]);

  // Tick down cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const coins = user?.coins ?? 1500;
  const isBomzhMode = coins < 500;
  const freeRollsLeft = (user?.maxFreeRolls || 150) - (user?.freeRollsToday || 0);

  // Handle Regular Roll (500 Coins)
  const handleRegularIssue = async () => {
    if (isRolling || isAutoRolling) return;
    if (coins < 500) {
      setErrorMessage('Недостаточно средств для стандартного выпуска');
      hapticNotification('error');
      return;
    }

    setErrorMessage(null);
    setIsRolling(true);
    hapticImpact('heavy');

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await api.issueCard(requestId);
      setPendingCard(res.card);
      onRefreshUser();
    } catch (err: any) {
      setIsRolling(false);
      setErrorMessage(err.message || 'Ошибка при выпуске карты');
      hapticNotification('error');
    }
  };

  // Handle Free Roll (BOMZH)
  const handleFreeIssue = async () => {
    if (isRolling || isAutoRolling) return;
    if (cooldown > 0) {
      setErrorMessage(`Подождите еще ${cooldown} сек.`);
      hapticNotification('warning');
      return;
    }
    if (freeRollsLeft <= 0) {
      setErrorMessage('Суточный лимит 150 бесплатных выпусков исчерпан');
      hapticNotification('error');
      return;
    }

    setErrorMessage(null);
    setIsRolling(true);
    hapticImpact('heavy');

    const requestId = `free_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await api.freeIssueCard(requestId);
      setPendingCard(res.card);
      setCooldown(30);
      onRefreshUser();
    } catch (err: any) {
      setIsRolling(false);
      setErrorMessage(err.message || 'Ошибка бесплатного выпуска');
      hapticNotification('error');
    }
  };

  // Handle Auto-Roll (Batch up to 100 spins, fast)
  const handleStartAutoRoll = async () => {
    if (coins < 500) {
      setErrorMessage('Недостаточно средств для запуска автопрокрута');
      hapticNotification('error');
      return;
    }

    setShowAutoModal(false);
    setIsAutoRolling(true);
    setErrorMessage(null);
    hapticImpact('heavy');

    const requestId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await api.autoIssueCards(autoSpinCount, requestId);
      setAutoSummary({
        completed: res.spinsCompleted,
        cards: res.cards,
        stoppedReason: res.stoppedReason,
      });

      if (res.cards.length > 0) {
        setLatestCard(res.cards[res.cards.length - 1]);
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#00FFCC', '#FFFFFF'],
        });
      }

      if (res.stoppedReason === 'Недостаточно средств') {
        setErrorMessage('Автопрокрут остановлен: Недостаточно средств');
        hapticNotification('warning');
      } else {
        hapticNotification('success');
      }

      onRefreshUser();
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка автопрокрута');
      hapticNotification('error');
    } finally {
      setIsAutoRolling(false);
    }
  };

  // Called when ReelAnimation finishes
  const handleReelComplete = () => {
    if (pendingCard) {
      setLatestCard(pendingCard);
      // Confetti for rare drop
      if (['Gold', 'Titanium', 'Holographic'].includes(pendingCard.material) || pendingCard.category !== 'Standard') {
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#00FFCC', '#FFFFFF'],
        });
      }
    }
    setIsRolling(false);
    setPendingCard(null);
  };

  return (
    <div className="w-full flex flex-col items-center justify-between min-h-[calc(100vh-70px)] px-4 py-4 max-w-md mx-auto select-none">
      {/* Error or Warning Banner */}
      {errorMessage && (
        <div className="w-full mb-3 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Central Luxury Card with On-Card Slot Reel Generation */}
      <div className="w-full flex flex-col items-center my-auto py-2">
        <CardPreview
          card={latestCard}
          targetCard={pendingCard}
          isRolling={isRolling && !!pendingCard}
          onRollComplete={handleReelComplete}
          interactive={!isRolling}
          onClick={() => {
            if (isRolling) {
              handleReelComplete();
            } else if (latestCard) {
              onOpenCardDetails(latestCard);
            }
          }}
        />

        {isRolling ? (
          <button
            onClick={handleReelComplete}
            className="text-xs font-mono text-amber-400/90 hover:text-amber-300 bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full mt-3 flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
          >
            <FastForward className="w-3.5 h-3.5 text-amber-400" />
            <span>Пропустить анимацию</span>
          </button>
        ) : latestCard ? (
          <p className="text-[11px] text-white/40 font-mono mt-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400/70" />
            Нажмите на карту для подробного просмотра
          </p>
        ) : null}
      </div>

      {/* Mode & Timer Status Bar */}
      <div className="w-full my-3 flex items-center justify-between px-3 py-2 rounded-xl bg-[#12151D] border border-white/5 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isBomzhMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
            }`}
          />
          <span className="text-white/80 font-medium">
            {isBomzhMode ? 'Режим «БОМЖ» (0 ₽)' : 'Стандартный выпуск (500 ₽)'}
          </span>
        </div>

        {isBomzhMode ? (
          <span className="text-white/60 text-[11px]">
            {cooldown > 0 ? `Таймер: ${cooldown}с` : `Готов (${freeRollsLeft}/150)`}
          </span>
        ) : (
          <span className="text-emerald-400 text-[11px]">Баланс в норме</span>
        )}
      </div>

      {/* 5. Two Compact Panels (Bank & Material of last drop) */}
      <div className="w-full grid grid-cols-2 gap-2 mb-4">
        <div className="flex flex-col p-2.5 rounded-xl bg-[#12151D] border border-white/5">
          <span className="text-[10px] text-white/40 uppercase font-mono">БАНК</span>
          <span className="text-xs font-bold text-white/90 truncate mt-0.5">
            {latestCard ? latestCard.bank : '—'}
          </span>
        </div>

        <div className="flex flex-col p-2.5 rounded-xl bg-[#12151D] border border-white/5">
          <span className="text-[10px] text-white/40 uppercase font-mono">МАТЕРИАЛ</span>
          <span className="text-xs font-bold text-white/90 truncate mt-0.5">
            {latestCard ? latestCard.material : '—'}
          </span>
        </div>
      </div>

      {/* 6. Action Buttons: Main Mint Button & Auto-Roll */}
      <div className="w-full flex flex-col gap-2">
        {/* Main Button */}
        {isBomzhMode ? (
          <button
            onClick={handleFreeIssue}
            disabled={cooldown > 0 || freeRollsLeft <= 0 || isRolling || isAutoRolling}
            className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 ${
              cooldown > 0 || freeRollsLeft <= 0
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-white/5'
                : 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black active:scale-[0.98]'
            }`}
          >
            <RotateCw className={`w-4 h-4 ${isRolling ? 'animate-spin' : ''}`} />
            {cooldown > 0
              ? `ОЖИДАНИЕ ТАЙМЕРА (${cooldown} С)`
              : freeRollsLeft <= 0
              ? 'ЛИМИТ БОМЖ ИСЧЕРПАН'
              : 'БЕСПЛАТНЫЙ ВЫПУСК (0 ₽)'}
          </button>
        ) : (
          <button
            onClick={handleRegularIssue}
            disabled={isRolling || isAutoRolling}
            className="w-full py-4 rounded-2xl font-bold text-sm tracking-wide bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:brightness-110 text-black shadow-[0_8px_25px_rgba(34,197,94,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-emerald-400/30"
          >
            <Play className={`w-4 h-4 fill-black ${isRolling ? 'animate-spin' : ''}`} />
            {isRolling ? 'ВЫПУСК КАРТЫ...' : 'ВЫПУСТИТЬ КАРТУ (500 ₽)'}
          </button>
        )}

        {/* Auto-Roll Trigger Button */}
        <button
          onClick={() => {
            if (coins < 500) {
              setErrorMessage('Недостаточно средств для автопрокрута (нужно от 500 ₽)');
              hapticNotification('error');
              return;
            }
            setShowAutoModal(true);
          }}
          disabled={isRolling || isAutoRolling}
          className="w-full py-2.5 rounded-xl bg-[#14171F] hover:bg-[#1A1F2B] active:scale-[0.98] border border-white/10 text-white/80 text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-2"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
          {isAutoRolling ? 'АВТОПРОКРУТ В ПРОЦЕССЕ...' : 'АВТОПРОКРУТ (ДО 100 КАРТ)'}
        </button>
      </div>

      {/* Auto-Roll Setup Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-[#12151D] border border-white/15 p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Автопрокрут CardDrop</h3>
              </div>
              <button
                onClick={() => setShowAutoModal(false)}
                className="text-white/40 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/60">
              Быстрый автоматический выпуск серии карт на повышенной скорости. Если монеты закончатся, выпуск мгновенно остановится.
            </p>

            {/* Quick Count Selectors */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-white/50 font-mono">
                КОЛИЧЕСТВО ВЫПУСКОВ: <strong className="text-white">{autoSpinCount}</strong> (Стоимость:{' '}
                {(autoSpinCount * 500).toLocaleString('ru-RU')} ₽)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 10, 25, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAutoSpinCount(n)}
                    className={`py-2 rounded-lg text-xs font-mono font-bold transition-all border ${
                      autoSpinCount === n
                        ? 'bg-amber-500 text-black border-amber-400 shadow-md'
                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input & Slider */}
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="100"
                value={autoSpinCount}
                onChange={(e) => setAutoSpinCount(parseInt(e.target.value, 10) || 1)}
                className="flex-1 accent-amber-400 cursor-pointer"
              />
              <div className="flex items-center gap-1 font-mono text-xs">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={autoSpinCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setAutoSpinCount(Math.min(100, Math.max(1, val)));
                    }
                  }}
                  className="w-14 px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-white text-center font-bold font-mono focus:outline-none focus:border-amber-400"
                />
                <span className="text-white/40 text-[10px]">шт.</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowAutoModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleStartAutoRoll}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-black text-xs font-bold shadow-lg"
              >
                Запустить ({autoSpinCount} раз)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Roll Summary Dialog */}
      {autoSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-[#12151D] border border-white/20 p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Итоги автопрокрута</h3>
              </div>
              <button
                onClick={() => setAutoSummary(null)}
                className="text-white/40 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/50">Выпущено карт:</span>
                <span className="font-bold text-white font-mono">{autoSummary.completed}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/50">Потрачено монет:</span>
                <span className="font-bold text-amber-400 font-mono">
                  {(autoSummary.completed * 500).toLocaleString('ru-RU')} ₽
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-white/50">Статус завершения:</span>
                <span
                  className={`font-semibold ${
                    autoSummary.stoppedReason === 'COMPLETED'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {autoSummary.stoppedReason === 'COMPLETED'
                    ? 'Завершено полностью'
                    : autoSummary.stoppedReason}
                </span>
              </div>
            </div>

            {/* List preview of cards issued */}
            <div className="max-h-40 overflow-y-auto pr-1 flex flex-col gap-1.5">
              {autoSummary.cards.map((c, i) => (
                <div
                  key={c.id || i}
                  onClick={() => {
                    setAutoSummary(null);
                    onOpenCardDetails(c);
                  }}
                  className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer border border-white/5 text-[11px]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{c.bank}</span>
                    <span className="text-white/50">• {c.material}</span>
                  </div>
                  <span className="font-mono text-amber-400 font-bold">★ {c.collector_score}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setAutoSummary(null)}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
