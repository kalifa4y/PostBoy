import React from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';

export interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  step: number;
  totalSteps: number;
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  nextLabel?: string;
  submitLabel?: string;
  isNextDisabled?: boolean;
  isSubmitting?: boolean;
  error?: string | null;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const WizardModal: React.FC<WizardModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  step,
  totalSteps,
  onPrev,
  onNext,
  onSubmit,
  nextLabel = 'Continuer',
  submitLabel = 'Confirmer',
  isNextDisabled = false,
  isSubmitting = false,
  error,
  children,
  icon
}) => {
  if (!isOpen) return null;

  const isLastStep = step === totalSteps;
  const progressPercent = Math.round((step / totalSteps) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg bg-ows-surface-card border border-ows-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Barre de progression visuelle continue */}
        <div className="w-full bg-ows-surface-2 h-1.5 overflow-hidden">
          <div
            className="h-full bg-ows-accent transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* En-tête épuré */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-ows-border/60">
          <div className="flex items-center space-x-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-ows-accent/10 border border-ows-accent/20 flex items-center justify-center text-ows-accent shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-heading font-semibold text-base sm:text-lg text-ows-text-main tracking-tight truncate">
                  {title}
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-ows-surface-2 text-ows-text-muted border border-ows-border shrink-0">
                  {step}/{totalSteps}
                </span>
              </div>
              {subtitle && (
                <p className="text-xs text-ows-text-muted mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-ows-text-subtle hover:text-ows-text-main hover:bg-ows-surface-2 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message d'erreur élégant */}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        )}

        {/* Corps de l'étape (« Une décision à la fois ») */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>

        {/* Pied de page tactile et ergonomique */}
        <div className="px-5 py-3.5 bg-ows-surface-1 border-t border-ows-border flex items-center justify-between gap-3 shrink-0">
          {step > 1 ? (
            <button
              type="button"
              onClick={onPrev}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-ows-border bg-ows-surface-2 text-ows-text-muted hover:text-ows-text-main hover:bg-ows-surface-card transition-all text-xs font-medium disabled:opacity-50"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Précédent</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center px-3.5 py-2.5 rounded-xl text-ows-text-subtle hover:text-ows-text-muted transition-colors text-xs font-medium"
            >
              Annuler
            </button>
          )}

          <div className="flex items-center gap-2">
            {!isLastStep ? (
              <button
                type="button"
                onClick={onNext}
                disabled={isNextDisabled || isSubmitting}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-xs transition-all shadow-md shadow-ows-accent/20 disabled:opacity-40 disabled:pointer-events-none"
              >
                <span>{nextLabel}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || isNextDisabled}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-ows-accent hover:bg-ows-accent-hover text-black font-semibold text-xs transition-all shadow-lg shadow-ows-accent/25 disabled:opacity-40 disabled:pointer-events-none"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{submitLabel}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
