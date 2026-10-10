import React, { useState } from 'react';
import {
  CreditCard,
  Layers,
  Star,
  Store,
  ChevronRight,
  Check,
  X,
  Sparkles,
} from 'lucide-react';
import { api } from '../utils/api.js';
import { hapticSelection, hapticNotification } from '../utils/telegram.js';

interface OnboardingGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToScreen?: (screen: any) => void;
}

export const OnboardingGuide: React.FC<OnboardingGuideProps> = ({
  isOpen,
  onClose,
  onNavigateToScreen,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      title: '1. Выпуск коллекционной карты',
      desc: 'Выбирайте кейс (от БОМЖ до Элит) и жмите «ВЫПУСТИТЬ КАРТУ». 16 цифр номера карты синхронно вращаются на барабанах прямо на чипе карты!',
      icon: <CreditCard className="w-8 h-8 text-emerald-400" />,
      accentColor: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
      badge: 'ШАГ 1 ИЗ 4',
      screen: 'mint',
    },
    {
      title: '2. Характеристики и редкость',
      desc: 'Каждая карта получает банк (Алфа, Зверь, ВБ Банк), премиальный материал (от Пластика до Титана и Золота) и уникальный узор номера (Triple, Quad, Mirror, 777).',
      icon: <Layers className="w-8 h-8 text-cyan-400" />,
      accentColor: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
      badge: 'ШАГ 2 ИЗ 4',
      screen: 'mint',
    },
    {
      title: '3. Избранное и Коллекция',
      desc: 'Отмечайте лучшие карты звёздочкой ★, чтобы сохранить их в Избранное. Собирайте полные банковские и материальные альбомы ради бонусных монет!',
      icon: <Star className="w-8 h-8 text-amber-400" />,
      accentColor: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
      badge: 'ШАГ 3 ИЗ 4',
      screen: 'collection',
    },
    {
      title: '4. Продажа скупщику «Авита»',
      desc: 'Ненужные или дублирующиеся карты можно продать виртуальному торговцу Авите за Coins. Соглашайтесь, торгуйтесь или сбрасывайте партию оптом!',
      icon: <Store className="w-8 h-8 text-purple-400" />,
      accentColor: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
      badge: 'ШАГ 4 ИЗ 4',
      screen: 'avita',
    },
  ];

  const step = steps[currentStep];

  const handleFinish = async () => {
    hapticNotification('success');
    localStorage.setItem('carddrop_onboarding_completed', 'true');
    api.updateSettings({ onboardingCompleted: true }).catch(() => {});
    onClose();
  };

  const handleNext = () => {
    hapticSelection();
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      if (onNavigateToScreen && steps[currentStep + 1].screen) {
        onNavigateToScreen(steps[currentStep + 1].screen);
      }
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    hapticSelection();
    handleFinish();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-fadeIn select-none p-4 font-mono">
      <div className="w-full max-w-sm rounded-3xl bg-[#0F111A] border border-white/20 p-5 shadow-2xl flex flex-col gap-4 relative">
        {/* Step progress pills */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === currentStep
                    ? 'w-6 bg-amber-400'
                    : idx < currentStep
                    ? 'w-3 bg-white/40'
                    : 'w-3 bg-white/10'
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="text-xs text-white/40 hover:text-white transition-colors"
          >
            Пропустить
          </button>
        </div>

        {/* Step Visual Card */}
        <div className="flex flex-col items-center text-center py-3">
          <div className={`p-4 rounded-3xl border mb-3 ${step.accentColor} shadow-lg`}>
            {step.icon}
          </div>
          <span className="text-[10px] font-bold tracking-wider text-amber-400 uppercase mb-1">
            {step.badge}
          </span>
          <h3 className="text-base font-bold text-white tracking-tight mb-2">
            {step.title}
          </h3>
          <p className="text-xs text-white/70 leading-relaxed font-sans">
            {step.desc}
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
          <button
            onClick={handleNext}
            className="w-full py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-black font-black text-xs transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-lg"
          >
            <span>{currentStep === steps.length - 1 ? 'Начать игру' : 'Далее'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
