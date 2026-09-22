import React, { useState, useEffect } from 'react';
import {
  Save,
  Globe,
  Mail,
  Check,
  AlertCircle,
  Send,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { AppSettings } from '../types/domain';

interface SettingsViewProps {
  onSettingsUpdated: () => void;
}

interface SmtpStatus {
  configured: boolean;
  host: string | null;
  port?: number;
  secure?: boolean;
  from?: string;
  recipient: string | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsUpdated }) => {
  const [settings, setSettings] = useState<AppSettings>({
    timezone: 'Africa/Bamako',
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

  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus | null>(null);
  const [testingEmail, setTestingEmail] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    fetchSmtpStatus();
  }, []);

  const fetchSmtpStatus = async () => {
    try {
      const res = await fetch('/api/notifications/status');
      const data = await res.json();
      if (data.status === 'success') {
        setSmtpStatus({
          configured: data.configured,
          host: data.host,
          port: data.port,
          secure: data.secure,
          from: data.from,
          recipient: data.recipient
        });
      }
    } catch (err) {
      console.error('Erreur chargement statut SMTP:', err);
    }
  };

  const handleTestEmail = async () => {
    try {
      setTestingEmail(true);
      setTestResult(null);
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.status === 'success') {
        setTestResult({ type: 'success', text: data.message || 'Email de test envoyé avec succès.' });
      } else {
        setTestResult({ type: 'error', text: data.message || 'Échec de l\'envoi du test SMTP.' });
      }
    } catch (err: any) {
      setTestResult({ type: 'error', text: `Erreur de connexion au serveur: ${err.message}` });
    } finally {
      setTestingEmail(false);
    }
  };

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
        setMessage({ type: 'success', text: 'Vos préférences ont été enregistrées avec succès.' });
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-heading text-ows-textMain tracking-tight">
            Préférences
          </h2>
          <p className="text-xs text-ows-textMuted mt-1">
            Ajustez votre fuseau horaire et la réception de vos alertes de publication.
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

        {/* Section Notifications Email */}
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-ows-textMain">
              <Mail className="w-4 h-4 text-ows-accent" />
              <h3 className="font-heading font-semibold text-sm">Alertes & Rappels par Email</h3>
            </div>
            <span
              className={`text-[10px] font-medium px-2.5 py-0.5 rounded-full border ${
                smtpStatus?.configured
                  ? 'bg-ows-accent/15 border-ows-accent/30 text-ows-accent'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
              }`}
            >
              {smtpStatus?.configured ? 'Alertes activées' : 'Non configuré'}
            </span>
          </div>

          <p className="text-xs text-ows-textMuted">
            Recevez des rappels avant vos créneaux de publication et le bilan de votre objectif quotidien.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-3.5 rounded-lg bg-ows-surface2 border border-ows-border space-y-2">
              <div className="text-xs font-medium text-ows-textMain flex items-center justify-between">
                <span>Adresse de réception</span>
                <span className="text-[11px] text-ows-textSubtle">Boîte de réception</span>
              </div>
              <div className="text-xs text-ows-textMuted font-mono">
                {smtpStatus?.recipient || 'Non renseigné dans l’environnement'}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-ows-surface2 border border-ows-border space-y-2">
              <div className="text-xs font-medium text-ows-textMain flex items-center justify-between">
                <span>Service d’expédition</span>
                <span className="text-[11px] text-ows-textSubtle">
                  Canal sécurisé
                </span>
              </div>
              <div className="text-xs text-ows-textMuted font-mono">
                {smtpStatus?.host ? `${smtpStatus.host}` : 'Non configuré dans l’environnement'}
              </div>
            </div>
          </div>

          {/* Test d'envoi & Message de retour */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-ows-border">
            <div className="flex items-center space-x-2 text-[11px] text-ows-textSubtle">
              <ShieldCheck className="w-3.5 h-3.5 text-ows-accent" />
              <span>Vos identifiants d’envoi restent strictement privés et protégés.</span>
            </div>

            <button
              type="button"
              onClick={handleTestEmail}
              disabled={testingEmail}
              className="inline-flex items-center justify-center space-x-2 px-3.5 py-1.5 rounded-lg bg-ows-surface2 hover:bg-ows-surfaceCard border border-ows-border text-xs text-ows-textMain hover:text-ows-accent transition-colors disabled:opacity-50"
            >
              {testingEmail ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{testingEmail ? 'Envoi du test...' : 'Envoyer un email de test'}</span>
            </button>
          </div>

          {testResult && (
            <div
              className={`flex items-center space-x-2 p-3 rounded-lg text-xs font-medium border ${
                testResult.type === 'success'
                  ? 'bg-ows-accent/10 border-ows-accent/30 text-ows-accent'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              {testResult.type === 'success' ? (
                <Check className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{testResult.text}</span>
            </div>
          )}
        </div>

        {/* Bouton de sauvegarde */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || loading}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors disabled:opacity-50 shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Enregistrement...' : 'Enregistrer les préférences'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
