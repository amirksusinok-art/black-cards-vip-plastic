import React, { useState, useEffect } from 'react';
import { UserProfile, LeaderboardUser, Card } from '../types.js';
import { api } from '../utils/api.js';
import { CardPreview } from './CardPreview.js';
import { hapticImpact, hapticSelection } from '../utils/telegram.js';
import { Trophy, Star, Share2, Award, Users, Shield, Sparkles } from 'lucide-react';

interface ProfileViewProps {
  user: UserProfile | null;
  onOpenCardDetails: (card: Card) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, onOpenCardDetails }) => {
  const [favoriteCards, setFavoriteCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load favorite cards
        if (user && user.favorites.length > 0) {
          const loaded: Card[] = [];
          for (const favId of user.favorites.slice(0, 5)) {
            try {
              const c = await api.getCardById(favId);
              if (c.card) loaded.push(c.card);
            } catch {
              // ignore
            }
          }
          setFavoriteCards(loaded);
        }
      } catch (err) {
        console.error('Failed to load profile data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const handleShareProfile = () => {
    hapticImpact('light');
    const shareText = `🔥 Мой профиль в CardDrop: Black Cards & Коллекции!\nУровень: ${user?.level || 1}\nКарт в коллекции: ${user?.totalCards || 0}\nПрисоединяйся к выпуску карт!`;
    
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent('https://t.me/your_bot')}&text=${encodeURIComponent(
          shareText
        )}`
      );
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareText);
      alert('Ссылка на профиль скопирована!');
    }
  };

  const getCollectorRank = (cardsCount: number) => {
    if (cardsCount >= 100) return 'Diamond Black Master';
    if (cardsCount >= 50) return 'Titanium Legend';
    if (cardsCount >= 20) return 'Gold Connoisseur';
    if (cardsCount >= 5) return 'Plastic Enthusiast';
    return 'Новичок клуба';
  };

  return (
    <div className="w-full flex flex-col p-4 max-w-md mx-auto pb-20 select-none animate-fadeIn">
      <div className="flex flex-col gap-4">
          {/* User Card */}
          <div className="p-5 rounded-3xl bg-gradient-to-br from-[#181B26] to-[#0E1017] border border-white/15 shadow-xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-700 p-0.5 shadow-md">
                <div className="w-full h-full rounded-[14px] bg-[#12151D] flex items-center justify-center font-bold text-lg text-white uppercase overflow-hidden">
                  {user?.photoUrl ? (
                    <img src={user.photoUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    user?.username?.slice(0, 2) || 'CD'
                  )}
                </div>
              </div>

              <div className="flex flex-col">
                <h3 className="text-base font-bold text-white flex items-center gap-1.5 flex-wrap">
                  {user?.prefix && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold">
                      {user.prefix}
                    </span>
                  )}
                  <span>{user?.firstName || user?.username || 'Игрок'}</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </h3>
                <span className="text-xs text-emerald-400 font-semibold font-mono">
                  {getCollectorRank(user?.totalCards || 0)}
                </span>
                <span className="text-[11px] text-white/40 font-mono">
                  Уровень {user?.level || 1} • {user?.totalCards || 0} карт
                </span>
              </div>
            </div>

            {/* Share Profile Button */}
            <button
              onClick={handleShareProfile}
              className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all"
            >
              <Share2 className="w-4 h-4 text-cyan-400" />
              Поделиться профилем в Telegram
            </button>
          </div>

          {/* Favorites Showcase (up to 5 cards) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                Избранные карты ({favoriteCards.length}/5)
              </span>
            </div>

            {favoriteCards.length === 0 ? (
              <div className="p-4 rounded-2xl bg-[#12151D] border border-white/5 text-center text-xs text-white/40">
                Вы пока не добавили карты в избранное. Откройте любую карту в коллекции и нажмите звёздочку!
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                {favoriteCards.map((card) => (
                  <div
                    key={card.id}
                    onClick={() => onOpenCardDetails(card)}
                    className="min-w-[220px] max-w-[220px] shrink-0 cursor-pointer"
                  >
                    <CardPreview card={card} interactive={false} size="compact" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Achievements Summary */}
          <div className="p-4 rounded-2xl bg-[#12151D] border border-white/5 flex flex-col gap-2">
            <span className="text-xs font-bold text-white/70 uppercase font-mono mb-1">
              Достижения коллекции
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-white/5 flex flex-col">
                <span className="text-[10px] text-white/40">Уникальные банки</span>
                <span className="font-bold text-white font-mono mt-0.5">5 из 5 доступно</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 flex flex-col">
                <span className="text-[10px] text-white/40">Редкие материалы</span>
                <span className="font-bold text-amber-400 font-mono mt-0.5">6 доступно</span>
              </div>
            </div>
          </div>
        </div>
      </div>
  );
};
