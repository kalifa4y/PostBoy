import React from 'react';
import { Clock, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { HealthStatus } from '../../types/domain';

interface HeaderProps {
  health: HealthStatus | null;
  loading: boolean;
  onRefreshHealth: () => void;
  activeTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  loading,
  onRefreshHealth,
  activeTitle
}) => {
  const isConnected = health?.database === 'connected' && health?.status === 'ok';

  return (
    <header className="h-16 bg-ows-surface1 border-b border-ows-border px-6 flex items-center justify-between">
      {/* Active Section Title */}
      <div className="flex items-center space-x-3">
        <h1 className="font-heading font-semibold text-lg text-ows-textMain tracking-tight">
          {activeTitle}
        </h1>
      </div>

      {/* Status Badges & Controls */}
      <div className="flex items-center space-x-4 text-xs">
        {/* Timezone Badge */}
        <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-ows-surface2 border border-ows-border text-ows-textMuted font-mono">
          <Clock className="w-3.5 h-3.5 text-ows-textSubtle" />
          <span>{health?.activeTimezone || 'Africa/Bamako'}</span>
        </div>

        {/* Database & Server Status */}
        <div
          className={`flex items-center space-x-2 px-3 py-1.5 rounded border transition-colors ${
            isConnected
              ? 'bg-ows-accent/10 border-ows-accent/30 text-ows-accent'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {isConnected ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="font-medium">Serveur Local Connecté</span>
              <span className="text-[10px] text-ows-textSubtle font-mono">
                ({health?.tablesCount || 0} tables)
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              <span className="font-medium">Serveur Injoignable</span>
            </>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefreshHealth}
          disabled={loading}
          title="Actualiser l'état du serveur"
          className="p-1.5 rounded bg-ows-surface2 border border-ows-border text-ows-textSubtle hover:text-ows-textMain hover:border-ows-accent/50 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-ows-accent' : ''}`} />
        </button>
      </div>
    </header>
  );
};
