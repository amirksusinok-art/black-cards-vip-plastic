import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, Card } from './types.js';
import { api } from './utils/api.js';
import { initTelegramApp, tg } from './utils/telegram.js';
import { TopNav } from './components/TopNav.js';
import { MintTerminal } from './components/MintTerminal.js';
import { CollectionView } from './components/CollectionView.js';
import { AvitaView } from './components/AvitaView.js';
import { AlbumsView } from './components/AlbumsView.js';
import { TasksView } from './components/TasksView.js';
import { StarsShopView } from './components/StarsShopView.js';
import { ProfileView } from './components/ProfileView.js';
import { ClickerView } from './components/ClickerView.js';
import { NavigationMenu, NavScreen } from './components/NavigationMenu.js';
import { CardDetailModal } from './components/CardDetailModal.js';
import { RulesModal } from './components/RulesModal.js';
import { PrivacyModal } from './components/PrivacyModal.js';
import { LeaderboardView } from './components/LeaderboardView.js';
import { SettingsModal } from './components/SettingsModal.js';
import { AdminModal } from './components/AdminModal.js';
import { OnboardingGuide } from './components/OnboardingGuide.js';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentScreen, setCurrentScreen] = useState<NavScreen>('mint');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showOnboardingGuide, setShowOnboardingGuide] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch (err) {
      console.error('Failed to load user data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initTelegramApp();
    loadUserData();

    // Check Onboarding
    const localOnboard = localStorage.getItem('carddrop_onboarding_completed');
    if (!localOnboard) {
      api.getSettings().then((res) => {
        if (!res.settings?.onboardingCompleted) {
          setShowOnboardingGuide(true);
        }
      }).catch(() => {
        setShowOnboardingGuide(true);
      });
    }

    // Check Admin
    api.verifyAdmin().then((res) => {
      setIsAdmin(res.isAdmin);
    }).catch(() => {});
  }, [loadUserData]);

  // Handle Telegram BackButton
  useEffect(() => {
    if (!tg?.BackButton) return;

    if (currentScreen !== 'mint' || selectedCard) {
      tg.BackButton.show();
      const handleBack = () => {
        if (selectedCard) {
          setSelectedCard(null);
        } else {
          setCurrentScreen('mint');
        }
      };
      tg.BackButton.onClick(handleBack);
      return () => {
        tg.BackButton.offClick(handleBack);
      };
    } else {
      tg.BackButton.hide();
    }
  }, [currentScreen, selectedCard]);

  const handleToggleFavorite = async (cardId: number) => {
    if (!user) return;
    const isFav = user.favorites.includes(cardId);
    try {
      if (isFav) {
        await api.removeFavorite(cardId);
        setUser({ ...user, favorites: user.favorites.filter((id) => id !== cardId) });
      } else {
        await api.addFavorite(cardId);
        setUser({ ...user, favorites: [...user.favorites, cardId] });
      }
    } catch (err: any) {
      alert(err.message || 'Ошибка обновления избранного');
    }
  };

  if (loading && !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#08090C] text-white">
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="font-mono text-xs tracking-widest text-white/50 uppercase">
          Загрузка CardDrop...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#08090C] text-[#F3F4F6]">
      {/* Top Header with Clean Minimal Layout */}
      <TopNav
        user={user}
        currentScreen={currentScreen}
        onSelectScreen={(screen) => setCurrentScreen(screen)}
        onOpenMenu={() => setMenuOpen(true)}
        onOpenTasks={() => setCurrentScreen('tasks')}
        onOpenSettings={() => setShowSettingsModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {currentScreen === 'mint' && (
          <MintTerminal
            user={user}
            onRefreshUser={loadUserData}
            onOpenCardDetails={(card) => setSelectedCard(card)}
          />
        )}

        {currentScreen === 'collection' && (
          <CollectionView
            favorites={user?.favorites || []}
            onOpenCardDetails={(card) => setSelectedCard(card)}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {currentScreen === 'earn' && (
          <ClickerView
            user={user}
            onRefreshUser={loadUserData}
          />
        )}

        {currentScreen === 'avita' && (
          <AvitaView
            user={user}
            onRefreshUser={loadUserData}
            onOpenCardDetails={(card) => setSelectedCard(card)}
          />
        )}

        {currentScreen === 'leaderboard' && (
          <LeaderboardView
            onOpenCardDetails={(card) => setSelectedCard(card)}
          />
        )}

        {currentScreen === 'albums' && <AlbumsView />}

        {currentScreen === 'tasks' && <TasksView onRewardClaimed={loadUserData} />}

        {currentScreen === 'shop' && <StarsShopView />}

        {currentScreen === 'profile' && (
          <ProfileView
            user={user}
            onOpenCardDetails={(card) => setSelectedCard(card)}
          />
        )}
      </main>

      {/* Navigation Drawer Menu */}
      {menuOpen && (
        <NavigationMenu
          currentScreen={currentScreen}
          onSelectScreen={(screen) => setCurrentScreen(screen)}
          onClose={() => setMenuOpen(false)}
          onOpenRules={() => setShowRulesModal(true)}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          onOpenAdmin={() => setShowAdminModal(true)}
          isAdmin={isAdmin}
        />
      )}

      {/* Full-screen Card Details Modal */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          isFavorite={(user?.favorites || []).includes(selectedCard.id)}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {/* Rules Modal */}
      {showRulesModal && <RulesModal onClose={() => setShowRulesModal(false)} />}

      {/* Privacy Policy Modal */}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onRestartOnboarding={() => setShowOnboardingGuide(true)}
        onOpenAdmin={() => setShowAdminModal(true)}
      />

      {/* Admin Panel Modal */}
      <AdminModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onRefreshGlobalUser={loadUserData}
      />

      {/* Onboarding Guide */}
      <OnboardingGuide
        isOpen={showOnboardingGuide}
        onClose={() => setShowOnboardingGuide(false)}
        onNavigateToScreen={(screen) => setCurrentScreen(screen)}
      />
    </div>
  );
};

