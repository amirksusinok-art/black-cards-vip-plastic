import React, { useState, useEffect, useRef } from 'react';
import { Card, UserProfile, AvitaSession, AvitaDeal, AvitaMessage } from '../types.js';
import { api } from '../utils/api.js';
import { hapticImpact, hapticNotification } from '../utils/telegram.js';
import confetti from 'canvas-confetti';
import {
  Store,
  DollarSign,
  TrendingUp,
  Clock,
  AlertTriangle,
  History,
  CheckCircle2,
  XCircle,
  Sparkles,
  Star,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

interface AvitaViewProps {
  user: UserProfile | null;
  onRefreshUser: () => void;
  onOpenCardDetails?: (card: Card) => void;
}

export const AvitaView: React.FC<AvitaViewProps> = ({
  user,
  onRefreshUser,
  onOpenCardDetails,
}) => {
  // Tabs: 'trade' | 'history'
  const [activeTab, setActiveTab] = useState<'trade' | 'history'>('trade');

  // Cooldown status
  const [isBlocked, setIsBlocked] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // User cards for selection
  const [cards, setCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<number[]>([]);

  // Active negotiation session
  const [session, setSession] = useState<AvitaSession | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [customDemand, setCustomDemand] = useState<number | ''>('');
  const [showBargainInput, setShowBargainInput] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Past deals history
  const [deals, setDeals] = useState<AvitaDeal[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  // 1. Check merchant status / 120s cooldown
  const checkStatus = async () => {
    try {
      const res = await api.getAvitaStatus();
      setIsBlocked(res.isBlocked);
      setSecondsRemaining(res.secondsRemaining || 0);
    } catch (err) {
      console.error('Failed to get Avita status:', err);
    }
  };

  // Cooldown timer interval
  useEffect(() => {
    checkStatus();
  }, []);

  useEffect(() => {
    if (secondsRemaining <= 0) {
      if (isBlocked) setIsBlocked(false);
      return;
    }
    const timer = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s <= 1) {
          setIsBlocked(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsRemaining, isBlocked]);

  // 2. Load player's cards
  const loadCards = async () => {
    setLoadingCards(true);
    try {
      const res = await api.getCards({ limit: 80, view: 'all' });
      setCards(res.items || []);
    } catch (err) {
      console.error('Failed to load cards:', err);
    } finally {
      setLoadingCards(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, []);

  // 3. Load deals history
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.getAvitaHistory();
      setDeals(res.deals || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (session?.dialogHistory) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [session?.dialogHistory]);

  // Toggle card selection
  const toggleSelectCard = (card: Card) => {
    if (session) return; // Cannot modify while session active

    if (card.is_free_roll) {
      setErrorMessage(
        'Эту карту нельзя продать Авите: она получена в бесплатном режиме («БОМЖ»).'
      );
      hapticNotification('warning');
      return;
    }

    setErrorMessage(null);
    hapticImpact('light');
    setSelectedCardIds((prev) =>
      prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]
    );
  };

  // Select all non-free, non-favorite cards
  const selectAllEligible = () => {
    if (session) return;
    const favs = new Set(user?.favorites || []);
    const eligibleIds = cards
      .filter((c) => !c.is_free_roll && !favs.has(c.id))
      .map((c) => c.id);
    setSelectedCardIds(eligibleIds);
    hapticImpact('medium');
  };

  const clearSelection = () => {
    if (session) return;
    setSelectedCardIds([]);
  };

  // 4. Request initial quote
  const handleRequestQuote = async () => {
    if (selectedCardIds.length === 0) return;
    if (isBlocked) {
      setErrorMessage(`Авита обижена. Подождите ещё ${secondsRemaining} сек.`);
      hapticNotification('error');
      return;
    }

    setLoadingAction(true);
    setErrorMessage(null);
    hapticImpact('heavy');

    try {
      const res = await api.quoteAvita(selectedCardIds);
      setSession(res.session);
      setShowBargainInput(false);
      setCustomDemand('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка оценки карт');
      hapticNotification('error');
      checkStatus();
    } finally {
      setLoadingAction(false);
    }
  };

  // 5. Submit Bargain
  const handleBargain = async (demandedPrice: number) => {
    if (!session || demandedPrice <= 0) return;
    setLoadingAction(true);
    setErrorMessage(null);
    hapticImpact('medium');

    try {
      const res = await api.bargainAvita(session.sessionId, demandedPrice);

      setSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentOffer: res.newOffer,
          roundsUsed: res.roundsUsed,
          isLastRound: res.isLastRound,
          dialogHistory: res.dialogHistory,
        };
      });

      setShowBargainInput(false);
      setCustomDemand('');

      if (res.accepted) {
        hapticNotification('success');
      } else if (res.rejected) {
        hapticNotification('error');
        setIsBlocked(true);
        setSecondsRemaining(res.secondsRemaining || 120);
      } else {
        hapticImpact('heavy');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка торга');
      hapticNotification('error');
      checkStatus();
    } finally {
      setLoadingAction(false);
    }
  };

  // 6. Accept Deal
  const handleAcceptDeal = async () => {
    if (!session) return;
    setLoadingAction(true);
    setErrorMessage(null);
    hapticImpact('heavy');

    try {
      const res = await api.acceptAvitaDeal(session.sessionId);
      hapticNotification('success');
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#F59E0B', '#FFFFFF'],
      });

      alert(
        `Сделка успешно завершена!\nПродано карт: ${res.cardsSold}\nПолучено: +${res.coinsEarned.toLocaleString()} Coins`
      );

      setSession(null);
      setSelectedCardIds([]);
      onRefreshUser();
      loadCards();
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка при подтверждении сделки');
      hapticNotification('error');
    } finally {
      setLoadingAction(false);
    }
  };

  // 7. Cancel Deal (Voluntary walk-away, no 120s penalty)
  const handleCancelDeal = async () => {
    if (!session) return;
    setLoadingAction(true);
    setErrorMessage(null);
    hapticImpact('light');

    try {
      await api.cancelAvitaDeal(session.sessionId);
      hapticNotification('warning');
      setSession(null);
      setSelectedCardIds([]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка отмены');
    } finally {
      setLoadingAction(false);
    }
  };

  const selectedCardsList = cards.filter((c) => selectedCardIds.includes(c.id));
  const hasFavoriteInSelection = selectedCardsList.some((c) =>
    user?.favorites?.includes(c.id)
  );

  return (
    <div className="w-full flex flex-col p-4 max-w-md mx-auto pb-24 select-none animate-fadeIn">
      {/* Merchant Header Profile */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-[#181A22] via-[#12141C] to-[#0D0F15] border border-white/10 mb-4 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center gap-3.5 relative z-10">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 p-0.5 shadow-lg shadow-amber-950/40">
              <div className="w-full h-full rounded-[14px] bg-[#12141C] flex items-center justify-center">
                <Store className="w-7 h-7 text-amber-400" />
              </div>
            </div>
            <span
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#12141C] ${
                isBlocked ? 'bg-red-500' : 'bg-emerald-400'
              }`}
            />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">«Авита»</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Скупщик карт
              </span>
            </div>
            <p className="text-xs text-white/60 mt-0.5 line-clamp-1">
              {isBlocked
                ? 'Обиделась и не общается'
                : 'Покупает карты за Coins по рыночным правилам'}
            </p>
          </div>
        </div>

        {/* 120s Cooldown Banner */}
        {isBlocked && (
          <div className="mt-3.5 p-3 rounded-2xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                Торг заблокирован: <strong>{secondsRemaining} сек.</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono text-red-300/80">Остывает</span>
          </div>
        )}

        {/* Sub-Tabs: Торг vs История */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10">
          <button
            onClick={() => setActiveTab('trade')}
            className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'trade'
                ? 'bg-white/15 text-white border border-white/20 shadow-md'
                : 'text-white/50 hover:bg-white/5'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            Скупка и Торг
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-white/15 text-white border border-white/20 shadow-md'
                : 'text-white/50 hover:bg-white/5'
            }`}
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            История сделок
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="mb-4 p-3 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2 animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* TAB 1: TRADE & NEGOTIATION */}
      {activeTab === 'trade' && (
        <>
          {/* Active Dialogue Session View */}
          {session ? (
            <div className="flex flex-col gap-3">
              {/* Cards Summary in Current Deal */}
              <div className="p-3.5 rounded-2xl bg-[#14161F] border border-white/10">
                <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                  <span>
                    На оценке: <strong>{session.cards.length} шт.</strong>
                  </span>
                  <span className="font-mono text-amber-400">
                    Раунд: {session.roundsUsed} / 3
                  </span>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                  {session.cards.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => onOpenCardDetails && onOpenCardDetails(c)}
                      className="shrink-0 p-2 rounded-xl bg-black/40 border border-white/10 text-[11px] font-mono flex flex-col gap-0.5 cursor-pointer hover:border-amber-400/50"
                    >
                      <span className="font-bold text-white">{c.bank}</span>
                      <span className="text-white/60 text-[10px]">{c.material}</span>
                      <span className="text-amber-300 text-[10px]">
                        •••• {c.card_number.slice(-4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat Dialogue History */}
              <div className="p-4 rounded-3xl bg-[#10121A] border border-white/10 flex flex-col gap-3 max-h-[320px] overflow-y-auto">
                {session.dialogHistory.map((msg, idx) => {
                  const isAvita = msg.sender === 'avita';
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col max-w-[85%] ${
                        isAvita ? 'self-start' : 'self-end'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-white/40 font-mono">
                        {isAvita ? (
                          <>
                            <Store className="w-3 h-3 text-amber-400" />
                            <span>Авита</span>
                          </>
                        ) : (
                          <>
                            <span>Вы</span>
                          </>
                        )}
                      </div>
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed ${
                          isAvita
                            ? 'bg-[#1C1F2B] text-white/90 rounded-tl-sm border border-white/5'
                            : 'bg-amber-600/90 text-white font-medium rounded-tr-sm shadow-md'
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })}
                <div ref={chatBottomRef} />
              </div>

              {/* Deal Controls */}
              <div className="flex flex-col gap-2 mt-1">
                {/* Accept Current Price Button */}
                <button
                  onClick={handleAcceptDeal}
                  disabled={loadingAction || isBlocked}
                  className="w-full py-4 rounded-2xl font-bold text-sm bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:brightness-110 text-black shadow-lg shadow-emerald-950/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-emerald-400/30"
                >
                  <CheckCircle2 className="w-4 h-4 fill-black text-emerald-500" />
                  ПРОДАТЬ ЗА {session.currentOffer.toLocaleString()} COINS
                </button>

                {/* Bargain Section */}
                {!showBargainInput ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowBargainInput(true)}
                      disabled={loadingAction || session.roundsUsed >= 3 || isBlocked}
                      className={`py-3 rounded-2xl font-bold text-xs uppercase tracking-wide border transition-all flex items-center justify-center gap-1.5 ${
                        session.roundsUsed >= 3 || isBlocked
                          ? 'bg-white/5 text-white/30 border-white/5 cursor-not-allowed'
                          : 'bg-[#181B24] hover:bg-[#202432] text-amber-400 border-amber-500/30 active:scale-[0.98]'
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      {session.roundsUsed >= 3 ? 'Раунды исчерпаны' : 'Поторговаться'}
                    </button>

                    <button
                      onClick={handleCancelDeal}
                      disabled={loadingAction}
                      className="py-3 rounded-2xl font-bold text-xs uppercase tracking-wide bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5 text-white/40" />
                      Отказаться
                    </button>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-[#14161F] border border-amber-500/30 flex flex-col gap-3 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/60 font-mono">Ваше предложение:</span>
                      <button
                        onClick={() => setShowBargainInput(false)}
                        className="text-white/40 hover:text-white text-[11px]"
                      >
                        Скрыть
                      </button>
                    </div>

                    {/* Quick percentage steps */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1.15, 1.25, 1.4].map((multiplier, i) => {
                        const target = Math.round((session.currentOffer * multiplier) / 100) * 100;
                        const label = i === 0 ? '+15%' : i === 1 ? '+25%' : '+40%';
                        return (
                          <button
                            key={i}
                            onClick={() => handleBargain(target)}
                            disabled={loadingAction}
                            className="py-2 px-1 rounded-xl bg-white/5 hover:bg-amber-500/20 hover:border-amber-500/40 text-amber-300 text-xs font-mono border border-white/10 transition-all text-center"
                          >
                            <span className="text-[10px] text-white/50 block">{label}</span>
                            <strong>{target.toLocaleString()}</strong>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom input */}
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Своя цена в Coins"
                        value={customDemand}
                        onChange={(e) =>
                          setCustomDemand(e.target.value ? parseInt(e.target.value, 10) : '')
                        }
                        className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-amber-400"
                      />
                      <button
                        onClick={() => {
                          if (typeof customDemand === 'number' && customDemand > 0) {
                            handleBargain(customDemand);
                          }
                        }}
                        disabled={loadingAction || !customDemand}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-all disabled:opacity-40"
                      >
                        Предложить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Card Selection View */
            <div className="flex flex-col gap-3">
              {/* Selection Bar */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-white tracking-wide">
                  Выберите карты для продажи:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllEligible}
                    className="text-[11px] text-amber-400 hover:underline font-mono"
                  >
                    Выбрать все
                  </button>
                  {selectedCardIds.length > 0 && (
                    <button
                      onClick={clearSelection}
                      className="text-[11px] text-white/40 hover:text-white font-mono"
                    >
                      Сброс
                    </button>
                  )}
                </div>
              </div>

              {/* Warning if favorite card is in selection */}
              {hasFavoriteInSelection && (
                <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                  <span>В выборе есть избранные карты. Они будут проданы безвозвратно!</span>
                </div>
              )}

              {/* Cards Grid */}
              {loadingCards ? (
                <div className="p-8 text-center text-xs text-white/40 font-mono">
                  Загрузка вашей коллекции...
                </div>
              ) : cards.length === 0 ? (
                <div className="p-8 text-center text-xs text-white/40 font-mono rounded-2xl bg-[#12141C] border border-white/5">
                  У вас пока нет карт для продажи. Выпустите новые карты на терминале.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
                  {cards.map((card) => {
                    const isSelected = selectedCardIds.includes(card.id);
                    const isFav = user?.favorites?.includes(card.id);
                    const isFree = card.is_free_roll;

                    return (
                      <div
                        key={card.id}
                        onClick={() => toggleSelectCard(card)}
                        className={`p-3 rounded-2xl border transition-all relative flex flex-col justify-between cursor-pointer ${
                          isFree
                            ? 'bg-neutral-900/40 border-white/5 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'bg-gradient-to-br from-amber-950/40 to-[#1A1D27] border-amber-400 shadow-md shadow-amber-950/30'
                            : 'bg-[#13151E] border-white/10 hover:border-white/20'
                        }`}
                      >
                        {/* Top tags */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-white/50 truncate max-w-[80px]">
                            {card.bank}
                          </span>
                          <div className="flex items-center gap-1">
                            {isFav && (
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            )}
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'bg-amber-400 border-amber-300'
                                  : 'border-white/20 bg-black/40'
                              }`}
                            >
                              {isSelected && (
                                <span className="text-[9px] font-bold text-black">✓</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Info */}
                        <div className="mb-2">
                          <div className="text-xs font-bold text-white tracking-wide truncate">
                            {card.material}
                          </div>
                          <div className="text-[10px] text-amber-400/80 font-mono mt-0.5">
                            {card.category} • {card.collector_score} pts
                          </div>
                        </div>

                        {/* Number / Status */}
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-white/40">•••• {card.card_number.slice(-4)}</span>
                          {isFree ? (
                            <span className="text-amber-500/80 font-bold">БОМЖ</span>
                          ) : (
                            <span className="text-emerald-400">Годна</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Start Trade Button */}
              <button
                onClick={handleRequestQuote}
                disabled={selectedCardIds.length === 0 || loadingAction || isBlocked}
                className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 ${
                  selectedCardIds.length === 0 || isBlocked
                    ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-white/5'
                    : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 text-black active:scale-[0.98]'
                }`}
              >
                <Store className="w-4 h-4" />
                {selectedCardIds.length === 0
                  ? 'ВЫБЕРИТЕ КАРТЫ ДЛЯ СКУПКИ'
                  : isBlocked
                  ? `ОЖИДАНИЕ ТАЙМЕРА (${secondsRemaining} С)`
                  : `ОЦЕНИТЬ У АВИТЫ (${selectedCardIds.length} КАРТ)`}
              </button>
            </div>
          )}
        </>
      )}

      {/* TAB 2: DEAL HISTORY */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-2.5">
          {loadingHistory ? (
            <div className="p-8 text-center text-xs text-white/40 font-mono">
              Загрузка истории сделок...
            </div>
          ) : deals.length === 0 ? (
            <div className="p-8 text-center text-xs text-white/40 font-mono rounded-2xl bg-[#12141C] border border-white/5">
              У вас пока нет закрытых сделок со скупщиком Авитой.
            </div>
          ) : (
            deals.map((deal) => (
              <div
                key={deal.id}
                className="p-3.5 rounded-2xl bg-[#13151E] border border-white/10 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="font-bold text-white">
                      Продано карт: {deal.cardCount} шт.
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400">
                    +{deal.finalPrice.toLocaleString()} Coins
                  </span>
                </div>

                {/* Cards Mini Tags */}
                <div className="flex flex-wrap gap-1">
                  {deal.cardsSummary.map((c, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-lg bg-black/40 border border-white/5 text-[10px] font-mono text-white/70"
                    >
                      {c.bank} ({c.material})
                    </span>
                  ))}
                </div>

                <div className="text-[10px] text-white/40 font-mono pt-1 border-t border-white/5 flex items-center justify-between">
                  <span>Сделка #{deal.dealId.slice(0, 10)}</span>
                  <span>{new Date(deal.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
