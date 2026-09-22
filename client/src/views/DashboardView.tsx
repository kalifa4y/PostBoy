import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  Send,
  Calendar,
  ExternalLink,
  RefreshCw,
  Clock,
  Flame,
  Target,
  BarChart3,
  XCircle
} from 'lucide-react';
import {
  DashboardData,
  ClippingHistoryResponse,
  DailyClippingGoal
} from '../types/domain';
import { NavTab } from '../components/layout/Sidebar';

interface DashboardViewProps {
  onNavigate: (tab: NavTab) => void;
  activeTimezone: string;
}

// Composant d'icône vectorielle SVG pour chaque réseau social (Zero Emoji)
const PlatformBadge: React.FC<{ platform: string }> = ({ platform }) => {
  const p = platform.toLowerCase();

  if (p === 'tiktok') {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#ff0050]/10 text-[#ff4b72] border border-[#ff0050]/20">
        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.5 6.27 6.27 0 0 0 1.9-4.49V8.41a8.28 8.28 0 0 0 4.87 1.57V6.69z" />
        </svg>
        <span>TikTok</span>
      </span>
    );
  }

  if (p === 'youtube') {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#ff0000]/10 text-[#ff4d4d] border border-[#ff0000]/20">
        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
        <span>YouTube</span>
      </span>
    );
  }

  if (p === 'instagram') {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-[#e1306c]/10 text-[#f77737] border border-[#e1306c]/20">
        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
        </svg>
        <span>Instagram</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-ows-surface2 text-ows-textMuted border border-ows-border">
      {platform}
    </span>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, activeTimezone }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres temporels de l'historique (Phase 5)
  const [historyPeriod, setHistoryPeriod] = useState<'day' | 'week' | 'month' | 'year'>('week');
  const [historyData, setHistoryData] = useState<ClippingHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const fetchDashboardStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) {
        throw new Error(`Erreur serveur (${res.status})`);
      }
      const json = await res.json();
      if (json.status === 'success') {
        setData(json);
      } else {
        throw new Error(json.message || 'Impossible de récupérer les statistiques.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue de chargement';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async (period: 'day' | 'week' | 'month' | 'year') => {
    try {
      setHistoryLoading(true);
      const res = await fetch(`/api/dashboard/history?period=${period}`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success') {
          setHistoryData(json);
        }
      }
    } catch (err) {
      console.error('Erreur chargement historique:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardStats();
    // Rafraîchissement périodique toutes les 20 secondes
    const interval = setInterval(fetchDashboardStats, 20000);
    return () => clearInterval(interval);
  }, [fetchDashboardStats]);

  useEffect(() => {
    fetchHistory(historyPeriod);
  }, [fetchHistory, historyPeriod]);

  // Formatage de date locale
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Date non définie';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: activeTimezone || 'Africa/Bamako'
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const stats = data?.stats || {
    videosToPublish: 0,
    scheduledCount: 0,
    publishedCount: 0,
    failedCount: 0,
    totalVideos: 0
  };

  const dailyGoal: DailyClippingGoal = data?.dailyGoal || {
    date: new Date().toISOString().slice(0, 10),
    targetPosts: 5,
    targetCampaigns: 5,
    scheduledToday: 0,
    publishedToday: 0,
    distinctCampaignsToday: 0,
    remainingPosts: 5,
    remainingCampaigns: 5,
    isGoalMet: false,
    streak: 0,
    bestStreak: 0
  };

  const upcomingList = data?.upcomingPublications || [];
  const recentList = data?.recentPublications || [];

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & Actions Rapides */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-ows-textMain tracking-tight">
            Tableau de Bord
          </h2>
          <p className="text-xs text-ows-textMuted mt-1">
            Supervision en temps réel, discipline de clipping et suivi des publications.
          </p>
        </div>

        {/* Bouton d'actualisation manuelle */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              fetchDashboardStats();
              fetchHistory(historyPeriod);
            }}
            disabled={loading || historyLoading}
            className="inline-flex items-center space-x-2 px-3 py-2 rounded-lg bg-ows-surface1 border border-ows-border hover:border-ows-accent/50 text-xs font-medium text-ows-textMuted hover:text-ows-textMain transition-all disabled:opacity-50"
            title="Rafraîchir les métriques"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(loading || historyLoading) ? 'animate-spin text-ows-accent' : ''}`} />
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Message d'erreur éventuel */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. OBJECTIF QUOTIDIEN DE DISCIPLINE DE CLIPPING (PHASE 5) */}
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-ows-borderSubtle">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h3 className="text-base font-bold font-heading text-ows-textMain">
                  Discipline Quotidienne de Clipping
                </h3>
                {dailyGoal.isGoalMet ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Objectif atteint</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    <Clock className="w-3.5 h-3.5" />
                    <span>En cours ({dailyGoal.remainingPosts} restante{dailyGoal.remainingPosts > 1 ? 's' : ''})</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-ows-textMuted mt-0.5">
                Objectif strict : 5 publications minimum par jour associées à 5 campagnes différentes.
              </p>
            </div>
          </div>

          {/* Indicateur de Streak */}
          <div className="flex items-center space-x-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-ows-surface2 border border-ows-border text-xs">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-ows-textMuted">Série en cours :</span>
              <span className="font-bold font-mono text-ows-textMain">
                {dailyGoal.streak} {dailyGoal.streak > 1 ? 'jours' : 'jour'}
              </span>
              {dailyGoal.bestStreak > 0 && (
                <span className="text-[11px] text-ows-textSubtle font-mono">
                  (record : {dailyGoal.bestStreak}j)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3 Cartes Métriques Quotidiennes */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          {/* Métrique 1 : Publiés aujourd'hui */}
          <div className="p-4 rounded-xl bg-ows-surface2 border border-ows-border flex flex-col justify-between">
            <span className="text-xs font-medium text-ows-textMuted">Publications publiées</span>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className={`text-3xl font-bold font-heading ${dailyGoal.publishedToday >= 5 ? 'text-emerald-400' : 'text-ows-textMain'}`}>
                {dailyGoal.publishedToday}
              </span>
              <span className="text-sm font-mono text-ows-textSubtle">/ 5</span>
            </div>
            <div className="text-[11px] text-ows-textSubtle mt-1 flex items-center justify-between font-mono">
              <span>Planifiés : {dailyGoal.scheduledToday} / 5</span>
              <span className="text-ows-textMuted">{dailyGoal.publishedToday >= 5 ? 'Quota atteint' : `${dailyGoal.remainingPosts} restant(s)`}</span>
            </div>
          </div>

          {/* Métrique 2 : Campagnes différentes */}
          <div className="p-4 rounded-xl bg-ows-surface2 border border-ows-border flex flex-col justify-between">
            <span className="text-xs font-medium text-ows-textMuted">Campagnes différentes</span>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className={`text-3xl font-bold font-heading ${dailyGoal.distinctCampaignsToday >= 5 ? 'text-emerald-400' : 'text-ows-textMain'}`}>
                {dailyGoal.distinctCampaignsToday}
              </span>
              <span className="text-sm font-mono text-ows-textSubtle">/ 5</span>
            </div>
            <div className="text-[11px] text-ows-textSubtle mt-1">
              {dailyGoal.distinctCampaignsToday >= 5 ? (
                <span className="text-emerald-400 font-medium">5 campagnes distinctes validées</span>
              ) : (
                <span>{dailyGoal.remainingCampaigns} campagne(s) distincte(s) restante(s)</span>
              )}
            </div>
          </div>

          {/* Métrique 3 : Restantes pour atteindre 5 */}
          <div className="p-4 rounded-xl bg-ows-surface2 border border-ows-border flex flex-col justify-between">
            <span className="text-xs font-medium text-ows-textMuted">Statut & Restants</span>
            <div className="mt-2 flex items-baseline space-x-2">
              <span className={`text-3xl font-bold font-heading ${dailyGoal.isGoalMet ? 'text-emerald-400' : 'text-amber-400'}`}>
                {dailyGoal.remainingPosts}
              </span>
              <span className="text-sm font-mono text-ows-textSubtle">restante{dailyGoal.remainingPosts > 1 ? 's' : ''}</span>
            </div>
            <div className="text-[11px] text-ows-textSubtle mt-1">
              {dailyGoal.isGoalMet ? (
                <span className="text-emerald-400 font-medium">Objectif 5/5 validé aujourd'hui</span>
              ) : (
                <span>À poster manuellement</span>
              )}
            </div>
          </div>
        </div>

        {/* Jauge visuelle de paliers (1 à 5) */}
        <div className="mt-5 space-y-1.5">
          <div className="flex justify-between text-[11px] font-mono text-ows-textSubtle">
            <span>Progression du jour (Publications & Campagnes)</span>
            <span>
              {dailyGoal.isGoalMet
                ? '100%'
                : `${Math.round(((Math.min(dailyGoal.publishedToday, 5) + Math.min(dailyGoal.distinctCampaignsToday, 5)) / 10) * 100)}%`}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 h-2.5">
            {[1, 2, 3, 4, 5].map((slot) => {
              const isPubFilled = dailyGoal.publishedToday >= slot;
              const isCampFilled = dailyGoal.distinctCampaignsToday >= slot;
              const isBoth = isPubFilled && isCampFilled;
              return (
                <div
                  key={slot}
                  className={`rounded-sm transition-all ${
                    isBoth
                      ? 'bg-emerald-400'
                      : isPubFilled
                      ? 'bg-amber-400/80'
                      : 'bg-ows-surface2 border border-ows-border/60'
                  }`}
                  title={`Palier ${slot} : ${isPubFilled ? 'Publication validée' : 'Manquante'} • ${isCampFilled ? 'Campagne validée' : 'Campagne manquante'}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. SUIVI HISTORIQUE ET STATISTIQUES (PHASE 5) */}
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ows-borderSubtle">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-ows-accent" />
            <h3 className="font-heading font-semibold text-sm text-ows-textMain">
              Suivi Historique & Performance
            </h3>
          </div>

          {/* Onglets Temporels : Jour / Semaine / Mois / Année */}
          <div className="flex items-center bg-black border border-ows-border rounded-lg p-1 text-xs">
            {(['day', 'week', 'month', 'year'] as const).map((p) => {
              const labels = { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année' };
              const active = historyPeriod === p;
              return (
                <button
                  key={p}
                  onClick={() => setHistoryPeriod(p)}
                  className={`px-3 py-1 rounded-md transition-all ${
                    active
                      ? 'bg-ows-accent text-black font-semibold shadow-sm'
                      : 'text-ows-textMuted hover:text-ows-textMain'
                  }`}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Résumé de la période sélectionnée */}
        {historyData && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-ows-surface2 border border-ows-border">
                <span className="text-[10px] uppercase font-mono text-ows-textSubtle">Total Publié</span>
                <div className="text-xl font-bold font-heading text-ows-textMain mt-1">
                  {historyData.summary.totalPublished}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-ows-surface2 border border-ows-border">
                <span className="text-[10px] uppercase font-mono text-ows-textSubtle">Campagnes Utilisées</span>
                <div className="text-xl font-bold font-heading text-ows-textMain mt-1">
                  {historyData.summary.distinctCampaigns}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-ows-surface2 border border-ows-border">
                <span className="text-[10px] uppercase font-mono text-ows-textSubtle">Jours Objectif Atteint</span>
                <div className="text-xl font-bold font-heading text-emerald-400 mt-1">
                  {historyData.summary.goalsMetDays}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-ows-surface2 border border-ows-border">
                <span className="text-[10px] uppercase font-mono text-ows-textSubtle">Jours Non Atteints</span>
                <div className="text-xl font-bold font-heading text-amber-400 mt-1">
                  {historyData.summary.goalsMissedDays}
                </div>
              </div>
            </div>

            {/* Découpage par intervalle */}
            <div className="pt-2">
              <div className="text-[11px] font-mono text-ows-textSubtle mb-2">
                Détail de la période ({historyData.intervals.length} intervalle{historyData.intervals.length > 1 ? 's' : ''})
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {historyData.intervals.map((item) => {
                  const isZero = item.publishedCount === 0;
                  return (
                    <div
                      key={item.dateKey}
                      className={`p-2.5 rounded-lg border flex flex-col justify-between text-xs transition-all ${
                        item.isGoalMet
                          ? 'bg-emerald-500/5 border-emerald-500/30'
                          : isZero
                          ? 'bg-ows-surface2/30 border-ows-border/60 text-ows-textSubtle'
                          : 'bg-ows-surface2 border-ows-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ows-textMain text-[11px]">
                          {item.label}
                        </span>
                        {item.isGoalMet ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : isZero ? (
                          <XCircle className="w-3.5 h-3.5 text-ows-textSubtle" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </div>

                      <div className="mt-2 font-mono text-[11px]">
                        <span className={item.publishedCount >= 5 ? 'text-emerald-400 font-bold' : 'text-ows-textMain'}>
                          {item.publishedCount}
                        </span>
                        <span className="text-ows-textSubtle"> / 5 posts</span>
                      </div>

                      <div className="mt-0.5 font-mono text-[10px] text-ows-textSubtle">
                        {item.distinctCampaignsCount} camp.
                      </div>

                      <div className="mt-1.5 pt-1.5 border-t border-ows-borderSubtle text-[9px] font-mono">
                        {item.isGoalMet ? (
                          <span className="text-emerald-400 font-semibold">Objectif atteint</span>
                        ) : isZero ? (
                          <span className="text-ows-textSubtle">0/5 • Non atteint</span>
                        ) : (
                          <span className="text-amber-400">Objectif non atteint</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Cartes de Métriques Clés (4 KPIs généraux) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : À publier */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ows-textMuted">À publier</span>
            <div className="w-8 h-8 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-textSubtle">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold font-heading text-ows-textMain">
              {stats.videosToPublish}
            </div>
            <div className="text-[11px] text-ows-textSubtle mt-1 flex items-center space-x-1">
              <span>sources en attente de publication</span>
            </div>
          </div>
        </div>

        {/* KPI 2 : Publications programmées */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ows-textMuted">Programmées</span>
            <div className="w-8 h-8 rounded-lg bg-ows-surface2 border border-ows-accent/20 flex items-center justify-center text-ows-accent">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold font-heading text-ows-accent">
              {stats.scheduledCount}
            </div>
            <div className="text-[11px] text-ows-textSubtle mt-1 flex items-center space-x-1">
              <span>en attente de publication</span>
            </div>
          </div>
        </div>

        {/* KPI 3 : Publications publiées */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ows-textMuted">Publiées avec succès</span>
            <div className="w-8 h-8 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-textMain">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-bold font-heading text-ows-textMain">
              {stats.publishedCount}
            </div>
            <div className="text-[11px] text-ows-textSubtle mt-1">
              publications diffusées
            </div>
          </div>
        </div>

        {/* KPI 4 : Publications en échec */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ows-textMuted">En erreur</span>
            <div className="w-8 h-8 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-textSubtle">
              <AlertCircle
                className={`w-4 h-4 ${
                  stats.failedCount > 0 ? 'text-rose-500' : 'text-ows-textSubtle'
                }`}
              />
            </div>
          </div>
          <div className="mt-4">
            <div
              className={`text-3xl font-bold font-heading ${
                stats.failedCount > 0 ? 'text-rose-400' : 'text-ows-textMuted'
              }`}
            >
              {stats.failedCount}
            </div>
            <div className="text-[11px] text-ows-textSubtle mt-1">
              {stats.failedCount > 0 ? 'nécessite attention' : 'aucune erreur détectée'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Actions Rapides (Barre de navigation métier) */}
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5">
        <div className="text-[11px] font-medium text-ows-textSubtle uppercase tracking-wider mb-3">
          Actions rapides
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => onNavigate('publications')}
            className="flex items-center space-x-3 p-3 rounded-lg bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-left transition-all group"
          >
            <div className="w-8 h-8 rounded bg-ows-surfaceCard flex items-center justify-center text-ows-textMuted group-hover:text-ows-accent transition-colors">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-ows-textMain">Gérer les publications</div>
              <div className="text-[10px] text-ows-textSubtle">Créer & programmer</div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('campaigns')}
            className="flex items-center space-x-3 p-3 rounded-lg bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-left transition-all group"
          >
            <div className="w-8 h-8 rounded bg-ows-surfaceCard flex items-center justify-center text-ows-textMuted group-hover:text-ows-accent transition-colors">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-ows-textMain">Gérer les campagnes</div>
              <div className="text-[10px] text-ows-textSubtle">Organiser vos projets</div>
            </div>
          </button>

          <button
            onClick={() => onNavigate('calendar')}
            className="flex items-center space-x-3 p-3 rounded-lg bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-left transition-all group"
          >
            <div className="w-8 h-8 rounded bg-ows-surfaceCard flex items-center justify-center text-ows-textMuted group-hover:text-ows-accent transition-colors">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-ows-textMain">Voir le calendrier</div>
              <div className="text-[10px] text-ows-textSubtle">Planning & diffusion</div>
            </div>
          </button>
        </div>
      </div>

      {/* 4. Grille 2 Colonnes : Prochaines publications & Publications récentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonne Gauche : Prochaines publications programmées */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5 flex flex-col h-full">
          <div className="flex items-center justify-between pb-4 border-b border-ows-borderSubtle">
            <div className="flex items-center space-x-2">
              <CalendarClock className="w-4 h-4 text-ows-accent" />
              <h3 className="font-heading font-semibold text-sm text-ows-textMain">
                Prochaines publications
              </h3>
            </div>
            <span className="text-[11px] font-mono text-ows-textSubtle">
              {upcomingList.length} en attente
            </span>
          </div>

          <div className="flex-1 mt-4">
            {upcomingList.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-ows-border rounded-lg bg-ows-surface2/30">
                <div className="w-10 h-10 rounded-full bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-textSubtle mb-3">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="text-xs font-medium text-ows-textMain">
                  Aucune publication programmée
                </div>
                <p className="text-[11px] text-ows-textMuted mt-1 max-w-xs">
                  Les publications planifiées apparaîtront ici avec leur créneau horaire précis.
                </p>
                <button
                  onClick={() => onNavigate('publications')}
                  className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-xs text-ows-accent transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Programmer un clip</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {upcomingList.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-between hover:border-ows-borderSubtle transition-all"
                  >
                    <div className="space-y-1 min-w-0 flex-1 pr-3">
                      <div className="flex items-center space-x-2">
                        {/* Indicateur de couleur de campagne */}
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: item.campaign_color || '#08EB08' }}
                        />
                        <span className="text-[11px] font-semibold text-ows-textMain truncate">
                          {item.campaign_name}
                        </span>
                        <span className="text-[11px] text-ows-textSubtle">•</span>
                        <span className="text-[11px] text-ows-textMuted truncate font-mono">
                          {item.video_name}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-ows-textMain truncate">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-ows-textSubtle font-mono flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>Prévu le {formatDateTime(item.scheduled_at)}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end space-y-1.5 shrink-0">
                      <PlatformBadge platform={item.platform} />
                      <span className="text-[10px] font-mono text-ows-accent px-1.5 py-0.5 rounded bg-ows-accent/10 border border-ows-accent/20">
                        Programmé
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Colonne Droite : Publications récentes */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-5 flex flex-col h-full">
          <div className="flex items-center justify-between pb-4 border-b border-ows-borderSubtle">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="font-heading font-semibold text-sm text-ows-textMain">
                Publications récentes
              </h3>
            </div>
            <span className="text-[11px] font-mono text-ows-textSubtle">
              {recentList.length} historique
            </span>
          </div>

          <div className="flex-1 mt-4">
            {recentList.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-ows-border rounded-lg bg-ows-surface2/30">
                <div className="w-10 h-10 rounded-full bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-textSubtle mb-3">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-xs font-medium text-ows-textMain">
                  Aucune publication récente
                </div>
                <p className="text-[11px] text-ows-textMuted mt-1 max-w-xs">
                  Les publications diffusées ou ayant échoué s'afficheront ici avec leurs liens officiels.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {recentList.map((item) => {
                  const isSuccess = item.status === 'published';
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-between hover:border-ows-borderSubtle transition-all"
                    >
                      <div className="space-y-1 min-w-0 flex-1 pr-3">
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.campaign_color || '#08EB08' }}
                          />
                          <span className="text-[11px] font-semibold text-ows-textMain truncate">
                            {item.campaign_name}
                          </span>
                          <span className="text-[11px] text-ows-textSubtle">•</span>
                          <span className="text-[11px] text-ows-textMuted truncate font-mono">
                            {item.video_name}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-ows-textMain truncate">
                          {item.title}
                        </div>
                        {item.error_message && (
                          <div className="text-[10px] text-rose-400 truncate">
                            Erreur : {item.error_message}
                          </div>
                        )}
                        <div className="text-[10px] text-ows-textSubtle font-mono">
                          {formatDateTime(item.published_at)}
                        </div>
                      </div>

                      <div className="flex flex-col items-end space-y-1.5 shrink-0">
                        <PlatformBadge platform={item.platform} />
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                              isSuccess
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {isSuccess ? 'Publié' : 'Échec'}
                          </span>
                          {item.post_url && (
                            <a
                              href={item.post_url}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 rounded bg-ows-surfaceCard border border-ows-border text-ows-accent hover:border-ows-accent/50 transition-colors"
                              title="Voir la publication sur la plateforme"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
