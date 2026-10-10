import React, { useRef, useState } from 'react';
import { Card, BankName, MaterialName, CategoryName } from '../types.js';
import { ShieldCheck, Sparkles, Wifi } from 'lucide-react';

interface CardPreviewProps {
  card?: Card | null;
  interactive?: boolean;
  className?: string;
  size?: 'normal' | 'large' | 'compact';
  onClick?: () => void;
}

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  interactive = true,
  className = '',
  size = 'normal',
  onClick,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  // Defaults if no card passed yet (e.g. initial empty slot or teaser)
  const bank: BankName = card?.bank || 'Алфа Банк';
  const material: MaterialName = card?.material || 'Black Carbon';
  const category: CategoryName = card?.category || 'Standard';
  const cardNumber = card?.card_number || '2202 8841 9023 5510';
  const expiresAt = card?.expires_at || '12/29';
  const collectionCode = card?.collection_code || '007';

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotX = ((y - centerY) / centerY) * -12;
    const rotY = ((x - centerX) / centerX) * 12;
    setRotateX(rotX);
    setRotateY(rotY);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  // Material style helper
  const getMaterialStyles = (mat: MaterialName) => {
    switch (mat) {
      case 'Gold':
        return 'gold-gradient border-[#D4AF37]/50 shadow-[0_12px_36px_rgba(212,175,55,0.25)] text-amber-100';
      case 'Titanium':
        return 'titanium-gradient border-slate-400/40 shadow-[0_12px_36px_rgba(148,163,184,0.2)] text-slate-100';
      case 'Black Carbon':
        return 'carbon-pattern border-neutral-700/60 shadow-[0_14px_40px_rgba(0,0,0,0.8)] text-neutral-100';
      case 'Holographic':
        return 'holo-gradient border-cyan-400/60 shadow-[0_14px_45px_rgba(6,182,212,0.35)] text-white';
      case 'Matte Plastic':
        return 'bg-gradient-to-br from-[#1E2129] to-[#12141A] border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.6)] text-neutral-200';
      case 'Classic Plastic':
      default:
        return 'bg-gradient-to-br from-[#181A20] via-[#0F1116] to-[#0A0B0E] border-white/8 shadow-[0_10px_30px_rgba(0,0,0,0.7)] text-neutral-300';
    }
  };

  // Bank Emblem & Color
  const getBankBranding = (b: BankName) => {
    switch (b) {
      case 'Алфа Банк':
        return {
          emblem: (
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center font-black text-white text-[11px] shadow-sm">
                A
              </span>
              <span className="font-bold tracking-wider text-xs uppercase text-red-400">АЛФА</span>
            </div>
          ),
          accent: 'text-red-400',
        };
      case 'ЗверьБанк':
        return {
          emblem: (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full border-2 border-emerald-400 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
              </div>
              <span className="font-bold tracking-wider text-xs uppercase text-emerald-400">ЗВЕРЬ</span>
            </div>
          ),
          accent: 'text-emerald-400',
        };
      case 'ОзановБанк':
        return {
          emblem: (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center font-bold text-white text-[10px]">
                OZ
              </div>
              <span className="font-bold tracking-wider text-xs uppercase text-blue-400">ОЗАНОВ</span>
            </div>
          ),
          accent: 'text-blue-400',
        };
      case 'Тинькоффи':
        return {
          emblem: (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded bg-yellow-400 flex items-center justify-center font-black text-black text-[11px]">
                T
              </div>
              <span className="font-bold tracking-wider text-xs uppercase text-yellow-400">ТИНЬКОФФИ</span>
            </div>
          ),
          accent: 'text-yellow-400',
        };
      case 'ОООтмыв Банк':
      default:
        return {
          emblem: (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full border border-purple-400 flex items-center justify-center text-purple-300 text-[10px] font-mono font-bold">
                $$
              </div>
              <span className="font-bold tracking-wider text-xs uppercase text-purple-400">ОООТМЫВ</span>
            </div>
          ),
          accent: 'text-purple-400',
        };
    }
  };

  const branding = getBankBranding(bank);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: interactive
          ? `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
          : undefined,
        transition: rotateX === 0 ? 'transform 0.4s ease-out' : 'none',
      }}
      className={`relative w-full aspect-[1.58/1] max-w-[370px] rounded-2xl border p-5 sm:p-6 flex flex-col justify-between overflow-hidden cursor-pointer select-none transition-shadow duration-300 ${getMaterialStyles(
        material
      )} ${className}`}
    >
      {/* Specular Glare Overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />

      {/* Top Row: Bank Emblem & Contactless Wave */}
      <div className="relative z-10 flex items-center justify-between">
        {branding.emblem}
        <div className="flex items-center gap-2">
          {category !== 'Standard' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide bg-white/10 backdrop-blur-md border border-white/15 text-white flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-300" />
              {category}
            </span>
          )}
          <Wifi className="w-5 h-5 opacity-70 rotate-90" />
        </div>
      </div>

      {/* Middle Row: EMV Chip & Rarity Score */}
      <div className="relative z-10 flex items-center justify-between my-auto pt-2">
        {/* Realistic EMV Chip */}
        <div className="w-11 h-8 rounded-md bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 p-[1px] shadow-md border border-amber-500/40">
          <div className="w-full h-full rounded-[4px] bg-amber-400/90 grid grid-cols-3 grid-rows-2 gap-[1px] p-[2px]">
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
          </div>
        </div>

        {card && (
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-white/50 uppercase tracking-widest font-mono">
              ОЦЕНКА
            </span>
            <span className="text-xs font-bold font-mono tracking-tight text-white/90">
              ★ {card.collector_score}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Area: 16-Digit Number & Meta */}
      <div className="relative z-10 flex flex-col gap-2">
        {/* Card Number */}
        <div className="font-mono text-lg sm:text-xl font-bold tracking-[0.16em] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {cardNumber}
        </div>

        {/* Expiry & Holder Info */}
        <div className="flex items-end justify-between text-[10px] sm:text-[11px] uppercase tracking-wider text-white/70 font-mono">
          <div>
            <div className="text-[8px] text-white/40 leading-none mb-0.5">VALID THRU</div>
            <div className="font-bold text-white/90">{expiresAt}</div>
          </div>
          <div>
            <div className="text-[8px] text-white/40 leading-none mb-0.5">CODE</div>
            <div className="font-bold text-white/90">{collectionCode}</div>
          </div>
          <div className="text-right">
            <div className="text-[8px] text-white/40 leading-none mb-0.5">MATERIAL</div>
            <div className="font-bold text-white/90">{material}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
