import React, { useState, useEffect, useCallback } from 'react';
import { Card, UserProfile, CaseTier } from '../types.js';
import { CardPreview } from './CardPreview.js';
import { api } from '../utils/api.js';
import { hapticImpact, hapticNotification, jackpotHaptics, hapticSelection } from '../utils/telegram.js';
import { playJackpotJingle } from '../utils/audio.js';
import confetti from 'canvas-confetti';
import { Play, RotateCw, AlertTriangle, Sparkles, SlidersHorizontal, X, FastForward, TrendingUp, Layers, ChevronDown, ChevronUp } from 'lucide-react';

interface MintTerminalProps {
  user: UserProfile | null;
  onRefreshUser: () => void;
  onOpenCardDetails: (card: Card) => void;
}

interface CaseTierConfig {
  id: CaseTier;
  name: string;
  price: number;
  luckMultiplier: number;
  label: string;
  badge: string;
  accentColor: string;
  borderColor: string;
  bgGradient: string;
}

const CASE_TIERS: CaseTierConfig[] = [
  {
    id: 'standard',
    name: 'Стандарт',
    price: 500,
    luckMultiplier: 1.0,
    label: 'x1.0',
    badge: '1.0x',
    accentColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/40',
    bgGradient: 'from-emerald-950/40 via-[#141822] to-[#0E1118]',
  },
  {
    id: 'go',
    name: 'Go',
    price: 1000,
    luckMultiplier: 1.5,
    label: 'x1.5',
    badge: '1.5x',
    accentColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/40',
    bgGradient: 'from-cyan-950/40 via-[#131926] to-[#0E1118]',
  },
  {
    id: 'plus',
    name: 'Plus',
    price: 2000,
    luckMultiplier: 2.0,
    label: 'x2.0',
    badge: '2.0x',
    accentColor: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgGradient: 'from-amber-950/40 via-[#191924] to-[#0E1118]',
  },
  {
    id: 'elite',
    name: 'Элит',
    price: 5000,
    luckMultiplier: 3.0,
    label: 'x3.0',
    badge: '3.0x',
    accentColor: 'text-fuchsia-400',
    borderColor: 'border-fuchsia-500/40',
    bgGradient: 'from-fuchsia-950/40 via-[#1c142b] to-[#0E1118]',
  },
];

export const MintTerminal: React.FC<MintTerminalProps> = ({
  user,
  onRefreshUser,
  onOpenCardDetails,
}) => {
  const [latestCard, setLatestCard] = useState<Card | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rollSpeed, setRollSpeed] = useState<'normal' | 'fast'>('normal');
  const [selectedTier, setSelectedTier] = useState<CaseTier>('standard');
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [lockedBlockCount, setLockedBlockCount] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJackpotActive, setIsJackpotActive] = useState<boolean>(false);
  const [showDetailedCardList, setShowDetailedCardList] = useState<boolean>(false);

  // Helper to calculate card market valuation
  const getEstimatedCardPrice = (c: Card | null): number => {
    if (!c) return 160;
    if (c.is_free_roll) return 0;
    const materialBase: Record<string, number> = {
      'Classic Plastic': 70,
      'Matte Plastic': 130,
      'Gold': 1800,
      'Black Carbon': 3600,
      'Titanium': 9000,
      'Holographic': 18000,
    };
    const categoryBonus: Record<string, number> = {
      'Standard': 0,
      'Pair': 100,
      'Triple': 250,
      'Repeater': 400,
      'Straight': 800,
      'Quad': 2000,
      'Mirror': 12000,
    };
    const isHighTier = ['Titanium', 'Holographic'].includes(c.material);
    const mult = isHighTier ? 30 : ['Gold', 'Black Carbon'].includes(c.material) ? 15 : 2;
    const scoreBonus = Math.round((c.collector_score || 25) * mult);
    const bankBonus = c.bank === 'ВБ Банк' ? 300 : 0;
    const base =
      (materialBase[c.material] || 70) +
      (categoryBonus[c.category] || 0) +
      scoreBonus +
      bankBonus;
    return Math.max(Math.round((base * 1.3) / 10) * 10, 80);
  };

  const getCardDemandMultiplier = (c: Card | null): string => {
    if (!c) return '×1,15';
    let base = 1.15;
    if (c.material === 'Classic Plastic') base = 1.15;
    else if (c.material === 'Matte Plastic') base = 1.25;
    else if (c.material === 'Gold') base = 1.45;
    else if (c.material === 'Black Carbon') base = 1.65;
    else if (c.material === 'Titanium') base = 2.10;
    else if (c.material === 'Holographic') base = 2.80;

    if (c.bank === 'ВБ Банк') base += 0.2;
    if (c.category !== 'Standard') base += 0.15;

    return `×${base.toFixed(2).replace('.', ',')}`;
  };

  const getCardCategoryLabel = (c: Card | null): string => {
    if (!c) return 'Обычный · оценка';
    const catMap: Record<string, string> = {
      'Standard': 'Обычный',
      'Pair': 'Пара',
      'Triple': 'Тройка',
      'Repeater': 'Повторитель',
      'Straight': 'Стрит',
      'Quad': 'Каре',
      'Mirror': 'Зеркало',
    };
    const prefix = catMap[c.category] || c.category || 'Обычный';
    return `${prefix} · оценка`;
  };

  // Free roll cooldown timer
  const [cooldown, setCooldown] = useState(user?.freeRollCooldownSeconds || 0);

  // Auto-roll state
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoSpinCount, setAutoSpinCount] = useState(10);
  const [isAutoRolling, setIsAutoRolling] = useState(false);
  const [pendingAutoSummary, setPendingAutoSummary] = useState<{
    completed: number;
    cards: Card[];
    stoppedReason: string;
  } | null>(null);
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
  const currentTierConfig = CASE_TIERS.find((t) => t.id === selectedTier) || CASE_TIERS[0];

  // Handle Regular Roll (Using Selected Tier)
  const handleRegularIssue = async () => {
    if (isRolling || isAutoRolling) return;
    if (coins < currentTierConfig.price) {
      setErrorMessage(`Недостаточно средств для выпуска «${currentTierConfig.name}» (нужно ${currentTierConfig.price.toLocaleString('ru-RU')} ₽)`);
      hapticNotification('error');
      return;
    }

    setErrorMessage(null);
    setLockedBlockCount(0);
    setRollSpeed('normal');
    setIsRolling(true);
    hapticImpact('heavy');

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await api.issueCard(requestId, selectedTier);
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
    setLockedBlockCount(0);
    setRollSpeed('normal');
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

  // Handle Auto-Roll (Fast card reel animation, then statistics modal)
  const handleStartAutoRoll = async () => {
    if (coins < currentTierConfig.price) {
      setErrorMessage(`Недостаточно средств для автопрокрута (нужно от ${currentTierConfig.price.toLocaleString('ru-RU')} ₽)`);
      hapticNotification('error');
      return;
    }

    setShowAutoModal(false);
    setIsAutoRolling(true);
    setErrorMessage(null);
    hapticImpact('heavy');

    const requestId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      const res = await api.autoIssueCards(autoSpinCount, requestId, selectedTier);
      const summaryData = {
        completed: res.spinsCompleted,
        cards: res.cards,
        stoppedReason: res.stoppedReason,
      };

      if (res.cards.length > 0) {
        // Fast reel spin on the last generated card!
        const lastCard = res.cards[res.cards.length - 1];
        setPendingAutoSummary(summaryData);
        setPendingCard(lastCard);
        setRollSpeed('fast');
        setIsRolling(true);
      } else {
        setAutoSummary(summaryData);
      }

      if (res.stoppedReason === 'Недостаточно средств') {
        setErrorMessage('Автопрокрут остановлен: Недостаточно средств');
        hapticNotification('warning');
      }

      onRefreshUser();
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка автопрокрута');
      hapticNotification('error');
    } finally {
      setIsAutoRolling(false);
    }
  };

  const handleLockedCountChange = useCallback((count: number) => {
    setLockedBlockCount(count);
  }, []);

  // Called when ReelAnimation finishes
  const handleReelComplete = useCallback(() => {
    if (pendingCard) {
      setLatestCard(pendingCard);
      const isRare =
        ['Gold', 'Black Carbon', 'Titanium', 'Holographic'].includes(pendingCard.material) ||
        pendingCard.bank === 'ВБ Банк' ||
        pendingCard.category !== 'Standard';

      if (isRare) {
        setIsJackpotActive(true);
        playJackpotJingle();
        jackpotHaptics();
        setTimeout(() => setIsJackpotActive(false), 850);

        try {
          confetti({
            particleCount: 85,
            spread: 85,
            origin: { y: 0.6 },
            colors: ['#D4AF37', '#00FFCC', '#E11D48', '#FFFFFF'],
          });
        } catch (e) {
          console.warn('Confetti error:', e);
        }
      }
    }

    // If an auto-roll batch completed, pop up the statistics modal!
    if (pendingAutoSummary) {
      setAutoSummary(pendingAutoSummary);
      setPendingAutoSummary(null);
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#D4AF37', '#00FFCC', '#FFFFFF'],
        });
      } catch (e) {
        console.warn('Confetti error:', e);
      }
      hapticNotification('success');
    }

    setIsRolling(false);
    setPendingCard(null);
  }, [pendingCard, pendingAutoSummary]);

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[calc(100vh-75px)] px-4 py-3 max-w-md mx-auto select-none gap-2">
      {/* Error or Warning Banner */}
      {errorMessage && (
        <div className="w-full mb-2 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Screen Dim & Luxury Jackpot Vignette Flash on Rare Drop */}
      {isJackpotActive && (
        <div className="fixed inset-0 z-50 pointer-events-none transition-all duration-300 bg-black/70 backdrop-brightness-75 shadow-[inset_0_0_120px_rgba(212,175,55,0.5)] animate-pulse" />
      )}

      {/* Central Luxury Card with On-Card Slot Reel Generation */}
      <div className="w-full flex flex-col items-center py-1">
        <CardPreview
          card={latestCard}
          targetCard={pendingCard}
          isRolling={isRolling && !!pendingCard}
          rollSpeed={rollSpeed}
          onRollComplete={handleReelComplete}
          onLockedCountChange={handleLockedCountChange}
          interactive={!isRolling}
          onClick={() => {
            if (isRolling) {
              handleReelComplete();
            } else if (latestCard) {
              onOpenCardDetails(latestCard);
            }
          }}
        />

        {/* Market Valuation Display (Exact design matching requested photo) */}
        {(() => {
          const cardToShow = isRolling ? pendingCard : latestCard;
          const targetEstimatedPrice = getEstimatedCardPrice(cardToShow);
          const displayPrice = isRolling
            ? Math.max(
                50,
                Math.round(
                  targetEstimatedPrice *
                    (lockedBlockCount === 0
                      ? 0.25
                      : lockedBlockCount === 1
                      ? 0.5
                      : lockedBlockCount === 2
                      ? 0.75
                      : lockedBlockCount === 3
                      ? 0.9
                      : 1)
                )
              )
            : cardToShow
            ? targetEstimatedPrice
            : 0;

          const categoryText = getCardCategoryLabel(cardToShow);
          const demandMultiplier = getCardDemandMultiplier(cardToShow);

          return (
            <div className="flex flex-col items-center justify-center my-1.5 text-center select-none animate-fadeIn shrink-0">
              {/* Top Subtitle: "Обычный · оценка" */}
              <span className="text-[11px] xs:text-xs text-white/50 font-medium tracking-wide">
                {categoryText}
              </span>

              {/* Big Bold Price: "1 604 ₽" */}
              <div className="text-2xl xs:text-3xl font-black font-mono text-white tracking-tight leading-tight my-0.5 flex items-center justify-center gap-2">
                <span>{displayPrice.toLocaleString('ru-RU')} ₽</span>
                {isRolling && (
                  <button
                    onClick={handleReelComplete}
                    className="text-white/40 hover:text-white/80 active:opacity-60 transition-colors flex items-center gap-1 text-[11px] underline underline-offset-2 ml-1"
                  >
                    <FastForward className="w-3 h-3" />
                    <span>Пропустить</span>
                  </button>
                )}
                {!isRolling && latestCard && (
                  <button
                    onClick={() => onOpenCardDetails(latestCard)}
                    className="text-white/40 hover:text-white/80 active:opacity-60 transition-colors flex items-center gap-1 text-[11px] ml-1"
                  >
                    <Sparkles className="w-3 h-3 text-amber-400" />
                  </button>
                )}
              </div>

              {/* Bottom Demand Multiplier Pill: "×1,15 спрос 🇷🇺" */}
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#181B24] border border-white/10 text-[11px] font-mono font-medium text-white/85 shadow-sm mt-0.5">
                <span>{demandMultiplier} спрос</span>
                <span>🇷🇺</span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Mode & Timer Status Bar */}
      <div className="w-full my-1.5 flex items-center justify-between px-3 py-2 rounded-xl bg-[#12151D] border border-white/5 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isBomzhMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
            }`}
          />
          <span className="text-white/80 font-medium">
            {isBomzhMode
              ? 'Режим «БОМЖ» (0 ₽)'
              : `Кейс «${currentTierConfig.name}» (${currentTierConfig.price.toLocaleString('ru-RU')} ₽)`}
          </span>
        </div>

        {isBomzhMode ? (
          <span className="text-white/60 text-[11px]">
            {cooldown > 0 ? `Таймер: ${cooldown}с` : `Готов (${freeRollsLeft}/150)`}
          </span>
        ) : (
          <span className="text-emerald-400 text-[11px] font-bold">
            Удача {currentTierConfig.badge}
          </span>
        )}
      </div>

      {/* 5. Two Compact Panels (Bank & Material of last drop) - Perfectly Centered */}
      <div className="w-full grid grid-cols-2 gap-2 mb-1.5">
        <div className="flex flex-col items-center justify-center text-center p-2 rounded-xl bg-[#12151D] border border-white/5">
          <span className="text-[10px] text-white/40 uppercase font-mono">БАНК</span>
          <span className="text-xs font-bold text-white/90 truncate mt-0.5">
            {latestCard ? latestCard.bank : '—'}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center text-center p-2 rounded-xl bg-[#12151D] border border-white/5">
          <span className="text-[10px] text-white/40 uppercase font-mono">МАТЕРИАЛ</span>
          <span className="text-xs font-bold text-white/90 truncate mt-0.5">
            {latestCard ? latestCard.material : '—'}
          </span>
        </div>
      </div>

      {/* Case Tiers Selector (Стандарт, Go, Plus, Элит) */}
      {!isBomzhMode && (
        <div className="w-full flex flex-col gap-1.5 mb-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-white/50 uppercase font-mono tracking-wider">
              ВЫБОР КЕЙСА:
            </span>
            <span className={`text-[10px] font-mono font-bold ${currentTierConfig.accentColor}`}>
              {currentTierConfig.name} • {currentTierConfig.label}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {CASE_TIERS.map((tier) => {
              const isSelected = selectedTier === tier.id;
              const canAfford = coins >= tier.price;

              return (
                <button
                  key={tier.id}
                  onClick={() => {
                    hapticSelection();
                    setSelectedTier(tier.id);
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all text-center relative overflow-hidden ${
                    isSelected
                      ? `bg-gradient-to-b ${tier.bgGradient} ${tier.borderColor} ring-1 ring-white/20 shadow-md`
                      : 'bg-[#12151D] border-white/5 hover:border-white/10 opacity-75 hover:opacity-100'
                  }`}
                >
                  <span className={`text-xs font-bold leading-tight ${isSelected ? tier.accentColor : 'text-white/80'}`}>
                    {tier.name}
                  </span>
                  <span className="text-[11px] font-mono font-black text-white mt-0.5">
                    {tier.price.toLocaleString('ru-RU')} ₽
                  </span>
                  <span
                    className={`mt-1 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-white/5 text-white/40'
                    }`}
                  >
                    {tier.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
            disabled={isRolling || isAutoRolling || coins < currentTierConfig.price}
            className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 border ${
              coins < currentTierConfig.price
                ? 'bg-neutral-800 text-neutral-500 border-white/5 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:brightness-110 text-black border-emerald-400/30 shadow-[0_8px_25px_rgba(34,197,94,0.3)]'
            }`}
          >
            <Play className={`w-4 h-4 fill-black ${isRolling ? 'animate-spin' : ''}`} />
            {isRolling
              ? 'ВЫПУСК КАРТЫ...'
              : `ВЫПУСТИТЬ КАРТУ (${currentTierConfig.price.toLocaleString('ru-RU')} ₽)`}
          </button>
        )}

        {/* Auto-Roll Trigger Button */}
        <button
          onClick={() => {
            if (coins < currentTierConfig.price) {
              setErrorMessage(`Недостаточно средств для автопрокрута (нужно от ${currentTierConfig.price.toLocaleString('ru-RU')} ₽)`);
              hapticNotification('error');
              return;
            }
            setShowAutoModal(true);
          }}
          disabled={isRolling || isAutoRolling}
          className="w-full py-2.5 rounded-xl bg-[#14171F] hover:bg-[#1A1F2B] active:scale-[0.98] border border-white/10 text-white/80 text-xs font-semibold tracking-wider uppercase transition-all flex items-center justify-center gap-2"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
          {isAutoRolling ? 'АВТОПРОКРУТ В ПРОЦЕССЕ...' : `АВТОПРОКРУТ (${currentTierConfig.name} • ДО 100 КАРТ)`}
        </button>
      </div>

      {/* Auto-Roll Setup Modal */}
      {showAutoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-[#12151D] border border-white/15 p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Автопрокрут • Кейс «{currentTierConfig.name}»</h3>
              </div>
              <button
                onClick={() => setShowAutoModal(false)}
                className="text-white/40 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/60">
              Быстрый автоматический выпуск серии карт на повышенной скорости анимации. При нехватке монет выпуск завершается с показом сводной статистики.
            </p>

            {/* Quick Count Selectors */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] text-white/50 font-mono">
                КОЛИЧЕСТВО ВЫПУСКОВ: <strong className="text-white">{autoSpinCount}</strong> (Стоимость:{' '}
                <span className="text-emerald-400 font-bold">{(autoSpinCount * currentTierConfig.price).toLocaleString('ru-RU')} ₽</span>)
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
                Запустить ({autoSpinCount} шт. • {(autoSpinCount * currentTierConfig.price).toLocaleString('ru-RU')} ₽)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Roll Summary Dialog with Compact 100-Card Statistics */}
      {autoSummary && (() => {
        const materialCounts = autoSummary.cards.reduce((acc, c) => {
          acc[c.material] = (acc[c.material] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const categoryCounts = autoSummary.cards.reduce((acc, c) => {
          acc[c.category] = (acc[c.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const uniqueDesigns = new Set(autoSummary.cards.map((c) => `${c.bank}|${c.material}`)).size;
        const totalMarketEst = autoSummary.cards.reduce((sum, c) => sum + getEstimatedCardPrice(c), 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
            <div className="w-full max-w-sm rounded-3xl bg-[#12151D] border border-white/20 p-5 shadow-2xl flex flex-col gap-3.5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <h3 className="font-bold text-sm text-white">Статистика серии карт</h3>
                </div>
                <button
                  onClick={() => setAutoSummary(null)}
                  className="text-white/40 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Compact Overview KPIs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-center">
                  <span className="text-[10px] text-white/50 block font-mono">ВЫПУЩЕНО</span>
                  <strong className="text-sm font-bold text-white font-mono">{autoSummary.completed}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-center">
                  <span className="text-[10px] text-white/50 block font-mono">ДИЗАЙНОВ</span>
                  <strong className="text-sm font-bold text-cyan-400 font-mono">{uniqueDesigns}</strong>
                </div>
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-center">
                  <span className="text-[10px] text-white/50 block font-mono">ОЦЕНКА</span>
                  <strong className="text-xs font-bold text-emerald-400 font-mono">~{totalMarketEst.toLocaleString('ru-RU')} ₽</strong>
                </div>
              </div>

              {/* Materials Breakdown */}
              <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-black/30 border border-white/5">
                <span className="text-[11px] font-bold text-white/70 uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" /> Материалы карт:
                </span>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {Object.entries(materialCounts).map(([mat, count]) => {
                    const isSuperRare = ['Gold', 'Titanium', 'Holographic', 'Black Carbon'].includes(mat);
                    return (
                      <div
                        key={mat}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                          isSuperRare
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-bold'
                            : 'bg-white/5 border-white/5 text-white/80'
                        }`}
                      >
                        <span className="truncate pr-1">{mat}</span>
                        <strong className="shrink-0">{count} шт.</strong>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Number Categories Breakdown */}
              <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-black/30 border border-white/5">
                <span className="text-[11px] font-bold text-white/70 uppercase font-mono tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Категории номеров:
                </span>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {Object.entries(categoryCounts).map(([cat, count]) => (
                    <div
                      key={cat}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                        cat !== 'Standard'
                          ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 font-bold'
                          : 'bg-white/5 border-white/5 text-white/70'
                      }`}
                    >
                      <span className="truncate pr-1">{cat}</span>
                      <strong className="shrink-0">{count} шт.</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expandable Individual Cards List */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setShowDetailedCardList((prev) => !prev)}
                  className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-mono flex items-center justify-between transition-colors border border-white/5"
                >
                  <span>Показать полный список ({autoSummary.cards.length} карт)</span>
                  {showDetailedCardList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showDetailedCardList && (
                  <div className="max-h-40 overflow-y-auto pr-1 flex flex-col gap-1.5 animate-fadeIn">
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
                )}
              </div>

              <button
                onClick={() => setAutoSummary(null)}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-md transition-all active:scale-[0.98]"
              >
                Отлично
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
