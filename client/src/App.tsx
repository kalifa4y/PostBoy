import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { CampaignsView } from './views/CampaignsView';
import { VideosView } from './views/VideosView';
import { PublicationsView } from './views/PublicationsView';
import { FoundationView } from './views/FoundationView';
import { SettingsView } from './views/SettingsView';
import { PlaceholderView } from './views/PlaceholderView';
import { HealthStatus } from './types/domain';
import {
  Calendar,
  Share2
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);

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
      case 'foundation':
        return 'Phase 0 — Architecture & Fondations';
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
      case 'accounts':
        return 'Comptes Réseaux Sociaux';
      case 'settings':
        return 'Configuration Système';
      default:
        return 'PostBoy';
    }
  };

  return (
    <div className="flex h-screen bg-ows-bg overflow-hidden">
      {/* Barre latérale */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Zone Principale */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* En-tête */}
        <Header
          health={health}
          loading={loadingHealth}
          onRefreshHealth={fetchHealth}
          activeTitle={getTabTitle(activeTab)}
        />

        {/* Contenu principal défilable */}
        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'foundation' && (
            <FoundationView health={health} onNavigateToTab={setActiveTab} />
          )}

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
            <PlaceholderView
              phaseNumber={5}
              title="Calendrier & Programmation Manuelle"
              description="Visualisation temporelle et planification précise de vos clips sur une grille calendaire."
              icon={Calendar}
              deliverables={[
                'Vue mensuelle, hebdomadaire et journalière',
                'Glisser-déposer ou sélection de créneau horaire',
                'Respect du fuseau horaire configuré'
              ]}
            />
          )}

          {activeTab === 'accounts' && (
            <PlaceholderView
              phaseNumber={6}
              title="Connexion des Comptes Sociaux"
              description="Liaison sécurisée des profils sociaux via les APIs et flux officiels sans jamais stocker de mot de passe."
              icon={Share2}
              deliverables={[
                'Connexion OAuth2 sécurisée (TikTok, Instagram, YouTube)',
                'Chiffrement AES-256-GCM local des tokens d accès',
                'Gestion du rafraîchissement des jetons expirés'
              ]}
            />
          )}
        </main>
      </div>
    </div>
  );
};
