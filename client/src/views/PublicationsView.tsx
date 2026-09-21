import React, { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Plus,
  Search,
  Trash2,
  Edit3,
  Copy,
  ExternalLink,
  Clock,
  AlertCircle,
  CheckCircle2,
  X,
  Calendar,
  Film,
  Layers,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { Publication, Video, Campaign, SocialPlatform, PublicationStatus } from '../types/domain';

interface PublicationsViewProps {
  activeTimezone: string;
}

// Composant icône TikTok propre (SVG natif sans emoji ni dépendance externe)
const TikTokIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.31a6.34 6.34 0 0 0-.85-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.5a8.28 8.28 0 0 0 4.77 1.52V6.69z" />
  </svg>
);

// Composant icône Instagram propre (SVG natif)
const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

// Composant icône YouTube propre (SVG natif)
const YouTubeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

export const PublicationsView: React.FC<PublicationsViewProps> = ({ activeTimezone }) => {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingPublication, setEditingPublication] = useState<Publication | null>(null);
  const [duplicatingPublication, setDuplicatingPublication] = useState<Publication | null>(null);
  const [deletingPublication, setDeletingPublication] = useState<Publication | null>(null);

  // Formulaire de Création
  const [createMode, setCreateMode] = useState<'single' | 'multi'>('single');
  const [formVideoId, setFormVideoId] = useState<string>('');
  const [formPlatform, setFormPlatform] = useState<SocialPlatform>('tiktok');
  const [formMultiPlatforms, setFormMultiPlatforms] = useState<SocialPlatform[]>(['tiktok', 'instagram', 'youtube']);
  const [formCaption, setFormCaption] = useState<string>('');
  const [formStatus, setFormStatus] = useState<PublicationStatus>('draft');
  const [formScheduledAt, setFormScheduledAt] = useState<string>('');
  const [formCampaignId, setFormCampaignId] = useState<string>('auto');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Formulaire d'Édition
  const [editPlatform, setEditPlatform] = useState<SocialPlatform>('tiktok');
  const [editCaption, setEditCaption] = useState<string>('');
  const [editStatus, setEditStatus] = useState<PublicationStatus>('draft');
  const [editScheduledAt, setEditScheduledAt] = useState<string>('');
  const [editExternalUrl, setEditExternalUrl] = useState<string>('');

  // Formulaire de Duplication
  const [duplicateTargetPlatform, setDuplicateTargetPlatform] = useState<SocialPlatform>('instagram');
  const [duplicateCaption, setDuplicateCaption] = useState<string>('');
  const [duplicateScheduledAt, setDuplicateScheduledAt] = useState<string>('');
  const [duplicateStatus, setDuplicateStatus] = useState<PublicationStatus>('draft');

  // Chargement des données
  const fetchPublications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (selectedPlatform !== 'all') params.set('platform', selectedPlatform);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (selectedCampaign !== 'all') params.set('campaign_id', selectedCampaign);
      if (searchQuery.trim() !== '') params.set('search', searchQuery.trim());

      const res = await fetch(`/api/publications?${params.toString()}`);
      if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setPublications(data.publications || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Impossible de charger les publications';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedPlatform, selectedStatus, selectedCampaign, searchQuery]);

  const fetchAuxiliaryData = useCallback(async () => {
    try {
      const [vRes, cRes] = await Promise.all([
        fetch('/api/videos'),
        fetch('/api/campaigns')
      ]);
      if (vRes.ok) {
        const vData = await vRes.json();
        if (vData.status === 'success') setVideos(vData.videos || []);
      }
      if (cRes.ok) {
        const cData = await cRes.json();
        if (cData.status === 'success') setCampaigns(cData.campaigns || []);
      }
    } catch (err) {
      console.error('Erreur chargement données auxiliaires:', err);
    }
  }, []);

  useEffect(() => {
    fetchAuxiliaryData();
  }, [fetchAuxiliaryData]);

  useEffect(() => {
    fetchPublications();
  }, [fetchPublications]);

  // Formatage date
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
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

  // Statistiques calculées
  const stats = {
    total: publications.length,
    drafts: publications.filter(p => p.status === 'draft').length,
    scheduled: publications.filter(p => p.status === 'scheduled').length,
    published: publications.filter(p => p.status === 'published').length,
    failed: publications.filter(p => p.status === 'failed').length
  };

  // Badge Plateforme
  const renderPlatformBadge = (platform: SocialPlatform) => {
    switch (platform) {
      case 'tiktok':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-black border border-[#222222] text-[#00f2fe]">
            <TikTokIcon className="w-3.5 h-3.5 text-[#fe2c55]" />
            TikTok
          </span>
        );
      case 'instagram':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#140e14] border border-[#3b1d36] text-[#e1306c]">
            <InstagramIcon className="w-3.5 h-3.5 text-[#e1306c]" />
            Instagram
          </span>
        );
      case 'youtube':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#170e0e] border border-[#381616] text-[#ff4444]">
            <YouTubeIcon className="w-3.5 h-3.5 text-[#ff0000]" />
            YouTube
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-ows-surface-1 border border-ows-border text-ows-text-muted">
            {platform}
          </span>
        );
    }
  };

  // Badge Statut
  const renderStatusBadge = (status: PublicationStatus) => {
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1e2621] text-ows-text-muted border border-ows-border">
            <span className="w-1.5 h-1.5 rounded-full bg-ows-text-muted"></span>
            Brouillon
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#08EB08]/10 text-[#08EB08] border border-[#08EB08]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#08EB08] animate-pulse"></span>
            Programmée
          </span>
        );
      case 'publishing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <RotateCcw className="w-3 h-3 animate-spin" />
            En cours
          </span>
        );
      case 'published':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Publiée
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" />
            Échec
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
            Annulée
          </span>
        );
      default:
        return null;
    }
  };

  // Ouverture du modal de création
  const handleOpenCreateModal = (mode: 'single' | 'multi' = 'single') => {
    setCreateMode(mode);
    setFormVideoId(videos.length > 0 ? videos[0].id : '');
    setFormPlatform('tiktok');
    setFormMultiPlatforms(['tiktok', 'instagram', 'youtube']);
    setFormCaption('');
    setFormStatus('draft');
    setFormScheduledAt('');
    setFormCampaignId('auto');
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  // Insertion rapide de tags/mentions dans la caption
  const insertTextToCaption = (text: string) => {
    setFormCaption(prev => (prev ? `${prev} ${text}` : text));
  };

  // Soumission Création (Unitaire ou Multi-Plateformes)
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formVideoId) {
      setFormError('Veuillez sélectionner une vidéo source.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      if (createMode === 'multi') {
        if (formMultiPlatforms.length === 0) {
          setFormError('Sélectionnez au moins une plateforme.');
          return;
        }

        const res = await fetch('/api/publications/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_id: formVideoId,
            platforms: formMultiPlatforms,
            caption: formCaption,
            status: formStatus,
            scheduled_at: formScheduledAt || null,
            campaign_id: formCampaignId === 'auto' ? undefined : (formCampaignId || null)
          })
        });

        const data = await res.json();
        if (!res.ok || data.status !== 'success') {
          throw new Error(data.message || 'Erreur lors de la création par lot');
        }
      } else {
        const res = await fetch('/api/publications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            video_id: formVideoId,
            platform: formPlatform,
            caption: formCaption,
            status: formStatus,
            scheduled_at: formScheduledAt || null,
            campaign_id: formCampaignId === 'auto' ? undefined : (formCampaignId || null)
          })
        });

        const data = await res.json();
        if (!res.ok || data.status !== 'success') {
          throw new Error(data.message || 'Erreur lors de la création de la publication');
        }
      }

      setIsCreateModalOpen(false);
      await fetchPublications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Ouverture du modal d'édition
  const handleOpenEdit = (pub: Publication) => {
    setEditingPublication(pub);
    setEditPlatform(pub.platform);
    setEditCaption(pub.caption || '');
    setEditStatus(pub.status);
    setEditScheduledAt(pub.scheduled_at ? pub.scheduled_at.slice(0, 16) : '');
    setEditExternalUrl(pub.external_url || pub.post_url || '');
    setFormError(null);
  };

  // Soumission Édition
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPublication) return;

    try {
      setSubmitting(true);
      setFormError(null);

      const res = await fetch(`/api/publications/${editingPublication.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: editPlatform,
          caption: editCaption,
          status: editStatus,
          scheduled_at: editScheduledAt || null,
          external_url: editExternalUrl || null
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Erreur lors de la mise à jour');
      }

      setEditingPublication(null);
      await fetchPublications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Ouverture du modal de duplication vers une autre plateforme
  const handleOpenDuplicate = (pub: Publication) => {
    setDuplicatingPublication(pub);
    // Sélectionner une plateforme par défaut différente de celle existante
    const remainingPlats: SocialPlatform[] = (['tiktok', 'instagram', 'youtube'] as SocialPlatform[]).filter(
      p => p !== pub.platform
    );
    setDuplicateTargetPlatform(remainingPlats[0] || 'instagram');
    setDuplicateCaption(pub.caption || '');
    setDuplicateScheduledAt(pub.scheduled_at ? pub.scheduled_at.slice(0, 16) : '');
    setDuplicateStatus('draft');
    setFormError(null);
  };

  // Soumission Duplication
  const handleDuplicateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicatingPublication) return;

    try {
      setSubmitting(true);
      setFormError(null);

      const res = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: duplicatingPublication.video_id,
          platform: duplicateTargetPlatform,
          caption: duplicateCaption,
          status: duplicateStatus,
          scheduled_at: duplicateScheduledAt || null,
          campaign_id: duplicatingPublication.campaign_id
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Erreur lors de la duplication');
      }

      setDuplicatingPublication(null);
      await fetchPublications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Suppression
  const handleDeleteConfirm = async () => {
    if (!deletingPublication) return;

    try {
      setSubmitting(true);
      const res = await fetch(`/api/publications/${deletingPublication.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Erreur lors de la suppression');
      }

      setDeletingPublication(null);
      await fetchPublications();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Récupération de la campagne liée à la vidéo sélectionnée dans le formulaire
  const selectedFormVideo = videos.find(v => v.id === formVideoId);
  const videoCampaign = campaigns.find(c => c.id === selectedFormVideo?.campaign_id);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. En-tête & Barre d'outils */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ows-border pb-6">
        <div>
          <h1 className="text-3xl font-heading font-bold text-ows-text-main flex items-center gap-3">
            <Send className="w-8 h-8 text-ows-accent" />
            Publications Multi-Plateformes
          </h1>
          <p className="text-ows-text-muted mt-1 text-sm font-sans">
            Gérez chaque déclinaison sociale (TikTok, Instagram, YouTube) de vos clips de manière autonome.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenCreateModal('multi')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-ows-surface-card border border-ows-border hover:border-ows-accent text-ows-text-main text-sm font-medium transition-colors"
          >
            <Layers className="w-4 h-4 text-ows-accent" />
            Génération Multi-Réseaux
          </button>

          <button
            onClick={() => handleOpenCreateModal('single')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-sm transition-colors shadow-lg shadow-ows-accent/20"
          >
            <Plus className="w-4 h-4" />
            Nouvelle Publication
          </button>
        </div>
      </div>

      {/* 2. KPIs de Synthèse */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="p-4 rounded-xl bg-ows-surface-card border border-ows-border">
          <p className="text-xs text-ows-text-muted uppercase tracking-wider font-semibold">Total</p>
          <p className="text-2xl font-bold font-heading text-ows-text-main mt-1">{stats.total}</p>
        </div>
        <div className="p-4 rounded-xl bg-ows-surface-card border border-ows-border">
          <p className="text-xs text-ows-text-muted uppercase tracking-wider font-semibold">Brouillons</p>
          <p className="text-2xl font-bold font-heading text-ows-text-muted mt-1">{stats.drafts}</p>
        </div>
        <div className="p-4 rounded-xl bg-ows-surface-card border border-ows-border">
          <p className="text-xs text-ows-text-muted uppercase tracking-wider font-semibold">Programmées</p>
          <p className="text-2xl font-bold font-heading text-ows-accent mt-1">{stats.scheduled}</p>
        </div>
        <div className="p-4 rounded-xl bg-ows-surface-card border border-ows-border">
          <p className="text-xs text-ows-text-muted uppercase tracking-wider font-semibold">Publiées</p>
          <p className="text-2xl font-bold font-heading text-emerald-400 mt-1">{stats.published}</p>
        </div>
        <div className="p-4 rounded-xl bg-ows-surface-card border border-ows-border">
          <p className="text-xs text-ows-text-muted uppercase tracking-wider font-semibold">Échecs</p>
          <p className="text-2xl font-bold font-heading text-rose-400 mt-1">{stats.failed}</p>
        </div>
      </div>

      {/* 3. Filtres & Recherche */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between p-4 rounded-xl bg-ows-surface-1 border border-ows-border">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ows-text-subtle" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par vidéo, campagne, caption..."
            className="w-full pl-10 pr-4 py-2 bg-black border border-ows-border rounded-lg text-sm text-ows-text-main placeholder:text-ows-text-subtle focus:outline-none focus:border-ows-accent"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtre Plateforme */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-text-main focus:outline-none focus:border-ows-accent"
          >
            <option value="all">Toutes plateformes</option>
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
          </select>

          {/* Filtre Statut */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-text-main focus:outline-none focus:border-ows-accent"
          >
            <option value="all">Tous statuts</option>
            <option value="draft">Brouillon</option>
            <option value="scheduled">Programmée</option>
            <option value="published">Publiée</option>
            <option value="failed">Échec</option>
            <option value="cancelled">Annulée</option>
          </select>

          {/* Filtre Campagne */}
          <select
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            className="bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-text-main focus:outline-none focus:border-ows-accent"
          >
            <option value="all">Toutes campagnes</option>
            <option value="unassigned">Sans campagne</option>
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Message d'erreur général */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4. Liste des Publications */}
      {loading ? (
        <div className="p-12 text-center text-ows-text-muted">
          <RotateCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-ows-accent" />
          <p className="text-sm">Chargement des publications...</p>
        </div>
      ) : publications.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-ows-surface-card border border-dashed border-ows-border">
          <div className="w-16 h-16 rounded-full bg-ows-surface-1 border border-ows-border flex items-center justify-center mx-auto mb-4 text-ows-text-muted">
            <Send className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-heading font-semibold text-ows-text-main">Aucune publication trouvée</h3>
          <p className="text-ows-text-muted text-sm max-w-md mx-auto mt-1 mb-6">
            Déclinez vos vidéos sources en publications indépendantes adaptées à chaque réseau social.
          </p>
          <button
            onClick={() => handleOpenCreateModal('single')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Créer votre première publication
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-ows-border overflow-hidden bg-ows-surface-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-ows-surface-1 text-ows-text-muted text-xs uppercase tracking-wider border-b border-ows-border">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Vidéo Source</th>
                  <th className="py-3.5 px-4 font-semibold">Campagne</th>
                  <th className="py-3.5 px-4 font-semibold">Plateforme</th>
                  <th className="py-3.5 px-4 font-semibold">Statut</th>
                  <th className="py-3.5 px-4 font-semibold">Légende (Caption)</th>
                  <th className="py-3.5 px-4 font-semibold">Programmation</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ows-border/60">
                {publications.map((pub) => (
                  <tr key={pub.id} className="hover:bg-ows-surface-1/50 transition-colors">
                    {/* Vidéo Source */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5 max-w-[220px]">
                        <div className="w-8 h-8 rounded bg-black border border-ows-border flex items-center justify-center flex-shrink-0 text-ows-text-muted">
                          <Film className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-medium text-ows-text-main truncate" title={pub.video_original_name || pub.title}>
                            {pub.video_original_name || pub.title}
                          </p>
                          <p className="text-[10px] text-ows-text-subtle font-mono truncate">
                            {pub.video_filename || 'Vidéo liée'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Campagne */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {pub.campaign_name ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-black border border-ows-border">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: pub.campaign_color || '#08EB08' }}
                          />
                          <span className="text-ows-text-main font-medium">{pub.campaign_name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-ows-text-subtle">Sans campagne</span>
                      )}
                    </td>

                    {/* Plateforme */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderPlatformBadge(pub.platform)}
                    </td>

                    {/* Statut */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {renderStatusBadge(pub.status)}
                    </td>

                    {/* Légende / Caption */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="text-xs text-ows-text-muted line-clamp-2" title={pub.caption || pub.title}>
                        {pub.caption || <span className="text-ows-text-subtle italic">Aucune légende</span>}
                      </p>
                    </td>

                    {/* Programmation */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-ows-text-muted">
                        <Clock className="w-3.5 h-3.5 text-ows-text-subtle" />
                        <span>{formatDate(pub.scheduled_at)}</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {pub.external_url && (
                          <a
                            href={pub.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-ows-text-subtle hover:text-ows-accent transition-colors"
                            title="Voir la publication externe"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        <button
                          onClick={() => handleOpenDuplicate(pub)}
                          className="p-1.5 text-ows-text-subtle hover:text-ows-accent transition-colors"
                          title="Dupliquer vers un autre réseau"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleOpenEdit(pub)}
                          className="p-1.5 text-ows-text-subtle hover:text-ows-text-main transition-colors"
                          title="Modifier la publication"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setDeletingPublication(pub)}
                          className="p-1.5 text-ows-text-subtle hover:text-rose-400 transition-colors"
                          title="Supprimer la publication"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CRÉATION (UNITAIRE OU MULTI-PLATEFORMES) */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-ows-surface-card border border-ows-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            {/* Header Modal */}
            <div className="flex items-center justify-between p-6 border-b border-ows-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent">
                  {createMode === 'multi' ? <Layers className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-ows-text-main">
                    {createMode === 'multi' ? 'Génération Multi-Réseaux' : 'Nouvelle Publication'}
                  </h2>
                  <p className="text-xs text-ows-text-muted">
                    {createMode === 'multi'
                      ? 'Créez instantanément des déclinaisons autonomes pour plusieurs plateformes'
                      : 'Préparez une publication pour un réseau spécifique'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-ows-text-muted hover:text-ows-text-main rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Sélection Vidéo Source */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Vidéo Source <span className="text-ows-accent">*</span>
                </label>
                {videos.length === 0 ? (
                  <div className="p-3 bg-black border border-rose-500/30 rounded-lg text-xs text-rose-400">
                    Aucune vidéo disponible dans la vidéothèque. Veuillez d&apos;abord importer une vidéo dans l&apos;onglet Vidéothèque.
                  </div>
                ) : (
                  <select
                    value={formVideoId}
                    onChange={(e) => setFormVideoId(e.target.value)}
                    className="w-full bg-black border border-ows-border rounded-lg px-3.5 py-2.5 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                    required
                  >
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.original_name} ({(v.file_size / (1024 * 1024)).toFixed(1)} Mo)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* 2. Plateformes Cibles */}
              {createMode === 'multi' ? (
                <div>
                  <label className="block text-xs font-medium text-ows-text-muted mb-2">
                    Plateformes cibles (des publications distinctes seront créées)
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['tiktok', 'instagram', 'youtube'] as SocialPlatform[]).map(plat => {
                      const isChecked = formMultiPlatforms.includes(plat);
                      return (
                        <button
                          type="button"
                          key={plat}
                          onClick={() => {
                            setFormMultiPlatforms(prev =>
                              isChecked ? prev.filter(p => p !== plat) : [...prev, plat]
                            );
                          }}
                          className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                            isChecked
                              ? 'bg-ows-accent/10 border-ows-accent text-ows-text-main shadow-sm'
                              : 'bg-black border-ows-border text-ows-text-muted hover:border-ows-text-subtle'
                          }`}
                        >
                          {plat === 'tiktok' && <TikTokIcon className="w-4 h-4 text-[#fe2c55]" />}
                          {plat === 'instagram' && <InstagramIcon className="w-4 h-4 text-[#e1306c]" />}
                          {plat === 'youtube' && <YouTubeIcon className="w-4 h-4 text-[#ff0000]" />}
                          <span className="capitalize">{plat}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                    Plateforme cible
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['tiktok', 'instagram', 'youtube'] as SocialPlatform[]).map(plat => (
                      <button
                        type="button"
                        key={plat}
                        onClick={() => setFormPlatform(plat)}
                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                          formPlatform === plat
                            ? 'bg-ows-accent/10 border-ows-accent text-ows-text-main shadow-sm'
                            : 'bg-black border-ows-border text-ows-text-muted hover:border-ows-text-subtle'
                        }`}
                      >
                        {plat === 'tiktok' && <TikTokIcon className="w-4 h-4 text-[#fe2c55]" />}
                        {plat === 'instagram' && <InstagramIcon className="w-4 h-4 text-[#e1306c]" />}
                        {plat === 'youtube' && <YouTubeIcon className="w-4 h-4 text-[#ff0000]" />}
                        <span className="capitalize">{plat}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Caption / Légende */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ows-text-muted">
                    Légende & Hashtags
                  </label>
                  {videoCampaign && (
                    <span className="text-[11px] text-ows-text-subtle">
                      Campagne liée : <strong className="text-ows-text-main">{videoCampaign.name}</strong>
                    </span>
                  )}
                </div>

                <textarea
                  value={formCaption}
                  onChange={(e) => setFormCaption(e.target.value)}
                  placeholder="Écrivez le texte de votre clip, accroche, hashtags..."
                  rows={4}
                  className="w-full bg-black border border-ows-border rounded-lg p-3 text-sm text-ows-text-main placeholder:text-ows-text-subtle focus:outline-none focus:border-ows-accent"
                />

                {/* Boutons d'insertion rapide de la campagne */}
                {videoCampaign && (videoCampaign.hashtags || videoCampaign.mentions) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {videoCampaign.hashtags && (
                      <button
                        type="button"
                        onClick={() => insertTextToCaption(videoCampaign.hashtags || '')}
                        className="px-2 py-0.5 rounded text-[11px] bg-ows-surface-1 border border-ows-border hover:border-ows-accent text-ows-text-muted transition-colors"
                      >
                        + Insérer tags campagne
                      </button>
                    )}
                    {videoCampaign.mentions && (
                      <button
                        type="button"
                        onClick={() => insertTextToCaption(videoCampaign.mentions || '')}
                        className="px-2 py-0.5 rounded text-[11px] bg-ows-surface-1 border border-ows-border hover:border-ows-accent text-ows-text-muted transition-colors"
                      >
                        + Insérer mentions campagne
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Statut & Date de Programmation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                    Statut initial
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as PublicationStatus)}
                    className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                  >
                    <option value="draft">Brouillon</option>
                    <option value="scheduled">Programmée</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-ows-text-muted mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-ows-accent" />
                    Date et heure de publication
                  </label>
                  <input
                    type="datetime-local"
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                    className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
                  />
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ows-border">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-sm text-ows-text-muted hover:text-ows-text-main"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting || videos.length === 0}
                  className="px-5 py-2 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {submitting
                    ? 'Création...'
                    : createMode === 'multi'
                    ? `Créer ${formMultiPlatforms.length} publications`
                    : 'Créer la publication'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ÉDITION D'UNE PUBLICATION */}
      {/* ========================================================================= */}
      {editingPublication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-ows-surface-card border border-ows-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-ows-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-ows-text-main">
                    Modifier la Publication
                  </h2>
                  <p className="text-xs text-ows-text-muted">
                    {editingPublication.video_original_name || editingPublication.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingPublication(null)}
                className="p-2 text-ows-text-muted hover:text-ows-text-main rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

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
                    <option value="draft">Brouillon</option>
                    <option value="scheduled">Programmée</option>
                    <option value="publishing">En cours</option>
                    <option value="published">Publiée</option>
                    <option value="failed">Échec</option>
                    <option value="cancelled">Annulée</option>
                  </select>
                </div>
              </div>

              {/* Caption */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Légende (Caption)
                </label>
                <textarea
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={4}
                  className="w-full bg-black border border-ows-border rounded-lg p-3 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                />
              </div>

              {/* Date programmée */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-ows-accent" />
                  Date et heure programmée
                </label>
                <input
                  type="datetime-local"
                  value={editScheduledAt}
                  onChange={(e) => setEditScheduledAt(e.target.value)}
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
                />
              </div>

              {/* URL Externe (si publiée) */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  URL de publication externe (optionnelle)
                </label>
                <input
                  type="url"
                  value={editExternalUrl}
                  onChange={(e) => setEditExternalUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@clip/video/..."
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ows-border">
                <button
                  type="button"
                  onClick={() => setEditingPublication(null)}
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
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DUPLICATION VERS UNE AUTRE PLATEFORME */}
      {/* ========================================================================= */}
      {duplicatingPublication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-ows-surface-card border border-ows-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-ows-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-heading font-semibold text-ows-text-main">
                    Dupliquer vers un autre réseau
                  </h2>
                  <p className="text-xs text-ows-text-muted">
                    Créera une publication indépendante basée sur ce clip
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDuplicatingPublication(null)}
                className="p-2 text-ows-text-muted hover:text-ows-text-main rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDuplicateSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Plateforme Cible */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Nouvelle Plateforme Cible
                </label>
                <select
                  value={duplicateTargetPlatform}
                  onChange={(e) => setDuplicateTargetPlatform(e.target.value as SocialPlatform)}
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                >
                  <option value="tiktok">TikTok</option>
                  <option value="instagram">Instagram</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>

              {/* Caption */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Légende personnalisée pour ce réseau
                </label>
                <textarea
                  value={duplicateCaption}
                  onChange={(e) => setDuplicateCaption(e.target.value)}
                  rows={4}
                  className="w-full bg-black border border-ows-border rounded-lg p-3 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent"
                />
              </div>

              {/* Date programmée */}
              <div>
                <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                  Date de programmation
                </label>
                <input
                  type="datetime-local"
                  value={duplicateScheduledAt}
                  onChange={(e) => setDuplicateScheduledAt(e.target.value)}
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-sm text-ows-text-main focus:outline-none focus:border-ows-accent font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ows-border">
                <button
                  type="button"
                  onClick={() => setDuplicatingPublication(null)}
                  className="px-4 py-2 text-sm text-ows-text-muted hover:text-ows-text-main"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-sm transition-colors"
                >
                  {submitting ? 'Création...' : 'Créer la duplication'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CONFIRMATION DE SUPPRESSION */}
      {/* ========================================================================= */}
      {deletingPublication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-ows-surface-card border border-rose-500/30 rounded-2xl p-6 shadow-2xl animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-heading font-semibold text-ows-text-main text-center">
              Supprimer cette publication ?
            </h3>

            <p className="text-xs text-ows-text-muted text-center mt-2 mb-6">
              Cette action supprimera la programmation pour{' '}
              <strong className="text-ows-text-main capitalize">{deletingPublication.platform}</strong>.
              <br />
              <span className="text-ows-accent mt-2 inline-block font-medium">
                La vidéo source et les éventuelles autres publications ne seront pas affectées.
              </span>
            </p>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setDeletingPublication(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-ows-border text-sm text-ows-text-muted hover:text-ows-text-main hover:bg-ows-surface-1 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-medium text-sm transition-colors shadow-lg shadow-rose-500/20"
              >
                {submitting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
