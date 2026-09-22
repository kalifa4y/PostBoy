import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  Film,
  FileText,
  Calendar,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Plus,
  Tag,
  Clock,
  Send,
  Check,
  HardDrive
} from 'lucide-react';
import { Campaign, Video, SocialPlatform, Publication } from '../../types/domain';

interface QuickPublishWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (publication: Publication) => void;
  activeTimezone: string;
}

const PRESET_COLORS = [
  '#08EB08', // Oshun signature green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f97316', // Orange
  '#eab308', // Yellow
  '#14b8a6'  // Teal
];

// Icônes SVG vectorielles pour plateformes (Zéro Emoji)
const TikTokIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.31a6.34 6.34 0 0 0-.85-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.5a8.28 8.28 0 0 0 4.77 1.52V6.69z" />
  </svg>
);

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const YouTubeIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

export const QuickPublishWizard: React.FC<QuickPublishWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  activeTimezone
}) => {
  // Navigation entre étapes (1 à 6)
  const [step, setStep] = useState<number>(1);

  // Données auxiliaires
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Étape 1 : Campagne
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [isCreatingCampaign, setIsCreatingCampaign] = useState<boolean>(false);
  const [newCampName, setNewCampName] = useState<string>('');
  const [newCampDesc, setNewCampDesc] = useState<string>('');
  const [newCampColor, setNewCampColor] = useState<string>('#08EB08');
  const [newCampHashtags, setNewCampHashtags] = useState<string>('');
  const [creatingCampLoading, setCreatingCampLoading] = useState<boolean>(false);

  // Étape 2 : Clip Local
  const [useCustomClip, setUseCustomClip] = useState<boolean>(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [customVideoName, setCustomVideoName] = useState<string>('');

  // Étape 3 : Contenu
  const [title, setTitle] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [hashtags, setHashtags] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Étape 4 : Plateforme
  const [platform, setPlatform] = useState<SocialPlatform>('tiktok');

  // Étape 5 : Planification
  const [scheduleMode, setScheduleMode] = useState<'scheduled' | 'draft'>('scheduled');
  const [scheduledAt, setScheduledAt] = useState<string>('');

  // États de soumission et d'erreur
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialisation date programmée par défaut (prochaine heure pleine)
  const getDefaultScheduledDate = useCallback(() => {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }, []);

  // Chargement des données à l'ouverture du modal
  const fetchAuxiliaryData = useCallback(async () => {
    try {
      setLoadingData(true);
      setError(null);
      const [cRes, vRes] = await Promise.all([
        fetch('/api/campaigns'),
        fetch('/api/videos')
      ]);

      if (cRes.ok) {
        const cData = await cRes.json();
        if (cData.status === 'success') {
          setCampaigns(cData.campaigns || []);
        }
      }

      if (vRes.ok) {
        const vData = await vRes.json();
        if (vData.status === 'success') {
          const loadedVideos: Video[] = vData.videos || [];
          setVideos(loadedVideos);
          if (loadedVideos.length > 0 && !selectedVideoId) {
            setSelectedVideoId(loadedVideos[0].id);
          } else if (loadedVideos.length === 0) {
            setUseCustomClip(true);
          }
        }
      }
    } catch (err) {
      console.error('Erreur chargement données wizard:', err);
    } finally {
      setLoadingData(false);
    }
  }, [selectedVideoId]);

  // Réinitialisation du wizard à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setError(null);
      setIsCreatingCampaign(false);
      setScheduledAt(getDefaultScheduledDate());
      fetchAuxiliaryData();
    }
  }, [isOpen, getDefaultScheduledDate, fetchAuxiliaryData]);

  if (!isOpen) return null;

  // Campagne actuellement sélectionnée
  const activeCampaign = campaigns.find(c => c.id === selectedCampaignId);

  // Validation et passage à l'étape suivante
  const goToNextStep = () => {
    setError(null);

    // Validation Étape 1 : Campagne
    if (step === 1) {
      if (!selectedCampaignId) {
        setError('Veuillez sélectionner une campagne pour continuer.');
        return;
      }
    }

    // Validation Étape 2 : Clip
    if (step === 2) {
      if (useCustomClip || videos.length === 0) {
        if (!customVideoName.trim()) {
          setError('Veuillez indiquer le nom ou le fichier de votre clip local (ex: clip_01.mp4).');
          return;
        }
      } else {
        if (!selectedVideoId) {
          setError('Veuillez choisir un clip dans la liste.');
          return;
        }
      }
    }

    // Validation Étape 3 : Contenu
    if (step === 3) {
      // Si le titre est vide, on l'initialise avec la première ligne de la légende ou le nom du clip
      if (!title.trim()) {
        if (caption.trim()) {
          setTitle(caption.trim().split('\n')[0].slice(0, 80));
        } else if (useCustomClip) {
          setTitle(customVideoName.trim());
        } else {
          const selectedV = videos.find(v => v.id === selectedVideoId);
          setTitle(selectedV?.original_name || 'Nouvelle publication');
        }
      }
    }

    // Validation Étape 5 : Planification
    if (step === 5) {
      if (scheduleMode === 'scheduled' && !scheduledAt) {
        setError('Veuillez renseigner une date et une heure de programmation valide.');
        return;
      }
    }

    setStep(prev => Math.min(prev + 1, 6));
  };

  const goToPrevStep = () => {
    setError(null);
    setStep(prev => Math.max(prev - 1, 1));
  };

  // Création inline d'une nouvelle campagne (Étape 1)
  const handleCreateCampaignInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampName.trim()) {
      setError('Le nom de la campagne est obligatoire.');
      return;
    }

    try {
      setCreatingCampLoading(true);
      setError(null);
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCampName.trim(),
          description: newCampDesc.trim() || undefined,
          color: newCampColor,
          hashtags: newCampHashtags.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Impossible de créer la campagne');
      }

      // Ajout de la nouvelle campagne, sélection automatique et retour au flux
      const createdCampaign: Campaign = data.campaign;
      setCampaigns(prev => [createdCampaign, ...prev]);
      setSelectedCampaignId(createdCampaign.id);

      // Si la campagne a des hashtags, on les pré-remplit pour l'étape contenu
      if (createdCampaign.hashtags && !hashtags) {
        setHashtags(createdCampaign.hashtags);
      }

      setIsCreatingCampaign(false);
      setNewCampName('');
      setNewCampDesc('');
      setNewCampHashtags('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur création de campagne';
      setError(msg);
    } finally {
      setCreatingCampLoading(false);
    }
  };

  // Insertion rapide des hashtags de la campagne sélectionnée
  const handleInsertCampaignTags = () => {
    if (activeCampaign?.hashtags) {
      setHashtags(prev => (prev ? `${prev} ${activeCampaign.hashtags}` : activeCampaign.hashtags || ''));
    }
  };

  // Soumission finale du workflow (Étape 6)
  const handleFinalSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      let finalVideoId = selectedVideoId;

      // Si l'utilisateur a saisi une référence locale de clip, on l'enregistre
      if (useCustomClip || videos.length === 0) {
        const vRes = await fetch('/api/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            original_name: customVideoName.trim(),
            campaign_id: selectedCampaignId || undefined
          })
        });

        const vData = await vRes.json();
        if (!vRes.ok || vData.status !== 'success' || !vData.video) {
          throw new Error(vData.message || 'Impossible d\'enregistrer la référence du clip');
        }
        finalVideoId = vData.video.id;
      }

      // Création de la tâche de publication dans PostBoy
      const finalTitle = title.trim() || (useCustomClip ? customVideoName.trim() : 'Nouvelle publication');
      const finalStatus = scheduleMode === 'scheduled' && scheduledAt ? 'scheduled' : 'draft';

      const pRes = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: finalVideoId,
          campaign_id: selectedCampaignId,
          platform: platform,
          title: finalTitle,
          caption: caption.trim() || undefined,
          hashtags: hashtags.trim() || undefined,
          notes: notes.trim() || undefined,
          status: finalStatus,
          scheduled_at: scheduleMode === 'scheduled' && scheduledAt ? scheduledAt : null
        })
      });

      const pData = await pRes.json();
      if (!pRes.ok || pData.status !== 'success') {
        throw new Error(pData.message || 'Erreur lors de la création de la publication');
      }

      if (onSuccess) {
        onSuccess(pData.publication);
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau lors de la soumission';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Libellé de l'étape active
  const stepTitles = [
    'Choisir la Campagne',
    'Clip Vidéo Local',
    'Contenu & Légende',
    'Plateforme Cible',
    'Planification',
    'Récapitulatif & Validation'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-ows-surface-card border border-ows-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scale-in">
        {/* Header du Wizard */}
        <div className="p-5 border-b border-ows-border flex items-center justify-between bg-ows-surface1/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-ows-accent/15 border border-ows-accent/30 flex items-center justify-center text-ows-accent">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-heading font-bold text-base text-ows-textMain">
                  Nouvelle Publication
                </h2>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-ows-accent/10 border border-ows-accent/20 text-ows-accent">
                  Étape {step}/6
                </span>
              </div>
              <p className="text-xs text-ows-textMuted mt-0.5">
                {stepTitles[step - 1]}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-ows-textMuted hover:text-ows-textMain rounded-lg transition-colors"
            title="Fermer le workflow"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre de Progression Visuelle */}
        <div className="w-full bg-black/40 h-1 flex">
          {[1, 2, 3, 4, 5, 6].map(s => (
            <div
              key={s}
              className={`flex-1 transition-all duration-300 ${
                s <= step ? 'bg-ows-accent' : 'bg-ows-border/40'
              }`}
            />
          ))}
        </div>

        {/* Zone de Contenu Défilable */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* Message d'Erreur Global */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ÉTAPE 1 : CHOIX DE LA CAMPAGNE OU CRÉATION INLINE */}
          {/* ========================================================================= */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              {!isCreatingCampaign ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-ows-textMain flex items-center gap-2">
                        <Layers className="w-4 h-4 text-ows-accent" />
                        Sélectionnez la campagne associée
                      </h3>
                      <p className="text-xs text-ows-textMuted mt-0.5">
                        Permet de suivre votre objectif des 5 campagnes différentes aujourd&apos;hui.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCreatingCampaign(true)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ows-surface2 border border-ows-border hover:border-ows-accent text-xs font-medium text-ows-accent transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Créer une campagne</span>
                    </button>
                  </div>

                  {loadingData ? (
                    <div className="p-8 text-center text-xs text-ows-textMuted font-mono">
                      Chargement des campagnes...
                    </div>
                  ) : campaigns.length === 0 ? (
                    <div className="p-8 text-center rounded-xl bg-ows-surface1 border border-ows-border space-y-3">
                      <p className="text-xs text-ows-textMuted">
                        Aucune campagne enregistrée pour le moment.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsCreatingCampaign(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ows-accent text-black font-semibold text-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Créer ma première campagne</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
                      {campaigns.map(c => {
                        const isSelected = selectedCampaignId === c.id;
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              setSelectedCampaignId(c.id);
                              if (c.hashtags && !hashtags) {
                                setHashtags(c.hashtags);
                              }
                            }}
                            className={`p-3.5 rounded-xl border text-left transition-all flex items-start space-x-3 ${
                              isSelected
                                ? 'bg-ows-accent/10 border-ows-accent shadow-sm'
                                : 'bg-ows-surface1 border-ows-border hover:border-ows-borderSubtle'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full mt-0.5 shrink-0"
                              style={{ backgroundColor: c.color || '#08EB08' }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-xs text-ows-textMain truncate">
                                  {c.name}
                                </span>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-ows-accent shrink-0" />
                                )}
                              </div>
                              {c.description && (
                                <p className="text-[11px] text-ows-textMuted truncate mt-0.5">
                                  {c.description}
                                </p>
                              )}
                              {c.hashtags && (
                                <p className="text-[10px] text-ows-textSubtle font-mono truncate mt-1">
                                  {c.hashtags}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                /* Mini-workflow inline de création de campagne */
                <form onSubmit={handleCreateCampaignInline} className="space-y-3.5 bg-ows-surface1 p-4 rounded-xl border border-ows-border animate-scale-in">
                  <div className="flex items-center justify-between pb-2 border-b border-ows-border">
                    <span className="font-semibold text-xs text-ows-textMain flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5 text-ows-accent" />
                      Créer une nouvelle campagne
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingCampaign(false)}
                      className="text-xs text-ows-textMuted hover:text-ows-textMain"
                    >
                      Annuler
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ows-textMuted mb-1">
                      Nom de la campagne <span className="text-ows-accent">*</span>
                    </label>
                    <input
                      type="text"
                      value={newCampName}
                      onChange={(e) => setNewCampName(e.target.value)}
                      placeholder="Ex: Boxabl, Yomi Denzel, Motivation..."
                      className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ows-textMuted mb-1">
                      Description (optionnelle)
                    </label>
                    <input
                      type="text"
                      value={newCampDesc}
                      onChange={(e) => setNewCampDesc(e.target.value)}
                      placeholder="Objectif de clipping, chaîne cible..."
                      className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ows-textMuted mb-1">
                      Hashtags par défaut
                    </label>
                    <input
                      type="text"
                      value={newCampHashtags}
                      onChange={(e) => setNewCampHashtags(e.target.value)}
                      placeholder="#clipping #viral #boxabl"
                      className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-textMain focus:outline-none focus:border-ows-accent font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ows-textMuted mb-1.5">
                      Couleur distinctive
                    </label>
                    <div className="flex items-center space-x-2">
                      {PRESET_COLORS.map(c => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setNewCampColor(c)}
                          className={`w-6 h-6 rounded-full transition-transform ${
                            newCampColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-black' : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCampaign(false)}
                      className="px-3 py-1.5 rounded text-xs text-ows-textMuted hover:text-ows-textMain"
                    >
                      Retour
                    </button>
                    <button
                      type="submit"
                      disabled={creatingCampLoading}
                      className="px-4 py-1.5 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accent-hover transition-colors disabled:opacity-50"
                    >
                      {creatingCampLoading ? 'Création...' : 'Créer et continuer'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* ÉTAPE 2 : CLIP VIDÉO LOCAL (RÉFÉRENCE SANS UPLOAD) */}
          {/* ========================================================================= */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h3 className="text-sm font-semibold text-ows-textMain flex items-center gap-2">
                  <Film className="w-4 h-4 text-ows-accent" />
                  Renseigner le clip vidéo source
                </h3>
                <p className="text-xs text-ows-textMuted mt-0.5">
                  Indiquez le fichier local situé sur votre PC. Aucun upload ni copie cloud.
                </p>
              </div>

              <div className="flex items-center space-x-3 p-1 bg-black rounded-lg border border-ows-border">
                <button
                  type="button"
                  onClick={() => setUseCustomClip(false)}
                  disabled={videos.length === 0}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${
                    !useCustomClip && videos.length > 0
                      ? 'bg-ows-surfaceCard text-ows-textMain shadow-sm'
                      : 'text-ows-textMuted hover:text-ows-textMain disabled:opacity-40'
                  }`}
                >
                  Choisir un clip déjà déclaré ({videos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setUseCustomClip(true)}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-medium transition-all ${
                    useCustomClip || videos.length === 0
                      ? 'bg-ows-surfaceCard text-ows-textMain shadow-sm'
                      : 'text-ows-textMuted hover:text-ows-textMain'
                  }`}
                >
                  Nouveau fichier local
                </button>
              </div>

              {useCustomClip || videos.length === 0 ? (
                <div className="space-y-2 p-4 rounded-xl bg-ows-surface1 border border-ows-border">
                  <label className="block text-xs font-medium text-ows-textMuted">
                    Nom ou chemin du fichier sur votre PC <span className="text-ows-accent">*</span>
                  </label>
                  <div className="relative">
                    <HardDrive className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ows-textSubtle" />
                    <input
                      type="text"
                      value={customVideoName}
                      onChange={(e) => setCustomVideoName(e.target.value)}
                      placeholder="Ex: clip_boxabl_01.mp4 ou D:\Clips\yomi_04.mov"
                      className="w-full pl-10 pr-3 py-2.5 bg-black border border-ows-border rounded-lg text-xs font-mono text-ows-textMain focus:outline-none focus:border-ows-accent"
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-ows-textSubtle">
                    PostBoy conservera cette référence pour vous rappeler quel fichier poster.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {videos.map(v => {
                    const isSelected = selectedVideoId === v.id;
                    return (
                      <button
                        type="button"
                        key={v.id}
                        onClick={() => setSelectedVideoId(v.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-ows-accent/10 border-ows-accent'
                            : 'bg-ows-surface1 border-ows-border hover:border-ows-borderSubtle'
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <Film className={`w-4 h-4 ${isSelected ? 'text-ows-accent' : 'text-ows-textSubtle'}`} />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-ows-textMain truncate">
                              {v.original_name}
                            </div>
                            <div className="text-[11px] text-ows-textSubtle font-mono">
                              {v.file_size ? `${(v.file_size / (1024 * 1024)).toFixed(1)} Mo` : 'Fichier local'}
                            </div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-ows-accent shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* ÉTAPE 3 : CONTENU & LÉGENDE */}
          {/* ========================================================================= */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h3 className="text-sm font-semibold text-ows-textMain flex items-center gap-2">
                  <FileText className="w-4 h-4 text-ows-accent" />
                  Rédiger le texte de la publication
                </h3>
                <p className="text-xs text-ows-textMuted mt-0.5">
                  Ce texte sera copiable en 1 clic au moment de poster manuellement.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-ows-textMuted mb-1">
                  Titre du clip (repère interne)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Pourquoi Boxabl va révolutionner l'habitat"
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ows-textMuted mb-1">
                  Légende (Caption pour les réseaux)
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  placeholder="Accroche percutante à coller dans TikTok / Instagram / Shorts..."
                  className="w-full bg-black border border-ows-border rounded-lg p-3 text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-ows-textMuted flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-ows-accent" />
                    <span>Hashtags</span>
                  </label>
                  {activeCampaign?.hashtags && (
                    <button
                      type="button"
                      onClick={handleInsertCampaignTags}
                      className="text-[11px] text-ows-accent hover:underline font-medium"
                    >
                      + Insérer les tags de la campagne
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  placeholder="#clipping #viral #shorts"
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-xs font-mono text-ows-textMain focus:outline-none focus:border-ows-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ows-textMuted mb-1">
                  Notes & Consignes manuelles (optionnelles)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Son tendance TikTok requis, mentionner le créateur"
                  className="w-full bg-black border border-ows-border rounded-lg px-3 py-2 text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
                />
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ÉTAPE 4 : PLATEFORME CIBLE */}
          {/* ========================================================================= */}
          {step === 4 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h3 className="text-sm font-semibold text-ows-textMain">
                  Sélectionnez le réseau social cible
                </h3>
                <p className="text-xs text-ows-textMuted mt-0.5">
                  Indique où vous prévoyez de publier ce clip manuellement.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* TikTok */}
                <button
                  type="button"
                  onClick={() => setPlatform('tiktok')}
                  className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center space-y-2.5 ${
                    platform === 'tiktok'
                      ? 'bg-[#ff0050]/10 border-[#ff0050] text-[#ff4b72] shadow-sm'
                      : 'bg-ows-surface1 border-ows-border text-ows-textMuted hover:border-ows-borderSubtle'
                  }`}
                >
                  <TikTokIcon className="w-6 h-6 text-[#ff0050]" />
                  <div>
                    <div className="text-xs font-bold text-ows-textMain">TikTok</div>
                    <div className="text-[10px] text-ows-textSubtle">Format vertical 9:16</div>
                  </div>
                </button>

                {/* Instagram */}
                <button
                  type="button"
                  onClick={() => setPlatform('instagram')}
                  className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center space-y-2.5 ${
                    platform === 'instagram'
                      ? 'bg-[#e1306c]/10 border-[#e1306c] text-[#f77737] shadow-sm'
                      : 'bg-ows-surface1 border-ows-border text-ows-textMuted hover:border-ows-borderSubtle'
                  }`}
                >
                  <InstagramIcon className="w-6 h-6 text-[#e1306c]" />
                  <div>
                    <div className="text-xs font-bold text-ows-textMain">Instagram</div>
                    <div className="text-[10px] text-ows-textSubtle">Reels & Feed</div>
                  </div>
                </button>

                {/* YouTube */}
                <button
                  type="button"
                  onClick={() => setPlatform('youtube')}
                  className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center space-y-2.5 ${
                    platform === 'youtube'
                      ? 'bg-[#ff0000]/10 border-[#ff0000] text-[#ff4d4d] shadow-sm'
                      : 'bg-ows-surface1 border-ows-border text-ows-textMuted hover:border-ows-borderSubtle'
                  }`}
                >
                  <YouTubeIcon className="w-6 h-6 text-[#ff0000]" />
                  <div>
                    <div className="text-xs font-bold text-ows-textMain">YouTube</div>
                    <div className="text-[10px] text-ows-textSubtle">Shorts</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ÉTAPE 5 : PLANIFICATION CALENDAIRE */}
          {/* ========================================================================= */}
          {step === 5 && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h3 className="text-sm font-semibold text-ows-textMain flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-ows-accent" />
                  Date et heure de publication
                </h3>
                <p className="text-xs text-ows-textMuted mt-0.5">
                  Planifie l&apos;entrée dans votre calendrier pour déclencher les rappels email.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleMode('scheduled')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    scheduleMode === 'scheduled'
                      ? 'bg-ows-accent/10 border-ows-accent'
                      : 'bg-ows-surface1 border-ows-border text-ows-textMuted'
                  }`}
                >
                  <div className="flex items-center space-x-2 text-xs font-semibold text-ows-textMain">
                    <Clock className="w-4 h-4 text-ows-accent" />
                    <span>Planifier</span>
                  </div>
                  <p className="text-[11px] text-ows-textSubtle mt-1">
                    Apparaîtra dans le calendrier à l&apos;heure fixée.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleMode('draft')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    scheduleMode === 'draft'
                      ? 'bg-ows-accent/10 border-ows-accent'
                      : 'bg-ows-surface1 border-ows-border text-ows-textMuted'
                  }`}
                >
                  <div className="flex items-center space-x-2 text-xs font-semibold text-ows-textMain">
                    <FileText className="w-4 h-4 text-ows-textSubtle" />
                    <span>Brouillon</span>
                  </div>
                  <p className="text-[11px] text-ows-textSubtle mt-1">
                    À planifier plus tard depuis le calendrier.
                  </p>
                </button>
              </div>

              {scheduleMode === 'scheduled' && (
                <div className="p-4 rounded-xl bg-ows-surface1 border border-ows-border space-y-2">
                  <label className="block text-xs font-medium text-ows-textMuted">
                    Date et heure prévue (Fuseau : {activeTimezone || 'Africa/Bamako'})
                  </label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full bg-black border border-ows-border rounded-lg px-3.5 py-2.5 text-xs text-ows-textMain focus:outline-none focus:border-ows-accent font-mono"
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* ÉTAPE 6 : RÉCAPITULATIF COMPLET AVANT VALIDATION */}
          {/* ========================================================================= */}
          {step === 6 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <h3 className="text-sm font-semibold text-ows-textMain">
                  Récapitulatif avant planification
                </h3>
              </div>

              <div className="p-4 rounded-xl bg-ows-surface1 border border-ows-border space-y-3 text-xs">
                {/* Campagne */}
                <div className="flex items-center justify-between py-1 border-b border-ows-borderSubtle">
                  <span className="text-ows-textMuted">Campagne :</span>
                  <div className="flex items-center space-x-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: activeCampaign?.color || '#08EB08' }}
                    />
                    <span className="font-semibold text-ows-textMain">
                      {activeCampaign?.name || 'Campagne sélectionnée'}
                    </span>
                  </div>
                </div>

                {/* Clip */}
                <div className="flex items-center justify-between py-1 border-b border-ows-borderSubtle">
                  <span className="text-ows-textMuted">Clip source :</span>
                  <span className="font-mono text-ows-textMain truncate max-w-[280px]">
                    {useCustomClip ? customVideoName : videos.find(v => v.id === selectedVideoId)?.original_name}
                  </span>
                </div>

                {/* Plateforme */}
                <div className="flex items-center justify-between py-1 border-b border-ows-borderSubtle">
                  <span className="text-ows-textMuted">Réseau :</span>
                  <span className="font-semibold uppercase tracking-wider text-ows-textMain">
                    {platform}
                  </span>
                </div>

                {/* Planification */}
                <div className="flex items-center justify-between py-1 border-b border-ows-borderSubtle">
                  <span className="text-ows-textMuted">Statut & Échéance :</span>
                  <span className="font-mono text-ows-textMain">
                    {scheduleMode === 'scheduled' && scheduledAt
                      ? `Programmée le ${new Date(scheduledAt).toLocaleString('fr-FR')}`
                      : 'Brouillon non planifié'}
                  </span>
                </div>

                {/* Titre & Légende */}
                <div className="py-1 border-b border-ows-borderSubtle">
                  <span className="text-ows-textMuted block mb-1">Titre & Légende :</span>
                  <p className="font-medium text-ows-textMain">
                    {title || 'Titre par défaut'}
                  </p>
                  {caption && (
                    <p className="text-ows-textMuted text-[11px] mt-1 whitespace-pre-wrap line-clamp-3">
                      {caption}
                    </p>
                  )}
                  {hashtags && (
                    <p className="text-ows-accent text-[11px] font-mono mt-1">
                      {hashtags}
                    </p>
                  )}
                </div>

                {/* Notes */}
                {notes && (
                  <div className="py-1">
                    <span className="text-ows-textMuted block mb-0.5">Notes perso :</span>
                    <p className="text-ows-textSubtle italic text-[11px]">{notes}</p>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-ows-textSubtle text-center">
                La tâche sera enregistrée dans PostBoy. Vous publierez manuellement sur le réseau social.
              </p>
            </div>
          )}
        </div>

        {/* Footer avec Boutons d'Action */}
        <div className="p-4 border-t border-ows-border bg-ows-surface1/60 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={goToPrevStep}
              disabled={submitting}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-medium text-ows-textMuted hover:text-ows-textMain hover:bg-ows-surface2 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Précédent</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-ows-textMuted hover:text-ows-textMain transition-colors"
            >
              Annuler
            </button>
          )}

          {step < 6 ? (
            <button
              type="button"
              onClick={goToNextStep}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-xs transition-colors shadow-sm"
            >
              <span>Suivant</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-lg bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-xs transition-colors shadow-lg shadow-ows-accent/20 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'Création en cours...' : 'Créer la publication'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
