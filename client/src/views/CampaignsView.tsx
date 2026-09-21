import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Search,
  AlertCircle,
  Clock,
  Trash2,
  Edit3,
  Eye,
  X,
  Hash,
  AtSign,
  Palette,
  AlertTriangle
} from 'lucide-react';
import { Campaign } from '../types/domain';

interface CampaignsViewProps {
  activeTimezone: string;
}

const PRESET_COLORS = [
  '#08EB08', // Oshun Signature Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f97316', // Orange
  '#eab308', // Yellow
  '#14b8a6'  // Teal
];

export const CampaignsView: React.FC<CampaignsViewProps> = ({ activeTimezone }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Recherche & Filtres
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(null);

  // Données de formulaire
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#08EB08',
    mentions: '',
    hashtags: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Récupération de la liste des campagnes
  const fetchCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/campaigns');
      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }
      const data = await res.json();
      if (data.status === 'success') {
        setCampaigns(data.campaigns || []);
      } else {
        throw new Error(data.message || 'Impossible de charger les campagnes');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Formatage date locale
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: activeTimezone || 'Africa/Bamako'
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  // Ouverture du formulaire de création
  const openCreateModal = () => {
    setFormData({
      name: '',
      description: '',
      color: '#08EB08',
      mentions: '',
      hashtags: '',
      status: 'active'
    });
    setFormError(null);
    setIsCreateModalOpen(true);
  };

  // Ouverture du formulaire de modification
  const openEditModal = (c: Campaign) => {
    setFormData({
      name: c.name,
      description: c.description || '',
      color: c.color || '#08EB08',
      mentions: c.mentions || '',
      hashtags: c.hashtags || '',
      status: c.status || 'active'
    });
    setFormError(null);
    setEditingCampaign(c);
  };

  // Soumission (Création ou Modification)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('Le nom de la campagne est obligatoire.');
      return;
    }

    try {
      setSubmitting(true);
      const isEdit = !!editingCampaign;
      const url = isEdit ? `/api/campaigns/${editingCampaign.id}` : '/api/campaigns';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Une erreur est survenue lors de lenregistrement.');
      }

      setIsCreateModalOpen(false);
      setEditingCampaign(null);
      await fetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de communication';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Bascule rapide Actif / Inactif
  const toggleStatus = async (c: Campaign) => {
    const nextStatus = c.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/api/campaigns/${c.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        setCampaigns((prev) =>
          prev.map((item) => (item.id === c.id ? { ...item, status: nextStatus } : item))
        );
      }
    } catch (err) {
      console.error('Erreur bascule de statut:', err);
    }
  };

  // Suppression d'une campagne
  const handleDelete = async () => {
    if (!deletingCampaign) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch(`/api/campaigns/${deletingCampaign.id}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Impossible de supprimer cette campagne.');
      }

      setDeletingCampaign(null);
      await fetchCampaigns();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur suppression';
      setError(msg);
      setDeletingCampaign(null);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtrage des campagnes
  const filteredCampaigns = campaigns.filter((c) => {
    // Filtre statut
    if (statusFilter !== 'all' && c.status !== statusFilter) {
      return false;
    }
    // Filtre recherche
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchDesc = (c.description || '').toLowerCase().includes(q);
      const matchTags = (c.hashtags || '').toLowerCase().includes(q);
      const matchMentions = (c.mentions || '').toLowerCase().includes(q);
      return matchName || matchDesc || matchTags || matchMentions;
    }
    return true;
  });

  const activeCount = campaigns.filter((c) => c.status === 'active').length;
  const inactiveCount = campaigns.filter((c) => c.status === 'inactive').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-ows-textMain tracking-tight">
            Campagnes
          </h2>
          <p className="text-xs text-ows-textMuted mt-1">
            Organisation thématique des vidéos et publications de clipping.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle campagne</span>
        </button>
      </div>

      {/* Message d'erreur global */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Filtres & Statistiques rapides */}
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Barre de recherche */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ows-textSubtle" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, mentions, hashtags..."
            className="w-full pl-9 pr-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain placeholder-ows-textSubtle focus:outline-none focus:border-ows-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-ows-textSubtle hover:text-ows-textMain"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Boutons de filtre de statut */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-ows-surfaceCard text-ows-textMain border border-ows-border'
                : 'text-ows-textMuted hover:text-ows-textMain'
            }`}
          >
            Toutes ({campaigns.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'active'
                ? 'bg-ows-accent/15 text-ows-accent border border-ows-accent/30'
                : 'text-ows-textMuted hover:text-ows-textMain'
            }`}
          >
            Actives ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'inactive'
                ? 'bg-ows-surfaceCard text-ows-textSubtle border border-ows-border'
                : 'text-ows-textMuted hover:text-ows-textMain'
            }`}
          >
            Inactives ({inactiveCount})
          </button>
        </div>
      </div>

      {/* 3. Liste / Grille des campagnes */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-xs text-ows-textMuted">
          Chargement des campagnes...
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-ows-surface2 border border-ows-border mx-auto flex items-center justify-center text-ows-textSubtle">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold font-heading text-ows-textMain">
              {campaigns.length === 0 ? 'Aucune campagne' : 'Aucun résultat correspondant'}
            </h3>
            <p className="text-xs text-ows-textMuted mt-1 max-w-sm mx-auto">
              {campaigns.length === 0
                ? 'Créez votre première campagne pour regrouper vos vidéos et publications de clipping.'
                : 'Modifiez vos critères de recherche pour retrouver vos campagnes.'}
            </p>
          </div>
          {campaigns.length === 0 && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Créer une campagne</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCampaigns.map((c) => {
            const isActive = c.status === 'active';
            const hashtagsList = c.hashtags
              ? c.hashtags.split(/\s+/).filter(Boolean)
              : [];
            const mentionsList = c.mentions
              ? c.mentions.split(/\s+/).filter(Boolean)
              : [];

            return (
              <div
                key={c.id}
                className="bg-ows-surface1 border border-ows-border rounded-xl p-5 flex flex-col justify-between hover:border-ows-borderSubtle transition-all space-y-4"
              >
                {/* En-tête de la carte */}
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: c.color || '#08EB08' }}
                      />
                      <h3 className="font-heading font-bold text-sm text-ows-textMain truncate">
                        {c.name}
                      </h3>
                    </div>

                    {/* Statut Toggle */}
                    <button
                      onClick={() => toggleStatus(c)}
                      title={`Cliquer pour passer en ${isActive ? 'inactif' : 'actif'}`}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors border ${
                        isActive
                          ? 'bg-ows-accent/15 text-ows-accent border-ows-accent/30 hover:bg-ows-accent/25'
                          : 'bg-ows-surface2 text-ows-textSubtle border-ows-border hover:text-ows-textMuted'
                      }`}
                    >
                      {isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  {/* Description */}
                  {c.description ? (
                    <p className="text-xs text-ows-textMuted line-clamp-2 leading-relaxed">
                      {c.description}
                    </p>
                  ) : (
                    <p className="text-xs text-ows-textSubtle italic">
                      Aucune description renseignée.
                    </p>
                  )}
                </div>

                {/* Métadonnées : Mentions & Hashtags */}
                <div className="space-y-2 border-t border-ows-borderSubtle pt-3">
                  {mentionsList.length > 0 && (
                    <div className="flex items-center space-x-1.5 text-[11px] text-ows-textMuted overflow-hidden">
                      <AtSign className="w-3 h-3 text-ows-textSubtle shrink-0" />
                      <div className="flex flex-wrap gap-1 truncate font-mono">
                        {mentionsList.map((m, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.2 rounded bg-ows-surface2 text-ows-textMuted border border-ows-border text-[10px]"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {hashtagsList.length > 0 && (
                    <div className="flex items-center space-x-1.5 text-[11px] text-ows-textMuted overflow-hidden">
                      <Hash className="w-3 h-3 text-ows-textSubtle shrink-0" />
                      <div className="flex flex-wrap gap-1 truncate font-mono">
                        {hashtagsList.map((h, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.2 rounded bg-ows-surface2 text-ows-textMuted border border-ows-border text-[10px]"
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-ows-textSubtle font-mono pt-1">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(c.updated_at)}</span>
                    </span>
                  </div>
                </div>

                {/* Barre d'actions */}
                <div className="flex items-center justify-end space-x-2 border-t border-ows-borderSubtle pt-3">
                  <button
                    onClick={() => setViewingCampaign(c)}
                    className="p-1.5 rounded bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-ows-textSubtle hover:text-ows-textMain transition-all"
                    title="Consulter les détails"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => openEditModal(c)}
                    className="p-1.5 rounded bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-ows-textSubtle hover:text-ows-textMain transition-all"
                    title="Modifier la campagne"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setDeletingCampaign(c)}
                    className="p-1.5 rounded bg-ows-surface2 border border-ows-border hover:border-rose-500/50 text-ows-textSubtle hover:text-rose-400 transition-all"
                    title="Supprimer la campagne"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Modal Création / Édition */}
      {(isCreateModalOpen || editingCampaign) && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-ows-surface1 border border-ows-border rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-ows-border">
              <h3 className="text-base font-bold font-heading text-ows-textMain">
                {editingCampaign ? 'Modifier la campagne' : 'Nouvelle campagne'}
              </h3>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingCampaign(null);
                }}
                className="text-ows-textSubtle hover:text-ows-textMain transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nom */}
              <div>
                <label className="block text-xs font-semibold text-ows-textMain mb-1.5">
                  Nom de la campagne <span className="text-ows-accent">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: BOXABL, Prime Video, Call of Duty..."
                  className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-ows-textMuted mb-1.5">
                  Description / Notes
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Objectif de la campagne, consignes de clipping, etc."
                  className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
                />
              </div>

              {/* Couleur */}
              <div>
                <label className="block text-xs font-semibold text-ows-textMuted mb-1.5 flex items-center space-x-1.5">
                  <Palette className="w-3.5 h-3.5 text-ows-accent" />
                  <span>Couleur distinctive</span>
                </label>
                <div className="flex items-center space-x-2">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: col })}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        formData.color === col ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : ''
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-7 h-7 bg-transparent border-0 cursor-pointer rounded ml-2"
                    title="Couleur personnalisée"
                  />
                </div>
              </div>

              {/* Mentions & Hashtags */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ows-textMuted mb-1.5 flex items-center space-x-1">
                    <AtSign className="w-3 h-3 text-ows-accent" />
                    <span>Mentions sociales</span>
                  </label>
                  <input
                    type="text"
                    value={formData.mentions}
                    onChange={(e) => setFormData({ ...formData, mentions: e.target.value })}
                    placeholder="@compte1 @compte2"
                    className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain font-mono focus:outline-none focus:border-ows-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ows-textMuted mb-1.5 flex items-center space-x-1">
                    <Hash className="w-3 h-3 text-ows-accent" />
                    <span>Hashtags</span>
                  </label>
                  <input
                    type="text"
                    value={formData.hashtags}
                    onChange={(e) => setFormData({ ...formData, hashtags: e.target.value })}
                    placeholder="#tag1 #tag2 #tag3"
                    className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain font-mono focus:outline-none focus:border-ows-accent"
                  />
                </div>
              </div>

              {/* Statut */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-ows-surface2 border border-ows-border">
                <div>
                  <div className="text-xs font-medium text-ows-textMain">Statut de la campagne</div>
                  <div className="text-[11px] text-ows-textSubtle">
                    {formData.status === 'active' ? 'Campagne active' : 'Campagne désactivée (archivée)'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      status: formData.status === 'active' ? 'inactive' : 'active'
                    })
                  }
                  className={`px-3 py-1 rounded text-xs font-mono font-medium border ${
                    formData.status === 'active'
                      ? 'bg-ows-accent/15 text-ows-accent border-ows-accent/30'
                      : 'bg-ows-surface1 text-ows-textSubtle border-ows-border'
                  }`}
                >
                  {formData.status === 'active' ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Actions du formulaire */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-ows-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingCampaign(null);
                  }}
                  className="px-4 py-2 rounded-lg text-xs text-ows-textMuted hover:text-ows-textMain transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Enregistrement...' : editingCampaign ? 'Enregistrer les modifications' : 'Créer la campagne'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal Consultation Détails */}
      {viewingCampaign && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-ows-surface1 border border-ows-border rounded-xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-ows-border">
              <div className="flex items-center space-x-2.5">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: viewingCampaign.color || '#08EB08' }}
                />
                <h3 className="text-base font-bold font-heading text-ows-textMain">
                  {viewingCampaign.name}
                </h3>
              </div>
              <button
                onClick={() => setViewingCampaign(null)}
                className="text-ows-textSubtle hover:text-ows-textMain transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-[11px] font-medium text-ows-textSubtle uppercase tracking-wider block mb-1">
                  Description
                </span>
                <p className="text-ows-textMain leading-relaxed bg-ows-surface2 p-3 rounded-lg border border-ows-border">
                  {viewingCampaign.description || 'Aucune description disponible.'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-ows-surface2 p-3 rounded-lg border border-ows-border space-y-1">
                  <span className="text-[11px] font-medium text-ows-textSubtle uppercase tracking-wider block">
                    Statut
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono border ${
                      viewingCampaign.status === 'active'
                        ? 'bg-ows-accent/15 text-ows-accent border-ows-accent/30'
                        : 'bg-ows-surfaceCard text-ows-textSubtle border-ows-border'
                    }`}
                  >
                    {viewingCampaign.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="bg-ows-surface2 p-3 rounded-lg border border-ows-border space-y-1">
                  <span className="text-[11px] font-medium text-ows-textSubtle uppercase tracking-wider block">
                    Identifiant
                  </span>
                  <span className="font-mono text-[10px] text-ows-textMuted truncate block">
                    {viewingCampaign.id}
                  </span>
                </div>
              </div>

              {viewingCampaign.mentions && (
                <div>
                  <span className="text-[11px] font-medium text-ows-textSubtle uppercase tracking-wider block mb-1">
                    Mentions
                  </span>
                  <p className="font-mono text-[11px] text-ows-textMuted bg-ows-surface2 p-2.5 rounded-lg border border-ows-border">
                    {viewingCampaign.mentions}
                  </p>
                </div>
              )}

              {viewingCampaign.hashtags && (
                <div>
                  <span className="text-[11px] font-medium text-ows-textSubtle uppercase tracking-wider block mb-1">
                    Hashtags
                  </span>
                  <p className="font-mono text-[11px] text-ows-textMuted bg-ows-surface2 p-2.5 rounded-lg border border-ows-border">
                    {viewingCampaign.hashtags}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 text-[10px] text-ows-textSubtle font-mono border-t border-ows-borderSubtle">
                <div>Créée le : {formatDate(viewingCampaign.created_at)}</div>
                <div>Modifiée le : {formatDate(viewingCampaign.updated_at)}</div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-ows-border">
              <button
                onClick={() => setViewingCampaign(null)}
                className="px-4 py-2 rounded-lg bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-xs text-ows-textMain transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Confirmation Suppression */}
      {deletingCampaign && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-ows-surface1 border border-ows-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-heading text-ows-textMain">
                  Supprimer la campagne ?
                </h3>
                <span className="text-xs text-rose-400 font-mono">Action irréversible</span>
              </div>
            </div>

            <p className="text-xs text-ows-textMuted leading-relaxed">
              Êtes-vous sûr de vouloir supprimer définitivement la campagne{' '}
              <strong className="text-ows-textMain">« {deletingCampaign.name} »</strong> ?
            </p>

            <div className="p-3 rounded-lg bg-ows-surface2 border border-ows-border text-[11px] text-ows-textSubtle">
              Note : La suppression sera refusée si des vidéos sources sont actuellement associées à cette campagne.
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-ows-border">
              <button
                type="button"
                onClick={() => setDeletingCampaign(null)}
                className="px-4 py-2 rounded-lg text-xs text-ows-textMuted hover:text-ows-textMain transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDelete}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white font-semibold text-xs hover:bg-rose-600 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
