import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { emailService } from '../services/emailService.js';

interface CronQuery {
  key?: string;
  date?: string;
}

interface TriggerBody {
  job: 'morning' | 'reminders' | 'evening' | 'goal_achieved';
  date?: string;
}

/**
 * Vérifie l'autorisation d'accès aux routes Cron.
 * Utilise l'entête standard Vercel Cron "Authorization: Bearer <CRON_SECRET>"
 * ou le paramètre d'URL "?key=<CRON_SECRET>".
 * En mode local / développement si CRON_SECRET n'est pas défini, l'accès est autorisé.
 */
function verifyCronAuth(request: FastifyRequest<{ Querystring: CronQuery }>, reply: FastifyReply): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return true;
  }

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.trim() === `Bearer ${secret}`) {
    return true;
  }

  const queryKey = request.query?.key?.trim();
  if (queryKey && queryKey === secret) {
    return true;
  }

  reply.code(401).send({
    status: 'error',
    message: 'Non autorisé : Jeton CRON_SECRET invalide ou manquant.'
  });
  return false;
}

export async function cronRoutes(fastify: FastifyInstance) {
  // GET & POST /api/cron/morning — Déclenché à 06:00 (Africa/Bamako / UTC)
  const handleMorning = async (request: FastifyRequest<{ Querystring: CronQuery }>, reply: FastifyReply) => {
    if (!verifyCronAuth(request, reply)) return;

    try {
      const targetDate = request.query?.date;
      const result = await emailService.sendMorningReminder(targetDate);
      return reply.code(200).send({
        status: 'success',
        job: 'morning',
        ...result
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur interne cron morning';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  };

  fastify.get('/api/cron/morning', handleMorning);
  fastify.post('/api/cron/morning', handleMorning);

  // GET & POST /api/cron/check-reminders — Déclenché toutes les 30 minutes
  const handleCheckReminders = async (request: FastifyRequest<{ Querystring: CronQuery }>, reply: FastifyReply) => {
    if (!verifyCronAuth(request, reply)) return;

    try {
      const upcomingResult = await emailService.checkAndSendUpcomingReminders(60);
      const overdueResult = await emailService.checkAndSendOverdueAlerts();

      return reply.code(200).send({
        status: 'success',
        job: 'check-reminders',
        upcomingRemindersSent: upcomingResult.sentCount,
        overdueAlertsSent: overdueResult.sentCount
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur interne cron check-reminders';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  };

  fastify.get('/api/cron/check-reminders', handleCheckReminders);
  fastify.post('/api/cron/check-reminders', handleCheckReminders);

  // GET & POST /api/cron/evening — Déclenché à 22:00 (Africa/Bamako / UTC)
  const handleEvening = async (request: FastifyRequest<{ Querystring: CronQuery }>, reply: FastifyReply) => {
    if (!verifyCronAuth(request, reply)) return;

    try {
      const targetDate = request.query?.date;
      const result = await emailService.sendDailyRecap(targetDate);
      return reply.code(200).send({
        status: 'success',
        job: 'evening',
        ...result
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur interne cron evening';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  };

  fastify.get('/api/cron/evening', handleEvening);
  fastify.post('/api/cron/evening', handleEvening);

  // POST /api/cron/trigger — Déclenchement manuel ou test pour une tâche spécifique
  fastify.post<{ Body: TriggerBody; Querystring: CronQuery }>('/api/cron/trigger', async (request, reply) => {
    if (!verifyCronAuth(request, reply)) return;

    const { job, date } = request.body || {};

    if (!job || !['morning', 'reminders', 'evening', 'goal_achieved'].includes(job)) {
      return reply.code(400).send({
        status: 'error',
        message: 'Paramètre "job" requis : "morning", "reminders", "evening" ou "goal_achieved"'
      });
    }

    try {
      let result: any;
      if (job === 'morning') {
        result = await emailService.sendMorningReminder(date);
      } else if (job === 'reminders') {
        const upcoming = await emailService.checkAndSendUpcomingReminders(60);
        const overdue = await emailService.checkAndSendOverdueAlerts();
        result = { upcomingRemindersSent: upcoming.sentCount, overdueAlertsSent: overdue.sentCount };
      } else if (job === 'evening') {
        result = await emailService.sendDailyRecap(date);
      } else if (job === 'goal_achieved') {
        const sent = await emailService.notifyDailyGoalAchieved();
        result = { success: sent, message: sent ? 'Objectif atteint notifié' : 'Objectif non atteint ou déjà notifié' };
      }

      return reply.code(200).send({
        status: 'success',
        job,
        result
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur lors du déclenchement du job';
      fastify.log.error(error);
      return reply.code(500).send({ status: 'error', message });
    }
  });
}
