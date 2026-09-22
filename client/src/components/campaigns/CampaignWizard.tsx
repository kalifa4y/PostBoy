import React, { useState, useEffect } from 'react';
import { Layers, Palette, Hash, Plus } from 'lucide-react';
import { WizardModal } from '../ui/wizard/WizardModal';
import { Campaign } from '../../types/domain';

interface CampaignWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (campaign: Campaign) => void;
  initialCampaign?: Campaign | null;
}

const PRESET_COLORS = [
  { hex: '#08EB08', label: 'Vert Oshun' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#3b82f6', label: 'Bleu' },
  { hex: '#8b5cf6', label: 'Violet' },
  { hex: '#ec4899', label: 'Rose' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#eab308', label: 'Jaune' },
  { hex: '#14b8a6', label: 'Teal' }
];

const SUGGESTED_HASHTAGS = ['#clipping', '#viral', '#shorts', '#tiktok', '#reels', '#growth'];

export const CampaignWizard: React.FC<CampaignWizardProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialCampaign
}) => {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [color, setColor] = useState<string>('#08EB08');
  const [hashtags, setHashtags] = useState<string>('');
  const [mentions, setMentions] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(initialCampaign);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setError(null);
      if (initialCampaign) {
        setName(initialCampaign.name || '');
        setDescription(initialCampaign.description || '');
        setColor(initialCampaign.color || '#08EB08');
        setHashtags(initialCampaign.hashtags || '');
        setMentions(initialCampaign.mentions || '');
      } else {
        setName('');
        setDescription('');
        setColor('#08EB08');
        setHashtags('');
        setMentions('');
      }
    }
  }, [isOpen, initialCampaign]);

  const handleAddTag = (tag: string) => {
    const currentTags = hashtags
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean);
    if (!currentTags.includes(tag)) {
      setHashtags(currentTags.length > 0 ? `${hashtags} ${tag}` : tag);
    }
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!name.trim()) {
        setError('Donne un nom à ta campagne pour continuer.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handlePrev = () => {
    setError(null);
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Le nom de la campagne est obligatoire.');
      setStep(1);
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const url = isEditing ? `/api/campaigns/${initialCampaign!.id}` : '/api/campaigns';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          hashtags: hashtags.trim() || undefined,
          mentions: mentions.trim() || undefined,
          status: 'active'
        })
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.message || 'Impossible d\'enregistrer la campagne.');
      }

      onSuccess(data.campaign);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Modifier la Campagne' : 'Nouvelle Campagne'}
      subtitle={
        step === 1
          ? 'Identité de votre projet'
          : step === 2
          ? 'Couleur & Réseaux'
          : 'Aperçu & Validation'
      }
      step={step}
      totalSteps={3}
      onPrev={handlePrev}
      onNext={handleNext}
      onSubmit={handleSubmit}
      nextLabel="Suivant"
      submitLabel={isEditing ? 'Enregistrer' : 'Créer la campagne'}
      isNextDisabled={step === 1 && !name.trim()}
      isSubmitting={isSubmitting}
      error={error}
      icon={<Layers className="w-5 h-5" />}
    >
      {/* Étape 1 : Identité */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
              Nom de la campagne *
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: BOXABL, Prime Video, Défi 30 Jours..."
              autoFocus
              className="w-full bg-black/60 border border-ows-border rounded-xl px-4 py-3 text-sm text-ows-text-main placeholder:text-ows-text-subtle focus:outline-none focus:border-ows-accent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
              Objectif court ou mémo (optionnel)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Consignes de clipping, format préféré, cible visée..."
              rows={3}
              className="w-full bg-black/60 border border-ows-border rounded-xl px-4 py-3 text-sm text-ows-text-main placeholder:text-ows-text-subtle focus:outline-none focus:border-ows-accent transition-all resize-none"
            />
          </div>
        </div>
      )}

      {/* Étape 2 : Style & Hashtags */}
      {step === 2 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <label className="block text-xs font-medium text-ows-text-muted mb-2.5 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-ows-accent" />
              <span>Choisis une couleur distinctive</span>
            </label>
            <div className="grid grid-cols-4 gap-2.5">
              {PRESET_COLORS.map(c => {
                const isSelected = color.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setColor(c.hex)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left ${
                      isSelected
                        ? 'border-ows-accent bg-ows-surface-2 shadow-sm'
                        : 'border-ows-border bg-ows-surface-1 hover:border-ows-text-subtle'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="text-xs text-ows-text-main truncate">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-ows-text-muted flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-ows-accent" />
                <span>Hashtags recommandés</span>
              </label>
            </div>
            <input
              type="text"
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              placeholder="#boxabl #clipping #viral"
              className="w-full bg-black/60 border border-ows-border rounded-xl px-4 py-2.5 text-xs font-mono text-ows-text-main placeholder:text-ows-text-subtle focus:outline-none focus:border-ows-accent"
            />
            {/* Suggestions rapides en 1 clic */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SUGGESTED_HASHTAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleAddTag(tag)}
                  className="text-[11px] font-mono px-2 py-1 rounded-lg bg-ows-surface-2 text-ows-text-muted hover:text-ows-accent border border-ows-border hover:border-ows-accent/30 transition-all flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>{tag}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ows-text-muted mb-1.5">
              Mentions sociales (optionnel)
            </label>
            <input
              type="text"
              value={mentions}
              onChange={e => setMentions(e.target.value)}
              placeholder="@compte1 @compte2"
              className="w-full bg-black/60 border border-ows-border rounded-xl px-4 py-2.5 text-xs text-ows-text-main placeholder:text-ows-text-subtle focus:outline-none focus:border-ows-accent"
            />
          </div>
        </div>
      )}

      {/* Étape 3 : Aperçu en direct & Validation */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-ows-text-muted">
            Voici comment ta campagne apparaîtra dans ton tableau de bord et ton calendrier :
          </p>

          <div
            className="p-5 rounded-2xl border bg-ows-surface-1 shadow-lg transition-all"
            style={{ borderColor: `${color}40` }}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <h3 className="font-heading font-semibold text-base text-ows-text-main">
                  {name || 'Nom de la campagne'}
                </h3>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-ows-accent/10 border border-ows-accent/30 text-ows-accent">
                Active
              </span>
            </div>

            {description && (
              <p className="text-xs text-ows-text-muted mt-1 mb-3 line-clamp-2">
                {description}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-ows-border/60 text-xs">
              {hashtags ? (
                <span className="font-mono text-[11px] text-ows-accent">
                  {hashtags}
                </span>
              ) : (
                <span className="text-ows-text-subtle text-[11px]">Aucun hashtag spécifié</span>
              )}
              {mentions && (
                <span className="text-[11px] text-ows-text-muted">
                  • {mentions}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </WizardModal>
  );
};
