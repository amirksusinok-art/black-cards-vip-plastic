import React, { useState, useEffect } from 'react';
import { CosmeticItem } from '../types.js';
import { api } from '../utils/api.js';
import { hapticImpact, hapticNotification } from '../utils/telegram.js';
import confetti from 'canvas-confetti';
import { Star, Check, Sparkles, HelpCircle, FileText, ShoppingBag, X } from 'lucide-react';

export const StarsShopView: React.FC = () => {
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CosmeticItem | null>(null);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  const loadShop = async () => {
    setLoading(true);
    try {
      const res = await api.getShop();
      setItems(res.items);
    } catch (err) {
      console.error('Failed to load shop:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShop();
  }, []);

  const handleBuy = async (item: CosmeticItem) => {
    if (item.isOwned) return;
    setPurchasing(true);
    hapticImpact('heavy');

    try {
      const invoice = await api.createInvoice(item.id);

      if (invoice.invoiceUrl && !invoice.isDevTestMode && window.Telegram?.WebApp?.openInvoice) {
        // Live Telegram Stars invoice flow
        window.Telegram.WebApp.openInvoice(invoice.invoiceUrl, async (status: string) => {
          if (status === 'paid') {
            await api.confirmPayment(invoice.chargeId, false);
            hapticNotification('success');
            confetti({
              particleCount: 70,
              spread: 70,
              origin: { y: 0.6 },
              colors: ['#FBBF24', '#00FFCC', '#FFFFFF'],
            });
            alert(`Успешно! Предмет "${item.name}" активирован.`);
            setSelectedItem(null);
            loadShop();
          } else if (status === 'cancelled') {
            hapticNotification('warning');
          } else if (status === 'failed') {
            alert('Оплата Stars не завершена или была отменена');
            hapticNotification('error');
          }
        });
      } else {
        // Safe In-App Confirmation Mode (When BOT_TOKEN is in test mode or no Telegram merchant slug)
        const confirmBuy = window.confirm(
          `[Оплата Telegram Stars]\nТовар: ${item.name}\nСтоимость: ${item.price_stars} Stars (XTR)\n\nПодтвердить получение предмета?`
        );
        if (confirmBuy) {
          await api.confirmPayment(invoice.chargeId, true);
          hapticNotification('success');
          confetti({
            particleCount: 50,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#FBBF24', '#00FFCC', '#FFFFFF'],
          });
          alert(`Успешно! Предмет "${item.name}" добавлен в ваш профиль.`);
          setSelectedItem(null);
          loadShop();
        }
      }
    } catch (err: any) {
      alert(err.message || 'Ошибка выставления счета');
      hapticNotification('error');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <div className="w-full flex flex-col p-4 max-w-md mx-auto pb-20 select-none animate-fadeIn">
      {/* Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-950/40 via-[#18151D] to-[#12131C] border border-amber-500/30 mb-4 shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
          <h2 className="text-base font-bold text-white">Магазин Telegram Stars</h2>
        </div>
        <p className="text-xs text-white/60 leading-relaxed">
          Эксклюзивная косметика для вашего профиля и карт за валюту Telegram Stars (XTR). Покупки постоянны и не влияют на баланс монет.
        </p>

        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10 text-[11px] text-white/50">
          <button
            onClick={() => setShowTermsModal(true)}
            className="flex items-center gap-1 hover:text-white"
          >
            <FileText className="w-3 h-3" /> /terms
          </button>
          <span>•</span>
          <button
            onClick={() => setShowSupportModal(true)}
            className="flex items-center gap-1 hover:text-white"
          >
            <HelpCircle className="w-3 h-3" /> /paysupport
          </button>
        </div>
      </div>

      {/* Item Catalog */}
      {loading ? (
        <div className="text-center py-12 text-white/40 font-mono text-xs">
          Загрузка каталога...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="p-4 rounded-2xl bg-[#12151D] border border-white/10 hover:border-white/20 transition-all cursor-pointer flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white">{item.name}</span>
                  <span className="text-[11px] text-white/50 truncate max-w-[180px]">
                    {item.description}
                  </span>
                </div>
              </div>

              {item.isOwned ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-emerald-400 text-xs font-bold font-mono">
                  <Check className="w-3.5 h-3.5" />
                  Куплено
                </div>
              ) : (
                <div className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold font-mono">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  {item.price_stars} Stars
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Item Detail & Preview Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-[#141722] border border-white/15 p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">{selectedItem.name}</h3>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-white/40 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Visual Preview Box */}
            <div className="w-full h-32 rounded-2xl bg-black/40 border border-white/10 flex flex-col items-center justify-center p-4 text-center">
              <Sparkles className="w-8 h-8 text-amber-400 mb-2 animate-pulse" />
              <p className="text-xs text-white/80 font-medium">{selectedItem.description}</p>
            </div>

            <div className="flex items-center justify-between text-xs font-mono py-1 border-b border-white/5">
              <span className="text-white/40">Цена покупки:</span>
              <span className="font-bold text-amber-400 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                {selectedItem.price_stars} Stars (XTR)
              </span>
            </div>

            <div className="text-[11px] text-white/40 leading-relaxed">
              Покупка привязывается к вашему Telegram аккаунту навсегда. Косметика не дает игровых преимуществ и не подлежит возврату после активации.
            </div>

            {selectedItem.isOwned ? (
              <button
                disabled
                className="w-full py-3 rounded-xl bg-white/10 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Товар уже в вашей коллекции
              </button>
            ) : (
              <button
                onClick={() => handleBuy(selectedItem)}
                disabled={purchasing}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-black font-bold text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" />
                {purchasing ? 'Оформление счета...' : `Купить за ${selectedItem.price_stars} Stars`}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Terms Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-[#141722] border border-white/15 p-5 shadow-2xl flex flex-col gap-3 text-xs text-white/70">
            <h3 className="font-bold text-sm text-white">Условия использования (/terms)</h3>
            <p>1. CardDrop — это виртуальная коллекционная игра. Все карты, номера, баланс Coins и материалы являются демонстрационными игровыми объектами.</p>
            <p>2. Цифровые товары в Telegram Stars являются исключительно косметическими (фоны, рамки, стили).</p>
            <p>3. В приложении отсутствует вывод реальных денежных средств, обмен на фиатную валюту или азартные ставки.</p>
            <button
              onClick={() => setShowTermsModal(false)}
              className="mt-2 w-full py-2.5 rounded-xl bg-white/10 text-white font-bold"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Pay Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-[#141722] border border-white/15 p-5 shadow-2xl flex flex-col gap-3 text-xs text-white/70">
            <h3 className="font-bold text-sm text-white">Служба поддержки (/paysupport)</h3>
            <p>Если у вас возникли вопросы по оплате Telegram Stars или доставке косметических товаров:</p>
            <p className="font-mono text-emerald-400">Telegram: @stena10</p>
            <p className="text-white/40">Укажите ваш Telegram ID и номер транзакции при обращении.</p>
            <button
              onClick={() => setShowSupportModal(false)}
              className="mt-2 w-full py-2.5 rounded-xl bg-white/10 text-white font-bold"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
