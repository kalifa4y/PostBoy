import React from 'react';
import { Clock, RefreshCw, AlertCircle, Menu } from 'lucide-react';
import { HealthStatus } from '../../types/domain';

interface HeaderProps {
  health: HealthStatus | null;
  loading: boolean;
  onRefreshHealth: () => void;
  activeTitle: string;
  onToggleMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  loading,
  onRefreshHealth,
  activeTitle,
  onToggleMenu
}) => {
  const isConnected = health?.database === 'connected' && health?.status === 'ok';

  return (
    <header className="h-16 bg-ows-surface1 border-b border-ows-border px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
      {/* Menu Hamburger Mobile + Active Section Title */}
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        {onToggleMenu && (
          <button
            onClick={onToggleMenu}
            aria-label="Ouvrir le menu de navigation"
            className="md:hidden w-10 h-10 -ml-1.5 flex items-center justify-center rounded-lg text-ows-textMuted hover:text-ows-textMain hover:bg-ows-surface2 transition-colors shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <h1 className="font-heading font-semibold text-sm sm:text-base md:text-lg text-ows-textMain tracking-tight truncate">
          {activeTitle}
        </h1>
      </div>

      {/* Status Badges & Controls */}
      <div className="flex items-center space-x-2 sm:space-x-3 text-xs shrink-0">
        {/* Timezone Badge (Visible sur tablette et desktop) */}
        <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded bg-ows-surface2 border border-ows-border text-ows-textMuted font-mono">
          <Clock className="w-3.5 h-3.5 text-ows-textSubtle shrink-0" />
          <span className="truncate max-w-[120px]">{health?.activeTimezone || 'Africa/Bamako'}</span>
        </div>

        {/* Statut du service (Adapté mobile & desktop) */}
        <div
          title={isConnected ? 'PostBoy est opérationnel' : 'Service momentanément indisponible'}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border transition-colors ${
            isConnected
              ? 'bg-ows-accent/10 border-ows-accent/30 text-ows-accent'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-ows-accent animate-pulse shrink-0" />
              <span className="font-medium text-xs">En ligne</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="font-medium text-xs">Hors ligne</span>
            </>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefreshHealth}
          disabled={loading}
          aria-label="Actualiser l'état du serveur"
          title="Actualiser l'état du serveur"
          className="w-9 h-9 flex items-center justify-center rounded bg-ows-surface2 border border-ows-border text-ows-textSubtle hover:text-ows-textMain hover:border-ows-accent/50 transition-all disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-ows-accent' : ''}`} />
        </button>
      </div>
    </header>
  );
};
