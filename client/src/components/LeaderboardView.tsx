import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Coins,
  Layers,
  Sparkles,
  ArrowUp,
  ArrowDown,
  Minus,
  Crown,
  ChevronRight,
  Shield,
  CreditCard,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  LeaderboardCategory,
  LeaderboardEntry,
  LeaderboardMyPosition,
  Card,
} from '../types.js';
import { api } from '../utils/api.js';
import { hapticSelection, hapticImpact } from '../utils/telegram.js';

interface LeaderboardViewProps {
  onOpenCardDetails?: (card: any) => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ onOpenCardDetails }) => {
  const [category, setCategory] = useState<LeaderboardCategory>('coins');
  const [topList, setTopList] = useState<LeaderboardEntry[]>([]);
  const [myPosition, setMyPosition] = useState<LeaderboardMyPosition | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchLeaderboard = async (cat: LeaderboardCategory) => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await api.getLeaderboard(cat);
      setTopList(res.top || []);
      setMyPosition(res.myPosition || null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка загрузки рейтинга');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(category);
  }, [category]);

  const handleTabChange = (cat: LeaderboardCategory) => {
    hapticSelection();
    setCategory(cat);
  };

  // Top 3 Podium split
  const first = topList[0];
  const second = topList[1];
  const third = topList[2];
  const restList = topList.slice(3);

  const renderTrendBadge = (trend?: 'up' | 'down' | 'same' | 'new', changeValue?: number) => {
    if (trend === 'up') {
      return (
        <span className="flex items-center gap-0.5 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
          <ArrowUp className="w-3 h-3 shrink-0" />
          {changeValue ? changeValue : ''}
        </span>
      );
    }
    if (trend === 'down') {
      return (
        <span className="flex items-center gap-0.5 text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-full border border-rose-500/20">
          <ArrowDown className="w-3 h-3 shrink-0" />
          {changeValue ? changeValue : ''}
        </span>
      );
    }
    if (trend === 'new') {
      return (
        <span className="text-[9px] font-mono font-bold text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded-full border border-purple-500/20">
          Новый
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono text-white/30 px-1.5 py-0.5">
        <Minus className="w-2.5 h-2.5" />
      </span>
    );
  };

  return (
    <div className="w-full flex flex-col items-center min-h-[calc(100vh-70px)] px-3 sm:px-4 py-3 max-w-md mx-auto select-none pb-24">
      {/* Title & Refresh */}
      <div className="w-full flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">Лидерборд игроков</h1>
            <p className="text-[11px] text-white/40 font-mono">Соревнования топ-коллекционеров</p>
          </div>
        </div>

        <button
          onClick={() => {
            hapticSelection();
            fetchLeaderboard(category);
          }}
          disabled={loading}
          className="p-2 rounded-xl bg-[#141722] border border-white/10 hover:border-white/20 active:scale-95 transition-all text-white/70 disabled:opacity-50"
          aria-label="Обновить"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
        </button>
      </div>

      {/* 3 Categories Switcher Tabs */}
      <div className="w-full grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#10121A] border border-white/10 mb-4">
        <button
          onClick={() => handleTabChange('coins')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition-all ${
            category === 'coins'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">Coins</span>
        </button>

        <button
          onClick={() => handleTabChange('cards')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition-all ${
            category === 'cards'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="truncate">Карты</span>
        </button>

        <button
          onClick={() => handleTabChange('best_card')}
          className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-xl text-xs font-bold transition-all ${
            category === 'best_card'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
              : 'text-white/50 hover:text-white/80'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="truncate">Лучшая карта</span>
        </button>
      </div>

      {errorMessage && (
        <div className="w-full mb-3 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="w-full flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
            Загрузка таблицы лидеров...
          </span>
        </div>
      ) : topList.length === 0 ? (
        <div className="w-full flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl bg-[#10121A] border border-white/5">
          <Trophy className="w-10 h-10 text-white/20 mb-2" />
          <p className="text-sm font-semibold text-white/70">В этом рейтинге пока нет участников</p>
          <p className="text-xs text-white/40 mt-1 font-mono">Выпустите первую карту или заработайте монеты!</p>
        </div>
      ) : (
        <>
          {/* Top-3 Podium */}
          <div className="w-full grid grid-cols-3 gap-2 items-end mb-4 pt-4">
            {/* 2nd Place (Left) */}
            {second ? (
              <div className="flex flex-col items-center p-2.5 rounded-2xl bg-[#121520] border border-slate-400/30 text-center relative shadow-lg">
                <div className="absolute -top-3 w-6 h-6 rounded-full bg-slate-300 text-black font-black text-xs flex items-center justify-center shadow-md font-mono">
                  2
                </div>
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-slate-300 mt-1 mb-1 bg-neutral-800 flex items-center justify-center text-xs font-bold text-white">
                  {second.photoUrl ? (
                    <img src={second.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    second.username?.slice(0, 2) || '2P'
                  )}
                </div>
                <span className="text-xs font-bold text-white truncate max-w-[85px]">
                  {second.firstName || second.username}
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-300 mt-0.5">
                  {second.formattedScore}
                </span>
                {category === 'best_card' && second.cardMeta && (
                  <button
                    onClick={() => onOpenCardDetails && onOpenCardDetails(second.cardMeta)}
                    className="mt-1 text-[9px] font-mono text-slate-400 hover:text-white underline truncate max-w-full"
                  >
                    {second.cardMeta.serialId}
                  </button>
                )}
                <div className="mt-1">{renderTrendBadge(second.trend, second.changeValue)}</div>
              </div>
            ) : (
              <div />
            )}

            {/* 1st Place (Center - Elevated Champion) */}
            {first && (
              <div className="flex flex-col items-center p-3 rounded-2xl bg-gradient-to-b from-[#1C1820] to-[#12141F] border-2 border-amber-400/60 text-center relative shadow-[0_0_24px_rgba(245,158,11,0.25)] -translate-y-2">
                <div className="absolute -top-4 w-8 h-8 rounded-full bg-amber-400 text-black font-black text-sm flex items-center justify-center shadow-lg font-mono">
                  <Crown className="w-5 h-5 text-amber-950 fill-amber-950" />
                </div>
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-amber-400 mt-2 mb-1.5 bg-neutral-800 flex items-center justify-center text-sm font-bold text-white shadow-inner">
                  {first.photoUrl ? (
                    <img src={first.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    first.username?.slice(0, 2) || '1P'
                  )}
                </div>
                <span className="text-xs font-black text-amber-300 truncate max-w-[95px]">
                  {first.firstName || first.username}
                </span>
                <span className="text-xs font-mono font-black text-white mt-0.5 drop-shadow">
                  {first.formattedScore}
                </span>
                {category === 'best_card' && first.cardMeta && (
                  <button
                    onClick={() => onOpenCardDetails && onOpenCardDetails(first.cardMeta)}
                    className="mt-1 text-[10px] font-mono text-amber-300/80 hover:text-white underline truncate max-w-full"
                  >
                    {first.cardMeta.serialId}
                  </button>
                )}
                <div className="mt-1">{renderTrendBadge(first.trend, first.changeValue)}</div>
              </div>
            )}

            {/* 3rd Place (Right) */}
            {third ? (
              <div className="flex flex-col items-center p-2.5 rounded-2xl bg-[#121520] border border-amber-700/30 text-center relative shadow-lg">
                <div className="absolute -top-3 w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs flex items-center justify-center shadow-md font-mono">
                  3
                </div>
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-700 mt-1 mb-1 bg-neutral-800 flex items-center justify-center text-xs font-bold text-white">
                  {third.photoUrl ? (
                    <img src={third.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    third.username?.slice(0, 2) || '3P'
                  )}
                </div>
                <span className="text-xs font-bold text-white truncate max-w-[85px]">
                  {third.firstName || third.username}
                </span>
                <span className="text-[11px] font-mono font-bold text-amber-600 mt-0.5">
                  {third.formattedScore}
                </span>
                {category === 'best_card' && third.cardMeta && (
                  <button
                    onClick={() => onOpenCardDetails && onOpenCardDetails(third.cardMeta)}
                    className="mt-1 text-[9px] font-mono text-amber-500 hover:text-white underline truncate max-w-full"
                  >
                    {third.cardMeta.serialId}
                  </button>
                )}
                <div className="mt-1">{renderTrendBadge(third.trend, third.changeValue)}</div>
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* Places #4 to #100 List */}
          <div className="w-full flex flex-col gap-1.5">
            {restList.map((entry) => (
              <div
                key={entry.userId}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#11131C] border border-white/5 hover:border-white/15 transition-colors font-mono"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs font-black text-white/40 w-6 text-center shrink-0">
                    #{entry.rank}
                  </span>

                  <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-800 border border-white/10 shrink-0 flex items-center justify-center text-[10px] font-bold text-white">
                    {entry.photoUrl ? (
                      <img src={entry.photoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      entry.username?.slice(0, 2) || 'CD'
                    )}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white/90 truncate">
                        {entry.firstName || entry.username}
                      </span>
                      {entry.prefix && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-mono font-bold">
                          {entry.prefix}
                        </span>
                      )}
                    </div>
                    {category === 'best_card' && entry.cardMeta ? (
                      <button
                        onClick={() => onOpenCardDetails && onOpenCardDetails(entry.cardMeta)}
                        className="text-[10px] text-white/50 hover:text-white text-left truncate"
                      >
                        {entry.cardMeta.serialId} • {entry.cardMeta.material}
                      </button>
                    ) : (
                      <span className="text-[10px] text-white/30 truncate">Коллекционер</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-white/90">
                    {entry.formattedScore}
                  </span>
                  {renderTrendBadge(entry.trend, entry.changeValue)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Sticky Bottom Bar: «Моё место» */}
      {myPosition && (
        <div className="fixed bottom-3 left-3 right-3 max-w-md mx-auto p-3 rounded-2xl bg-[#151824]/95 backdrop-blur-md border border-amber-500/40 shadow-2xl flex items-center justify-between z-30 font-mono">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black text-xs flex items-center justify-center shrink-0">
              #{myPosition.rank}
            </div>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white">Моё место</span>
                {renderTrendBadge(myPosition.trend, myPosition.changeValue)}
              </div>
              <span className="text-[11px] text-amber-300 font-bold">
                {myPosition.formattedScore}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end text-right min-w-0 pl-2">
            {myPosition.rank === 1 ? (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5" /> Топ-1 лидер!
              </span>
            ) : myPosition.diffToNext !== null ? (
              <>
                <span className="text-[10px] text-white/40">До места #{myPosition.rank - 1}:</span>
                <span className="text-xs font-bold text-emerald-300">
                  +{myPosition.diffToNext.toLocaleString('ru-RU')}{' '}
                  {category === 'cards' ? 'карт' : '₽'}
                </span>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
