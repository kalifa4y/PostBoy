import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { CampaignsView } from './views/CampaignsView';
import { VideosView } from './views/VideosView';
import { PublicationsView } from './views/PublicationsView';
import { CalendarView } from './views/CalendarView';
import { SettingsView } from './views/SettingsView';
import { HealthStatus } from './types/domain';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Détection du paramètre d'onglet dans l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as NavTab | null;
    if (
      tabParam &&
      ['dashboard', 'campaigns', 'videos', 'publications', 'calendar', 'settings'].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      setLoadingHealth(true);
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      } else {
        setHealth(null);
      }
    } catch (err) {
      console.error('Erreur de connexion au serveur API:', err);
      setHealth(null);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    // Rafraîchissement automatique de l'état du serveur toutes les 30s
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Titres des vues
  const getTabTitle = (tab: NavTab): string => {
    switch (tab) {
      case 'dashboard':
        return 'Dashboard & Statistiques';
      case 'campaigns':
        return 'Gestion des Campagnes';
      case 'videos':
        return 'Bibliothèque de Vidéos';
      case 'publications':
        return 'Gestion des Publications';
      case 'calendar':
        return 'Calendrier & Programmation';
      case 'settings':
        return 'Configuration Système';
      default:
        return 'PostBoy';
    }
  };

  return (
    <div className="flex h-screen bg-ows-bg overflow-hidden w-full max-w-full">
      {/* Barre latérale desktop & Drawer mobile */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Zone Principale */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden w-full max-w-full">
        {/* En-tête avec bouton hamburger */}
        <Header
          health={health}
          loading={loadingHealth}
          onRefreshHealth={fetchHealth}
          activeTitle={getTabTitle(activeTab)}
          onToggleMenu={() => setIsMobileMenuOpen((prev) => !prev)}
        />

        {/* Contenu principal défilable avec padding réactif */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 w-full max-w-full overflow-x-hidden">
          {activeTab === 'settings' && (
            <SettingsView onSettingsUpdated={fetchHealth} />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              onNavigate={setActiveTab}
              activeTimezone={health?.activeTimezone || 'Africa/Bamako'}
            />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsView activeTimezone={health?.activeTimezone || 'Africa/Bamako'} />
          )}

          {activeTab === 'videos' && (
            <VideosView activeTimezone={health?.activeTimezone || 'Africa/Bamako'} />
          )}

          {activeTab === 'publications' && (
            <PublicationsView activeTimezone={health?.activeTimezone || 'Africa/Bamako'} />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              activeTimezone={health?.activeTimezone || 'Africa/Bamako'}
              onNavigateToTab={setActiveTab}
            />
          )}
        </main>
      </div>
    </div>
  );
};
