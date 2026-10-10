import React, { useRef, useState, useEffect } from 'react';
import { Card, BankName, MaterialName, CategoryName } from '../types.js';
import { hapticImpact } from '../utils/telegram.js';
import { Sparkles, Wifi } from 'lucide-react';

export interface CardPreviewProps {
  card?: Card | null;
  targetCard?: Card | null;
  isRolling?: boolean;
  onRollComplete?: () => void;
  interactive?: boolean;
  className?: string;
  size?: 'normal' | 'large' | 'compact';
  onClick?: () => void;
  onLockedCountChange?: (count: number) => void;
}

const ALL_BANKS: BankName[] = [
  'Алфа Банк',
  'Тинькоффи',
  'ЗверьБанк',
  'ОзановБанк',
  'ОООтмыв Банк',
  'ВБ Банк',
];

export const CardPreview: React.FC<CardPreviewProps> = ({
  card,
  targetCard,
  isRolling = false,
  onRollComplete,
  interactive = true,
  className = '',
  size = 'normal',
  onClick,
  onLockedCountChange,
}) => {
  const isCompact = size === 'compact';
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  // Active displayed card data (switches to targetCard when finished or target preview)
  const activeCard = isRolling && targetCard ? targetCard : card;

  const targetBank: BankName = activeCard?.bank || 'Алфа Банк';
  const targetMaterial: MaterialName = activeCard?.material || 'Black Carbon';
  const targetCategory: CategoryName = activeCard?.category || 'Standard';
  const targetCardNumber = activeCard?.card_number || '2202 8841 9023 5510';
  const expiresAt = activeCard?.expires_at || '12/29';
  const collectionCode = activeCard?.collection_code || '007';

  // Slot Reel Animation State
  const [reelActive, setReelActive] = useState(false);
  const [bankReelActive, setBankReelActive] = useState(false);
  const [lockedBlocks, setLockedBlocks] = useState<number>(0);

  // Parse digits into 4 blocks of 4 digits
  const rawDigits = targetCardNumber.replace(/\s+/g, '').split(''); // 16 digits

  useEffect(() => {
    if (isRolling && targetCard) {
      setReelActive(false);
      setBankReelActive(false);
      setLockedBlocks(0);
      if (onLockedCountChange) onLockedCountChange(0);

      const startTimer = setTimeout(() => {
        setReelActive(true);
        setBankReelActive(true);
      }, 40);

      // Progressive locking timings
      const t1 = setTimeout(() => {
        setLockedBlocks(1);
        if (onLockedCountChange) onLockedCountChange(1);
        hapticImpact('light');
      }, 650);

      const t2 = setTimeout(() => {
        setLockedBlocks(2);
        if (onLockedCountChange) onLockedCountChange(2);
        hapticImpact('light');
      }, 1250);

      const t3 = setTimeout(() => {
        setLockedBlocks(3);
        if (onLockedCountChange) onLockedCountChange(3);
        hapticImpact('medium');
      }, 1750);

      const t4 = setTimeout(() => {
        setLockedBlocks(4);
        if (onLockedCountChange) onLockedCountChange(4);
        hapticImpact('heavy');
        if (onRollComplete) onRollComplete();
      }, 2300);

      return () => {
        clearTimeout(startTimer);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    } else {
      setReelActive(false);
      setBankReelActive(false);
      setLockedBlocks(4);
    }
  }, [isRolling, targetCard, onRollComplete, onLockedCountChange]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || isRolling || !cardRef.current) return;
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
  const getMaterialStyles = (mat: MaterialName, bank: BankName) => {
    // Exclusive WB Bank Custom Surface Style
    if (bank === 'ВБ Банк' && (mat === 'Classic Plastic' || mat === 'Matte Plastic')) {
      return 'bg-gradient-to-br from-[#2D0946] via-[#1B052B] to-[#0E0217] border-fuchsia-500/40 shadow-[0_14px_40px_rgba(203,17,171,0.3)] text-fuchsia-100';
    }

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
    const iconH = isCompact ? 'h-4.5' : 'h-6';
    const emblemW = isCompact ? 'w-4 h-4 text-[9px]' : 'w-5 h-5 text-[11px]';
    const textSz = isCompact ? 'text-[9px]' : 'text-xs';

    switch (b) {
      case 'ВБ Банк':
        return {
          emblem: (
            <div className={`flex items-center gap-1.5 ${iconH}`}>
              <div
                className={`${
                  isCompact ? 'w-4 h-4 text-[8px] rounded-md' : 'w-5 h-5 text-[10px] rounded-lg'
                } bg-gradient-to-br from-[#CB11AB] via-[#9C27B0] to-[#4A148C] flex items-center justify-center font-black text-white shadow-md shadow-fuchsia-950/60 border border-fuchsia-400/40`}
              >
                WB
              </div>
              <span
                className={`font-black tracking-wider uppercase bg-gradient-to-r from-fuchsia-300 via-pink-200 to-purple-300 bg-clip-text text-transparent ${textSz}`}
              >
                ВБ БАНК
              </span>
            </div>
          ),
          accent: 'text-fuchsia-400',
        };
      case 'Алфа Банк':
        return {
          emblem: (
            <div className={`flex items-center gap-1.5 ${iconH}`}>
              <span
                className={`${emblemW} rounded-full bg-red-600 flex items-center justify-center font-black text-white shadow-sm`}
              >
                A
              </span>
              <span className={`font-bold tracking-wider uppercase text-red-400 ${textSz}`}>
                АЛФА
              </span>
            </div>
          ),
          accent: 'text-red-400',
        };
      case 'ЗверьБанк':
        return {
          emblem: (
            <div className={`flex items-center gap-1.5 ${iconH}`}>
              <div
                className={`${emblemW} rounded-full border-2 border-emerald-400 flex items-center justify-center`}
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              </div>
              <span className={`font-bold tracking-wider uppercase text-emerald-400 ${textSz}`}>
                ЗВЕРЬ
              </span>
            </div>
          ),
          accent: 'text-emerald-400',
        };
      case 'ОзановБанк':
        return {
          emblem: (
            <div className={`flex items-center gap-1.5 ${iconH}`}>
              <div
                className={`${emblemW} rounded-md bg-blue-600 flex items-center justify-center font-bold text-white`}
              >
                OZ
              </div>
              <span className={`font-bold tracking-wider uppercase text-blue-400 ${textSz}`}>
                ОЗАНОВ
              </span>
            </div>
          ),
          accent: 'text-blue-400',
        };
      case 'Тинькоффи':
        return {
          emblem: (
            <div className={`flex items-center gap-1.5 ${iconH}`}>
              <div
                className={`${emblemW} rounded bg-yellow-400 flex items-center justify-center font-black text-black`}
              >
                T
              </div>
              <span className={`font-bold tracking-wider uppercase text-yellow-400 ${textSz}`}>
                ТИНЬКОФФИ
              </span>
            </div>
          ),
          accent: 'text-yellow-400',
        };
      case 'ОООтмыв Банк':
      default:
        return {
          emblem: (
            <div className={`flex items-center gap-1.5 ${iconH}`}>
              <div
                className={`${emblemW} rounded-full border border-purple-400 flex items-center justify-center text-purple-300 font-mono font-bold`}
              >
                $$
              </div>
              <span className={`font-bold tracking-wider uppercase text-purple-400 ${textSz}`}>
                ОООТМЫВ
              </span>
            </div>
          ),
          accent: 'text-purple-400',
        };
    }
  };

  // Build vertical bank reel strip
  const bankStrip = [...ALL_BANKS, ...ALL_BANKS, targetBank];
  const targetBankIndex = bankStrip.length - 1;

  // Progressive live score during roll
  const finalScore = activeCard?.collector_score || 25;
  const rollingScore = Math.max(
    10,
    Math.round(
      finalScore *
        (lockedBlocks === 0 ? 0.25 : lockedBlocks === 1 ? 0.45 : lockedBlocks === 2 ? 0.7 : lockedBlocks === 3 ? 0.9 : 1)
    )
  );

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform:
          interactive && !isRolling
            ? `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
            : undefined,
        transition: rotateX === 0 ? 'transform 0.4s ease-out' : 'none',
      }}
      className={`relative w-full ${
        isCompact ? 'p-3 max-w-[280px]' : 'p-5 sm:p-6 max-w-[360px]'
      } aspect-[1.58/1] shrink-0 rounded-2xl border flex flex-col justify-between overflow-hidden cursor-pointer select-none transition-shadow duration-300 box-border ${getMaterialStyles(
        targetMaterial,
        targetBank
      )} ${
        isRolling
          ? targetBank === 'ВБ Банк'
            ? 'shadow-[inset_0_0_0_2px_rgba(217,70,239,0.7),0_0_35px_rgba(203,17,171,0.4)]'
            : 'shadow-[inset_0_0_0_2px_rgba(251,191,36,0.6),0_0_35px_rgba(251,191,36,0.3)]'
          : ''
      } ${className}`}
    >
      {/* Specular Glare Overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />

      {/* Dynamic Laser / Shimmer during rolling */}
      {isRolling && (
        <div
          className={`absolute inset-0 pointer-events-none animate-shimmer ${
            targetBank === 'ВБ Банк'
              ? 'bg-gradient-to-r from-transparent via-fuchsia-400/25 to-transparent'
              : 'bg-gradient-to-r from-transparent via-amber-400/20 to-transparent'
          }`}
        />
      )}

      {/* Top Row: Bank Emblem (With Slot Reel) & Contactless Wave */}
      <div className="relative z-10 flex items-center justify-between">
        {isRolling ? (
          /* Animated Bank Slot Reel (Proper block layout with 3D fade mask) */
          <div
            className={`overflow-hidden relative w-36 ${isCompact ? 'h-4.5' : 'h-6'}`}
            style={{
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
              maskImage:
                'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
            }}
          >
            <div
              className="flex flex-col"
              style={{
                transform: bankReelActive
                  ? `translateY(-${targetBankIndex * (isCompact ? 18 : 24)}px)`
                  : 'translateY(0px)',
                transition: bankReelActive
                  ? 'transform 1350ms cubic-bezier(0.12, 0.85, 0.3, 1)'
                  : 'none',
              }}
            >
              {bankStrip.map((bName, idx) => (
                <div
                  key={idx}
                  className={`${isCompact ? 'h-4.5' : 'h-6'} shrink-0 flex items-center`}
                >
                  {getBankBranding(bName).emblem}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`${isCompact ? 'h-4.5' : 'h-6'} flex items-center`}>
            {getBankBranding(targetBank).emblem}
          </div>
        )}

        <div className="flex items-center gap-2">
          {targetCategory !== 'Standard' && (
            <span
              className={`px-2 py-0.5 rounded-full font-semibold tracking-wide bg-white/10 backdrop-blur-md border border-white/15 text-white flex items-center gap-1 ${
                isCompact ? 'text-[8px]' : 'text-[10px]'
              }`}
            >
              <Sparkles className={isCompact ? 'w-2.5 h-2.5 text-amber-300' : 'w-3 h-3 text-amber-300'} />
              {targetCategory}
            </span>
          )}
          <Wifi className={`${isCompact ? 'w-3.5 h-3.5' : 'w-5 h-5'} opacity-70 rotate-90`} />
        </div>
      </div>

      {/* Middle Row: EMV Chip & Rarity Score */}
      <div className="relative z-10 flex items-center justify-between my-auto pt-1">
        {/* Realistic EMV Chip */}
        <div
          className={`${
            isCompact ? 'w-7 h-5 rounded-[3px] p-[1px]' : 'w-11 h-8 rounded-md p-[1px]'
          } bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-md border border-amber-500/40 shrink-0`}
        >
          <div className="w-full h-full rounded-[2px] bg-amber-400/90 grid grid-cols-3 grid-rows-2 gap-[1px] p-[1.5px]">
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
            <div className="border border-amber-700/40 rounded-[1px]" />
          </div>
        </div>

        <div className={`${isCompact ? 'h-6' : 'h-8'} flex flex-col items-end justify-center shrink-0`}>
          {activeCard && (
            <>
              {!isCompact && (
                <span className="text-[10px] text-white/50 uppercase tracking-widest font-mono">
                  ОЦЕНКА
                </span>
              )}
              <span
                className={`font-bold font-mono tracking-tight text-white/90 ${
                  isCompact ? 'text-[10px]' : 'text-xs'
                }`}
              >
                ★ {isRolling ? rollingScore : activeCard.collector_score}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Bottom Area: 16-Digit Number (With Slot Reel) & Meta */}
      <div className="relative z-10 flex flex-col gap-1.5 sm:gap-2">
        {/* Card Number Container */}
        {isRolling ? (
          /* On-Card 16-Digit Slot Reel with 3D Depth Cylinders */
          <div
            className={`flex items-center justify-between font-mono font-bold tracking-[0.14em] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] overflow-hidden ${
              isCompact ? 'h-5 text-xs' : 'h-7 text-lg sm:text-xl'
            }`}
          >
            {[0, 1, 2, 3].map((blockIdx) => {
              const blockDelay = blockIdx * 180;
              const blockDuration = 650 + blockIdx * 500;
              const isLocked = lockedBlocks > blockIdx;

              return (
                <div
                  key={blockIdx}
                  className={`flex gap-[1.5px] px-1 py-0.5 rounded-lg transition-all duration-300 ${
                    isLocked
                      ? 'bg-amber-400/10 border border-amber-400/40 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                      : 'bg-black/30 border border-white/5'
                  }`}
                >
                  {[0, 1, 2, 3].map((dIdx) => {
                    const globalIdx = blockIdx * 4 + dIdx;
                    const finalDigit = parseInt(rawDigits[globalIdx] || '0', 10);
                    const digitStrip = [
                      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
                      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
                      finalDigit,
                    ];
                    const targetIdx = digitStrip.length - 1;
                    const colHeight = isCompact ? 20 : 28;

                    return (
                      <div
                        key={dIdx}
                        className={`${
                          isCompact ? 'w-[8px] h-5' : 'w-[11px] sm:w-[13px] h-7'
                        } overflow-hidden relative flex flex-col items-center`}
                        style={{
                          WebkitMaskImage:
                            'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
                          maskImage:
                            'linear-gradient(to bottom, transparent 0%, black 18%, black 82%, transparent 100%)',
                        }}
                      >
                        <div
                          className="flex flex-col items-center"
                          style={{
                            transform: reelActive
                              ? `translateY(-${targetIdx * colHeight}px)`
                              : 'translateY(0px)',
                            transition: reelActive
                              ? `transform ${blockDuration}ms cubic-bezier(0.12, 0.85, 0.3, 1) ${blockDelay}ms`
                              : 'none',
                          }}
                        >
                          {digitStrip.map((num, i) => (
                            <div
                              key={i}
                              className={`flex items-center justify-center font-mono font-bold text-white leading-none ${
                                isCompact ? 'h-5 text-xs' : 'h-7 text-lg sm:text-xl'
                              }`}
                            >
                              {num}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          /* Static Card Number (Guaranteed single line, never wraps!) */
          <div
            className={`${
              isCompact ? 'h-5 text-[11px] sm:text-xs tracking-wider' : 'h-7 text-lg sm:text-xl tracking-[0.16em]'
            } flex items-center font-mono font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] whitespace-nowrap overflow-hidden`}
          >
            {targetCardNumber}
          </div>
        )}

        {/* Expiry & Holder Info */}
        <div
          className={`flex items-end justify-between uppercase tracking-wider text-white/70 font-mono ${
            isCompact ? 'text-[8px] leading-tight' : 'text-[10px] sm:text-[11px]'
          }`}
        >
          <div>
            <div className={`${isCompact ? 'text-[6.5px]' : 'text-[8px]'} text-white/40 leading-none mb-0.5`}>
              VALID THRU
            </div>
            <div className="font-bold text-white/90">{expiresAt}</div>
          </div>
          <div>
            <div className={`${isCompact ? 'text-[6.5px]' : 'text-[8px]'} text-white/40 leading-none mb-0.5`}>
              CODE
            </div>
            <div className="font-bold text-white/90">{collectionCode}</div>
          </div>
          <div className="text-right">
            <div className={`${isCompact ? 'text-[6.5px]' : 'text-[8px]'} text-white/40 leading-none mb-0.5`}>
              MATERIAL
            </div>
            <div className="font-bold text-white/90">{targetMaterial}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
