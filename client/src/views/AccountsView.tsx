import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  RefreshCw,
  ExternalLink,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Key,
  ShieldCheck,
  Clock,
  Info,
  X,
  Plus
} from 'lucide-react';
import { SocialAccount, SocialAccountsApiResponse, SocialPlatform } from '../types/domain';

interface AccountsViewProps {
  activeTimezone: string;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ activeTimezone }) => {
  const [data, setData] = useState<SocialAccountsApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal de confirmation de déconnexion
  const [accountToDisconnect, setAccountToDisconnect] = useState<SocialAccount | null>(null);
  const [disconnecting, setDisconnecting] = useState<boolean>(false);

  // Récupération des comptes et statut des plateformes
  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch('/api/social-accounts');
      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }
      const json = await res.json() as SocialAccountsApiResponse;
      setData(json);
    } catch (err: any) {
      console.error('Erreur chargement comptes:', err);
      setErrorMessage('Impossible de charger les comptes sociaux. Vérifiez que le serveur est démarré.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Détection des retours OAuth dans l'URL (?tab=accounts&status=success ou &error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const platform = params.get('platform');
    const error = params.get('error');

    if (status === 'success') {
      const platformName = platform ? platform.toUpperCase() : 'Social';
      setSuccessMessage(`Compte ${platformName} connecté avec succès via OAuth 2.0.`);
      // Nettoyage de l'URL sans recharger
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } else if (error) {
      let friendlyError = 'Échec de la connexion OAuth.';
      if (error === 'access_denied') {
        friendlyError = "L'autorisation a été refusée par l'utilisateur sur la plateforme.";
      } else if (error === 'invalid_state') {
        friendlyError = 'Protection anti-CSRF : session expirée ou invalide. Veuillez réessayer.';
      } else if (error === 'token_exchange_failed') {
        friendlyError = "Impossible d'échanger le code d'autorisation contre les jetons auprès de la plateforme.";
      } else if (error === 'missing_code') {
        friendlyError = 'Aucun code d autorisation retourné par la plateforme.';
      } else if (error === 'invalid_platform') {
        friendlyError = 'Plateforme sociale non supportée.';
      }
      setErrorMessage(friendlyError);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    fetchAccounts();
  }, [fetchAccounts]);

  // Déclencher le flux OAuth pour une plateforme
  const handleConnect = async (platform: 'tiktok' | 'instagram' | 'youtube') => {
    try {
      setActionLoading(platform);
      setErrorMessage(null);

      const res = await fetch(`/api/social-accounts/${platform}/connect`);
      const resData = await res.json();

      if (!res.ok) {
        if (resData.error === 'MISSING_CONFIGURATION') {
          setErrorMessage(
            `Configuration manquante pour ${platform.toUpperCase()}. Veuillez définir les identifiants OAuth dans votre fichier .env (voir .env.example).`
          );
        } else {
          setErrorMessage(resData.message || `Erreur d'initialisation OAuth pour ${platform}`);
        }
        return;
      }

      if (resData.authorizationUrl) {
        // Redirection vers le fournisseur OAuth officiel
        window.location.href = resData.authorizationUrl;
      } else {
        throw new Error("URL d'autorisation manquante.");
      }
    } catch (err: any) {
      console.error(`Erreur connect ${platform}:`, err);
      setErrorMessage(err.message || 'Erreur lors de la redirection OAuth');
    } finally {
      setActionLoading(null);
    }
  };

  // Déconnexion confirmée d'un compte
  const confirmDisconnect = async () => {
    if (!accountToDisconnect) return;

    try {
      setDisconnecting(true);
      const res = await fetch(`/api/social-accounts/${accountToDisconnect.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Échec de la déconnexion');
      }

      setSuccessMessage(`Compte ${accountToDisconnect.username} déconnecté. Jetons supprimés.`);
      setAccountToDisconnect(null);
      await fetchAccounts();
    } catch (err: any) {
      console.error('Erreur déconnexion:', err);
      setErrorMessage(err.message || 'Impossible de déconnecter ce compte.');
    } finally {
      setDisconnecting(false);
    }
  };

  // Formatage des dates
  const formatDate = (isoString?: string | null): string => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('fr-FR', {
        timeZone: activeTimezone,
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(d);
    } catch {
      return isoString;
    }
  };

  // Rendu de l'icône de plateforme
  const renderPlatformIcon = (platform: SocialPlatform | string, size: string = 'w-5 h-5') => {
    switch (platform) {
      case 'tiktok':
        return (
          <div className={`${size} rounded flex items-center justify-center font-bold text-xs bg-black text-white border border-ows-border`}>
            <span>TT</span>
          </div>
        );
      case 'instagram':
        return (
          <div className={`${size} rounded flex items-center justify-center font-bold text-xs bg-gradient-to-tr from-amber-600 via-rose-600 to-purple-600 text-white`}>
            <span>IG</span>
          </div>
        );
      case 'youtube':
        return (
          <div className={`${size} rounded flex items-center justify-center font-bold text-xs bg-red-600 text-white`}>
            <span>YT</span>
          </div>
        );
      default:
        return <Share2 className={size} />;
    }
  };

  // Plateformes supportées et métadonnées UI
  const platformCards = [
    {
      id: 'tiktok' as const,
      name: 'TikTok',
      scope: 'user.info.basic',
      authType: 'TikTok OAuth v2',
      envKeys: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
      configured: data?.platforms?.tiktok?.configured ?? false
    },
    {
      id: 'instagram' as const,
      name: 'Instagram',
      scope: 'user_profile, user_media',
      authType: 'Meta OAuth 2.0',
      envKeys: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
      configured: data?.platforms?.instagram?.configured ?? false
    },
    {
      id: 'youtube' as const,
      name: 'YouTube',
      scope: 'youtube.readonly',
      authType: 'Google OAuth 2.0',
      envKeys: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
      configured: data?.platforms?.youtube?.configured ?? false
    }
  ];

  const accounts = data?.accounts || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* En-tête de la vue */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ows-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold font-heading text-ows-textMain tracking-tight">
              Comptes Réseaux Sociaux
            </h1>
            <span className="px-2 py-0.5 text-xs font-mono rounded bg-ows-accent/10 border border-ows-accent/30 text-ows-accent font-medium">
              Phase 6
            </span>
          </div>
          <p className="text-sm text-ows-textSubtle mt-1">
            Connexion locale sécurisée via OAuth 2.0 officiel. Les jetons d'accès sont chiffrés en AES-256-GCM.
          </p>
        </div>

        <button
          onClick={fetchAccounts}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 rounded-md bg-ows-surfaceCard border border-ows-border text-xs font-medium text-ows-textMain hover:bg-ows-surface2 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-ows-accent' : 'text-ows-textSubtle'}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Bannière de message de succès */}
      {successMessage && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-ows-accent/10 border border-ows-accent/30 text-ows-textMain text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-ows-accent shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-ows-textSubtle hover:text-ows-textMain"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bannière de message d'erreur */}
      {errorMessage && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cartes de connexion OAuth des plateformes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {platformCards.map((card) => {
          const connectedCount = accounts.filter((a) => a.platform === card.id).length;
          const isBusy = actionLoading === card.id;

          return (
            <div
              key={card.id}
              className="bg-ows-surfaceCard border border-ows-border rounded-xl p-5 flex flex-col justify-between hover:border-ows-borderSubtle transition-all duration-200"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {renderPlatformIcon(card.id, 'w-8 h-8')}
                    <div>
                      <h3 className="font-heading font-semibold text-base text-ows-textMain">
                        {card.name}
                      </h3>
                      <span className="text-[11px] font-mono text-ows-textSubtle">
                        {card.authType}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${
                      card.configured
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        card.configured ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    {card.configured ? 'Prêt' : 'Clés .env requises'}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-ows-textSubtle">
                  <div className="flex items-center justify-between py-1 border-t border-ows-borderSubtle/60">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-ows-textMuted" />
                      Scope demandé
                    </span>
                    <span className="font-mono text-[11px] text-ows-textMain bg-ows-surface2 px-1.5 py-0.5 rounded">
                      {card.scope}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-t border-ows-borderSubtle/60">
                    <span className="flex items-center gap-1.5">
                      <Share2 className="w-3.5 h-3.5 text-ows-textMuted" />
                      Comptes reliés
                    </span>
                    <span className="font-mono font-bold text-ows-textMain">
                      {connectedCount}
                    </span>
                  </div>
                </div>

                {!card.configured && (
                  <div className="mt-3 p-2.5 rounded bg-ows-surface2/60 border border-ows-borderSubtle text-[11px] text-ows-textSubtle">
                    <div className="flex items-center gap-1.5 text-amber-400 font-medium mb-1">
                      <Key className="w-3 h-3" />
                      <span>Variables serveur à renseigner :</span>
                    </div>
                    <ul className="font-mono text-[10px] list-disc list-inside text-ows-textMuted">
                      {card.envKeys.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-ows-borderSubtle">
                <button
                  onClick={() => handleConnect(card.id)}
                  disabled={isBusy}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-xs font-semibold tracking-wide transition-all ${
                    card.configured
                      ? 'bg-ows-accent text-black hover:bg-ows-accent/90 shadow-sm'
                      : 'bg-ows-surface2 text-ows-textMuted hover:text-ows-textMain border border-ows-border'
                  }`}
                >
                  {isBusy ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Redirection OAuth...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Connecter {card.name}</span>
                      <ExternalLink className="w-3 h-3 opacity-60 ml-0.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Liste des comptes sociaux connectés */}
      <div className="bg-ows-surfaceCard border border-ows-border rounded-xl overflow-hidden">
        <div className="p-5 border-b border-ows-border flex items-center justify-between">
          <div>
            <h2 className="font-heading font-semibold text-base text-ows-textMain">
              Comptes Enregistrés ({accounts.length})
            </h2>
            <p className="text-xs text-ows-textSubtle mt-0.5">
              Profils authentifiés prêts pour l'association future aux publications.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-ows-textSubtle bg-ows-surface2 px-3 py-1.5 rounded-md border border-ows-borderSubtle">
            <ShieldCheck className="w-4 h-4 text-ows-accent" />
            <span>Chiffrement AES-256-GCM actif</span>
          </div>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="p-12 text-center text-ows-textSubtle flex flex-col items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-ows-accent mb-2" />
            <span className="text-xs">Chargement des comptes sociaux...</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-xl bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-textSubtle mb-3">
              <Share2 className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-semibold text-sm text-ows-textMain">
              Aucun compte social connecté
            </h3>
            <p className="text-xs text-ows-textSubtle max-w-md mt-1 mb-4">
              Pour préparer les futures publications, associez vos comptes TikTok, Instagram ou YouTube en utilisant les boutons officiels ci-dessus.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-ows-border bg-ows-surface2/50 text-[11px] text-ows-textSubtle uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Plateforme</th>
                  <th className="py-3 px-4 font-semibold">Identifiant / Chaîne</th>
                  <th className="py-3 px-4 font-semibold">Nom Affiché</th>
                  <th className="py-3 px-4 font-semibold">Statut</th>
                  <th className="py-3 px-4 font-semibold">Expiration Jeton</th>
                  <th className="py-3 px-4 font-semibold">Connecté le</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ows-borderSubtle/60">
                {accounts.map((account) => {
                  return (
                    <tr key={account.id} className="hover:bg-ows-surface2/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          {renderPlatformIcon(account.platform, 'w-6 h-6')}
                          <span className="font-medium text-ows-textMain capitalize">
                            {account.platform}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-ows-textMain">
                        {account.username}
                      </td>

                      <td className="py-3.5 px-4 text-ows-textSubtle">
                        {account.display_name || '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border ${
                            account.status === 'connected'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : account.status === 'expired'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              account.status === 'connected'
                                ? 'bg-emerald-400'
                                : account.status === 'expired'
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                            }`}
                          />
                          {account.status === 'connected'
                            ? 'Connecté'
                            : account.status === 'expired'
                            ? 'Token expiré'
                            : account.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-ows-textSubtle">
                        {account.token_expires_at ? (
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-ows-textMuted" />
                            <span>{formatDate(account.token_expires_at)}</span>
                          </div>
                        ) : (
                          <span className="text-ows-textMuted">Longue durée / Indéterminée</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-ows-textSubtle">
                        {formatDate(account.created_at)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setAccountToDisconnect(account)}
                          className="p-1.5 rounded text-ows-textSubtle hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Déconnecter ce compte"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Note de sécurité & Architecture */}
      <div className="p-4 rounded-lg bg-ows-surfaceCard border border-ows-border text-xs text-ows-textSubtle flex items-start gap-3">
        <Info className="w-4 h-4 text-ows-accent shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-ows-textMain">
            Sécurité des données & Confidentialité
          </div>
          <p>
            PostBoy stocke tous les jetons OAuth chiffrés avec la clé AES-256-GCM locale. Aucun mot de passe n'est demandé ni stocké.
            La déconnexion d'un compte social supprime définitivement ses jetons sans supprimer les vidéos ni les publications associées.
          </p>
        </div>
      </div>

      {/* Modal de confirmation de déconnexion */}
      {accountToDisconnect && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-ows-surfaceCard border border-ows-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-ows-border">
              <h3 className="font-heading font-semibold text-base text-ows-textMain flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>Déconnecter le compte</span>
              </h3>
              <button
                onClick={() => setAccountToDisconnect(null)}
                className="text-ows-textSubtle hover:text-ows-textMain"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-ows-textSubtle leading-relaxed">
              Êtes-vous sûr de vouloir déconnecter le compte{' '}
              <strong className="text-ows-textMain font-mono">{accountToDisconnect.username}</strong> ({accountToDisconnect.platform}) ?
            </p>

            <div className="p-3 rounded bg-ows-surface2 border border-ows-borderSubtle text-[11px] text-ows-textMuted space-y-1">
              <div>• Les jetons d'accès chiffrés seront immédiatement supprimés de SQLite.</div>
              <div>• Les publications existantes restent intactes (leur compte deviendra non assigné).</div>
              <div>• Aucune vidéo ne sera supprimée.</div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setAccountToDisconnect(null)}
                disabled={disconnecting}
                className="px-4 py-2 rounded-md bg-ows-surface2 border border-ows-border text-xs font-medium text-ows-textMain hover:bg-ows-surface1 transition"
              >
                Annuler
              </button>
              <button
                onClick={confirmDisconnect}
                disabled={disconnecting}
                className="px-4 py-2 rounded-md bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition flex items-center gap-2"
              >
                {disconnecting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Déconnexion...</span>
                  </>
                ) : (
                  <span>Confirmer la déconnexion</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
