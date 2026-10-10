import React, { useState, useEffect } from 'react';
import { Card, BankName, MaterialName, CategoryName, CardTemplateGroup } from '../types.js';
import { CardPreview } from './CardPreview.js';
import { api } from '../utils/api.js';
import { hapticSelection } from '../utils/telegram.js';
import { Filter, Layers, LayoutGrid, Star, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface CollectionViewProps {
  favorites: number[];
  onOpenCardDetails: (card: Card) => void;
  onToggleFavorite: (cardId: number) => void;
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  favorites,
  onOpenCardDetails,
}) => {
  const [viewMode, setViewMode] = useState<'templates' | 'all'>('templates');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const loadCards = async () => {
    setLoading(true);
    try {
      const res = await api.getCards({
        page,
        limit: 40,
        view: viewMode,
        bank: selectedBank || undefined,
        material: selectedMaterial || undefined,
        category: selectedCategory || undefined,
      });

      setItems(res.items);
      setTotalPages(res.totalPages || 1);
      setTotalItems(res.totalItems || 0);
    } catch (err) {
      console.error('Failed to load collection:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, [page, viewMode, selectedBank, selectedMaterial, selectedCategory]);

  return (
    <div className="w-full flex flex-col p-4 max-w-lg mx-auto pb-20 select-none animate-fadeIn">
      {/* Header & View Mode Switch */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white">Коллекция карт</h2>
          <p className="text-xs text-white/50 font-mono">Всего: {totalItems} единиц</p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center bg-[#141720] rounded-xl p-1 border border-white/10">
          <button
            onClick={() => {
              hapticSelection();
              setViewMode('templates');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'templates'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/40 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            По дизайнам
          </button>
          <button
            onClick={() => {
              hapticSelection();
              setViewMode('all');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              viewMode === 'all'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/40 hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Все карты
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <select
          value={selectedBank}
          onChange={(e) => {
            setSelectedBank(e.target.value);
            setPage(1);
          }}
          className="bg-[#12151D] border border-white/10 rounded-xl px-2 py-2 text-xs text-white/80 font-mono focus:outline-none"
        >
          <option value="">Все банки</option>
          <option value="Алфа Банк">Алфа Банк</option>
          <option value="ЗверьБанк">ЗверьБанк</option>
          <option value="ОзановБанк">ОзановБанк</option>
          <option value="Тинькоффи">Тинькоффи</option>
          <option value="ОООтмыв Банк">ОООтмыв Банк</option>
          <option value="ВБ Банк">ВБ Банк</option>
        </select>

        <select
          value={selectedMaterial}
          onChange={(e) => {
            setSelectedMaterial(e.target.value);
            setPage(1);
          }}
          className="bg-[#12151D] border border-white/10 rounded-xl px-2 py-2 text-xs text-white/80 font-mono focus:outline-none"
        >
          <option value="">Все материалы</option>
          <option value="Classic Plastic">Classic Plastic</option>
          <option value="Matte Plastic">Matte Plastic</option>
          <option value="Gold">Gold</option>
          <option value="Black Carbon">Black Carbon</option>
          <option value="Titanium">Titanium</option>
          <option value="Holographic">Holographic</option>
        </select>

        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setPage(1);
          }}
          className="bg-[#12151D] border border-white/10 rounded-xl px-2 py-2 text-xs text-white/80 font-mono focus:outline-none"
        >
          <option value="">Все узоры</option>
          <option value="Standard">Standard</option>
          <option value="Pair">Pair</option>
          <option value="Triple">Triple</option>
          <option value="Quad">Quad</option>
          <option value="Repeater">Repeater</option>
          <option value="Straight">Straight</option>
          <option value="Mirror">Mirror</option>
        </select>
      </div>

      {/* Grid of Cards or Template Groups */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-white/40 gap-2">
          <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono">Загрузка коллекции...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-[#12151D] rounded-2xl border border-white/5 p-6">
          <Sparkles className="w-8 h-8 text-white/20 mb-2" />
          <p className="text-sm font-semibold text-white/80">Коллекция пуста</p>
          <p className="text-xs text-white/40 mt-1 max-w-xs">
            Выпустите свои первые карты в главном терминале CardDrop!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {viewMode === 'templates'
            ? items.map((group: CardTemplateGroup) => (
                <div
                  key={group.templateKey}
                  onClick={() => onOpenCardDetails(group.sampleCard)}
                  className="flex flex-col p-3 rounded-2xl bg-[#12151D] border border-white/10 hover:border-white/20 transition-all cursor-pointer relative group"
                >
                  <CardPreview card={group.sampleCard} interactive={false} size="compact" />
                  <div className="flex items-center justify-between mt-3 px-1">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">{group.bank}</span>
                      <span className="text-[10px] text-white/50 font-mono">
                        {group.material} • {group.category}
                      </span>
                    </div>
                    {/* Copy Counter */}
                    <div className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono font-bold text-xs">
                      ×{group.count}
                    </div>
                  </div>
                </div>
              ))
            : items.map((card: Card) => (
                <div
                  key={card.id}
                  onClick={() => onOpenCardDetails(card)}
                  className="flex flex-col p-3 rounded-2xl bg-[#12151D] border border-white/10 hover:border-white/20 transition-all cursor-pointer relative"
                >
                  {favorites.includes(card.id) && (
                    <div className="absolute top-4 right-4 z-20 p-1 rounded-full bg-amber-500/30 text-amber-300">
                      <Star className="w-3.5 h-3.5 fill-amber-300" />
                    </div>
                  )}
                  <CardPreview card={card} interactive={false} size="compact" />
                  <div className="flex items-center justify-between mt-3 px-1">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">{card.bank}</span>
                      <span className="text-[10px] text-white/50 font-mono">
                        {card.serial_number || `CD-${String(card.id).padStart(6, '0')}`} • {card.card_number}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      ★ {card.collector_score}
                    </span>
                  </div>
                </div>
              ))}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-xl bg-[#141720] border border-white/10 text-white disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-white/70">
            {page} из {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-xl bg-[#141720] border border-white/10 text-white disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
