import { FastifyInstance } from 'fastify';
import { getDatabase } from '../db/connection.js';

export interface DashboardStatsResponse {
  status: 'success';
  stats: {
    videosToPublish: number;
    scheduledCount: number;
    publishedCount: number;
    failedCount: number;
    totalVideos: number;
  };
  upcomingPublications: Array<{
    id: string;
    platform: string;
    title: string;
    scheduled_at: string | null;
    status: string;
    campaign_name: string | null;
    campaign_color: string | null;
    video_name: string | null;
  }>;
  recentPublications: Array<{
    id: string;
    platform: string;
    title: string;
    published_at: string | null;
    status: string;
    post_url: string | null;
    error_message: string | null;
    campaign_name: string | null;
    campaign_color: string | null;
    video_name: string | null;
  }>;
}

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/api/dashboard/stats', async (_request, reply) => {
    try {
      const db = getDatabase();

      // 1. Vidéos à publier (vidéos n'ayant pas encore de publication marquée 'published')
      const videosToPublishRow = await db.get<{ count: number }>(`
        SELECT COUNT(*) as count 
        FROM videos v 
        WHERE NOT EXISTS (
          SELECT 1 FROM publications p 
          WHERE p.video_id = v.id AND p.status = 'published'
        )
      `);

      // Total des vidéos
      const totalVideosRow = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM videos`);

      // 2. Publications programmées
      const scheduledRow = await db.get<{ count: number }>(`
        SELECT COUNT(*) as count FROM publications WHERE status = 'scheduled'
      `);

      // 3. Publications publiées avec succès
      const publishedRow = await db.get<{ count: number }>(`
        SELECT COUNT(*) as count FROM publications WHERE status = 'published'
      `);

      // 4. Publications en échec
      const failedRow = await db.get<{ count: number }>(`
        SELECT COUNT(*) as count FROM publications WHERE status = 'failed'
      `);

      // 5. Prochaines publications programmées (triées par date d'échéance croissante)
      const upcomingPublications = await db.all<DashboardStatsResponse['upcomingPublications'][number]>(`
        SELECT 
          p.id,
          p.platform,
          p.title,
          p.scheduled_at,
          p.status,
          COALESCE(c.name, 'Sans campagne') as campaign_name,
          COALESCE(c.color, '#08EB08') as campaign_color,
          COALESCE(v.original_name, v.filename, 'Vidéo non liée') as video_name
        FROM publications p
        LEFT JOIN campaigns c ON p.campaign_id = c.id
        LEFT JOIN videos v ON p.video_id = v.id
        WHERE p.status = 'scheduled'
        ORDER BY datetime(COALESCE(p.scheduled_at, '9999-12-31')) ASC
        LIMIT 50
      `);

      // 6. Publications récentes (publiées ou échouées, triées par date décroissante)
      const recentPublications = await db.all<DashboardStatsResponse['recentPublications'][number]>(`
        SELECT 
          p.id,
          p.platform,
          p.title,
          p.published_at,
          p.status,
          p.post_url,
          p.error_message,
          COALESCE(c.name, 'Sans campagne') as campaign_name,
          COALESCE(c.color, '#08EB08') as campaign_color,
          COALESCE(v.original_name, v.filename, 'Vidéo non liée') as video_name
        FROM publications p
        LEFT JOIN campaigns c ON p.campaign_id = c.id
        LEFT JOIN videos v ON p.video_id = v.id
        WHERE p.status IN ('published', 'failed')
        ORDER BY datetime(COALESCE(p.published_at, p.updated_at)) DESC
        LIMIT 50
      `);

      const response: DashboardStatsResponse = {
        status: 'success',
        stats: {
          videosToPublish: Number(videosToPublishRow?.count || 0),
          scheduledCount: Number(scheduledRow?.count || 0),
          publishedCount: Number(publishedRow?.count || 0),
          failedCount: Number(failedRow?.count || 0),
          totalVideos: Number(totalVideosRow?.count || 0)
        },
        upcomingPublications,
        recentPublications
      };

      return reply.code(200).send(response);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur interne lors du calcul des statistiques';
      fastify.log.error(error);
      return reply.code(500).send({
        status: 'error',
        message
      });
    }
  });
}
