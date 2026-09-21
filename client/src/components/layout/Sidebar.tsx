import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  Film,
  Send,
  Calendar,
  Settings,
  HardDrive,
  X
} from 'lucide-react';

export type NavTab = 'dashboard' | 'campaigns' | 'videos' | 'publications' | 'calendar' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen = false,
  onClose
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: 'Actif'
    },
    {
      id: 'campaigns' as NavTab,
      label: 'Campagnes',
      icon: Layers,
      badge: 'Actif'
    },
    {
      id: 'videos' as NavTab,
      label: 'Vidéothèque',
      icon: Film,
      badge: 'Actif'
    },
    {
      id: 'publications' as NavTab,
      label: 'Publications',
      icon: Send,
      badge: 'Actif'
    },
    {
      id: 'calendar' as NavTab,
      label: 'Calendrier',
      icon: Calendar,
      badge: 'Actif'
    },
    {
      id: 'settings' as NavTab,
      label: 'Configuration',
      icon: Settings
    }
  ];

  // Gestion de la touche Échap pour fermer le drawer mobile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Contenu de la navigation (réutilisé entre Desktop et Mobile Drawer)
  const renderNavContent = (isMobile = false) => (
    <>
      {/* Brand Header */}
      <div className="p-5 border-b border-ows-border flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-accent">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="font-heading font-bold text-lg tracking-tight text-ows-textMain flex items-center gap-1.5">
              <span>PostBoy</span>
              <span className="w-1.5 h-1.5 rounded-full bg-ows-accent"></span>
            </div>
            <div className="text-[11px] text-ows-textSubtle tracking-wider uppercase font-semibold">
              Clipping Publisher
            </div>
          </div>
        </div>

        {/* Bouton de fermeture uniquement dans le drawer mobile */}
        {isMobile && onClose && (
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-ows-textMuted hover:text-ows-textMain hover:bg-ows-surface2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] uppercase font-bold text-ows-textSubtle tracking-wider">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (isMobile && onClose) {
                  onClose();
                }
              }}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-md text-xs font-medium transition-all duration-150 min-h-[44px] ${
                isActive
                  ? 'bg-ows-surfaceCard text-ows-textMain border border-ows-border shadow-sm'
                  : 'text-ows-textMuted hover:text-ows-textMain hover:bg-ows-surface2'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-ows-accent' : 'text-ows-textSubtle'
                  }`}
                />
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium ${
                    isActive
                      ? 'bg-ows-accent/15 text-ows-accent border border-ows-accent/30'
                      : 'bg-ows-surface2 text-ows-textSubtle border border-ows-borderSubtle'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-ows-border bg-ows-surface2/50 text-[11px] text-ows-textSubtle flex items-center justify-between">
        <span>Oshun Web Studio</span>
        <span className="font-mono text-[10px] text-ows-textMuted">v0.1.0</span>
      </div>
    </>
  );

  return (
    <>
      {/* 1. VRAIE SIDEBAR DESKTOP (Fixe, verticale à gauche sur écran >= md) */}
      <aside className="hidden md:flex w-64 bg-ows-surface1 border-r border-ows-border flex-col h-screen select-none shrink-0">
        {renderNavContent(false)}
      </aside>

      {/* 2. DRAWER MOBILE LATÉRAL (Sur écran < md) */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop semi-transparent avec flou */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panneau latéral coulissant */}
          <aside className="relative w-72 max-w-[85vw] bg-ows-surface1 border-r border-ows-border flex flex-col h-full shadow-2xl select-none z-10 animate-in slide-in-from-left duration-200">
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
