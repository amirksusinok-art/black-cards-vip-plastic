import React, { useState, useEffect } from 'react';
import { AlbumItem } from '../types.js';
import { api } from '../utils/api.js';
import { BookOpen, CheckCircle2, Coins, Award } from 'lucide-react';

export const AlbumsView: React.FC = () => {
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.getAlbums();
        setAlbums(res.albums);
      } catch (err) {
        console.error('Failed to load albums:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="w-full flex flex-col p-4 max-w-md mx-auto pb-20 select-none animate-fadeIn">
      <div className="p-4 rounded-2xl bg-[#12151D] border border-white/10 mb-4 shadow-lg flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-amber-400" />
            Коллекционные альбомы
          </h2>
          <p className="text-xs text-white/50 mt-0.5">
            Собирайте полные сеты карт для закрытия альбомов и бонусов
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-white/40 font-mono text-xs">
          Загрузка альбомов...
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {albums.map((album) => {
            const percent = Math.min(100, Math.round((album.progress / album.required_count) * 100));
            return (
              <div
                key={album.id}
                className="p-4 rounded-2xl bg-[#12151D] border border-white/10 flex flex-col gap-3 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-sm text-white">{album.name}</span>
                  </div>
                  {album.isCompleted ? (
                    <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Завершен
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-white/50">
                      {album.progress} / {album.required_count}
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/60">{album.description}</p>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-white/40">
                  <span>Награда за сбор:</span>
                  <span className="text-amber-400 font-bold flex items-center gap-1">
                    <Coins className="w-3 h-3" /> +{album.reward_coins} C
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
