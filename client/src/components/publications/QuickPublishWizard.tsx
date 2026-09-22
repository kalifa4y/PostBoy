import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Send
} from 'lucide-react';
import { Campaign, SocialPlatform, Publication } from '../../types/domain';
import { WizardModal } from '../ui/wizard/WizardModal';
import { VisualOptionCard } from '../ui/wizard/VisualOptionCard';
import { CampaignWizard } from '../campaigns/CampaignWizard';

interface QuickPublishWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (publication: Publication) => void;
  activeTimezone: string;
}

// Icônes vectorielles SVG soignées pour réseaux sociaux (Zéro Emoji)
const TikTokIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.85.12V9.31a6.34 6.34 0 0 0-.85-.06 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.5a8.28 8.28 0 0 0 4.77 1.52V6.69z" />
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

const TIME_PRESETS = [
  { time: '10:00', label: '10:00 (Matin)' },
  { time: '14:00', label: '14:00 (Midi)' },
  { time: '18:00', label: '18:00 (Soir)' },
  { time: '21:00', label: '21:00 (Nuit)' }
];

export const QuickPublishWizard: React.FC<QuickPublishWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  activeTimezone: _activeTimezone
}) => {
  const [step, setStep] = useState<number>(1);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(false);

  // Étape 1 : Campagne
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [isCampaignWizardOpen, setIsCampaignWizardOpen] = useState<boolean>(false);

  // Étape 2 : Plateforme
  const [platform, setPlatform] = useState<SocialPlatform>('tiktok');

  // Étape 3 : Programmation
  const [dayChoice, setDayChoice] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>('');
  const [timeSlot, setTimeSlot] = useState<string>('18:00');

  // Étape 4 : Note facultative & soumission
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Récupération des campagnes actives
  const fetchCampaigns = useCallback(async () => {
    try {
      setLoadingCampaigns(true);
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          const list: Campaign[] = data.campaigns || [];
          setCampaigns(list);
          if (list.length > 0 && !selectedCampaignId) {
            setSelectedCampaignId(list[0].id);
          }
        }
      }
    } catch {
      // Erreur réseau silencieuse, gérée par le state
    } finally {
      setLoadingCampaigns(false);
    }
  }, [selectedCampaignId]);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setError(null);
      setNote('');
      fetchCampaigns();

      // Initialiser la date du jour par défaut
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      setCustomDate(`${yyyy}-${mm}-${dd}`);
    }
  }, [isOpen, fetchCampaigns]);

  // Calcul de la date et heure ciblée
  const computeScheduledAt = (): string => {
    const now = new Date();
    let targetDateStr = '';

    if (dayChoice === 'today') {
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      targetDateStr = `${yyyy}-${mm}-${dd}`;
    } else if (dayChoice === 'tomorrow') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      targetDateStr = `${yyyy}-${mm}-${dd}`;
    } else {
      targetDateStr = customDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    return `${targetDateStr}T${timeSlot || '18:00'}`;
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!selectedCampaignId) {
        setError('Choisis une campagne pour continuer.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handlePrev = () => {
    setError(null);
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    if (!selectedCampaignId) {
      setError('Une campagne doit être sélectionnée.');
      setStep(1);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const scheduledAtIso = computeScheduledAt();
      const selectedCamp = campaigns.find(c => c.id === selectedCampaignId);
      const defaultTitle = selectedCamp
        ? `${selectedCamp.name} — ${platform.toUpperCase()}`
        : `Publication ${platform.toUpperCase()}`;

      const res = await fetch('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: selectedCampaignId,
          platform,
          title: defaultTitle,
          status: 'scheduled',
          scheduled_at: scheduledAtIso,
          notes: note.trim() || undefined,
          hashtags: selectedCamp?.hashtags || undefined
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Échec de la planification.');
      }

      if (onSuccess) {
        onSuccess(data.publication);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <>
      <WizardModal
        isOpen={isOpen && !isCampaignWizardOpen}
        onClose={onClose}
        title="Nouvelle Publication"
        subtitle={
          step === 1
            ? 'Choisis une campagne'
            : step === 2
            ? 'Où publier ?'
            : step === 3
            ? 'Quand publier ?'
            : 'Prêt à planifier'
        }
        step={step}
        totalSteps={4}
        onPrev={handlePrev}
        onNext={handleNext}
        onSubmit={handleSubmit}
        nextLabel="Continuer"
        submitLabel="Planifier la publication"
        isNextDisabled={step === 1 && !selectedCampaignId}
        isSubmitting={isSubmitting}
        error={error}
        icon={<Send className="w-5 h-5" />}
      >
        {/* Étape 1 : Choisis une campagne */}
        {step === 1 && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-ows-text-muted">
                Sélectionne le projet associé à ce clip :
              </span>
              <button
                type="button"
                onClick={() => setIsCampaignWizardOpen(true)}
                className="text-xs text-ows-accent hover:underline flex items-center gap-1 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Créer une campagne</span>
              </button>
            </div>

            {loadingCampaigns ? (
              <div className="py-8 text-center text-xs text-ows-text-subtle">
                Chargement des campagnes...
              </div>
            ) : campaigns.length === 0 ? (
              <div className="py-8 px-4 rounded-2xl border border-dashed border-ows-border text-center space-y-3">
                <p className="text-xs text-ows-text-muted">
                  Aucune campagne existante. Crée ta première campagne pour commencer !
                </p>
                <button
                  type="button"
                  onClick={() => setIsCampaignWizardOpen(true)}
                  className="px-4 py-2 rounded-xl bg-ows-accent text-black font-semibold text-xs inline-flex items-center gap-1.5 shadow-md shadow-ows-accent/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Créer une campagne</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {campaigns.map(camp => (
                  <VisualOptionCard
                    key={camp.id}
                    title={camp.name}
                    subtitle={camp.hashtags || camp.description || 'Campagne active'}
                    color={camp.color || '#08EB08'}
                    selected={selectedCampaignId === camp.id}
                    onClick={() => setSelectedCampaignId(camp.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Étape 2 : Où publier ? */}
        {step === 2 && (
          <div className="space-y-3 animate-fade-in">
            <p className="text-xs text-ows-text-muted pb-1">
              Choisis le réseau social sur lequel tu publieras ce clip :
            </p>

            <div className="space-y-2.5">
              <VisualOptionCard
                title="TikTok"
                subtitle="Format vertical 9:16 (Short clip)"
                icon={<TikTokIcon className="w-5 h-5 text-[#fe2c55]" />}
                selected={platform === 'tiktok'}
                onClick={() => setPlatform('tiktok')}
              />

              <VisualOptionCard
                title="Instagram"
                subtitle="Reels & Feed"
                icon={<InstagramIcon className="w-5 h-5 text-[#e1306c]" />}
                selected={platform === 'instagram'}
                onClick={() => setPlatform('instagram')}
              />

              <VisualOptionCard
                title="YouTube"
                subtitle="Shorts (Format court)"
                icon={<YouTubeIcon className="w-5 h-5 text-[#ff0000]" />}
                selected={platform === 'youtube'}
                onClick={() => setPlatform('youtube')}
              />
            </div>
          </div>
        )}

        {/* Étape 3 : Quand publier ? */}
        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label className="block text-xs font-medium text-ows-text-muted mb-2 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-ows-accent" />
                <span>Quel jour ?</span>
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDayChoice('today')}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    dayChoice === 'today'
                      ? 'border-ows-accent bg-ows-accent/10 text-ows-text-main font-semibold shadow-sm'
                      : 'border-ows-border bg-ows-surface-1 text-ows-text-muted hover:border-ows-text-subtle'
                  }`}
                >
                  <div className="text-xs">Aujourd'hui</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDayChoice('tomorrow')}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    dayChoice === 'tomorrow'
                      ? 'border-ows-accent bg-ows-accent/10 text-ows-text-main font-semibold shadow-sm'
                      : 'border-ows-border bg-ows-surface-1 text-ows-text-muted hover:border-ows-text-subtle'
                  }`}
                >
                  <div className="text-xs">Demain</div>
                </button>

                <button
                  type="button"
                  onClick={() => setDayChoice('custom')}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    dayChoice === 'custom'
                      ? 'border-ows-accent bg-ows-accent/10 text-ows-text-main font-semibold shadow-sm'
                      : 'border-ows-border bg-ows-surface-1 text-ows-text-muted hover:border-ows-text-subtle'
                  }`}
                >
                  <div className="text-xs">Autre date</div>
                </button>
              </div>

              {dayChoice === 'custom' && (
                <div className="mt-3">
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    className="w-full bg-black/60 border border-ows-border rounded-xl px-4 py-2.5 text-xs text-ows-text-main focus:outline-none focus:border-ows-accent"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-ows-text-muted mb-2 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-ows-accent" />
                <span>À quelle heure ?</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {TIME_PRESETS.map(preset => (
                  <button
                    key={preset.time}
                    type="button"
                    onClick={() => setTimeSlot(preset.time)}
                    className={`py-2 px-2.5 rounded-xl border text-xs text-center transition-all ${
                      timeSlot === preset.time
                        ? 'border-ows-accent bg-ows-accent/10 text-ows-text-main font-semibold'
                        : 'border-ows-border bg-ows-surface-1 text-ows-text-muted hover:border-ows-text-subtle'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ows-text-subtle">Heure personnalisée :</span>
                <input
                  type="time"
                  value={timeSlot}
                  onChange={e => setTimeSlot(e.target.value)}
                  className="bg-black/60 border border-ows-border rounded-xl px-3 py-1.5 text-xs font-mono text-ows-text-main focus:outline-none focus:border-ows-accent"
                />
              </div>
            </div>
          </div>
        )}

        {/* Étape 4 : Récapitulatif & Validation */}
        {step === 4 && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-4 rounded-2xl border border-ows-accent/30 bg-ows-surface-1 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {platform === 'tiktok' && <TikTokIcon className="w-5 h-5 text-[#fe2c55]" />}
                  {platform === 'instagram' && <InstagramIcon className="w-5 h-5 text-[#e1306c]" />}
                  {platform === 'youtube' && <YouTubeIcon className="w-5 h-5 text-[#ff0000]" />}
                  <span className="font-heading font-semibold text-sm text-ows-text-main capitalize">
                    {platform}
                  </span>
                </div>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-ows-accent/15 text-ows-accent border border-ows-accent/30 font-medium">
                  Programmé
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-ows-border/60">
                <div
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: selectedCampaign?.color || '#08EB08' }}
                />
                <span className="text-xs text-ows-text-main font-medium">
                  {selectedCampaign?.name || 'Campagne sélectionnée'}
                </span>
              </div>

              <div className="text-xs text-ows-text-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ows-accent" />
                <span>Créneau : {computeScheduledAt().replace('T', ' à ')}</span>
              </div>
            </div>

            {/* Note facultative en 1 ligne courte */}
            <div>
              <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
                Mémo personnel (facultatif)
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Ex: Son tendance #1, mentionner @boxabl"
                className="w-full bg-black/60 border border-ows-border rounded-xl px-4 py-2.5 text-xs text-ows-text-main placeholder:text-ows-text-subtle focus:outline-none focus:border-ows-accent"
              />
            </div>
          </div>
        )}
      </WizardModal>

      {/* Sous-wizard inline si l'utilisateur souhaite créer une campagne à la volée */}
      <CampaignWizard
        isOpen={isCampaignWizardOpen}
        onClose={() => setIsCampaignWizardOpen(false)}
        onSuccess={newCamp => {
          setIsCampaignWizardOpen(false);
          setCampaigns(prev => [newCamp, ...prev]);
          setSelectedCampaignId(newCamp.id);
        }}
      />
    </>
  );
};
