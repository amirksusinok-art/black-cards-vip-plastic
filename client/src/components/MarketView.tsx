import React, { useState, useEffect } from 'react';
import {
  Store,
  ShoppingBag,
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  TrendingUp,
  X,
  CreditCard,
  User,
  ShieldAlert,
  Tag,
  RefreshCw,
  Coins,
  History,
} from 'lucide-react';
import {
  UserProfile,
  Card,
  MarketListing,
  MarketDeal,
  MarketEstimate,
  BankName,
  MaterialName,
} from '../types.js';
import { api } from '../utils/api.js';
import { CardPreview } from './CardPreview.js';
import { hapticImpact, hapticSelection, hapticNotification } from '../utils/telegram.js';

interface MarketViewProps {
  user: UserProfile | null;
  onRefreshUser: () => void;
  onOpenCardDetails: (card: Card) => void;
}

export const MarketView: React.FC<MarketViewProps> = ({
  user,
  onRefreshUser,
  onOpenCardDetails,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'history'>('all');
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [historyDeals, setHistoryDeals] = useState<MarketDeal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search for "All" tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBank, setSelectedBank] = useState<string>('all');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'score_desc'>('newest');

  // Modals
  const [buyModalListing, setBuyModalListing] = useState<MarketListing | null>(null);
  const [buying, setBuying] = useState(false);

  const [showListModal, setShowListModal] = useState(false);
  const [userEligibleCards, setUserEligibleCards] = useState<Card[]>([]);
  const [selectedCardToList, setSelectedCardToList] = useState<Card | null>(null);
  const [cardEstimate, setCardEstimate] = useState<MarketEstimate | null>(null);
  const [listingPrice, setListingPrice] = useState<string>('');
  const [listingInProgress, setListingInProgress] = useState(false);

  // Price update modal
  const [editPriceListing, setEditPriceListing] = useState<MarketListing | null>(null);
  const [newPriceInput, setNewPriceInput] = useState<string>('');
  const [updatingPrice, setUpdatingPrice] = useState(false);

  // Toast / notification
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    if (type === 'success') hapticNotification('success');
    else hapticNotification('error');
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load listings based on active tab
  const loadMarketData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'all') {
        const res = await api.getMarketListings({
          search: searchQuery,
          bank: selectedBank === 'all' ? undefined : selectedBank,
          material: selectedMaterial === 'all' ? undefined : selectedMaterial,
          sortBy,
        });
        setListings(res.listings || []);
      } else if (activeTab === 'my') {
        const res = await api.getMyMarketListings();
        setMyListings(res.listings || []);
      } else if (activeTab === 'history') {
        const res = await api.getMarketHistory();
        setHistoryDeals(res.deals || []);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных рынка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarketData();
  }, [activeTab, selectedBank, selectedMaterial, sortBy]);

  // Load user eligible cards when opening List Modal
  const openListModal = async () => {
    hapticSelection();
    setShowListModal(true);
    setSelectedCardToList(null);
    setCardEstimate(null);
    setListingPrice('');

    try {
      const res = await api.getCards({ view: 'all', limit: 100 });
      const cards: Card[] = res.items || [];
      // Eligible: not sold, not free roll, not listed on market
      const eligible = cards.filter(
        (c) => !c.is_free_roll && !c.is_listed_on_market
      );
      setUserEligibleCards(eligible);
    } catch (err) {
      console.error('Failed to load user cards for listing:', err);
    }
  };

  // When card selected for listing, fetch estimate
  const handleSelectCardToList = async (card: Card) => {
    hapticSelection();
    setSelectedCardToList(card);
    try {
      const estRes = await api.getMarketEstimate(card.id);
      setCardEstimate(estRes.estimate);
      // Pre-fill with average recommended price
      setListingPrice(String(estRes.estimate.avgPrice || 1000));
    } catch (err) {
      console.error('Failed to fetch price estimate:', err);
      setListingPrice('1000');
    }
  };

  // Submit list card
  const handleConfirmListCard = async () => {
    if (!selectedCardToList) return;
    const priceNum = parseInt(listingPrice, 10);
    if (isNaN(priceNum) || priceNum < 50) {
      showToast('error', 'Минимальная цена карты на рынке — 50 ₽');
      return;
    }

    try {
      setListingInProgress(true);
      await api.listCardOnMarket(selectedCardToList.id, priceNum);
      showToast('success', 'Карта успешно выставлена на продажу на Рынке!');
      setShowListModal(false);
      setSelectedCardToList(null);
      loadMarketData();
      onRefreshUser();
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка выставления карты');
    } finally {
      setListingInProgress(false);
    }
  };

  // Buy card action
  const handleConfirmBuy = async () => {
    if (!buyModalListing) return;

    try {
      setBuying(true);
      hapticImpact('heavy');
      const res = await api.buyMarketCard(buyModalListing.id);
      showToast(
        'success',
        `Карта куплена за ${buyModalListing.price.toLocaleString('ru-RU')} ₽! Она добавлена в вашу коллекцию.`
      );
      setBuyModalListing(null);
      loadMarketData();
      onRefreshUser();
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка при покупке');
    } finally {
      setBuying(false);
    }
  };

  // Cancel listing
  const handleCancelListing = async (listingId: number) => {
    if (!window.confirm('Снять карту с продажи и вернуть в коллекцию?')) return;
    try {
      hapticSelection();
      await api.cancelMarketListing(listingId);
      showToast('success', 'Объявление снято. Карта возвращена в вашу коллекцию.');
      loadMarketData();
      onRefreshUser();
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка при отмене объявления');
    }
  };

  // Extend listing
  const handleExtendListing = async (listingId: number) => {
    try {
      hapticSelection();
      await api.extendMarketListing(listingId);
      showToast('success', 'Срок объявления продлен еще на 7 дней!');
      loadMarketData();
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка продления');
    }
  };

  // Submit price update
  const handleConfirmUpdatePrice = async () => {
    if (!editPriceListing) return;
    const priceNum = parseInt(newPriceInput, 10);
    if (isNaN(priceNum) || priceNum < 50) {
      showToast('error', 'Минимальная цена — 50 ₽');
      return;
    }

    try {
      setUpdatingPrice(true);
      await api.updateMarketPrice(editPriceListing.id, priceNum);
      showToast('success', `Цена лота изменена на ${priceNum.toLocaleString('ru-RU')} ₽`);
      setEditPriceListing(null);
      loadMarketData();
    } catch (err: any) {
      showToast('error', err.message || 'Ошибка обновления цены');
    } finally {
      setUpdatingPrice(false);
    }
  };

  // Format expiration time
  const formatTimeLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Срок истёк';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days} дн. ${hours} ч.`;
    return `${hours} ч.`;
  };

  const banksList = ['Алфа Банк', 'ЗверьБанк', 'ОзановБанк', 'Тинькоффи', 'ОООтмыв Банк', 'ВБ Банк'];
  const materialsList = ['Classic Plastic', 'Matte Plastic', 'Gold', 'Black Carbon', 'Titanium', 'Holographic'];

  return (
    <div className="w-full flex flex-col p-4 max-w-md mx-auto pb-24 select-none animate-fadeIn">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2 max-w-[90vw] animate-bounce ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
              : 'bg-red-950/90 border-red-500/50 text-red-300'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Market Header */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-[#1C1829] via-[#14121F] to-[#0E1017] border border-purple-500/30 shadow-xl flex flex-col gap-3 relative overflow-hidden mb-4">
        <div className="absolute top-0 right-0 w-36 h-36 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-purple-500/20 border border-purple-500/40 text-purple-400 shadow-md">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>Рынок CardDrop</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  P2P Биржа
                </span>
              </h2>
              <p className="text-[11px] text-white/50">Покупайте и продавайте редкие карты игрокам</p>
            </div>
          </div>

          <button
            onClick={openListModal}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-purple-900/40 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Продать</span>
          </button>
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex p-1 rounded-2xl bg-[#12141E] border border-white/10 mb-4">
        <button
          onClick={() => {
            hapticSelection();
            setActiveTab('all');
          }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'all'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>Все лоты</span>
        </button>

        <button
          onClick={() => {
            hapticSelection();
            setActiveTab('my');
          }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'my'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Мои объявления</span>
        </button>

        <button
          onClick={() => {
            hapticSelection();
            setActiveTab('history');
          }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'history'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>История сделок</span>
        </button>
      </div>

      {/* TAB 1: ALL ACTIVE LISTINGS */}
      {activeTab === 'all' && (
        <div className="flex flex-col gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по номеру, серии (CD-...) или продавцу..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') loadMarketData();
              }}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#141622] border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Quick Bank & Material Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
            <button
              onClick={() => {
                hapticSelection();
                setSelectedBank('all');
              }}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all font-semibold ${
                selectedBank === 'all'
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              Все банки
            </button>
            {banksList.map((b) => (
              <button
                key={b}
                onClick={() => {
                  hapticSelection();
                  setSelectedBank(b);
                }}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all font-semibold ${
                  selectedBank === b
                    ? 'bg-purple-600 text-white border border-purple-400'
                    : 'bg-white/5 text-white/50 hover:bg-white/10'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Sort bar & Results count */}
          <div className="flex items-center justify-between px-1 text-xs text-white/60">
            <span>Лотов в продаже: {listings.length}</span>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="bg-[#141622] text-white/80 text-[11px] rounded-lg border border-white/10 py-1 px-2 focus:outline-none"
              >
                <option value="newest">Сначала новые</option>
                <option value="price_asc">Сначала дешевые</option>
                <option value="price_desc">Сначала дорогие</option>
                <option value="score_desc">По оценке CardDrop</option>
              </select>
            </div>
          </div>

          {/* Listings List */}
          {loading ? (
            <div className="p-12 text-center text-white/40 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
              <span>Загрузка лотов биржи...</span>
            </div>
          ) : listings.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#12151E] border border-white/5 text-center text-xs text-white/40 flex flex-col items-center gap-2">
              <ShoppingBag className="w-8 h-8 text-white/20" />
              <span>По вашему запросу не найдено ни одного лота.</span>
              <button
                onClick={openListModal}
                className="mt-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all"
              >
                Выставить первую карту!
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {listings.map((item) => {
                const isMyListing = item.seller_id === user?.id;
                const canAfford = (user?.coins || 0) >= item.price;

                const fallbackCardNumber = `2202 ${String((item.card_id || 1) * 137).slice(-4).padStart(4, '8')} ${String((item.card_id || 1) * 389).slice(-4).padStart(4, '4')} ${String((item.card_id || 1) * 791).slice(-4).padStart(4, '2')}`;
                const safeCardNumber = item.card_number && item.card_number.replace(/\D/g, '').length >= 12
                  ? item.card_number
                  : fallbackCardNumber;

                const dummyCard: Card = {
                  id: item.card_id,
                  card_uid: `uid_${item.card_id}`,
                  user_id: item.seller_id,
                  bank: item.bank as BankName,
                  material: item.material as MaterialName,
                  category: item.category as any,
                  card_number: safeCardNumber,
                  collection_code: item.collection_code || '000',
                  expires_at: '12/30',
                  collector_score: item.collector_score || 30,
                  is_free_roll: false,
                  serial_number: item.serial_number,
                  created_at: item.created_at,
                };

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-gradient-to-br from-[#161824] to-[#0F1118] border border-white/10 hover:border-purple-500/40 shadow-lg flex flex-col gap-3 transition-all"
                  >
                    {/* Top Row: Seller Profile & Remaining time */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center font-bold text-[10px] text-white overflow-hidden shrink-0">
                          {item.seller_photo ? (
                            <img src={item.seller_photo} alt="seller" className="w-full h-full object-cover" />
                          ) : (
                            item.seller_username?.slice(0, 2).toUpperCase() || 'CD'
                          )}
                        </div>
                        <span className="text-xs font-semibold text-white/90 flex items-center gap-1">
                          {item.seller_prefix && (
                            <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-mono">
                              {item.seller_prefix}
                            </span>
                          )}
                          <span>{item.seller_username || 'Игрок'}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[10px] text-white/40 font-mono">
                        <Clock className="w-3 h-3 text-white/40" />
                        <span>{formatTimeLeft(item.expires_at)}</span>
                      </div>
                    </div>

                    {/* Card Preview Thumbnail & Meta */}
                    <div
                      onClick={() => onOpenCardDetails(dummyCard)}
                      className="cursor-pointer active:scale-[0.99] transition-transform"
                    >
                      <CardPreview card={dummyCard} interactive={false} size="compact" />
                    </div>

                    {/* Bottom Row: Price & Buy Button */}
                    <div className="flex items-center justify-between pt-1 border-t border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-white/40 uppercase font-mono">Цена покупки</span>
                        <span className="text-sm font-extrabold text-amber-400 font-mono">
                          {item.price.toLocaleString('ru-RU')} ₽
                        </span>
                      </div>

                      {isMyListing ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[11px] font-bold">
                            Ваш лот
                          </span>
                          <button
                            onClick={() => handleCancelListing(item.id)}
                            className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 border border-white/10 text-[11px] font-semibold transition-all"
                          >
                            Снять
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            hapticSelection();
                            setBuyModalListing(item);
                          }}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 ${
                            canAfford
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-emerald-950/40 active:scale-95'
                              : 'bg-white/10 text-white/40 cursor-not-allowed'
                          }`}
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                          <span>{canAfford ? 'Купить' : 'Не хватает ₽'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY LISTINGS */}
      {activeTab === 'my' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-white uppercase font-mono">Ваши лоты на бирже</span>
            <button
              onClick={openListModal}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1 shadow-md transition-all active:scale-95"
            >
              <Plus className="w-3 h-3" />
              <span>Выставить карту</span>
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-white/40 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
              <span>Загрузка...</span>
            </div>
          ) : myListings.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#12151E] border border-white/5 text-center text-xs text-white/40 flex flex-col items-center gap-2">
              <Tag className="w-8 h-8 text-white/20" />
              <span>У вас нет объявлений на рынке.</span>
              <button
                onClick={openListModal}
                className="mt-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all"
              >
                Выставить карту сейчас
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {myListings.map((item) => {
                const isActive = item.status === 'active';
                const isSold = item.status === 'sold';
                const isCancelled = item.status === 'cancelled';
                const fallbackCardNumber = `2202 ${String((item.card_id || 1) * 137).slice(-4).padStart(4, '8')} ${String((item.card_id || 1) * 389).slice(-4).padStart(4, '4')} ${String((item.card_id || 1) * 791).slice(-4).padStart(4, '2')}`;
                const safeCardNumber = item.card_number && item.card_number.replace(/\D/g, '').length >= 12
                  ? item.card_number
                  : fallbackCardNumber;

                const dummyCard: Card = {
                  id: item.card_id,
                  card_uid: `uid_${item.card_id}`,
                  user_id: item.seller_id,
                  bank: item.bank as BankName,
                  material: item.material as MaterialName,
                  category: item.category as any,
                  card_number: safeCardNumber,
                  collection_code: item.collection_code || '000',
                  expires_at: '12/30',
                  collector_score: item.collector_score || 30,
                  is_free_roll: false,
                  serial_number: item.serial_number,
                  created_at: item.created_at,
                };

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-gradient-to-br from-[#161824] to-[#0F1118] border border-white/10 shadow-lg flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                            АКТИВЕН
                          </span>
                        )}
                        {isSold && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold">
                            ПРОДАНО
                          </span>
                        )}
                        {isCancelled && (
                          <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/15 text-[10px] font-bold">
                            СНЯТ
                          </span>
                        )}
                        <span className="text-white/40 text-[10px]">{item.serial_number}</span>
                      </div>

                      {isActive && (
                        <span className="text-[10px] text-white/50 font-mono">
                          Осталось: {formatTimeLeft(item.expires_at)}
                        </span>
                      )}
                    </div>

                    <CardPreview card={dummyCard} interactive={false} size="compact" />

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-white/40 uppercase font-mono">
                          {isSold ? 'Получено монет' : 'Цена лота'}
                        </span>
                        <span className="text-sm font-extrabold text-amber-400 font-mono">
                          {isSold
                            ? Math.round(item.price * 0.97).toLocaleString('ru-RU')
                            : item.price.toLocaleString('ru-RU')}{' '}
                          ₽
                        </span>
                      </div>

                      {isActive && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              hapticSelection();
                              setEditPriceListing(item);
                              setNewPriceInput(String(item.price));
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
                          >
                            Цена
                          </button>
                          <button
                            onClick={() => handleExtendListing(item.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
                          >
                            +7 дн.
                          </button>
                          <button
                            onClick={() => handleCancelListing(item.id)}
                            className="px-2.5 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs font-semibold transition-all"
                          >
                            Снять
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GLOBAL MARKET DEALS HISTORY */}
      {activeTab === 'history' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-white uppercase font-mono">
              Лента недавних успешных сделок
            </span>
            <button onClick={loadMarketData} className="p-1 text-white/40 hover:text-white">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-white/40 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
              <span>Загрузка сделок...</span>
            </div>
          ) : historyDeals.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#12151E] border border-white/5 text-center text-xs text-white/40">
              Пока сделок не совершено. Будьте первыми!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {historyDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="p-3 rounded-2xl bg-[#12141F] border border-white/5 flex items-center justify-between text-xs"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-white font-mono flex items-center gap-1.5">
                      <span>{deal.card_serial || 'CD-CARD'}</span>
                      <span className="text-[10px] font-normal text-white/40">
                        {deal.card_bank} • {deal.card_material}
                      </span>
                    </span>
                    <span className="text-[11px] text-white/50 mt-0.5">
                      {deal.seller_username} → {deal.buyer_username}
                    </span>
                  </div>

                  <div className="flex flex-col text-right">
                    <span className="font-bold text-emerald-400 font-mono">
                      +{deal.price.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="text-[10px] text-white/30 font-mono">
                      Комиссия: {deal.fee_coins} ₽
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: BUY CARD CONFIRMATION */}
      {buyModalListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
          <div className="w-full max-w-sm rounded-3xl bg-[#121420] border border-purple-500/40 p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white uppercase font-mono flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-purple-400" />
                <span>Покупка карты</span>
              </h3>
              <button
                onClick={() => setBuyModalListing(null)}
                className="p-1 rounded-full text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Серийный номер:</span>
                  <span className="font-bold text-white font-mono">{buyModalListing.serial_number}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Банк и материал:</span>
                  <span className="font-bold text-white">
                    {buyModalListing.bank} • {buyModalListing.material}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Продавец:</span>
                  <span className="font-bold text-purple-300">{buyModalListing.seller_username}</span>
                </div>
              </div>

              {/* Price Calculation breakdown */}
              <div className="p-3 rounded-2xl bg-purple-950/20 border border-purple-500/20 flex flex-col gap-2 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Стоимость карты:</span>
                  <span className="font-extrabold text-amber-400">
                    {buyModalListing.price.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Ваш баланс до покупки:</span>
                  <span className="text-white">{(user?.coins || 0).toLocaleString('ru-RU')} ₽</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-white/10">
                  <span className="text-white/60">Баланс после покупки:</span>
                  <span className="font-bold text-emerald-400">
                    {((user?.coins || 0) - buyModalListing.price).toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setBuyModalListing(null)}
                  className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmBuy}
                  disabled={buying}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 active:scale-95 disabled:opacity-50"
                >
                  {buying ? 'Покупка...' : 'Подтвердить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LIST CARD FOR SALE */}
      {showListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
          <div className="w-full max-w-sm rounded-3xl bg-[#121420] border border-purple-500/40 p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white uppercase font-mono flex items-center gap-2">
                <Plus className="w-4 h-4 text-purple-400" />
                <span>Выставить на биржу</span>
              </h3>
              <button
                onClick={() => setShowListModal(false)}
                className="p-1 rounded-full text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Select Card */}
            {!selectedCardToList ? (
              <div className="flex flex-col gap-3">
                <span className="text-xs text-white/70">
                  Выберите карту из коллекции для продажи (только карты из платных кейсов):
                </span>

                {userEligibleCards.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-white/5 border border-white/5 text-center text-xs text-white/40">
                    Нет доступных карт для продажи. Бесплатные карты режима БОМЖ или уже выставленные карты нельзя выставить.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                    {userEligibleCards.map((card) => (
                      <div
                        key={card.id}
                        onClick={() => handleSelectCardToList(card)}
                        className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400 cursor-pointer flex flex-col gap-1 transition-all active:scale-95"
                      >
                        <span className="text-[10px] font-bold text-amber-400 font-mono">
                          {card.serial_number || `CD-${card.id}`}
                        </span>
                        <span className="text-xs font-bold text-white truncate">{card.bank}</span>
                        <span className="text-[10px] text-white/50">{card.material}</span>
                        <span className="text-[10px] text-purple-300 font-mono">
                          Оценка: {card.collector_score || 30}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Step 2: Set Price and Publish */
              <div className="flex flex-col gap-3">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-xs">{selectedCardToList.bank}</span>
                    <span className="text-[10px] text-white/50">
                      {selectedCardToList.material} • {selectedCardToList.serial_number}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedCardToList(null)}
                    className="text-xs text-purple-400 hover:underline"
                  >
                    Выбрать другую
                  </button>
                </div>

                {/* Recommended Price Badge */}
                {cardEstimate && (
                  <div className="p-3 rounded-2xl bg-purple-950/30 border border-purple-500/30 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Рекомендованная цена CardDrop:</span>
                    </div>
                    <span className="text-sm font-extrabold text-amber-300 font-mono">
                      от {cardEstimate.recommendedMin.toLocaleString('ru-RU')} до{' '}
                      {cardEstimate.recommendedMax.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="text-[10px] text-white/40">
                      {cardEstimate.hasSufficientHistory
                        ? `На основе ${cardEstimate.pastDealsCount} недавних сделок с похожими картами`
                        : 'Рассчитано на основе редкости материала и редкости номера'}
                    </span>
                  </div>
                )}

                {/* Price input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-white/70 font-semibold">Ваша цена (₽ / Coins):</label>
                  <input
                    type="number"
                    min="50"
                    placeholder="Например: 5000"
                    value={listingPrice}
                    onChange={(e) => setListingPrice(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-[#141622] border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-purple-500"
                  />

                  {/* Quick price presets */}
                  <div className="flex gap-1.5 mt-1">
                    {[1000, 2500, 5000, 10000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setListingPrice(String(preset))}
                        className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-mono text-white/70 border border-white/5"
                      >
                        {preset.toLocaleString('ru-RU')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fee & Payout summary */}
                {parseInt(listingPrice, 10) > 0 && (
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1.5 text-xs font-mono">
                    <div className="flex justify-between text-white/60">
                      <span>Цена покупателя:</span>
                      <span className="text-white font-bold">
                        {parseInt(listingPrice, 10).toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                    <div className="flex justify-between text-white/60">
                      <span>Комиссия биржи (3%):</span>
                      <span className="text-red-400">
                        -{Math.max(1, Math.round((parseInt(listingPrice, 10) * 3) / 100))} ₽
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-white/10 text-emerald-400 font-bold">
                      <span>Вы получите при продаже:</span>
                      <span>
                        {(
                          parseInt(listingPrice, 10) -
                          Math.max(1, Math.round((parseInt(listingPrice, 10) * 3) / 100))
                        ).toLocaleString('ru-RU')}{' '}
                        ₽
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-white/40 pt-1">
                      <span>Срок публикации:</span>
                      <span>7 дней</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setSelectedCardToList(null)}
                    className="flex-1 py-3 rounded-xl bg-white/10 text-white text-xs font-bold"
                  >
                    Назад
                  </button>
                  <button
                    onClick={handleConfirmListCard}
                    disabled={listingInProgress || !parseInt(listingPrice, 10)}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-950/40 active:scale-95 disabled:opacity-50"
                  >
                    {listingInProgress ? 'Публикация...' : 'Опубликовать'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDIT PRICE */}
      {editPriceListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
          <div className="w-full max-w-sm rounded-3xl bg-[#121420] border border-purple-500/40 p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-sm text-white uppercase font-mono">Изменить цену лота</h3>
              <button
                onClick={() => setEditPriceListing(null)}
                className="p-1 rounded-full text-white/40 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-white/70">Новая цена (₽):</label>
                <input
                  type="number"
                  min="50"
                  value={newPriceInput}
                  onChange={(e) => setNewPriceInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#141622] border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditPriceListing(null)}
                  className="flex-1 py-3 rounded-xl bg-white/10 text-white text-xs font-bold"
                >
                  Отмена
                </button>
                <button
                  onClick={handleConfirmUpdatePrice}
                  disabled={updatingPrice}
                  className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all disabled:opacity-50"
                >
                  {updatingPrice ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
