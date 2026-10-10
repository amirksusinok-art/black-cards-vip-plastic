import React, { useState } from 'react';
import { Card } from '../types.js';
import { CardPreview } from './CardPreview.js';
import { X, Star, Share2, Sparkles, Calendar, Shield, Cpu } from 'lucide-react';
import { hapticImpact, hapticSelection } from '../utils/telegram.js';

interface CardDetailModalProps {
  card: Card;
  isFavorite: boolean;
  onToggleFavorite: (cardId: number) => void;
  onClose: () => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  isFavorite,
  onToggleFavorite,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    hapticImpact('light');
    const shareText = `💳 Моя карта в CardDrop:\nБанк: ${card.bank}\nМатериал: ${card.material}\nУзор: ${card.category}\nНомер: ${card.card_number}\nОценка: ★ ${card.collector_score}`;
    
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent('https://t.me/your_bot')}&text=${encodeURIComponent(
          shareText
        )}`
      );
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleFav = () => {
    hapticSelection();
    onToggleFavorite(card.id);
  };

  const formattedDate = new Date(card.created_at).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fadeIn select-none">
      <div className="relative w-full max-w-sm rounded-3xl bg-[#0F1117] border border-white/15 p-5 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-widest text-white/50">
              КАРТА #{card.id}
            </span>
            {card.category !== 'Standard' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                {card.category}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3D Card Display */}
        <div className="w-full flex justify-center py-2">
          <CardPreview card={card} interactive={true} size="normal" />
        </div>

        {/* Market Valuation Display (Exact design matching requested photo) */}
        <div className="flex flex-col items-center justify-center my-0.5 text-center select-none">
          <span className="text-[11px] text-white/50 font-medium tracking-wide">
            {card.category === 'Standard' ? 'Обычный' : card.category} · оценка
          </span>
          <div className="text-2xl font-black font-mono text-white tracking-tight leading-tight my-0.5">
            {(card.estimated_market_price || card.collector_score * 35 || 1604).toLocaleString('ru-RU')} ₽
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#181B24] border border-white/10 text-[11px] font-mono font-medium text-white/85 shadow-sm mt-0.5">
            <span>
              {card.material === 'Classic Plastic'
                ? '×1,15'
                : card.material === 'Matte Plastic'
                ? '×1,25'
                : card.material === 'Gold'
                ? '×1,45'
                : card.material === 'Black Carbon'
                ? '×1,65'
                : card.material === 'Titanium'
                ? '×2,10'
                : '×2,80'}{' '}
              спрос
            </span>
            <span>🇷🇺</span>
          </div>
        </div>

        {/* Action Buttons: Favorite & Share */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleFav}
            className={`py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              isFavorite
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            {isFavorite ? 'В избранном' : 'В избранное'}
          </button>

          <button
            onClick={handleShare}
            className="py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
          >
            <Share2 className="w-3.5 h-3.5 text-cyan-400" />
            {copied ? 'Скопировано!' : 'Поделиться'}
          </button>
        </div>

        {/* Detailed Characteristics */}
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[#141722] border border-white/5 text-xs font-mono">
          <div className="flex justify-between py-1 border-b border-white/5">
            <span className="text-white/40 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-white/40" /> Банк
            </span>
            <span className="font-bold text-white">{card.bank}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-white/5">
            <span className="text-white/40 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-white/40" /> Материал
            </span>
            <span className="font-bold text-white">{card.material}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-white/5">
            <span className="text-white/40">Серийный номер</span>
            <span className="font-bold text-amber-300 font-mono">
              {card.serial_number || `CD-${String(card.id).padStart(6, '0')}`}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-white/5">
            <span className="text-white/40">Номер карты</span>
            <span className="font-bold text-white">{card.card_number}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-white/5">
            <span className="text-white/40">Код коллекции</span>
            <span className="font-bold text-white">{card.collection_code}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-white/5">
            <span className="text-white/40">Срок действия</span>
            <span className="font-bold text-white">{card.expires_at}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-white/5">
            <span className="text-white/40 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-white/40" /> Дата выпуска
            </span>
            <span className="text-white/80 text-[11px]">{formattedDate}</span>
          </div>

          <div className="flex justify-between py-1">
            <span className="text-white/40">Коллекционная оценка</span>
            <span className="font-bold text-amber-400">★ {card.collector_score}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
