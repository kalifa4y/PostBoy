import { FastifyInstance } from 'fastify';
import { emailService } from '../services/emailService.js';

interface TestEmailBody {
  email?: string;
}

export async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/notifications/status - Retourne l'état de configuration SMTP
  fastify.get('/api/notifications/status', async (_request, reply) => {
    const config = emailService.getSmtpConfig();
    const isConfigured = emailService.isConfigured();

    return reply.code(200).send({
      status: 'success',
      configured: isConfigured,
      host: config.host || null,
      port: config.port,
      secure: config.secure,
      from: config.from,
      recipient: config.notificationEmail || null
    });
  });

  // POST /api/notifications/test - Déclenche un envoi d'email de test SMTP
  fastify.post<{ Body: TestEmailBody }>('/api/notifications/test', async (request, reply) => {
    try {
      const targetEmail = request.body?.email;
      const result = await emailService.sendTestEmail(targetEmail);

      if (!result.success) {
        return reply.code(400).send({
          status: 'error',
          message: result.message
        });
      }

      return reply.code(200).send({
        status: 'success',
        message: result.message
      });
    } catch (err: any) {
      return reply.code(500).send({
        status: 'error',
        message: `Erreur inattendue lors du test email: ${err.message}`
      });
    }
  });
}
