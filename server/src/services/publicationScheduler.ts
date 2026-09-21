import { getDatabase } from '../db/connection.js';
import { publicationService } from './publicationService.js';

let timerHandle: NodeJS.Timeout | null = null;
let isPolling = false;
let isStopping = false;
const activeJobs = new Set<Promise<any>>();

/**
 * Récupère les publications arrivées à échéance et lance leur publication dans la limite de concurrence.
 * Retourne le nombre de publications déclenchées.
 */
export async function pollAndPublishDuePublications(concurrencyLimit?: number): Promise<number> {
  if (isPolling || isStopping) {
    return 0;
  }

  const concurrency = concurrencyLimit || Number(process.env.PUBLICATION_CONCURRENCY) || 5;

  try {
    isPolling = true;
    const db = getDatabase();

    // Vérification du paramètre utilisateur d'activation de la publication automatique
    const autoPublishSetting = db.prepare("SELECT value FROM settings WHERE key = 'auto_publish_enabled'").get() as any;
    if (autoPublishSetting && autoPublishSetting.value === '0') {
      return 0;
    }

    // Recherche des publications programmées échues
    const duePublications = db.prepare(`
      SELECT id FROM publications
      WHERE status = 'scheduled'
        AND (scheduled_at IS NULL OR datetime(scheduled_at) <= datetime('now'))
      ORDER BY datetime(COALESCE(scheduled_at, created_at)) ASC
      LIMIT ?
    `).all(concurrency) as Array<{ id: string }>;

    if (duePublications.length === 0) {
      return 0;
    }

    console.log(`[Scheduler] ${duePublications.length} publication(s) arrivée(s) à échéance détectée(s).`);

    // Lancement parallèle dans la limite de concurrence
    const promises = duePublications.map(async (p) => {
      const jobPromise = publicationService.publishPublication(p.id, { forceManual: false });
      activeJobs.add(jobPromise);
      try {
        await jobPromise;
      } finally {
        activeJobs.delete(jobPromise);
      }
    });

    await Promise.allSettled(promises);
    return duePublications.length;
  } catch (err) {
    console.error('[Scheduler] Erreur lors du polling des publications:', err);
    return 0;
  } finally {
    isPolling = false;
  }
}

/**
 * Démarre le planificateur périodique in-process.
 */
export function startPublicationScheduler(options: { intervalMs?: number; concurrency?: number } = {}): void {
  if (timerHandle) {
    console.log('[Scheduler] Le planificateur est déjà en cours d exécution.');
    return;
  }

  isStopping = false;
  const intervalMs = options.intervalMs || Number(process.env.PUBLICATION_POLL_INTERVAL_MS) || 30000;
  const concurrency = options.concurrency || Number(process.env.PUBLICATION_CONCURRENCY) || 5;

  console.log(`[Scheduler] Démarrage du planificateur de publication (Intervalle: ${intervalMs}ms, Concurrence: ${concurrency}).`);

  const runTick = async () => {
    if (isStopping) return;
    await pollAndPublishDuePublications(concurrency);
    if (!isStopping) {
      timerHandle = setTimeout(runTick, intervalMs);
    }
  };

  // Première passe différée légèrement pour laisser le serveur initialiser
  timerHandle = setTimeout(runTick, 1000);
}

/**
 * Arrête proprement le planificateur et attend la fin des jobs en cours.
 */
export async function stopPublicationScheduler(): Promise<void> {
  console.log('[Scheduler] Arrêt gracieux du planificateur...');
  isStopping = true;

  if (timerHandle) {
    clearTimeout(timerHandle);
    timerHandle = null;
  }

  if (activeJobs.size > 0) {
    console.log(`[Scheduler] Attente de la finalisation de ${activeJobs.size} publication(s) en cours...`);
    await Promise.allSettled(Array.from(activeJobs));
  }

  console.log('[Scheduler] Planificateur arrêté avec succès.');
}
