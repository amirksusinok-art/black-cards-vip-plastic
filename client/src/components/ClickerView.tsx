import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClickerState, UserProfile } from '../types.js';
import { api } from '../utils/api.js';
import { hapticImpact, hapticNotification, hapticSelection } from '../utils/telegram.js';
import confetti from 'canvas-confetti';
import {
  Zap,
  Flame,
  Award,
  ArrowUpCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sparkles,
  Gift,
  TrendingUp,
  Clock,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface ClickerViewProps {
  user: UserProfile | null;
  onRefreshUser: () => void;
}

interface FloatingScore {
  id: number;
  x: number;
  y: number;
  amount: number;
}

export const ClickerView: React.FC<ClickerViewProps> = ({ user, onRefreshUser }) => {
  const [clickerState, setClickerState] = useState<ClickerState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Optimistic & interaction state
  const [localEnergy, setLocalEnergy] = useState<number>(100);
  const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([]);
  const [isCoinPressed, setIsCoinPressed] = useState<boolean>(false);
  const [tilt, setTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Batching tap queue
  const pendingTapsRef = useRef<number>(0);
  const tapTimeoutRef = useRef<any>(null);
  const coinRef = useRef<HTMLDivElement>(null);

  // Fetch initial clicker state
  const fetchState = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.getClickerState();
      const state = res.state || (res as any);
      if (state) {
        setClickerState(state);
        setLocalEnergy(typeof state.energy === 'number' ? state.energy : typeof state.currentEnergy === 'number' ? state.currentEnergy : 100);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка загрузки заработка');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Dynamic local timer for energy recharge tick
  useEffect(() => {
    if (!clickerState) return;
    const interval = setInterval(() => {
      setLocalEnergy((prev) => {
        if (prev < clickerState.maxEnergy) {
          return Math.min(clickerState.maxEnergy, prev + 1);
        }
        return prev;
      });
    }, (clickerState.energyPerSec || 30) * 1000);

    return () => clearInterval(interval);
  }, [clickerState?.energyPerSec, clickerState?.maxEnergy]);

  // Flush batched taps to server
  const flushTaps = useCallback(async () => {
    const count = pendingTapsRef.current;
    if (count <= 0) return;
    pendingTapsRef.current = 0;

    try {
      const res = await api.clickerTap(count);
      const newEnergy = typeof res.energy === 'number' ? res.energy : typeof (res as any).currentEnergy === 'number' ? (res as any).currentEnergy : localEnergy;
      const newCoins = typeof res.coins === 'number' ? res.coins : typeof (res as any).userCoins === 'number' ? (res as any).userCoins : undefined;
      const newTotal = typeof res.totalTaps === 'number' ? res.totalTaps : undefined;

      setClickerState((prev) =>
        prev
          ? {
              ...prev,
              ...(newCoins !== undefined ? { coins: newCoins } : {}),
              energy: newEnergy,
              ...(newTotal !== undefined ? { totalTaps: newTotal } : {}),
            }
          : null
      );
      setLocalEnergy(newEnergy);
      onRefreshUser();
    } catch (err: any) {
      // Re-fetch on error to sync with server truth
      fetchState();
    }
  }, [fetchState, onRefreshUser, localEnergy]);

  // Handle Coin Tap
  const handleCoinTap = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!clickerState) return;

    if (localEnergy <= 0) {
      hapticNotification('warning');
      setErrorMessage('Энергия исчерпана! Подождите восстановления или улучшите скорость.');
      return;
    }

    setErrorMessage(null);
    hapticImpact('medium');

    const power = clickerState.powerCoinsPerTap || 1;

    // Optimistic deductions
    setLocalEnergy((prev) => Math.max(0, prev - 1));
    pendingTapsRef.current += 1;

    // Trigger visual pop animation
    setIsCoinPressed(true);
    setTimeout(() => setIsCoinPressed(false), 80);

    // Calculate click coordinates for floating particles
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    if (coinRef.current) {
      const rect = coinRef.current.getBoundingClientRect();
      const relativeX = clientX - rect.left - 20;
      const relativeY = clientY - rect.top - 20;

      const newId = Date.now() + Math.random();
      setFloatingScores((prev) => [
        ...prev.slice(-12),
        { id: newId, x: relativeX, y: relativeY, amount: power },
      ]);

      setTimeout(() => {
        setFloatingScores((prev) => prev.filter((item) => item.id !== newId));
      }, 750);
    }

    // Debounce server sync
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
    }
    tapTimeoutRef.current = setTimeout(() => {
      flushTaps();
    }, 450);
  };

  // 3D Tilt interaction
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!coinRef.current) return;
    const rect = coinRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setTilt({
      x: -(y / (rect.height / 2)) * 14,
      y: (x / (rect.width / 2)) * 14,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setIsCoinPressed(false);
  };

  // Handle Power Upgrade with Instant Optimistic UI (0ms delay)
  const handleUpgradePower = () => {
    if (!clickerState || !clickerState.nextPowerCost) return;
    const cost = clickerState.nextPowerCost;
    if ((user?.coins ?? 0) < cost) {
      setErrorMessage(`Недостаточно монет! Нужно ${cost.toLocaleString('ru-RU')} ₽`);
      hapticNotification('error');
      return;
    }

    hapticSelection();
    hapticNotification('success');

    const nextPowerLevel = Math.min(5, clickerState.powerLevel + 1);
    const newCoinsPerTap = nextPowerLevel;
    const nextCost = nextPowerLevel < 5 ? (nextPowerLevel === 2 ? 500 : nextPowerLevel === 3 ? 1000 : nextPowerLevel === 4 ? 2500 : 5000) : null;

    // Optimistic UI state
    setClickerState((prev) =>
      prev
        ? {
            ...prev,
            coins: Math.max(0, prev.coins - cost),
            powerLevel: nextPowerLevel,
            powerCoinsPerTap: newCoinsPerTap,
            nextPowerCost: nextCost,
          }
        : null
    );

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#F59E0B', '#FBBF24', '#FDE68A'],
    });
    setSuccessMessage(`Сила клика: +${newCoinsPerTap} ₽ за клик!`);
    setTimeout(() => setSuccessMessage(null), 2500);

    // Sync in background without blocking UI
    api.upgradeClickerPower()
      .then(() => onRefreshUser())
      .catch((err) => {
        setErrorMessage(err.message || 'Ошибка улучшения силы клика');
        fetchState();
        onRefreshUser();
      });
  };

  // Handle Energy Upgrade with Instant Optimistic UI (0ms delay)
  const handleUpgradeEnergy = () => {
    if (!clickerState || !clickerState.nextEnergyCost) return;
    const cost = clickerState.nextEnergyCost;
    if ((user?.coins ?? 0) < cost) {
      setErrorMessage(`Недостаточно монет! Нужно ${cost.toLocaleString('ru-RU')} ₽`);
      hapticNotification('error');
      return;
    }

    hapticSelection();
    hapticNotification('success');

    const nextEnergyLevel = Math.min(5, clickerState.energyLevel + 1);
    const rechargeSecs = [0, 30, 24, 18, 12, 6];
    const newSecondsPerEnergy = rechargeSecs[nextEnergyLevel] || 6;
    const nextCost = nextEnergyLevel < 5 ? (nextEnergyLevel === 2 ? 600 : nextEnergyLevel === 3 ? 1200 : nextEnergyLevel === 4 ? 3000 : 6000) : null;

    // Optimistic UI state
    setClickerState((prev) =>
      prev
        ? {
            ...prev,
            coins: Math.max(0, prev.coins - cost),
            energyLevel: nextEnergyLevel,
            energyPerSec: newSecondsPerEnergy,
            nextEnergyCost: nextCost,
          }
        : null
    );

    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#10B981', '#34D399', '#6EE7B7'],
    });
    setSuccessMessage(`Скорость восстановления: 1 за ${newSecondsPerEnergy} сек.!`);
    setTimeout(() => setSuccessMessage(null), 2500);

    // Sync in background without blocking UI
    api.upgradeClickerEnergy()
      .then(() => onRefreshUser())
      .catch((err) => {
        setErrorMessage(err.message || 'Ошибка улучшения восстановления');
        fetchState();
        onRefreshUser();
      });
  };

  // Handle Daily Help Claim (+300 Coins)
  const handleClaimDailyHelp = async () => {
    try {
      hapticSelection();
      const res = await api.claimClickerDailyHelp();
      hapticNotification('success');
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#F59E0B', '#10B981', '#FFFFFF'],
      });
      setSuccessMessage(`Получено +${res.addedCoins} ₽ финансовой помощи!`);
      setTimeout(() => setSuccessMessage(null), 3500);
      fetchState();
      onRefreshUser();
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка получения помощи');
      hapticNotification('error');
    }
  };

  // 5 Visual Stages of the Ruble Coin based on power level
  const getCoinVisualStage = (level: number) => {
    switch (level) {
      case 5:
        // Platinum VIP Coin with Iridescent Sheen and Gold Inlay
        return {
          title: 'Платиновый VIP Рубль',
          outerRing: 'from-slate-200 via-indigo-100 to-cyan-300 border-white/60 shadow-[0_0_50px_rgba(165,180,252,0.45),inset_0_0_20px_rgba(255,255,255,0.7)]',
          bodyGrad: 'bg-gradient-to-tr from-slate-300 via-slate-100 to-indigo-100',
          symbolGrad: 'bg-gradient-to-b from-amber-400 via-yellow-200 to-amber-500 text-transparent bg-clip-text drop-shadow-[0_2px_4px_rgba(180,83,9,0.7)]',
          rimStars: 'text-cyan-300',
          badgeText: 'VIP ПЛАТИНА ★★★★★',
          badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40',
        };
      case 4:
        // Pure Imperial Gold Coin
        return {
          title: 'Имперский Золотой Рубль',
          outerRing: 'from-amber-300 via-yellow-400 to-amber-600 border-amber-300/80 shadow-[0_0_45px_rgba(245,158,11,0.45),inset_0_0_20px_rgba(254,240,138,0.7)]',
          bodyGrad: 'bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200',
          symbolGrad: 'bg-gradient-to-b from-amber-950 via-yellow-900 to-amber-950 text-transparent bg-clip-text drop-shadow-[0_2px_3px_rgba(255,255,255,0.6)]',
          rimStars: 'text-amber-200',
          badgeText: 'ЗОЛОТО ★★★★',
          badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
        };
      case 3:
        // Mirror Finish Pure Silver Coin
        return {
          title: 'Серебряный Рубль',
          outerRing: 'from-slate-300 via-gray-100 to-slate-400 border-white/70 shadow-[0_0_35px_rgba(203,213,225,0.35),inset_0_0_15px_rgba(255,255,255,0.6)]',
          bodyGrad: 'bg-gradient-to-tr from-slate-400 via-slate-200 to-gray-100',
          symbolGrad: 'bg-gradient-to-b from-slate-800 via-slate-600 to-slate-900 text-transparent bg-clip-text drop-shadow-[0_1px_2px_rgba(255,255,255,0.5)]',
          rimStars: 'text-slate-300',
          badgeText: 'СЕРЕБРО ★★★',
          badgeColor: 'bg-slate-400/20 text-slate-200 border-slate-400/40',
        };
      case 2:
        // Bronze Coin with Warm Patina
        return {
          title: 'Бронзовый Рубль',
          outerRing: 'from-amber-700 via-orange-600 to-amber-900 border-amber-600/60 shadow-[0_0_30px_rgba(180,83,9,0.3),inset_0_0_15px_rgba(249,115,22,0.4)]',
          bodyGrad: 'bg-gradient-to-tr from-amber-800 via-orange-700 to-amber-600',
          symbolGrad: 'bg-gradient-to-b from-amber-200 via-orange-100 to-amber-300 text-transparent bg-clip-text drop-shadow-[0_2px_3px_rgba(0,0,0,0.8)]',
          rimStars: 'text-amber-400',
          badgeText: 'БРОНЗА ★★',
          badgeColor: 'bg-amber-700/20 text-orange-300 border-orange-500/40',
        };
      case 1:
      default:
        // Polished Steel Coin
        return {
          title: 'Стальной Рубль',
          outerRing: 'from-zinc-400 via-zinc-200 to-zinc-500 border-zinc-400/50 shadow-[0_0_25px_rgba(161,161,170,0.25),inset_0_0_12px_rgba(255,255,255,0.4)]',
          bodyGrad: 'bg-gradient-to-tr from-zinc-600 via-zinc-400 to-zinc-300',
          symbolGrad: 'bg-gradient-to-b from-zinc-900 via-zinc-700 to-zinc-950 text-transparent bg-clip-text drop-shadow-[0_1px_2px_rgba(255,255,255,0.4)]',
          rimStars: 'text-zinc-300',
          badgeText: 'СТАЛЬ ★',
          badgeColor: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
        };
    }
  };

  const powerLevel = clickerState?.powerLevel || 1;
  const energyLevel = clickerState?.energyLevel || 1;
  const coinVisual = getCoinVisualStage(powerLevel);

  return (
    <div className="w-full flex flex-col items-center min-h-[calc(100vh-70px)] px-4 py-3 max-w-md mx-auto select-none gap-4">
      {/* Notifications */}
      {errorMessage && (
        <div className="w-full p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="p-1 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="w-full p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="p-1 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Header Info Banner: Tier Badge & Per-tap Income */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[#12151E] border border-white/5 font-mono">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${coinVisual.badgeColor}`}>
            {coinVisual.badgeText}
          </span>
          <span className="text-xs text-white/70 font-semibold">{coinVisual.title}</span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold">
          <Flame className="w-3.5 h-3.5 text-amber-400" />
          <span>+{clickerState?.powerCoinsPerTap || 1} ₽ / клик</span>
        </div>
      </div>

      {/* Central 3D Metallic Ruble Coin Area */}
      <div className="w-full flex flex-col items-center justify-center my-auto py-2 relative">
        <div
          ref={coinRef}
          onClick={handleCoinTap}
          onTouchStart={handleCoinTap}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${
              isCoinPressed ? 0.94 : 1
            })`,
            transition: isCoinPressed ? 'transform 0.05s ease-out' : 'transform 0.25s ease-out',
          }}
          className={`relative w-56 h-56 sm:w-64 sm:h-64 rounded-full p-2 cursor-pointer transition-shadow duration-300 flex items-center justify-center bg-gradient-to-tr ${coinVisual.outerRing} border-4 select-none`}
        >
          {/* Subtle Outer Coin Milling Edge (Reeded Edge Effect) */}
          <div className="absolute inset-1 rounded-full border border-dashed border-white/30 pointer-events-none" />

          {/* Coin Inner Body Disc */}
          <div
            className={`w-full h-full rounded-full ${coinVisual.bodyGrad} flex flex-col items-center justify-center relative overflow-hidden shadow-inner border border-white/40`}
          >
            {/* Realistic Light Sweep Highlight */}
            <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-to-b from-white/25 via-transparent to-black/30 pointer-events-none transform -rotate-45" />

            {/* Clean Minimalist Inner Rim */}
            <div className="absolute inset-2 sm:inset-3 rounded-full border border-white/25 pointer-events-none" />

            {/* Pure 3D Ruble Symbol ₽ (Без лишних надписей) */}
            <div className="relative z-10 flex items-center justify-center">
              <span
                className={`font-mono font-black text-8xl sm:text-9xl leading-none select-none tracking-tight ${coinVisual.symbolGrad} drop-shadow-[0_4px_16px_rgba(0,0,0,0.45)]`}
              >
                ₽
              </span>
            </div>
          </div>

          {/* Floating Score Indicators (+1, +2, +5 ₽) */}
          {floatingScores.map((score) => (
            <div
              key={score.id}
              style={{
                left: `${score.x}px`,
                top: `${score.y}px`,
              }}
              className="absolute pointer-events-none font-mono font-black text-lg sm:text-xl text-amber-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] animate-float-fade flex items-center gap-0.5 z-30"
            >
              <span>+{score.amount}</span>
              <span className="text-sm font-bold text-amber-400">₽</span>
            </div>
          ))}
        </div>

        {/* Total Taps Counter */}
        <div className="mt-3 text-xs font-mono text-white/40 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-white/30" />
          <span>Всего кликов: <strong className="text-white/80 font-mono">{(clickerState?.totalTaps || 0).toLocaleString('ru-RU')}</strong></span>
        </div>
      </div>

      {/* Energy System Progress Bar */}
      <div className="w-full flex flex-col gap-1.5 p-3 rounded-2xl bg-[#12151E] border border-white/5">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
            <Zap className="w-4 h-4 fill-amber-400 text-amber-400" />
            <span>Энергия: {localEnergy} / {clickerState?.maxEnergy || 100}</span>
          </div>
          <div className="flex items-center gap-1 text-white/50 text-[11px]">
            <Clock className="w-3 h-3 text-white/40" />
            <span>+1 через {clickerState?.energyPerSec || 30}с</span>
          </div>
        </div>

        {/* Progress Bar Track */}
        <div className="w-full h-2.5 rounded-full bg-black/60 border border-white/5 overflow-hidden p-[1px]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 transition-all duration-300 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
            style={{
              width: `${Math.min(100, Math.max(0, (localEnergy / (clickerState?.maxEnergy || 100)) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* 2 Upgrade Modules (Click Power & Energy Recovery Speed) */}
      <div className="w-full grid grid-cols-2 gap-2">
        {/* Module 1: Click Power */}
        <div className="flex flex-col justify-between p-3 rounded-2xl bg-[#12151E] border border-white/5 relative overflow-hidden">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase font-mono">СИЛА КЛИКА</span>
              <span className="px-1.5 py-0.2 rounded-md bg-amber-500/10 text-amber-300 text-[10px] font-mono font-bold">
                Ур. {powerLevel}/5
              </span>
            </div>
            <span className="text-sm font-bold text-white mt-0.5">
              +{clickerState?.powerCoinsPerTap || 1} ₽ / клик
            </span>
            <span className="text-[10px] text-white/50">
              {clickerState?.nextPowerCoinsPerTap
                ? `След. уровень: +${clickerState.nextPowerCoinsPerTap} ₽`
                : 'Максимальный уровень'}
            </span>
          </div>

          <button
            onClick={handleUpgradePower}
            disabled={!clickerState?.nextPowerCost || (user?.coins ?? 0) < (clickerState.nextPowerCost || 0)}
            className={`w-full mt-3 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 border ${
              !clickerState?.nextPowerCost
                ? 'bg-neutral-800 text-neutral-500 border-white/5 cursor-not-allowed'
                : (user?.coins ?? 0) >= clickerState.nextPowerCost
                ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400 shadow-md active:scale-95'
                : 'bg-white/5 text-white/40 border-white/10 cursor-not-allowed'
            }`}
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            <span>
              {clickerState?.nextPowerCost
                ? `${clickerState.nextPowerCost.toLocaleString('ru-RU')} ₽`
                : 'MAX'}
            </span>
          </button>
        </div>

        {/* Module 2: Energy Recovery Speed */}
        <div className="flex flex-col justify-between p-3 rounded-2xl bg-[#12151E] border border-white/5 relative overflow-hidden">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/40 uppercase font-mono">СКОРОСТЬ ЭНЕРГИИ</span>
              <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/10 text-emerald-300 text-[10px] font-mono font-bold">
                Ур. {energyLevel}/5
              </span>
            </div>
            <span className="text-sm font-bold text-white mt-0.5">
              1 за {clickerState?.energyPerSec || 30} сек.
            </span>
            <span className="text-[10px] text-white/50">
              {clickerState?.nextEnergySec
                ? `След. уровень: 1 за ${clickerState.nextEnergySec}с`
                : 'Максимальный уровень'}
            </span>
          </div>

          <button
            onClick={handleUpgradeEnergy}
            disabled={!clickerState?.nextEnergyCost || (user?.coins ?? 0) < (clickerState.nextEnergyCost || 0)}
            className={`w-full mt-3 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 border ${
              !clickerState?.nextEnergyCost
                ? 'bg-neutral-800 text-neutral-500 border-white/5 cursor-not-allowed'
                : (user?.coins ?? 0) >= clickerState.nextEnergyCost
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-400 shadow-md active:scale-95'
                : 'bg-white/5 text-white/40 border-white/10 cursor-not-allowed'
            }`}
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            <span>
              {clickerState?.nextEnergyCost
                ? `${clickerState.nextEnergyCost.toLocaleString('ru-RU')} ₽`
                : 'MAX'}
            </span>
          </button>
        </div>
      </div>

      {/* Daily Help Claim (When balance < 500 ₽, +300 Coins once per 24h) */}
      <div className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-amber-950/40 via-[#181622] to-[#12151E] border border-amber-500/20">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
            <Gift className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white">Финансовая помощь (+300 ₽)</span>
            <span className="text-[10px] text-white/50">
              Доступно раз в 24ч при балансе меньше 500 ₽
            </span>
          </div>
        </div>

        <button
          onClick={handleClaimDailyHelp}
          disabled={!clickerState?.canClaimDailyHelp}
          className={`px-3 py-2 rounded-xl text-xs font-mono font-bold transition-all shrink-0 border ${
            clickerState?.canClaimDailyHelp
              ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-400 shadow-md active:scale-95'
              : 'bg-white/5 text-white/30 border-white/5 cursor-not-allowed'
          }`}
        >
          {clickerState?.canClaimDailyHelp ? 'Забрать' : 'Недоступно'}
        </button>
      </div>

      {/* Daily Clicker Tasks */}
      <div className="w-full flex flex-col gap-2 p-3 rounded-2xl bg-[#12151E] border border-white/5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Задания кликера</span>
          </span>
          <span className="text-[10px] font-mono text-white/40">Ежедневно</span>
        </div>

        <div className="flex flex-col gap-1.5 mt-1">
          {clickerState?.tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 text-xs font-mono"
            >
              <div className="flex items-center gap-2">
                {task.isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                )}
                <div className="flex flex-col">
                  <span className="text-[11px] text-white/90 font-sans font-semibold">
                    {task.title}
                  </span>
                  <span className="text-[9px] text-white/40">
                    {task.currentProgress} / {task.targetCount}
                  </span>
                </div>
              </div>

              <span className="text-xs font-bold text-amber-400 font-mono">
                +{task.rewardCoins} ₽
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
