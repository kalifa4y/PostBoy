import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Film,
  Upload,
  Search,
  Play,
  Trash2,
  AlertCircle,
  X,
  CheckCircle2,
  FileVideo,
  AlertTriangle,
  FolderPlus
} from 'lucide-react';
import { Video, Campaign } from '../types/domain';

interface VideosViewProps {
  activeTimezone: string;
}

interface UploadFileItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export const VideosView: React.FC<VideosViewProps> = ({ activeTimezone }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres & Recherche
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('all');

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [previewVideo, setPreviewVideo] = useState<Video | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<Video | null>(null);
  const [editingCampaignVideo, setEditingCampaignVideo] = useState<Video | null>(null);

  // État Upload Batch
  const [uploadQueue, setUploadQueue] = useState<UploadFileItem[]>([]);
  const [targetCampaignId, setTargetCampaignId] = useState<string>('unassigned');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chargement des vidéos
  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/videos');
      if (!res.ok) throw new Error(`Erreur HTTP: ${res.status}`);
      const data = await res.json();
      if (data.status === 'success') {
        setVideos(data.videos || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur chargement vidéos';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Chargement des campagnes (pour l'association)
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchCampaigns();
  }, [fetchVideos, fetchCampaigns]);

  // Formatage taille de fichier (Mo, Go)
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Mo';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} Go`;
    }
    return `${mb.toFixed(1)} Mo`;
  };

  // Formatage date locale
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: activeTimezone || 'Africa/Bamako'
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  // Gestion de la sélection de fichiers
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: UploadFileItem[] = Array.from(files).map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0
    }));

    setUploadQueue((prev) => [...prev, ...newItems]);
  };

  // Lancement du batch d'upload multiple en flux
  const processUploadQueue = async () => {
    if (uploadQueue.length === 0 || isUploading) return;
    setIsUploading(true);

    const pendingItems = uploadQueue.filter((item) => item.status === 'pending');

    for (const item of pendingItems) {
      // Mise à jour état "uploading"
      setUploadQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', progress: 20 } : i))
      );

      const formData = new FormData();
      formData.append('files', item.file);

      try {
        const url = `/api/videos/upload?campaign_id=${encodeURIComponent(targetCampaignId)}`;
        const res = await fetch(url, {
          method: 'POST',
          body: formData
        });

        const json = await res.json();
        if (res.ok && json.status === 'success' && json.uploadedCount > 0) {
          setUploadQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'success', progress: 100 } : i))
          );
        } else {
          const reason = json.failed?.[0]?.reason || json.message || 'Échec de l\'import';
          setUploadQueue((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: reason } : i))
          );
        }
      } catch (uploadErr) {
        setUploadQueue((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: 'error', error: 'Erreur réseau/écriture' } : i
          )
        );
      }
    }

    setIsUploading(false);
    await fetchVideos();
  };

  // Suppression d'une vidéo
  const handleDeleteVideo = async () => {
    if (!deletingVideo) return;
    try {
      setError(null);
      const res = await fetch(`/api/videos/${deletingVideo.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Impossible de supprimer cette vidéo.');
      }
      setDeletingVideo(null);
      await fetchVideos();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur suppression';
      setError(msg);
      setDeletingVideo(null);
    }
  };

  // Changement de campagne associée à une vidéo
  const handleUpdateCampaign = async (newCampaignId: string) => {
    if (!editingCampaignVideo) return;
    try {
      await fetch(`/api/videos/${editingCampaignVideo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: newCampaignId })
      });
      setEditingCampaignVideo(null);
      await fetchVideos();
    } catch (err) {
      console.error('Erreur mise à jour campagne:', err);
    }
  };

  // Filtrage des vidéos
  const filteredVideos = videos.filter((v) => {
    if (selectedCampaignFilter === 'unassigned') {
      if (v.campaign_id !== null) return false;
    } else if (selectedCampaignFilter !== 'all') {
      if (v.campaign_id !== selectedCampaignFilter) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = v.original_name.toLowerCase().includes(q);
      const matchCamp = (v.campaign_name || '').toLowerCase().includes(q);
      return matchName || matchCamp;
    }

    return true;
  });

  // Calcul du volume total
  const totalSizeBytes = videos.reduce((acc, v) => acc + (v.file_size || 0), 0);
  const completedUploadsCount = uploadQueue.filter((i) => i.status === 'success').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. En-tête & Métriques de stockage */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-ows-textMain tracking-tight">
            Vidéothèque
          </h2>
          <p className="text-xs text-ows-textMuted mt-1">
            Gestion locale de vos clips sources ({videos.length} vidéo{videos.length > 1 ? 's' : ''} — {formatFileSize(totalSizeBytes)} sur disque).
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start sm:self-auto">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Importer des vidéos</span>
          </button>
        </div>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Barre d'outils (Recherche & Filtres) */}
      <div className="bg-ows-surface1 border border-ows-border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Recherche textuelle */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ows-textSubtle" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom de fichier ou campagne..."
            className="w-full pl-9 pr-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain placeholder-ows-textSubtle focus:outline-none focus:border-ows-accent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-ows-textSubtle hover:text-ows-textMain"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filtre par Campagne */}
        <div className="flex items-center space-x-2">
          <label className="text-xs text-ows-textSubtle whitespace-nowrap">Campagne :</label>
          <select
            value={selectedCampaignFilter}
            onChange={(e) => setSelectedCampaignFilter(e.target.value)}
            className="px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
          >
            <option value="all">Toutes les vidéos ({videos.length})</option>
            <option value="unassigned">Sans campagne ({videos.filter(v => !v.campaign_id).length})</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Liste dense des Vidéos */}
      {loading ? (
        <div className="h-48 flex items-center justify-center text-xs text-ows-textMuted">
          Chargement de la bibliothèque...
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="bg-ows-surface1 border border-ows-border rounded-xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-ows-surface2 border border-ows-border mx-auto flex items-center justify-center text-ows-textSubtle">
            <Film className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold font-heading text-ows-textMain">
              {videos.length === 0 ? 'Aucune vidéo importée' : 'Aucune vidéo correspondante'}
            </h3>
            <p className="text-xs text-ows-textMuted mt-1 max-w-sm mx-auto">
              {videos.length === 0
                ? 'Importez vos premiers clips vidéo locaux (1, 5, 20 ou 50+ vidéos) pour démarrer.'
                : 'Modifiez vos filtres ou termes de recherche pour retrouver vos vidéos.'}
            </p>
          </div>
          {videos.length === 0 && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Importer un clip</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-ows-surface1 border border-ows-border rounded-xl overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-ows-border text-[11px] font-semibold text-ows-textSubtle uppercase tracking-wider bg-ows-surface2/50">
            <div className="col-span-5 sm:col-span-5">Clip Vidéo</div>
            <div className="col-span-3 sm:col-span-3">Campagne</div>
            <div className="col-span-2 sm:col-span-2">Taille</div>
            <div className="col-span-2 sm:col-span-2 text-right">Actions</div>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-ows-borderSubtle">
            {filteredVideos.map((video) => (
              <div
                key={video.id}
                className="grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-ows-surface2/30 transition-colors text-xs"
              >
                {/* Nom et icône */}
                <div className="col-span-5 sm:col-span-5 flex items-center space-x-3 min-w-0 pr-2">
                  <div
                    onClick={() => setPreviewVideo(video)}
                    className="w-9 h-9 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-center text-ows-textMuted hover:text-ows-accent hover:border-ows-accent/50 cursor-pointer transition-colors shrink-0 group"
                    title="Cliquer pour prévisualiser"
                  >
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      onClick={() => setPreviewVideo(video)}
                      className="font-medium text-ows-textMain truncate cursor-pointer hover:text-ows-accent transition-colors"
                      title={video.original_name}
                    >
                      {video.original_name}
                    </div>
                    <div className="text-[10px] text-ows-textSubtle font-mono flex items-center space-x-2 mt-0.5">
                      <span>{formatDate(video.created_at)}</span>
                      <span>•</span>
                      <span className="text-emerald-400">Prêt</span>
                    </div>
                  </div>
                </div>

                {/* Campagne */}
                <div className="col-span-3 sm:col-span-3 flex items-center space-x-2 min-w-0">
                  {video.campaign_name ? (
                    <span
                      onClick={() => setEditingCampaignVideo(video)}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded bg-ows-surface2 border border-ows-border text-ows-textMain cursor-pointer hover:border-ows-accent/40 transition-colors truncate"
                      title="Cliquer pour changer de campagne"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: video.campaign_color || '#08EB08' }}
                      />
                      <span className="truncate">{video.campaign_name}</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => setEditingCampaignVideo(video)}
                      className="text-[11px] text-ows-textSubtle hover:text-ows-accent underline underline-offset-2 flex items-center space-x-1"
                    >
                      <FolderPlus className="w-3 h-3" />
                      <span>Associer</span>
                    </button>
                  )}
                </div>

                {/* Taille */}
                <div className="col-span-2 sm:col-span-2 font-mono text-[11px] text-ows-textMuted">
                  {formatFileSize(video.file_size)}
                </div>

                {/* Actions */}
                <div className="col-span-2 sm:col-span-2 flex items-center justify-end space-x-2">
                  <button
                    onClick={() => setPreviewVideo(video)}
                    className="p-1.5 rounded bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-ows-textSubtle hover:text-ows-accent transition-colors"
                    title="Lire la vidéo"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                  <button
                    onClick={() => setDeletingVideo(video)}
                    className="p-1.5 rounded bg-ows-surface2 border border-ows-border hover:border-rose-500/50 text-ows-textSubtle hover:text-rose-400 transition-colors"
                    title="Supprimer la vidéo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Modal Import Multiple (Bulk Upload) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-ows-surface1 border border-ows-border rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] flex flex-col">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-ows-border">
              <div className="flex items-center space-x-2.5">
                <Upload className="w-4 h-4 text-ows-accent" />
                <h3 className="text-base font-bold font-heading text-ows-textMain">
                  Importer des clips vidéo
                </h3>
              </div>
              <button
                disabled={isUploading}
                onClick={() => {
                  setIsUploadModalOpen(false);
                  setUploadQueue([]);
                }}
                className="text-ows-textSubtle hover:text-ows-textMain transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sélecteur de campagne optionnel */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ows-textMuted">
                Associer directement à une campagne :
              </label>
              <select
                value={targetCampaignId}
                disabled={isUploading}
                onChange={(e) => setTargetCampaignId(e.target.value)}
                className="w-full px-3 py-2 bg-ows-surface2 border border-ows-border rounded-lg text-xs text-ows-textMain focus:outline-none focus:border-ows-accent"
              >
                <option value="unassigned">Aucune campagne (affecter plus tard)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Zone Drag & Drop */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                handleFileSelect(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-ows-accent bg-ows-accent/5'
                  : 'border-ows-border hover:border-ows-borderSubtle bg-ows-surface2/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska,.mp4,.mov,.webm,.avi,.mkv"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              <FileVideo className="w-10 h-10 text-ows-accent mx-auto mb-3" />
              <div className="text-xs font-semibold text-ows-textMain">
                Glissez-déposez vos fichiers vidéo ici, ou cliquez pour parcourir
              </div>
              <p className="text-[11px] text-ows-textMuted mt-1">
                Formats acceptés : MP4, MOV, WEBM, AVI, MKV • Aucune limite de nombre (1, 5, 20, 50+)
              </p>
            </div>

            {/* File Queue & Progress */}
            {uploadQueue.length > 0 && (
              <div className="flex-1 min-h-0 space-y-3 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ows-textMain">
                    Progression : {completedUploadsCount} / {uploadQueue.length} terminé(s)
                  </span>
                  <span className="text-[11px] font-mono text-ows-accent">
                    {Math.round((completedUploadsCount / uploadQueue.length) * 100)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-ows-surface2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ows-accent transition-all duration-300"
                    style={{
                      width: `${(completedUploadsCount / uploadQueue.length) * 100}%`
                    }}
                  />
                </div>

                {/* Liste des fichiers */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-48">
                  {uploadQueue.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-lg bg-ows-surface2 border border-ows-border flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="text-ows-textMain font-medium truncate">
                          {item.file.name}
                        </div>
                        <div className="text-[10px] text-ows-textSubtle font-mono">
                          {formatFileSize(item.file.size)}
                        </div>
                        {item.error && (
                          <div className="text-[10px] text-rose-400 mt-0.5">
                            Erreur : {item.error}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 font-mono text-[10px]">
                        {item.status === 'pending' && (
                          <span className="text-ows-textSubtle">En attente</span>
                        )}
                        {item.status === 'uploading' && (
                          <span className="text-ows-accent animate-pulse">En cours...</span>
                        )}
                        {item.status === 'success' && (
                          <span className="text-emerald-400 flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Terminé</span>
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-rose-400">Échec</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions Modal */}
            <div className="flex items-center justify-between pt-3 border-t border-ows-border">
              <span className="text-[11px] text-ows-textSubtle font-mono">
                {uploadQueue.length} fichier(s) sélectionné(s)
              </span>
              <div className="flex items-center space-x-3">
                <button
                  disabled={isUploading}
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setUploadQueue([]);
                  }}
                  className="px-4 py-2 rounded-lg text-xs text-ows-textMuted hover:text-ows-textMain transition-colors disabled:opacity-50"
                >
                  Fermer
                </button>
                <button
                  disabled={isUploading || uploadQueue.length === 0}
                  onClick={processUploadQueue}
                  className="px-5 py-2 rounded-lg bg-ows-accent text-black font-semibold text-xs hover:bg-ows-accentHover transition-colors disabled:opacity-50 shadow-sm flex items-center space-x-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isUploading ? 'Import en cours...' : 'Démarrer l\'importation'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Lecteur Vidéo HTML5 (Aperçu) */}
      {previewVideo && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-ows-surface1 border border-ows-border rounded-xl max-w-3xl w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-ows-border">
              <div className="min-w-0 pr-3">
                <h3 className="text-base font-bold font-heading text-ows-textMain truncate">
                  {previewVideo.original_name}
                </h3>
                <span className="text-[11px] text-ows-textSubtle font-mono">
                  {formatFileSize(previewVideo.file_size)} • {previewVideo.mime_type}
                </span>
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                className="text-ows-textSubtle hover:text-ows-textMain transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Lecteur HTML5 natif avec streaming HTTP */}
            <div className="bg-black rounded-lg overflow-hidden border border-ows-border aspect-video flex items-center justify-center">
              <video
                controls
                autoPlay
                src={`/uploads/${previewVideo.filename}`}
                className="w-full h-full object-contain"
              >
                Votre navigateur ne supporte pas la lecture directe de ce format vidéo.
              </video>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setPreviewVideo(null)}
                className="px-4 py-2 rounded-lg bg-ows-surface2 border border-ows-border hover:border-ows-accent/50 text-xs text-ows-textMain transition-colors"
              >
                Fermer l'aperçu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal Changement de Campagne */}
      {editingCampaignVideo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-ows-surface1 border border-ows-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-ows-border">
              <h3 className="text-base font-bold font-heading text-ows-textMain">
                Associer à une campagne
              </h3>
              <button
                onClick={() => setEditingCampaignVideo(null)}
                className="text-ows-textSubtle hover:text-ows-textMain"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-ows-textMuted">
              Sélectionnez la campagne pour la vidéo{' '}
              <strong className="text-ows-textMain">« {editingCampaignVideo.original_name} »</strong> :
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleUpdateCampaign('unassigned')}
                className={`w-full p-3 rounded-lg border text-left text-xs transition-colors flex items-center justify-between ${
                  !editingCampaignVideo.campaign_id
                    ? 'bg-ows-surface2 border-ows-accent text-ows-accent'
                    : 'bg-ows-surface2 border-ows-border text-ows-textMuted hover:text-ows-textMain'
                }`}
              >
                <span>Aucune campagne (sans association)</span>
                {!editingCampaignVideo.campaign_id && <CheckCircle2 className="w-4 h-4" />}
              </button>

              {campaigns.map((c) => {
                const isSelected = editingCampaignVideo.campaign_id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleUpdateCampaign(c.id)}
                    className={`w-full p-3 rounded-lg border text-left text-xs transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-ows-surface2 border-ows-accent text-ows-textMain'
                        : 'bg-ows-surface2 border-ows-border text-ows-textMuted hover:text-ows-textMain'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="font-medium">{c.name}</span>
                    </div>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-ows-accent" />}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-ows-border">
              <button
                onClick={() => setEditingCampaignVideo(null)}
                className="px-4 py-2 rounded-lg text-xs text-ows-textMuted hover:text-ows-textMain"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal Confirmation Suppression */}
      {deletingVideo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-ows-surface1 border border-ows-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold font-heading text-ows-textMain">
                  Supprimer la vidéo ?
                </h3>
                <span className="text-xs text-rose-400 font-mono">Action irréversible</span>
              </div>
            </div>

            <p className="text-xs text-ows-textMuted leading-relaxed">
              Êtes-vous sûr de vouloir supprimer définitivement la vidéo{' '}
              <strong className="text-ows-textMain">« {deletingVideo.original_name} »</strong> ? Le fichier physique sera effacé du disque.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-ows-border">
              <button
                onClick={() => setDeletingVideo(null)}
                className="px-4 py-2 rounded-lg text-xs text-ows-textMuted hover:text-ows-textMain"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteVideo}
                className="px-4 py-2 rounded-lg bg-rose-500 text-white font-semibold text-xs hover:bg-rose-600 transition-colors"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
