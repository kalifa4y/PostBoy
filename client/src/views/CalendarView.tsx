import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Edit3,
  Film,
  RotateCcw,
  AlertCircle,
  X,
  CalendarDays,
  ExternalLink
} from 'lucide-react';
import { Publication, Campaign, SocialPlatform, PublicationStatus } from '../types/domain';

interface CalendarViewProps {
  activeTimezone: string;
  onNavigateToTab?: (tab: 'dashboard' | 'campaigns' | 'videos' | 'publications' | 'calendar' | 'accounts' | 'settings' | 'foundation') => void;
}

// Composants SVG natifs pour plateformes (Zéro Emoji)
const TikTokIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.31a6.34 6.34 0 0 0-.85-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.5a8.28 8.28 0 0 0 4.77 1.52V6.69z" />
  </svg>
);

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const YouTubeIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

type CalendarViewMode = 'month' | 'week' | 'day';

export const CalendarView: React.FC<CalendarViewProps> = ({ activeTimezone, onNavigateToTab }) => {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [unscheduledPubs, setUnscheduledPubs] = useState<Publication[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // État de Navigation Calendaire
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  // Filtres
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modals
  const [selectedPublication, setSelectedPublication] = useState<Publication | null>(null);
  const [isQuickScheduleOpen, setIsQuickScheduleOpen] = useState<boolean>(false);
  const [targetDateForSchedule, setTargetDateForSchedule] = useState<string>('');

  // Formulaire d'Édition / Reprogrammation
  const [editScheduledAt, setEditScheduledAt] = useState<string>('');
  const [editStatus, setEditStatus] = useState<PublicationStatus>('scheduled');
  const [editCaption, setEditCaption] = useState<string>('');
  const [editPlatform, setEditPlatform] = useState<SocialPlatform>('tiktok');
  const [editExternalUrl, setEditExternalUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Formulaire de Planification Rapide
  const [quickPubId, setQuickPubId] = useState<string>('');
  const [quickTime, setQuickTime] = useState<string>('12:00');

  // 1. Récupération des publications programmées et données auxiliaires
  const fetchCalendarData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [pubsRes, unscheduledRes, cRes] = await Promise.all([
        fetch('/api/publications?scheduled_only=true'),
        fetch('/api/publications?status=draft'),
        fetch('/api/campaigns')
      ]);

      if (pubsRes.ok) {
        const pData = await pubsRes.json();
        if (pData.status === 'success') {
          setPublications(pData.publications || []);
        }
      }

      if (unscheduledRes.ok) {
        const uData = await unscheduledRes.json();
        if (uData.status === 'success') {
          // Filtrer ceux qui n'ont réellement pas de date programmée
          const drafts = (uData.publications || []).filter(
            (p: Publication) => !p.scheduled_at || p.scheduled_at.trim() === ''
          );
          setUnscheduledPubs(drafts);
        }
      }

      if (cRes.ok) {
        const cData = await cRes.json();
        if (cData.status === 'success') setCampaigns(cData.campaigns || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur chargement calendrier';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendarData();
  }, [fetchCalendarData]);

  // Formatage des dates selon le fuseau horaire actif
  const formatMonthTitle = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
      timeZone: activeTimezone || 'Africa/Bamako'
    }).format(date);
  };

  const formatDayHeader = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: activeTimezone || 'Africa/Bamako'
    }).format(date);
  };

  const formatEventTime = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: activeTimezone || 'Africa/Bamako'
      }).format(d);
    } catch {
      return '';
    }
  };

  // Clé de date normalisée YYYY-MM-DD
  const getDateKey = (d: Date | string): string => {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return '';
    const parts = new Intl.DateTimeFormat('fr-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: activeTimezone || 'Africa/Bamako'
    }).format(dateObj);
    return parts; // Format YYYY-MM-DD
  };

  // Filtrage des publications selon les filtres actifs
  const filteredPublications = useMemo(() => {
    return publications.filter(p => {
      if (selectedPlatform !== 'all' && p.platform !== selectedPlatform) return false;
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;
      if (selectedCampaign !== 'all') {
        if (selectedCampaign === 'unassigned' && p.campaign_id) return false;
        if (selectedCampaign !== 'unassigned' && p.campaign_id !== selectedCampaign) return false;
      }
      return true;
    });
  }, [publications, selectedPlatform, selectedStatus, selectedCampaign]);

  // Dictionnaire des publications indexées par clé de date YYYY-MM-DD
  const publicationsByDate = useMemo(() => {
    const map: Record<string, Publication[]> = {};
    for (const pub of filteredPublications) {
      if (!pub.scheduled_at) continue;
      const key = getDateKey(pub.scheduled_at);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(pub);
    }
    // Tri chronologique à l'intérieur de chaque jour
    for (const key in map) {
      map[key].sort((a, b) => {
        const tA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return tA - tB;
      });
    }
    return map;
  }, [filteredPublications, activeTimezone]);

  // Navigation Temporelle
  const handlePrev = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() - 1);
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() - 7);
      } else {
        d.setDate(d.getDate() - 1);
      }
      return d;
    });
  };

  const handleNext = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() + 1);
      } else if (viewMode === 'week') {
        d.setDate(d.getDate() + 7);
      } else {
        d.setDate(d.getDate() + 1);
      }
      return d;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Calcul de la Grille du Mois
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Premier jour du mois
    const firstDayOfMonth = new Date(year, month, 1);
    // Dernier jour du mois
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Jour de la semaine du 1er du mois (0 = Dimanche, 1 = Lundi, ...)
    let startDayOfWeek = firstDayOfMonth.getDay();
    // Adapter pour commencer le Lundi (Lundi = 0, Dimanche = 6)
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const days: Array<{ date: Date; isCurrentMonth: boolean; key: string }> = [];

    // Jours du mois précédent (padding début)
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({ date, isCurrentMonth: false, key: getDateKey(date) });
    }

    // Jours du mois en cours
    for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({ date, isCurrentMonth: true, key: getDateKey(date) });
    }

    // Jours du mois suivant (padding fin pour compléter les semaines de 7 jours)
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const date = new Date(year, month + 1, d);
        days.push({ date, isCurrentMonth: false, key: getDateKey(date) });
      }
    }

    return days;
  }, [currentDate, activeTimezone]);

  // Calcul des Jours de la Semaine Active
  const weekDays = useMemo(() => {
    const d = new Date(currentDate);
    let dayOfWeek = d.getDay();
    dayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Lundi = 0
    d.setDate(d.getDate() - dayOfWeek); // Se positionner sur le lundi de la semaine

    const days: Array<{ date: Date; key: string }> = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(d);
      dayDate.setDate(d.getDate() + i);
      days.push({ date: dayDate, key: getDateKey(dayDate) });
    }
    return days;
  }, [currentDate, activeTimezone]);

  const todayKey = getDateKey(new Date());

  // Ouverture du modal d'édition
  const handleOpenEdit = (pub: Publication) => {
    setSelectedPublication(pub);
    setEditScheduledAt(pub.scheduled_at ? pub.scheduled_at.slice(0, 16) : '');
    setEditStatus(pub.status);
    setEditCaption(pub.caption || '');
    setEditPlatform(pub.platform);
    setEditExternalUrl(pub.external_url || pub.post_url || '');
    setModalError(null);
  };

  // Soumission de la mise à jour / reprogrammation manuelle
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPublication) return;

    try {
      setSubmitting(true);
      setModalError(null);

      const res = await fetch(`/api/publications/${selectedPublication.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
          status: editStatus,
          caption: editCaption,
          platform: editPlatform,
          external_url: editExternalUrl || null
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Erreur lors de la mise à jour');
      }

      setSelectedPublication(null);
      await fetchCalendarData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setModalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Déprogrammation manuelle (retirer du calendrier)
  const handleUnschedule = async () => {
    if (!selectedPublication) return;

    try {
      setSubmitting(true);
      const res = await fetch(`/api/publications/${selectedPublication.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: null,
          status: 'draft'
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Erreur lors de la déprogrammation');
      }

      setSelectedPublication(null);
      await fetchCalendarData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setModalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Ouverture du modal de planification rapide sur un jour
  const handleOpenQuickSchedule = (dateKey: string) => {
    setTargetDateForSchedule(dateKey);
    setQuickTime('14:00');
    setQuickPubId(unscheduledPubs.length > 0 ? unscheduledPubs[0].id : '');
    setModalError(null);
    setIsQuickScheduleOpen(true);
  };

  // Soumission planification rapide
  const handleQuickScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPubId || !targetDateForSchedule) return;

    try {
      setSubmitting(true);
      setModalError(null);

      const combinedDateTime = `${targetDateForSchedule}T${quickTime}:00Z`;

      const res = await fetch(`/api/publications/${quickPubId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: combinedDateTime,
          status: 'scheduled'
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Erreur lors de la planification');
      }

      setIsQuickScheduleOpen(false);
      await fetchCalendarData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setModalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Rendu de l'icône plateforme
  const renderPlatformIcon = (platform: SocialPlatform) => {
    switch (platform) {
      case 'tiktok':
        return <TikTokIcon className="w-3.5 h-3.5 text-[#00f2fe]" />;
      case 'instagram':
        return <InstagramIcon className="w-3.5 h-3.5 text-[#e1306c]" />;
      case 'youtube':
        return <YouTubeIcon className="w-3.5 h-3.5 text-[#ff4444]" />;
      default:
        return <Film className="w-3.5 h-3.5 text-ows-text-muted" />;
    }
  };

  // Badge Statut sobre
  const renderStatusDot = (status: PublicationStatus) => {
    switch (status) {
      case 'scheduled':
        return <span className="w-2 h-2 rounded-full bg-[#08EB08] flex-shrink-0 animate-pulse" title="Programmée" />;
      case 'published':
        return <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" title="Publiée" />;
      case 'publishing':
        return <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="En cours" />;
      case 'failed':
        return <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" title="Échec" />;
      case 'cancelled':
        return <span className="w-2 h-2 rounded-full bg-zinc-500 flex-shrink-0" title="Annulée" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-zinc-600 flex-shrink-0" title="Brouillon" />;
    }
  };

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. En-tête & Barre d'outils Calendrier */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ows-border pb-6">
        <div>
          <h1 className="text-3xl font-heading font-bold text-ows-text-main flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-ows-accent" />
            Calendrier de Programmation
          </h1>
          <p className="text-ows-text-muted mt-1 text-sm font-sans">
            Visualisez et ajustez le planning de publication de vos clips multi-plateformes ({filteredPublications.length} publication(s) programmée(s)).
          </p>
        </div>

        {/* Bouton d'action rapide */}
        <div className="flex items-center gap-3">
          {unscheduledPubs.length > 0 && (
            <button
              onClick={() => handleOpenQuickSchedule(getDateKey(new Date()))}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-ows-surface-card border border-ows-border hover:border-ows-accent text-ows-text-main text-sm font-medium transition-colors"
            >
              <CalendarDays className="w-4 h-4 text-ows-accent" />
              Planifier un brouillon ({unscheduledPubs.length})
            </button>
          )}

          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('publications')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-sm transition-colors shadow-lg shadow-ows-accent/20"
            >
              <Plus className="w-4 h-4" />
              Créer une Publication
            </button>
          )}
        </div>
      </div>

      {/* 2. Contrôles de Navigation Temporelle & Sélecteur de Vues */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl bg-ows-surface-card border border-ows-border">
        {/* Navigation Mois / Année */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-black border border-ows-border rounded-lg p-0.5">
            <button
              onClick={handlePrev}
              className="p-1.5 text-ows-text-muted hover:text-ows-text-main rounded-md hover:bg-ows-surface-1 transition-colors"
              title="Précédent"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1 text-xs font-semibold text-ows-text-main hover:text-ows-accent transition-colors"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 text-ows-text-muted hover:text-ows-text-main rounded-md hover:bg-ows-surface-1 transition-colors"
              title="Suivant"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <h2 className="text-xl font-heading font-bold text-ows-text-main capitalize tracking-wide">
            {formatMonthTitle(currentDate)}
          </h2>
        </div>

        {/* Sélecteur de Vues (Mois / Semaine / Jour) */}
        <div className="flex items-center gap-1 bg-black border border-ows-border rounded-lg p-1 self-start sm:self-auto">
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'month'
                ? 'bg-ows-accent text-black shadow-sm'
                : 'text-ows-text-muted hover:text-ows-text-main'
            }`}
          >
            Mois
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'week'
                ? 'bg-ows-accent text-black shadow-sm'
                : 'text-ows-text-muted hover:text-ows-text-main'
            }`}
          >
            Semaine
          </button>
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'day'
                ? 'bg-ows-accent text-black shadow-sm'
                : 'text-ows-text-muted hover:text-ows-text-main'
            }`}
          >
            Jour
          </button>
        </div>
      </div>

      {/* 3. Filtres Intégrés (Plateforme, Campagne, Statut) */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-ows-surface-1 border border-ows-border text-xs">
        <span className="text-ows-text-subtle font-medium">Filtrer :</span>

        {/* Filtre Plateforme */}
        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="bg-black border border-ows-border rounded-lg px-2.5 py-1.5 text-ows-text-main focus:outline-none focus:border-ows-accent"
        >
          <option value="all">Toutes plateformes</option>
          <option value="tiktok">TikTok</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
        </select>

        {/* Filtre Campagne */}
        <select
          value={selectedCampaign}
          onChange={(e) => setSelectedCampaign(e.target.value)}
          className="bg-black border border-ows-border rounded-lg px-2.5 py-1.5 text-ows-text-main focus:outline-none focus:border-ows-accent"
        >
          <option value="all">Toutes campagnes</option>
          <option value="unassigned">Sans campagne</option>
          {campaigns.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Filtre Statut */}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-black border border-ows-border rounded-lg px-2.5 py-1.5 text-ows-text-main focus:outline-none focus:border-ows-accent"
        >
          <option value="all">Tous statuts</option>
          <option value="scheduled">Programmée</option>
          <option value="published">Publiée</option>
          <option value="draft">Brouillon</option>
          <option value="failed">Échec</option>
          <option value="cancelled">Annulée</option>
        </select>

        {(selectedPlatform !== 'all' || selectedCampaign !== 'all' || selectedStatus !== 'all') && (
          <button
            onClick={() => {
              setSelectedPlatform('all');
              setSelectedCampaign('all');
              setSelectedStatus('all');
            }}
            className="text-ows-accent hover:underline ml-auto"
          >
            Réinitialiser les filtres
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Affichage selon la vue sélectionnée */}
      {loading ? (
        <div className="p-16 text-center text-ows-text-muted">
          <RotateCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-ows-accent" />
          <p className="text-sm">Chargement du planning...</p>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* VUE MOIS (MONTH VIEW) */}
          {/* ========================================================================= */}
          {viewMode === 'month' && (
            <div className="rounded-xl border border-ows-border overflow-hidden bg-ows-surface-card">
              {/* En-tête des jours de la semaine */}
              <div className="grid grid-cols-7 bg-ows-surface-1 border-b border-ows-border text-center text-xs font-semibold uppercase tracking-wider text-ows-text-muted py-2.5">
                {dayNames.map(day => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              {/* Grille des cellules du mois */}
              <div className="grid grid-cols-7 divide-x divide-y divide-ows-border/60">
                {monthDays.map((item, idx) => {
                  const dayEvents = publicationsByDate[item.key] || [];
                  const isToday = item.key === todayKey;

                  return (
                    <div
                      key={idx}
                      className={`min-h-[120px] sm:min-h-[140px] p-2 transition-colors flex flex-col justify-between ${
                        item.isCurrentMonth
                          ? 'bg-ows-surface-card hover:bg-ows-surface-1/40'
                          : 'bg-black/40 text-ows-text-subtle'
                      } ${isToday ? 'ring-1 ring-inset ring-ows-accent/50 bg-ows-accent/5' : ''}`}
                    >
                      {/* Numéro du jour & bouton d'ajout */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className={`text-xs font-heading font-bold rounded-md px-1.5 py-0.5 ${
                            isToday
                              ? 'bg-ows-accent text-black'
                              : item.isCurrentMonth
                              ? 'text-ows-text-main'
                              : 'text-ows-text-subtle'
                          }`}
                        >
                          {item.date.getDate()}
                        </span>

                        <button
                          onClick={() => handleOpenQuickSchedule(item.key)}
                          className="opacity-0 hover:opacity-100 focus:opacity-100 p-1 text-ows-text-subtle hover:text-ows-accent transition-opacity"
                          title={`Planifier le ${item.key}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Liste des événements de la journée */}
                      <div className="space-y-1.5 flex-1 overflow-hidden">
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            onClick={() => handleOpenEdit(event)}
                            className="group flex items-center gap-1.5 p-1.5 rounded-md bg-black/80 border border-ows-border hover:border-ows-accent text-[11px] cursor-pointer transition-all hover:translate-x-0.5"
                          >
                            {renderStatusDot(event.status)}
                            {renderPlatformIcon(event.platform)}
                            <span className="font-mono text-ows-text-subtle text-[10px]">
                              {formatEventTime(event.scheduled_at)}
                            </span>
                            <span className="truncate font-medium text-ows-text-main flex-1" title={event.caption || event.title}>
                              {event.caption || event.title}
                            </span>
                            {event.campaign_color && (
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: event.campaign_color }}
                              />
                            )}
                          </div>
                        ))}

                        {dayEvents.length > 3 && (
                          <button
                            onClick={() => {
                              setCurrentDate(item.date);
                              setViewMode('day');
                            }}
                            className="w-full text-center text-[10px] font-semibold text-ows-accent hover:underline pt-0.5"
                          >
                            +{dayEvents.length - 3} autres clips
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VUE SEMAINE (WEEK VIEW) */}
          {/* ========================================================================= */}
          {viewMode === 'week' && (
            <div className="rounded-xl border border-ows-border overflow-hidden bg-ows-surface-card">
              {/* En-tête des 7 jours de la semaine */}
              <div className="grid grid-cols-7 bg-ows-surface-1 border-b border-ows-border divide-x divide-ows-border text-center">
                {weekDays.map(item => {
                  const isToday = item.key === todayKey;
                  return (
                    <div key={item.key} className={`py-3 px-2 ${isToday ? 'bg-ows-accent/10' : ''}`}>
                      <p className="text-xs uppercase font-semibold text-ows-text-muted">
                        {new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: activeTimezone }).format(item.date)}
                      </p>
                      <p className={`text-lg font-heading font-bold mt-0.5 ${isToday ? 'text-ows-accent' : 'text-ows-text-main'}`}>
                        {item.date.getDate()}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Colonnes des événements de la semaine */}
              <div className="grid grid-cols-7 divide-x divide-ows-border min-h-[400px]">
                {weekDays.map(item => {
                  const dayEvents = publicationsByDate[item.key] || [];

                  return (
                    <div key={item.key} className="p-2 space-y-2 bg-ows-surface-card">
                      {dayEvents.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-2 text-ows-text-subtle">
                          <p className="text-[11px] italic">Aucun clip</p>
                          <button
                            onClick={() => handleOpenQuickSchedule(item.key)}
                            className="mt-2 text-[10px] text-ows-text-muted hover:text-ows-accent"
                          >
                            + Programmer
                          </button>
                        </div>
                      ) : (
                        dayEvents.map(event => (
                          <div
                            key={event.id}
                            onClick={() => handleOpenEdit(event)}
                            className="p-2 rounded-lg bg-black border border-ows-border hover:border-ows-accent cursor-pointer transition-all space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-ows-text-muted font-medium">
                                <Clock className="w-3 h-3 text-ows-accent" />
                                {formatEventTime(event.scheduled_at)}
                              </span>
                              {renderPlatformIcon(event.platform)}
                            </div>

                            <p className="text-xs font-semibold text-ows-text-main line-clamp-2" title={event.caption || event.title}>
                              {event.caption || event.title}
                            </p>

                            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-ows-border/60">
                              <span className="text-ows-text-subtle truncate max-w-[80px]">
                                {event.video_original_name}
                              </span>
                              {event.campaign_name && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                                  style={{
                                    backgroundColor: `${event.campaign_color}20`,
                                    color: event.campaign_color || '#08EB08'
                                  }}
                                >
                                  {event.campaign_name}
                                </span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VUE JOUR (DAY VIEW) */}
          {/* ========================================================================= */}
          {viewMode === 'day' && (
            <div className="rounded-xl border border-ows-border overflow-hidden bg-ows-surface-card p-6">
              <div className="flex items-center justify-between pb-4 border-b border-ows-border mb-6">
                <div>
                  <h3 className="text-xl font-heading font-bold text-ows-text-main capitalize">
                    {formatDayHeader(currentDate)}
                  </h3>
                  <p className="text-xs text-ows-text-muted mt-0.5">
                    {(publicationsByDate[getDateKey(currentDate)] || []).length} clip(s) programmé(s) pour cette journée
                  </p>
                </div>

                <button
                  onClick={() => handleOpenQuickSchedule(getDateKey(currentDate))}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Programmer pour ce jour
                </button>
              </div>

              {/* Timeline chronologique des clips de la journée */}
              {(!publicationsByDate[getDateKey(currentDate)] || publicationsByDate[getDateKey(currentDate)].length === 0) ? (
                <div className="p-12 text-center text-ows-text-muted">
                  <CalendarIcon className="w-10 h-10 mx-auto mb-3 text-ows-text-subtle" />
                  <p className="text-sm">Aucun clip programmé pour cette journée.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {publicationsByDate[getDateKey(currentDate)].map(event => (
                    <div
                      key={event.id}
                      onClick={() => handleOpenEdit(event)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-black border border-ows-border hover:border-ows-accent cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-14 text-center">
                          <p className="text-base font-mono font-bold text-ows-accent">
                            {formatEventTime(event.scheduled_at)}
                          </p>
                          <p className="text-[10px] text-ows-text-subtle uppercase">Heure</p>
                        </div>

                        <div className="h-10 w-[1px] bg-ows-border hidden sm:block" />

                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {renderPlatformIcon(event.platform)}
                            <span className="text-xs font-semibold capitalize text-ows-text-main">
                              {event.platform}
                            </span>
                            {event.campaign_name && (
                              <span
                                className="px-2 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: `${event.campaign_color}20`,
                                  color: event.campaign_color || '#08EB08'
                                }}
                              >
                                {event.campaign_name}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-ows-text-main max-w-xl">
                            {event.caption || event.title}
                          </p>
                          <p className="text-xs text-ows-text-muted mt-1 font-mono">
                            Fichier source : {event.video_original_name || event.title}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(event);
                          }}
                          className="p-2 rounded-lg bg-ows-surface-1 border border-ows-border hover:border-ows-accent text-ows-text-muted hover:text-ows-text-main text-xs flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Reprogrammer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CONSULTATION / ÉDITION & REPROGRAMMATION MANUELLE */}
      {/* ========================================================================= */}
      {selectedPublication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-ows-surface-card border border-ows-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-ows-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-ows-text-main">
                    Gestion Manuelle de la Publication
                  </h2>
                  <p className="text-xs text-ows-text-muted">
                    {selectedPublication.video_original_name || selectedPublication.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPublication(null)}
                className="p-2 text-ows-text-muted hover:text-ows-text-main rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Date et Heure Programmée */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ows-accent" />
                  Date et Heure Programmée
                </label>
                <input
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono"
                  required
                />
              </div>

              {/* Plateforme & Statut */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                    Plateforme
                  </label>
                  <select
                    value={editPlatform}
                    onChange={(e) => setEditPlatform(e.target.value as SocialPlatform)}
                    className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                  >
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                    Statut
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as PublicationStatus)}
                    className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                  >
                    <option value="scheduled">Programmée</option>
                    <option value="draft">Brouillon</option>
                    <option value="published">Publiée</option>
                    <option value="failed">Échec</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
              </div>

              {/* Légende */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Légende (Caption)
                </label>
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={3}
                  className="w-full bg-black border border-ows-border rounded-lg p-3 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                />
              </div>

              {/* URL Externe si déjà publiée */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ows-text-muted">
                    Lien externe de publication (optionnel)
                  </label>
                  {editExternalUrl && (
                    <a
                      href={editExternalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ows-accent hover:underline inline-flex items-center gap-1 font-mono"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Voir le post
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={editExternalUrl}
                  onChange={(e) => setEditExternalUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-ows-border">
                <button
                  type="button"
                  onClick={handleUnschedule}
                  disabled={submitting}
                  className="px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Retire la date programmée et repasse en brouillon"
                >
                  Déprogrammer
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPublication(null)}
                    className="px-4 py-2 text-sm text-ows-text-muted hover:text-ows-text-main"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-sm transition-colors"
                  >
                    {submitting ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PLANIFICATION RAPIDE D'UN BROUILLON */}
      {/* ========================================================================= */}
      {isQuickScheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-ows-surface-card border border-ows-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-ows-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-ows-text-main">
                    Planifier un Clip
                  </h2>
                  <p className="text-xs text-ows-text-muted">
                    Pour le {targetDateForSchedule}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsQuickScheduleOpen(false)}
                className="p-2 text-ows-text-muted hover:text-ows-text-main rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickScheduleSubmit} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Sélection du brouillon */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Sélectionner un brouillon à programmer
                </label>
                {unscheduledPubs.length === 0 ? (
                  <div className="p-3 bg-black border border-ows-border rounded-lg text-xs text-ows-text-muted">
                    Aucun brouillon en attente de programmation.
                  </div>
                ) : (
                  <select
                    value={quickPubId}
                    onChange={(e) => setQuickPubId(e.target.value)}
                    className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                    required
                  >
                    {unscheduledPubs.map(p => (
                      <option key={p.id} value={p.id}>
                        [{p.platform.toUpperCase()}] {p.caption || p.title} ({p.video_original_name || 'Vidéo'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Heure de diffusion */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Heure de publication
                </label>
                <input
                  type="time"
                  value={quickTime}
                  onChange={(e) => setQuickTime(e.target.value)}
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ows-border">
                <button
                  type="button"
                  onClick={() => setIsQuickScheduleOpen(false)}
                  className="px-4 py-2 text-sm text-ows-text-muted hover:text-ows-text-main"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting || unscheduledPubs.length === 0}
                  className="px-5 py-2 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Planification...' : 'Confirmer la programmation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
