import React, { useState, useEffect } from 'react';
import {
  Save,
  Globe,
  Mail,
  Check,
  AlertCircle,
  Clock
} from 'lucide-react';
import { AppSettings } from '../types/domain';

interface SettingsViewProps {
  onSettingsUpdated: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsUpdated }) => {
  const [settings, setSettings] = useState<AppSettings>({
    timezone: 'Africa/Bamako',
    auto_publish_enabled: '1',
    email_notifications_enabled: '0',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    notification_email: ''
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fuseaux horaires préconfigurés utiles
  const timezones = [
    { value: 'Africa/Bamako', label: 'Africa/Bamako (UTC+0 — Mali)' },
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'Africa/Abidjan', label: 'Africa/Abidjan (UTC+0)' },
    { value: 'Africa/Dakar', label: 'Africa/Dakar (UTC+0)' },
    { value: 'Africa/Casablanca', label: 'Africa/Casablanca (UTC+1)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1 / UTC+2)' },
    { value: 'America/New_York', label: 'America/New_York (UTC-5 / UTC-4)' }
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.status === 'success' && data.settings) {
        setSettings((prev) => ({
          ...prev,
          ...data.settings
        }));
      }
    } catch (err) {
      console.error('Erreur chargement paramètres:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.status === 'success') {
        setMessage({ type: 'success', text: 'Paramètres enregistrés avec succès dans SQLite.' });
        onSettingsUpdated();
      } else {
        setMessage({ type: 'error', text: data.message || 'Erreur lors de la sauvegarde.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Impossible de contacter le serveur.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-heading text-ows-textMain tracking-tight">
            Configuration Système
          </h2>
          <p className="text-xs text-ows-textMuted mt-1">
            Gestion du fuseau horaire, des notifications et des préférences de l'application locale.
          </p>
        </div>
        {message && (
          <div
            className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium ${
              message.type === 'success'
                ? 'bg-ows-accent/15 border border-ows-accent/30 text-ows-accent'
                : 'bg-red-500/15 border border-red-500/30 text-red-400'
            }`}
          >
            {message.type === 'success' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            <span>{message.text}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section Fuseau Horaire */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2 text-ows-textMain">
            <Globe className="w-4 h-4 text-ows-accent" />
            <h3 className="font-heading font-semibold text-sm">Fuseau Horaire Local</h3>
          </div>
          <p className="text-xs text-ows-textMuted">
            Tous les horaires de publication programmés seront calculés et affichés selon ce fuseau.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-ows-textMuted mb-1.5">
                Sélectionnez le fuseau horaire
              </label>
              <select
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
              >
                {timezones.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ows-textMuted mb-1.5">
                Fuseau personnalisé (IANA)
              </label>
              <input
                type="text"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                placeholder="Ex: Africa/Bamako"
                className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent font-mono"
              />
            </div>
          </div>
        </div>

        {/* Section Automatisation */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-6 space-y-4">
          <div className="flex items-center space-x-2 text-ows-textMain">
            <Clock className="w-4 h-4 text-ows-accent" />
            <h3 className="font-heading font-semibold text-sm">Moteur d'Automatisation</h3>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg bg-ows-surface2 border border-ows-border">
            <div>
              <div className="text-xs font-medium text-ows-textMain">
                Publication automatique activée
              </div>
              <div className="text-[11px] text-ows-textSubtle mt-0.5">
                Le scheduler vérifiera les publications programmées au fil du temps.
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings({
                  ...settings,
                  auto_publish_enabled: settings.auto_publish_enabled === '1' ? '0' : '1'
                })
              }
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.auto_publish_enabled === '1' ? 'bg-ows-accent' : 'bg-ows-surfaceCard border border-ows-border'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full bg-black transition-transform absolute top-1 ${
                  settings.auto_publish_enabled === '1' ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Section Notifications Email */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-ows-textMain">
              <Mail className="w-4 h-4 text-ows-accent" />
              <h3 className="font-heading font-semibold text-sm">Notifications Email (Phase 9)</h3>
            </div>
            <span className="text-[10px] font-mono text-ows-textSubtle px-2 py-0.5 rounded bg-ows-surface2 border border-ows-border">
              Préparé
            </span>
          </div>
          <p className="text-xs text-ows-textMuted">
            Recevez un récapitulatif avec les liens officiels de chaque publication effectuée.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-ows-textMuted mb-1.5">
                Email de notification
              </label>
              <input
                type="email"
                value={settings.notification_email || ''}
                onChange={(e) => setSettings({ ...settings, notification_email: e.target.value })}
                placeholder="contact@exemple.com"
                className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ows-textMuted mb-1.5">
                Serveur SMTP Host
              </label>
              <input
                type="text"
                value={settings.smtp_host || ''}
                onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                placeholder="smtp.example.com"
                className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent font-mono"
              />
            </div>
          </div>
        </div>

        {/* Bouton de sauvegarde */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || loading}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors disabled:opacity-50 shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Enregistrement...' : 'Enregistrer la configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
