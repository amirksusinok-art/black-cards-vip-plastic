import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Vibrate,
  Sparkles,
  Bell,
  Cpu,
  BookOpen,
  KeyRound,
  ShieldCheck,
  Check,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { GameSettings } from '../types.js';
import { api, setSavedAdminPassword, getSavedAdminPassword } from '../utils/api.js';
import { hapticSelection, hapticImpact, hapticNotification } from '../utils/telegram.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestartOnboarding: () => void;
  onOpenAdmin: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onRestartOnboarding,
  onOpenAdmin,
}) => {
  const [settings, setSettings] = useState<GameSettings>({
    soundEnabled: true,
    hapticsEnabled: true,
    animationsEnabled: true,
    notificationsEnabled: true,
    compactMode: false,
    onboardingCompleted: false,
  });

  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Load settings
      api.getSettings()
        .then((res) => {
          if (res.settings) setSettings(res.settings);
        })
        .catch(() => {});

      // Check existing admin password
      const savedPw = getSavedAdminPassword();
      if (savedPw) {
        setAdminPassword(savedPw);
        api.verifyAdmin(savedPw)
          .then((res) => setIsAdminVerified(res.isAdmin))
          .catch(() => {});
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggle = async (key: keyof GameSettings) => {
    hapticSelection();
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);

    // Save to localStorage for instant local use
    localStorage.setItem(`carddrop_${key}`, String(updated[key]));

    try {
      setSaving(true);
      await api.updateSettings(updated);
    } catch {
      // keep local
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyAdmin = async () => {
    hapticSelection();
    setAdminError(null);
    setAdminSuccess(null);

    try {
      const res = await api.verifyAdmin(adminPassword.trim());
      if (res.isAdmin) {
        setIsAdminVerified(true);
        setSavedAdminPassword(adminPassword.trim());
        setAdminSuccess('Доступ администратора подтверждён!');
        hapticNotification('success');
      } else {
        setIsAdminVerified(false);
        setAdminError('Неверный пароль администратора');
        hapticNotification('error');
      }
    } catch (err: any) {
      setAdminError(err.message || 'Ошибка проверки пароля');
      hapticNotification('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn select-none p-0 sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[#10121A] border border-white/15 p-5 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white tracking-tight">Настройки игры</h2>
          </div>
          <button
            onClick={() => {
              hapticSelection();
              onClose();
            }}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Toggles List */}
        <div className="flex flex-col gap-2 font-mono">
          {/* Sounds */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#141724] border border-white/5">
            <div className="flex items-center gap-3">
              {settings.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-white/30" />
              )}
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Звуковые эффекты</span>
                <span className="text-[10px] text-white/40">Звуки кликов, крутки и джинглы</span>
              </div>
            </div>
            <button
              onClick={() => handleToggle('soundEnabled')}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                settings.soundEnabled ? 'bg-emerald-500 justify-end' : 'bg-neutral-700 justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Haptics */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#141724] border border-white/5">
            <div className="flex items-center gap-3">
              <Vibrate className={`w-4 h-4 ${settings.hapticsEnabled ? 'text-amber-400' : 'text-white/30'}`} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Вибрация (Telegram Haptics)</span>
                <span className="text-[10px] text-white/40">Тактильный отклик при касаниях</span>
              </div>
            </div>
            <button
              onClick={() => handleToggle('hapticsEnabled')}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                settings.hapticsEnabled ? 'bg-amber-500 justify-end' : 'bg-neutral-700 justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Animations */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#141724] border border-white/5">
            <div className="flex items-center gap-3">
              <Sparkles className={`w-4 h-4 ${settings.animationsEnabled ? 'text-purple-400' : 'text-white/30'}`} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Плавные анимации</span>
                <span className="text-[10px] text-white/40">Визуальные эффекты переходов</span>
              </div>
            </div>
            <button
              onClick={() => handleToggle('animationsEnabled')}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                settings.animationsEnabled ? 'bg-purple-500 justify-end' : 'bg-neutral-700 justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Compact Mode for Low-End Devices */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#141724] border border-white/5">
            <div className="flex items-center gap-3">
              <Cpu className={`w-4 h-4 ${settings.compactMode ? 'text-cyan-400' : 'text-white/30'}`} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Компактный режим (60 FPS)</span>
                <span className="text-[10px] text-white/40">Отключение blur и 3D для слабых телефонов</span>
              </div>
            </div>
            <button
              onClick={() => handleToggle('compactMode')}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 flex items-center ${
                settings.compactMode ? 'bg-cyan-500 justify-end' : 'bg-neutral-700 justify-start'
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>
        </div>

        {/* Onboarding Restart Button */}
        <button
          onClick={() => {
            hapticSelection();
            onClose();
            onRestartOnboarding();
          }}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-[#141724] hover:bg-[#1A1E2E] border border-white/10 hover:border-white/20 text-xs font-mono font-bold text-white transition-all active:scale-98"
        >
          <BookOpen className="w-4 h-4 text-emerald-400" />
          <span>Пройти обучение новичка заново</span>
        </button>

        {/* Admin Password Entry Section */}
        <div className="flex flex-col p-3 rounded-2xl bg-[#141724] border border-white/10 gap-2.5 font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white">Доступ администратора</span>
            </div>
            {isAdminVerified && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Вход выполнен
              </span>
            )}
          </div>

          {!isAdminVerified ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Введите пароль администратора"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyAdmin()}
                  className="flex-1 bg-[#0A0C13] border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400 font-mono"
                />
                <button
                  onClick={handleVerifyAdmin}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition-colors shrink-0"
                >
                  Войти
                </button>
              </div>

              {adminError && (
                <div className="text-[11px] text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{adminError}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {adminSuccess && (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3 shrink-0" />
                  <span>{adminSuccess}</span>
                </div>
              )}
              <button
                onClick={() => {
                  hapticSelection();
                  onClose();
                  onOpenAdmin();
                }}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Открыть панель администратора</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
