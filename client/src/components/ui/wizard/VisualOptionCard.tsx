import React from 'react';
import { Check } from 'lucide-react';

export interface VisualOptionCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export const VisualOptionCard: React.FC<VisualOptionCardProps> = ({
  title,
  subtitle,
  icon,
  color,
  badge,
  selected,
  onClick,
  disabled = false
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative w-full text-left p-4 rounded-2xl border transition-all duration-200 flex items-center justify-between gap-3 group ${
        disabled
          ? 'opacity-40 pointer-events-none border-ows-border bg-ows-surface-1'
          : selected
          ? 'bg-ows-accent/10 border-ows-accent shadow-md shadow-ows-accent/10'
          : 'bg-ows-surface-1 hover:bg-ows-surface-2 border-ows-border hover:border-ows-text-subtle'
      }`}
    >
      <div className="flex items-center space-x-3.5 min-w-0">
        {/* Pastille de couleur ou Icône */}
        {color ? (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105"
            style={{ backgroundColor: `${color}20`, border: `1.5px solid ${color}` }}
          >
            <div className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: color }} />
          </div>
        ) : icon ? (
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
              selected
                ? 'bg-ows-accent/20 text-ows-accent border border-ows-accent/40'
                : 'bg-ows-surface-2 text-ows-text-muted border border-ows-border'
            }`}
          >
            {icon}
          </div>
        ) : null}

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-heading font-medium text-sm text-ows-text-main truncate">
              {title}
            </h4>
            {badge && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-ows-surface-2 text-ows-text-subtle border border-ows-border shrink-0">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-ows-text-muted mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Indicateur de sélection */}
      <div
        className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-all ${
          selected
            ? 'bg-ows-accent border-ows-accent text-black scale-100'
            : 'border-ows-border/80 bg-ows-surface-2 group-hover:border-ows-text-subtle text-transparent scale-90'
        }`}
      >
        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
      </div>
    </button>
  );
};
