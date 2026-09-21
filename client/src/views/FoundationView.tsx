import React from 'react';
import {
  Database,
  Lock,
  Layers,
  Server,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { HealthStatus } from '../types/domain';

interface FoundationViewProps {
  health: HealthStatus | null;
  onNavigateToTab: (tab: any) => void;
}

export const FoundationView: React.FC<FoundationViewProps> = ({ health, onNavigateToTab }) => {
  return (
    <div className="space-y-6">
      {/* Hero Banner Phase 0 */}
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-ows-accent/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded bg-ows-accent/15 border border-ows-accent/30 text-ows-accent text-xs font-mono font-medium mb-3">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>PHASE 0 VALIDÉE & OPÉRATIONNELLE</span>
            </div>
            <h2 className="text-2xl font-bold font-heading text-ows-textMain tracking-tight">
              Architecture & Fondations Techniques
            </h2>
            <p className="text-xs text-ows-textMuted mt-1 max-w-2xl leading-relaxed">
              Le socle architectural local-first est opérationnel : serveur Fastify natif, base relationnelle SQLite avec WAL, moteur de chiffrement AES-256-GCM et typage strict.
            </p>
          </div>
          <button
            onClick={() => onNavigateToTab('settings')}
            className="self-start md:self-auto inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-xs font-medium text-ows-textMain transition-all shadow-sm"
          >
            <span>Paramètres Système</span>
            <ArrowRight className="w-4 h-4 text-ows-accent" />
          </button>
        </div>
      </div>

      {/* Grid 3 Colonnes : Piliers Architecturaux */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Pilier 1 : Base de Données */}
        <div className="bg-ows-surfaceCard border border-ows-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-accent">
              <Database className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-mono text-ows-accent px-2 py-0.5 rounded bg-ows-accent/10 border border-ows-accent/20">
              SQLite WAL
            </span>
          </div>
          <div>
            <h3 className="font-heading font-semibold text-sm text-ows-textMain">
              Base de Données Locale
            </h3>
            <p className="text-xs text-ows-textMuted mt-1">
              Stockage sans serveur dans <code className="font-mono text-[11px] text-ows-accent">data/postboy.db</code> avec intégrité relationnelle et mode WAL activé.
            </p>
          </div>
          <div className="border-t border-ows-borderSubtle pt-3 space-y-1.5">
            <div className="text-[11px] text-ows-textSubtle font-medium uppercase tracking-wider">
              Tables initialisées ({health?.tablesCount || 0})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {health?.tables?.map((table) => (
                <span
                  key={table}
                  className="text-[10px] font-mono px-2 py-0.5 rounded bg-ows-surface2 text-ows-textMuted border border-ows-border"
                >
                  {table}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Pilier 2 : Sécurité Cryptographique */}
        <div className="bg-ows-surfaceCard border border-ows-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-accent">
              <Lock className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-mono text-ows-accent px-2 py-0.5 rounded bg-ows-accent/10 border border-ows-accent/20">
              AES-256-GCM
            </span>
          </div>
          <div>
            <h3 className="font-heading font-semibold text-sm text-ows-textMain">
              Sécurité des Tokens
            </h3>
            <p className="text-xs text-ows-textMuted mt-1">
              Chiffrement symétrique authentifié des identifiants et tokens sociaux. Zéro mot de passe stocké en clair.
            </p>
          </div>
          <div className="border-t border-ows-borderSubtle pt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-ows-textMuted">
              <span>Algorithme</span>
              <span className="font-mono text-ows-textMain">AES-256-GCM</span>
            </div>
            <div className="flex items-center justify-between text-ows-textMuted">
              <span>Clé secrète</span>
              <span className="font-mono text-ows-accent">Définie dans .env</span>
            </div>
            <div className="flex items-center justify-between text-ows-textMuted">
              <span>Fuite interface</span>
              <span className="text-ows-accent font-medium">0% (filtrage API)</span>
            </div>
          </div>
        </div>

        {/* Pilier 3 : Serveur & API */}
        <div className="bg-ows-surfaceCard border border-ows-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-accent">
              <Server className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-mono text-ows-accent px-2 py-0.5 rounded bg-ows-accent/10 border border-ows-accent/20">
              Fastify 5
            </span>
          </div>
          <div>
            <h3 className="font-heading font-semibold text-sm text-ows-textMain">
              Serveur Local Dédié
            </h3>
            <p className="text-xs text-ows-textMuted mt-1">
              Serveur backend léger pour orchestrer les uploads, le scheduler de publication et les intégrations API externes.
            </p>
          </div>
          <div className="border-t border-ows-borderSubtle pt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between text-ows-textMuted">
              <span>Port d'écoute</span>
              <span className="font-mono text-ows-textMain">3001 (127.0.0.1)</span>
            </div>
            <div className="flex items-center justify-between text-ows-textMuted">
              <span>CORS</span>
              <span className="text-ows-textMain">localhost:5173</span>
            </div>
            <div className="flex items-center justify-between text-ows-textMuted">
              <span>Santé</span>
              <span className="text-ows-accent font-medium">/api/health [OK]</span>
            </div>
          </div>
        </div>
      </div>

      {/* Règles Métier & Respect du Master Operating System */}
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-6">
        <h3 className="font-heading font-semibold text-sm text-ows-textMain mb-4 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-ows-accent" />
          <span>Architecture Métier Découplée</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg bg-ows-surface2 border border-ows-border">
            <div className="font-semibold text-ows-textMain mb-1">Campagnes vs Vidéos</div>
            <p className="text-ows-textMuted text-[11px]">
              Une campagne regroupe plusieurs vidéos thématiques avec un code couleur et des métadonnées dédiées.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-ows-surface2 border border-ows-border">
            <div className="font-semibold text-ows-textMain mb-1">Vidéos vs Publications</div>
            <p className="text-ows-textMuted text-[11px]">
              Une vidéo est un actif source. Elle peut être déclinée en plusieurs publications indépendantes par plateforme.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-ows-surface2 border border-ows-border">
            <div className="font-semibold text-ows-textMain mb-1">Publications & Retries</div>
            <p className="text-ows-textMuted text-[11px]">
              Chaque publication suit un cycle de vie strict (draft, scheduled, publishing, published, failed) avec historique de logs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
