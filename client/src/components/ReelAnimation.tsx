import React, { useEffect, useState } from 'react';
import { Card } from '../types.js';
import { hapticImpact } from '../utils/telegram.js';
import { FastForward, Sparkles } from 'lucide-react';

interface ReelAnimationProps {
  card: Card;
  isAccelerated?: boolean;
  onComplete: () => void;
}

export const ReelAnimation: React.FC<ReelAnimationProps> = ({
  card,
  isAccelerated = false,
  onComplete,
}) => {
  const digits = card.card_number.replace(/\s+/g, '').split(''); // 16 digits
  const [lockedIndices, setLockedIndices] = useState<number[]>([]);
  const [displayDigits, setDisplayDigits] = useState<string[]>(() =>
    digits.map(() => Math.floor(Math.random() * 10).toString())
  );

  const isRare = ['Triple', 'Quad', 'Repeater', 'Straight', 'Mirror'].includes(card.category);

  useEffect(() => {
    // Digit cycling interval
    const cycleInterval = setInterval(() => {
      setDisplayDigits((prev) =>
        prev.map((d, idx) => {
          if (lockedIndices.includes(idx)) {
            return digits[idx];
          }
          return Math.floor(Math.random() * 10).toString();
        })
      );
    }, 45);

    return () => clearInterval(cycleInterval);
  }, [lockedIndices, digits]);

  useEffect(() => {
    // Column progressive lock timing
    const stepDelay = isAccelerated ? 35 : isRare ? 90 : 65;
    const timeouts: NodeJS.Timeout[] = [];

    digits.forEach((_, idx) => {
      const t = setTimeout(() => {
        setLockedIndices((prev) => [...prev, idx]);
        if (idx % 4 === 3) {
          hapticImpact('light');
        }
        if (idx === digits.length - 1) {
          // Finished
          setTimeout(() => {
            hapticImpact('heavy');
            onComplete();
          }, isAccelerated ? 100 : 300);
        }
      }, (idx + 1) * stepDelay);
      timeouts.push(t);
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [digits, isAccelerated, isRare, onComplete]);

  const handleSkip = () => {
    hapticImpact('medium');
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-6 select-none animate-fadeIn">
      {/* Rare drop metallic background glow */}
      {isRare && (
        <div className="absolute inset-0 bg-radial from-amber-500/10 via-transparent to-transparent pointer-events-none animate-pulse" />
      )}

      <div className="relative z-10 flex flex-col items-center max-w-sm w-full">
        {/* Rare Drop Badge */}
        {isRare && (
          <div className="mb-6 flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold uppercase tracking-wider animate-bounce">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Редкий узор: {card.category}
          </div>
        )}

        <div className="text-white/60 text-xs uppercase tracking-widest font-mono mb-4">
          ГЕНЕРАЦИЯ НОМЕРА
        </div>

        {/* 16 Digit Columns grouped in 4 blocks */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 w-full p-4 rounded-2xl bg-[#12151D] border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.8)]">
          {[0, 1, 2, 3].map((blockIdx) => (
            <div key={blockIdx} className="flex justify-center gap-1">
              {[0, 1, 2, 3].map((digitInBlock) => {
                const globalIdx = blockIdx * 4 + digitInBlock;
                const isLocked = lockedIndices.includes(globalIdx);
                return (
                  <div
                    key={digitInBlock}
                    className={`w-5 h-9 sm:w-6 sm:h-11 flex items-center justify-center font-mono font-bold text-base sm:text-xl rounded transition-all duration-150 ${
                      isLocked
                        ? 'text-white bg-white/10 border border-white/20 scale-105'
                        : 'text-white/40 bg-white/5'
                    }`}
                  >
                    {isLocked ? digits[globalIdx] : displayDigits[globalIdx]}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Bank & Material Teaser */}
        <div className="mt-6 flex items-center gap-4 text-xs font-mono text-white/50">
          <span>БАНК: <strong className="text-white/80">{card.bank}</strong></span>
          <span>•</span>
          <span>МАТЕРИАЛ: <strong className="text-white/80">{card.material}</strong></span>
        </div>

        {/* Skip button */}
        <button
          onClick={handleSkip}
          className="mt-8 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white/70 text-xs font-medium transition-all"
        >
          <FastForward className="w-3.5 h-3.5" />
          Пропустить анимацию
        </button>
      </div>
    </div>
  );
};
