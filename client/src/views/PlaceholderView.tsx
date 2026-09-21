import React from 'react';
import { LucideIcon, Clock, AlertTriangle } from 'lucide-react';

interface PlaceholderViewProps {
  phaseNumber: number;
  title: string;
  description: string;
  icon: LucideIcon;
  deliverables: string[];
}

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  phaseNumber,
  title,
  description,
  icon: Icon,
  deliverables
}) => {
  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-ows-surface2 border border-ows-border mx-auto flex items-center justify-center text-ows-accent">
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <div className="inline-flex items-center space-x-1.5 text-xs font-mono text-ows-textSubtle bg-ows-surface2 px-2.5 py-1 rounded border border-ows-border mb-2">
            <Clock className="w-3.5 h-3.5" />
            <span>PHASE {phaseNumber} — EN ATTENTE DE DÉMARRAGE</span>
          </div>
          <h2 className="text-xl font-bold font-heading text-ows-textMain">
            {title}
          </h2>
          <p className="text-xs text-ows-textMuted mt-1 max-w-lg mx-auto">
            {description}
          </p>
        </div>

        <div className="pt-4 border-t border-ows-borderSubtle max-w-md mx-auto text-left">
          <div className="text-[11px] font-medium text-ows-textSubtle uppercase tracking-wider mb-2">
            Périmètre prévu pour cette phase :
          </div>
          <ul className="space-y-1.5 text-xs text-ows-textMuted">
            {deliverables.map((item, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-ows-accent/50 mt-1.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-4">
          <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded bg-ows-surfaceCard border border-ows-border text-[11px] text-ows-textSubtle">
            <AlertTriangle className="w-3.5 h-3.5 text-ows-accent" />
            <span>Règle Oshun : Une seule phase implémentée à la fois. Aucun code factice.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
