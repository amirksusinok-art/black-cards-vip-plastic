import React from 'react';
import { X, Shield, Lock, Eye, FileText } from 'lucide-react';

interface PrivacyModalProps {
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn select-none">
      <div className="w-full max-w-sm rounded-3xl bg-[#12151D] border border-white/15 p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Политика конфиденциальности</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-white/50 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-white/80 leading-relaxed font-sans">
          <div>
            <h4 className="font-bold text-emerald-300 flex items-center gap-1 mb-1">
              <Lock className="w-3.5 h-3.5 text-emerald-400" /> 1. Безопасность данных
            </h4>
            <p className="text-white/60">
              CardDrop использует исключительно публичные идентификаторы Telegram (ID пользователя, имя пользователя) для аутентификации через официальный Telegram WebApp API.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-cyan-300 flex items-center gap-1 mb-1">
              <Eye className="w-3.5 h-3.5 text-cyan-400" /> 2. Использование информации
            </h4>
            <p className="text-white/60">
              Ваши данные используются строго внутри игрового процесса: сохранение коллекции карт, учёт монет, выполнение заданий и отображение в глобальном рейтинге.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-amber-300 flex items-center gap-1 mb-1">
              <FileText className="w-3.5 h-3.5 text-amber-400" /> 3. Платежи и Stars
            </h4>
            <p className="text-white/60">
              Все платежи в звёздах обрабатываются напрямую платёжным шлюзом Telegram (Telegram Stars). Сервер приложения не имеет доступа к вашим банковским картам или персональным платежным реквизитам.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-2 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider transition-all"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
};
