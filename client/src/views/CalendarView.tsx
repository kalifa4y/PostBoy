import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Film,
  RotateCcw,
  AlertCircle,
  X,
  CalendarDays,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Tag,
  FileText
} from 'lucide-react';
import { Publication, Campaign, SocialPlatform, PublicationStatus } from '../types/domain';
import { NavTab } from '../components/layout/Sidebar';

interface CalendarViewProps {
  activeTimezone: string;
  onNavigateToTab?: (tab: NavTab) => void;
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
  const [copiedPubId, setCopiedPubId] = useState<string | null>(null);

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

  // Formulaire d'Édition / Consultation Manuelle
  const [editScheduledAt, setEditScheduledAt] = useState<string>('');
  const [editStatus, setEditStatus] = useState<PublicationStatus>('scheduled');
  const [editCaption, setEditCaption] = useState<string>('');
  const [editHashtags, setEditHashtags] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editPlatform, setEditPlatform] = useState<SocialPlatform>('tiktok');
  const [editPostUrl, setEditPostUrl] = useState<string>('');
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

  // Détection du retard
  const isPublicationOverdue = (pub: Publication): boolean => {
    if (pub.status !== 'scheduled' || !pub.scheduled_at) return false;
    if (pub.is_overdue !== undefined) return pub.is_overdue;
    const t = new Date(pub.scheduled_at).getTime();
    return !isNaN(t) && t < Date.now();
  };

  // Clé de date normalisée YYYY-MM-DD
  const getDateKey = (d: Date | string): string => {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return '';
    return new Intl.DateTimeFormat('fr-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: activeTimezone || 'Africa/Bamako'
    }).format(dateObj);
  };

  const todayKey = useMemo(() => getDateKey(new Date()), [activeTimezone]);

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

  // Statistiques d'atteinte de l'objectif de clipping par jour (Phase 5 : 5 posts / 5 campagnes)
  const dayClippingStats = useMemo(() => {
    const statsMap: Record<string, { publishedCount: number; campaignsCount: number; isGoalMet: boolean }> = {};
    const campaignsMap: Record<string, Set<string>> = {};

    for (const pub of publications) {
      if (pub.status === 'published' && pub.published_at) {
        const k = getDateKey(pub.published_at);
        if (!k) continue;
        if (!statsMap[k]) {
          statsMap[k] = { publishedCount: 0, campaignsCount: 0, isGoalMet: false };
          campaignsMap[k] = new Set();
        }
        statsMap[k].publishedCount++;
        if (pub.campaign_id) {
          campaignsMap[k].add(pub.campaign_id);
        }
      }
    }

    for (const k in statsMap) {
      const cCount = campaignsMap[k] ? campaignsMap[k].size : 0;
      statsMap[k].campaignsCount = cCount;
      statsMap[k].isGoalMet = statsMap[k].publishedCount >= 5 && cCount >= 5;
    }

    return statsMap;
  }, [publications, activeTimezone]);

  // Dictionnaire des publications indexées par clé de date YYYY-MM-DD
  const publicationsByDate = useMemo(() => {
    const map: Record<string, Publication[]> = {};
    for (const pub of filteredPublications) {
      const targetDate = pub.status === 'published' && pub.published_at ? pub.published_at : pub.scheduled_at;
      if (!targetDate) continue;
      const key = getDateKey(targetDate);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(pub);
    }
    for (const key in map) {
      map[key].sort((a, b) => {
        const tA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const tB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return tA - tB;
      });
    }
    return map;
  }, [filteredPublications, activeTimezone]);

  // Publications prévues aujourd'hui
  const todaysPublications = useMemo(() => {
    return publicationsByDate[todayKey] || [];
  }, [publicationsByDate, todayKey]);

  // Action : Copier le texte
  const handleCopyText = async (pub: Publication) => {
    const textToCopy = pub.copy_text || [pub.caption, pub.hashtags || pub.tags].filter(Boolean).join('\n\n') || pub.title;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedPubId(pub.id);
      setTimeout(() => {
        setCopiedPubId(prev => (prev === pub.id ? null : prev));
      }, 2000);
    } catch (err) {
      console.error('Erreur copie:', err);
    }
  };

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

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDayOfMonth.getDay() - 1; // 0 = Lundi
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: Array<{ date: Date; isCurrentMonth: boolean; key: string }> = [];

    // Jours du mois précédent pour combler la première semaine
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({ date: d, isCurrentMonth: false, key: getDateKey(d) });
    }

    // Jours du mois en cours
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, isCurrentMonth: true, key: getDateKey(d) });
    }

    // Jours du mois suivant pour finir la grille (multiples de 7)
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: d, isCurrentMonth: false, key: getDateKey(d) });
      }
    }

    return days;
  }, [currentDate, activeTimezone]);

  // Jours de la semaine sélectionnée
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // Lundi de la semaine
    const monday = new Date(curr.setDate(diff));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const next = new Date(monday);
      next.setDate(monday.getDate() + i);
      days.push({
        date: next,
        key: getDateKey(next)
      });
    }
    return days;
  }, [currentDate, activeTimezone]);

  // Ouverture du modal d'édition/détail
  const handleOpenEdit = (pub: Publication) => {
    setSelectedPublication(pub);
    setEditScheduledAt(pub.scheduled_at ? pub.scheduled_at.slice(0, 16) : '');
    setEditStatus(pub.status);
    setEditCaption(pub.caption || '');
    setEditHashtags(pub.hashtags || pub.tags || '');
    setEditNotes(pub.notes || '');
    setEditPlatform(pub.platform);
    setEditPostUrl(pub.post_url || pub.external_url || '');
    setModalError(null);
  };

  // Soumission Modification
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
          scheduled_at: editScheduledAt || null,
          status: editStatus,
          caption: editCaption.trim() || null,
          hashtags: editHashtags.trim() || null,
          notes: editNotes.trim() || null,
          platform: editPlatform,
          post_url: editPostUrl.trim() || null
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

  // Action directe : Marquer comme publié depuis le calendrier
  const handleMarkAsPublishedFromModal = async () => {
    if (!selectedPublication) return;

    try {
      setSubmitting(true);
      setModalError(null);

      const res = await fetch(`/api/publications/${selectedPublication.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_url: editPostUrl.trim() || undefined,
          notes: editNotes.trim() || undefined,
          published_at: new Date().toISOString()
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Erreur lors du marquage de la publication');
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

  // Déprogrammer (remettre en brouillon)
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

  // Planification rapide
  const handleOpenQuickSchedule = (dateKey: string) => {
    setTargetDateForSchedule(dateKey);
    setQuickTime('14:00');
    setQuickPubId(unscheduledPubs.length > 0 ? unscheduledPubs[0].id : '');
    setModalError(null);
    setIsQuickScheduleOpen(true);
  };

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

  // Rendu icône plateforme
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

  // Rendu de la pastille de statut dans le calendrier
  const renderStatusDot = (pub: Publication) => {
    const overdue = isPublicationOverdue(pub);
    if (pub.status === 'published') {
      return (
        <span title="Publiée manuellement" className="flex items-center">
          <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
        </span>
      );
    }
    if (pub.status === 'scheduled' && overdue) {
      return (
        <span title="En retard !" className="flex items-center">
          <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0 animate-pulse" />
        </span>
      );
    }
    if (pub.status === 'scheduled') {
      return <span className="w-2 h-2 rounded-full bg-[#08EB08] flex-shrink-0 animate-pulse" title="Programmée" />;
    }
    return <span className="w-2 h-2 rounded-full bg-zinc-600 flex-shrink-0" title={pub.status} />;
  };

  const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. En-tête & Barre d'outils Calendrier */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ows-border pb-6">
        <div>
          <h1 className="text-3xl font-heading font-bold text-ows-text-main flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-ows-accent" />
            Calendrier de Clipping
          </h1>
          <p className="text-ows-text-muted mt-1 text-sm font-sans">
            Visualisez vos publications quotidiennes, identifiez vos retards et marquez vos publications réalisées.
          </p>
        </div>

        {/* Action rapide */}
        <div className="flex items-center gap-3">
          {unscheduledPubs.length > 0 && (
            <button
              onClick={() => handleOpenQuickSchedule(todayKey)}
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
              Nouvelle Tâche
            </button>
          )}
        </div>
      </div>

      {/* 2. Bannière « Aujourd'hui à poster » */}
      <div className="p-4 rounded-xl bg-ows-surface-card border border-ows-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-heading font-semibold text-ows-text-main">
              À poster aujourd&apos;hui ({todaysPublications.length} clip{todaysPublications.length > 1 ? 's' : ''})
            </h2>
            <p className="text-xs text-ows-text-muted">
              {todaysPublications.filter(p => p.status === 'published').length} publié(s),{' '}
              {todaysPublications.filter(p => p.status !== 'published').length} restant(s) à poster manuellement
            </p>
          </div>
        </div>

        {todaysPublications.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {todaysPublications.map(pub => {
              const overdue = isPublicationOverdue(pub);
              const isPublished = pub.status === 'published';
              return (
                <button
                  key={pub.id}
                  onClick={() => handleOpenEdit(pub)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    isPublished
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400 line-through'
                      : overdue
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold animate-pulse'
                      : 'bg-black border-ows-border hover:border-ows-accent text-ows-text-main'
                  }`}
                  title={`${pub.caption || pub.title} - ${pub.platform}`}
                >
                  {renderPlatformIcon(pub.platform)}
                  <span className="font-mono text-[10px]">{formatEventTime(pub.scheduled_at)}</span>
                  <span className="truncate max-w-[100px]">{pub.campaign_name || pub.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Contrôles de Navigation Temporelle & Sélecteur de Vues */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl bg-ows-surface-card border border-ows-border">
        {/* Navigation Mois / Année */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-black border border-ows-border rounded-lg p-0.5">
            <button
              onClick={handlePrev}
              className="p-1.5 text-ows-text-muted hover:text-ows-text-main rounded-md hover:bg-ows-surface-1 transition-colors"
              title="Précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-medium text-ows-text-muted hover:text-ows-text-main rounded-md hover:bg-ows-surface-1 transition-colors"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 text-ows-text-muted hover:text-ows-text-main rounded-md hover:bg-ows-surface-1 transition-colors"
              title="Suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <span className="text-base font-heading font-bold text-ows-text-main capitalize">
            {formatMonthTitle(currentDate)}
          </span>
        </div>

        {/* Sélecteur de mode de vue (Mois / Semaine / Jour) */}
        <div className="flex items-center bg-black border border-ows-border rounded-lg p-1">
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'month'
                ? 'bg-ows-accent text-black font-semibold shadow-sm'
                : 'text-ows-text-muted hover:text-ows-text-main'
            }`}
          >
            Mois
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'week'
                ? 'bg-ows-accent text-black font-semibold shadow-sm'
                : 'text-ows-text-muted hover:text-ows-text-main'
            }`}
          >
            Semaine
          </button>
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'day'
                ? 'bg-ows-accent text-black font-semibold shadow-sm'
                : 'text-ows-text-muted hover:text-ows-text-main'
            }`}
          >
            Jour
          </button>
        </div>
      </div>

      {/* 4. Barre de Filtres */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-ows-surface-1 border border-ows-border text-xs">
        <span className="text-ows-text-muted font-medium">Filtrer par :</span>

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
          <option value="scheduled">Programmées</option>
          <option value="published">Publiées</option>
          <option value="failed">Échecs</option>
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

      {/* 5. Vues du Calendrier */}
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
              {/* En-tête des jours */}
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
                      {/* Numéro du jour & indicateur de discipline & bouton d'ajout */}
                      <div className="flex items-center justify-between mb-1.5 gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
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

                          {/* Indicateur de performance de clipping quotidienne (Phase 5) */}
                          {(() => {
                            const perf = dayClippingStats[item.key];
                            if (!perf || perf.publishedCount === 0) {
                              if (item.isCurrentMonth && item.key < todayKey) {
                                return (
                                  <span
                                    className="text-[9px] font-mono text-zinc-500 px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800"
                                    title="0 publication réalisée • Objectif non atteint"
                                  >
                                    0/5
                                  </span>
                                );
                              }
                              return null;
                            }
                            if (perf.isGoalMet) {
                              return (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[9px] font-mono font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1 py-0.5 rounded"
                                  title={`${perf.publishedCount}/5 posts • ${perf.campaignsCount}/5 campagnes (Objectif atteint)`}
                                >
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  <span>5/5</span>
                                </span>
                              );
                            }
                            return (
                              <span
                                className="inline-flex items-center text-[9px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-1 py-0.5 rounded"
                                title={`${perf.publishedCount}/5 posts • ${perf.campaignsCount}/5 campagnes (Objectif non atteint)`}
                              >
                                {perf.publishedCount}/5
                              </span>
                            );
                          })()}
                        </div>

                        <button
                          onClick={() => handleOpenQuickSchedule(item.key)}
                          className="opacity-0 hover:opacity-100 focus:opacity-100 p-1 text-ows-text-subtle hover:text-ows-accent transition-opacity"
                          title={`Planifier un clip pour le ${item.key}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Liste des événements de la journée */}
                      <div className="space-y-1.5 flex-1 overflow-hidden">
                        {dayEvents.slice(0, 3).map(event => {
                          const overdue = isPublicationOverdue(event);
                          const isPublished = event.status === 'published';

                          return (
                            <div
                              key={event.id}
                              onClick={() => handleOpenEdit(event)}
                              className={`group flex items-center gap-1.5 p-1.5 rounded-md border text-[11px] cursor-pointer transition-all hover:translate-x-0.5 ${
                                isPublished
                                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400/90 line-through'
                                  : overdue
                                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/30 font-semibold'
                                  : 'bg-black/80 border-ows-border hover:border-ows-accent text-ows-text-main'
                              }`}
                            >
                              {renderStatusDot(event)}
                              {renderPlatformIcon(event.platform)}
                              <span className="font-mono text-ows-text-subtle text-[10px]">
                                {formatEventTime(event.scheduled_at)}
                              </span>
                              <span className="truncate flex-1" title={event.caption || event.title}>
                                {event.caption || event.title}
                              </span>
                              {event.campaign_color && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: event.campaign_color }}
                                />
                              )}
                            </div>
                          );
                        })}

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
              <div className="grid grid-cols-7 bg-ows-surface-1 border-b border-ows-border divide-x divide-ows-border text-center">
                {weekDays.map(item => {
                  const isToday = item.key === todayKey;
                  const perf = dayClippingStats[item.key];

                  return (
                    <div key={item.key} className={`py-3 px-2 flex flex-col items-center justify-between ${isToday ? 'bg-ows-accent/10' : ''}`}>
                      <p className="text-xs uppercase font-semibold text-ows-text-muted">
                        {new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: activeTimezone }).format(item.date)}
                      </p>
                      <p className={`text-lg font-heading font-bold mt-0.5 ${isToday ? 'text-ows-accent' : 'text-ows-text-main'}`}>
                        {item.date.getDate()}
                      </p>

                      {/* Indicateur d'objectif de clipping pour la journée (Phase 5) */}
                      <div className="mt-1">
                        {perf && perf.isGoalMet ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30"
                            title={`${perf.publishedCount} posts • ${perf.campaignsCount} campagnes distinctes`}
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                            <span>5/5 • {perf.campaignsCount}c</span>
                          </span>
                        ) : perf && perf.publishedCount > 0 ? (
                          <span
                            className="inline-flex items-center text-[10px] font-mono text-ows-text-muted px-1.5 py-0.5 rounded bg-black border border-ows-border"
                            title={`${perf.publishedCount} posts • ${perf.campaignsCount} campagnes distinctes (Objectif non atteint)`}
                          >
                            {perf.publishedCount}/5 • {perf.campaignsCount}c
                          </span>
                        ) : item.key < todayKey ? (
                          <span
                            className="text-[9px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-black/40 border border-zinc-800"
                            title="0 publication réalisée • Objectif non atteint"
                          >
                            0/5 • Non atteint
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-zinc-600">
                            En attente
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-7 divide-x divide-ows-border min-h-[400px]">
                {weekDays.map(item => {
                  const dayEvents = publicationsByDate[item.key] || [];
                  const isToday = item.key === todayKey;

                  return (
                    <div key={item.key} className={`p-2 space-y-2 ${isToday ? 'bg-ows-accent/5' : ''}`}>
                      <button
                        onClick={() => handleOpenQuickSchedule(item.key)}
                        className="w-full py-1 text-center text-[10px] text-ows-text-subtle hover:text-ows-accent border border-dashed border-transparent hover:border-ows-border rounded transition-colors"
                      >
                        + Planifier
                      </button>

                      {dayEvents.map(event => {
                        const overdue = isPublicationOverdue(event);
                        const isPublished = event.status === 'published';

                        return (
                          <div
                            key={event.id}
                            onClick={() => handleOpenEdit(event)}
                            className={`p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                              isPublished
                                ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400 line-through'
                                : overdue
                                ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 font-semibold ring-1 ring-amber-500/30'
                                : 'bg-black border-ows-border hover:border-ows-accent text-ows-text-main'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                {renderStatusDot(event)}
                                {renderPlatformIcon(event.platform)}
                                <span className="font-mono text-[10px] text-ows-text-subtle">
                                  {formatEventTime(event.scheduled_at)}
                                </span>
                              </div>
                              {event.campaign_color && (
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: event.campaign_color }}
                                />
                              )}
                            </div>
                            <p className="text-[11px] font-medium line-clamp-2">
                              {event.caption || event.title}
                            </p>
                          </div>
                        );
                      })}
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
            <div className="rounded-xl border border-ows-border bg-ows-surface-card p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-ows-border pb-4">
                <div>
                  <h3 className="text-xl font-heading font-bold text-ows-text-main">
                    {new Intl.DateTimeFormat('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: activeTimezone
                    }).format(currentDate)}
                  </h3>
                  <p className="text-xs text-ows-text-muted mt-1">
                    {(publicationsByDate[getDateKey(currentDate)] || []).length} publication(s) pour cette journée
                  </p>
                </div>
                <button
                  onClick={() => handleOpenQuickSchedule(getDateKey(currentDate))}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Planifier un clip
                </button>
              </div>

              {(publicationsByDate[getDateKey(currentDate)] || []).length === 0 ? (
                <div className="py-12 text-center text-ows-text-muted">
                  <p className="text-sm">Aucun clip programmé pour cette date.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(publicationsByDate[getDateKey(currentDate)] || []).map(event => {
                    const overdue = isPublicationOverdue(event);
                    const isPublished = event.status === 'published';

                    return (
                      <div
                        key={event.id}
                        onClick={() => handleOpenEdit(event)}
                        className={`p-4 rounded-xl border flex items-center justify-between gap-4 cursor-pointer transition-all hover:border-ows-accent ${
                          isPublished
                            ? 'bg-emerald-950/10 border-emerald-500/30 text-emerald-400'
                            : overdue
                            ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/30'
                            : 'bg-black border-ows-border text-ows-text-main'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {renderStatusDot(event)}
                          {renderPlatformIcon(event.platform)}
                          <div className="font-mono text-xs text-ows-text-muted whitespace-nowrap">
                            {formatEventTime(event.scheduled_at)}
                          </div>
                          <div className="truncate">
                            <p className="text-sm font-medium text-ows-text-main truncate">
                              {event.caption || event.title}
                            </p>
                            {event.hashtags && (
                              <p className="text-xs text-ows-accent/80 font-mono truncate">
                                {event.hashtags}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {event.campaign_name && (
                            <span className="px-2 py-0.5 rounded text-xs bg-ows-surface-1 border border-ows-border">
                              {event.campaign_name}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyText(event);
                            }}
                            className="p-2 rounded bg-ows-surface-1 hover:bg-ows-surface-card text-ows-text-muted hover:text-ows-text-main border border-ows-border"
                            title="Copier le texte"
                          >
                            {copiedPubId === event.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CONSULTATION / ÉDITION & PUBLICATION MANUELLE */}
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
                    Détail du Clip & Publication
                  </h2>
                  <p className="text-xs text-ows-text-muted truncate max-w-[280px]">
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

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {modalError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Statut actuel & Indicateur Retard */}
              <div className="p-3 rounded-xl bg-black border border-ows-border flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-ows-text-muted">Statut :</span>
                  {selectedPublication.status === 'published' ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Publiée
                    </span>
                  ) : isPublicationOverdue(selectedPublication) ? (
                    <span className="text-amber-400 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 animate-pulse" /> En retard de publication
                    </span>
                  ) : (
                    <span className="text-ows-accent font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Programmée
                    </span>
                  )}
                </div>

                {/* Bouton Copier le Texte */}
                <button
                  type="button"
                  onClick={() => handleCopyText(selectedPublication)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    copiedPubId === selectedPublication.id
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-ows-surface-1 border border-ows-border hover:border-ows-accent text-ows-text-main'
                  }`}
                >
                  {copiedPubId === selectedPublication.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Texte copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-ows-accent" />
                      <span>Copier texte</span>
                    </>
                  )}
                </button>
              </div>

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
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
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

              {/* Hashtags */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-ows-accent" />
                  Hashtags
                </label>
                <input
                  type="text"
                  value={editHashtags}
                  onChange={(e) => setEditHashtags(e.target.value)}
                  placeholder="#clipping #viral"
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-ows-text-subtle" />
                  Notes manuelles
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notes de clipping"
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-text-main focus:outline-none focus:border-ows-accent"
                />
              </div>

              {/* URL Externe si déjà publiée */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ows-text-muted">
                    Lien vers le post en ligne (optionnel)
                  </label>
                  {editPostUrl && (
                    <a
                      href={editPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:underline inline-flex items-center gap-1 font-mono"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Voir le post
                    </a>
                  )}
                </div>
                <input
                  type="url"
                  value={editPostUrl}
                  onChange={(e) => setEditPostUrl(e.target.value)}
                  placeholder="https://tiktok.com/@... ou https://instagram.com/p/..."
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
                />
              </div>

              {/* Actions du Modal */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-ows-border">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUnschedule}
                    disabled={submitting}
                    className="px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Retire la date programmée et repasse en brouillon"
                  >
                    Déprogrammer
                  </button>

                  {selectedPublication.status !== 'published' && (
                    <button
                      type="button"
                      onClick={handleMarkAsPublishedFromModal}
                      disabled={submitting}
                      className="px-3 py-2 text-xs bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors font-semibold flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Marquer publié
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPublication(null)}
                    className="px-4 py-2 text-sm text-ows-text-muted hover:text-ows-text-main"
                  >
                    Fermer
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
                  Sélectionner un clip brouillon à programmer
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
