import { LibSqlDatabase } from '../db/connection.js';

export interface DailyClippingGoal {
  date: string;
  targetPosts: number;
  targetCampaigns: number;
  scheduledToday: number;
  publishedToday: number;
  distinctCampaignsToday: number;
  remainingPosts: number;
  remainingCampaigns: number;
  isGoalMet: boolean;
  streak: number;
  bestStreak: number;
}

export interface ClippingHistoryInterval {
  dateKey: string;
  label: string;
  publishedCount: number;
  scheduledCount: number;
  distinctCampaignsCount: number;
  isGoalMet: boolean;
  targetPosts: number;
  targetCampaigns: number;
}

export interface ClippingHistorySummary {
  period: 'day' | 'week' | 'month' | 'year';
  referenceDate: string;
  totalPublished: number;
  totalScheduled: number;
  distinctCampaigns: number;
  goalsMetDays: number;
  goalsMissedDays: number;
  currentStreak: number;
  bestStreak: number;
}

export interface ClippingHistoryResponse {
  status: 'success';
  summary: ClippingHistorySummary;
  intervals: ClippingHistoryInterval[];
}

/**
 * Normalise une chaîne de date en YYYY-MM-DD
 */
export function normalizeDateString(dateStr?: string | null): string {
  if (!dateStr || dateStr.trim() === '') {
    return new Date().toISOString().slice(0, 10);
  }
  const trimmed = dateStr.trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  } catch {
    // Fallback date du jour
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calcule l'objectif quotidien de clipping pour une date donnée.
 * Règle stricte : 5 publications minimum par jour issues de 5 campagnes distinctes.
 */
export async function getDailyClippingGoal(
  db: LibSqlDatabase,
  targetDateStr?: string
): Promise<DailyClippingGoal> {
  const dateStr = normalizeDateString(targetDateStr);
  const targetPosts = 5;
  const targetCampaigns = 5;

  // 1. Publications publiées aujourd'hui (status = 'published')
  // Note: COUNT(DISTINCT campaign_id) ignore automatiquement les NULLs en SQLite/LibSQL
  const publishedRow = await db.get<{
    published_count: number;
    campaigns_count: number;
  }>(
    `
    SELECT 
      COUNT(*) as published_count,
      COUNT(DISTINCT campaign_id) as campaigns_count
    FROM publications
    WHERE status = 'published'
      AND published_at IS NOT NULL
      AND date(published_at) = date(?)
    `,
    [dateStr]
  );

  // 2. Publications programmées pour aujourd'hui (scheduled_at correspond au jour)
  const scheduledRow = await db.get<{ scheduled_count: number }>(
    `
    SELECT COUNT(*) as scheduled_count
    FROM publications
    WHERE scheduled_at IS NOT NULL
      AND date(scheduled_at) = date(?)
    `,
    [dateStr]
  );

  const publishedToday = Number(publishedRow?.published_count || 0);
  const distinctCampaignsToday = Number(publishedRow?.campaigns_count || 0);
  const scheduledToday = Number(scheduledRow?.scheduled_count || 0);

  const isGoalMet =
    publishedToday >= targetPosts && distinctCampaignsToday >= targetCampaigns;
  const remainingPosts = Math.max(0, targetPosts - publishedToday);
  const remainingCampaigns = Math.max(0, targetCampaigns - distinctCampaignsToday);

  // 3. Calcul de streak
  const { currentStreak, bestStreak } = await getClippingStreaks(db, dateStr);

  return {
    date: dateStr,
    targetPosts,
    targetCampaigns,
    scheduledToday,
    publishedToday,
    distinctCampaignsToday,
    remainingPosts,
    remainingCampaigns,
    isGoalMet,
    streak: currentStreak,
    bestStreak
  };
}

/**
 * Calcule la série consécutive (streak) et la meilleure série historique
 * basée sur les jours où l'objectif (5 posts & 5 campagnes) a été atteint.
 */
export async function getClippingStreaks(
  db: LibSqlDatabase,
  referenceDateStr?: string
): Promise<{ currentStreak: number; bestStreak: number }> {
  const targetDateStr = normalizeDateString(referenceDateStr);

  // Récupère toutes les dates ayant atteint l'objectif
  const rows = await db.all<{ day: string }>(
    `
    SELECT date(published_at) as day
    FROM publications
    WHERE status = 'published'
      AND published_at IS NOT NULL
    GROUP BY date(published_at)
    HAVING COUNT(*) >= 5 AND COUNT(DISTINCT campaign_id) >= 5
    ORDER BY day ASC
    `
  );

  if (!rows || rows.length === 0) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  const metDaysSet = new Set(rows.map((r) => r.day));

  // 1. Calcul de la meilleure série historique (bestStreak)
  let bestStreak = 0;
  let runningCount = 0;
  let prevDate: Date | null = null;

  for (const row of rows) {
    const curDate = new Date(row.day + 'T12:00:00Z');
    if (!prevDate) {
      runningCount = 1;
    } else {
      const diffDays = Math.round(
        (curDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diffDays === 1) {
        runningCount++;
      } else {
        runningCount = 1;
      }
    }
    prevDate = curDate;
    if (runningCount > bestStreak) {
      bestStreak = runningCount;
    }
  }

  // 2. Calcul du streak actuel se terminant aujourd'hui ou hier
  const refDate = new Date(targetDateStr + 'T12:00:00Z');
  const yesterdayDate = new Date(refDate);
  yesterdayDate.setUTCDate(refDate.getUTCDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

  let currentStreak = 0;
  let startDate: Date | null = null;

  if (metDaysSet.has(targetDateStr)) {
    // Aujourd'hui a déjà validé l'objectif
    startDate = refDate;
  } else if (metDaysSet.has(yesterdayStr)) {
    // Hier a validé l'objectif, aujourd'hui est en cours de journée
    startDate = yesterdayDate;
  }

  if (startDate) {
    currentStreak = 0;
    const walker = new Date(startDate);
    while (true) {
      const dayStr = walker.toISOString().slice(0, 10);
      if (metDaysSet.has(dayStr)) {
        currentStreak++;
        walker.setUTCDate(walker.getUTCDate() - 1);
      } else {
        break;
      }
    }
  }

  return { currentStreak, bestStreak };
}

/**
 * Calcule l'historique et les statistiques agrégées selon la période (jour, semaine, mois, année).
 */
export async function getClippingHistory(
  db: LibSqlDatabase,
  period: 'day' | 'week' | 'month' | 'year',
  referenceDateStr?: string
): Promise<ClippingHistoryResponse> {
  const targetDateStr = normalizeDateString(referenceDateStr);
  const { currentStreak, bestStreak } = await getClippingStreaks(db, targetDateStr);

  const targetPosts = 5;
  const targetCampaigns = 5;

  if (period === 'day') {
    const goal = await getDailyClippingGoal(db, targetDateStr);
    const intervals: ClippingHistoryInterval[] = [
      {
        dateKey: targetDateStr,
        label: formatDisplayDate(targetDateStr),
        publishedCount: goal.publishedToday,
        scheduledCount: goal.scheduledToday,
        distinctCampaignsCount: goal.distinctCampaignsToday,
        isGoalMet: goal.isGoalMet,
        targetPosts,
        targetCampaigns
      }
    ];

    return {
      status: 'success',
      summary: {
        period: 'day',
        referenceDate: targetDateStr,
        totalPublished: goal.publishedToday,
        totalScheduled: goal.scheduledToday,
        distinctCampaigns: goal.distinctCampaignsToday,
        goalsMetDays: goal.isGoalMet ? 1 : 0,
        goalsMissedDays: goal.isGoalMet ? 0 : 1,
        currentStreak,
        bestStreak
      },
      intervals
    };
  }

  if (period === 'week') {
    const refDate = new Date(targetDateStr + 'T12:00:00Z');
    const dayOfWeek = refDate.getUTCDay(); // 0 = Dimanche, 1 = Lundi, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(refDate);
    monday.setUTCDate(refDate.getUTCDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const startDateStr = monday.toISOString().slice(0, 10);
    const endDateStr = sunday.toISOString().slice(0, 10);

    // Agrégations SQL par date dans l'intervalle de la semaine
    const publishedRows = await db.all<{
      day: string;
      published_count: number;
      campaigns_count: number;
    }>(
      `
      SELECT 
        date(published_at) as day,
        COUNT(*) as published_count,
        COUNT(DISTINCT campaign_id) as campaigns_count
      FROM publications
      WHERE status = 'published'
        AND published_at IS NOT NULL
        AND date(published_at) >= date(?)
        AND date(published_at) <= date(?)
      GROUP BY date(published_at)
      `,
      [startDateStr, endDateStr]
    );

    const scheduledRows = await db.all<{
      day: string;
      scheduled_count: number;
    }>(
      `
      SELECT 
        date(scheduled_at) as day,
        COUNT(*) as scheduled_count
      FROM publications
      WHERE scheduled_at IS NOT NULL
        AND date(scheduled_at) >= date(?)
        AND date(scheduled_at) <= date(?)
      GROUP BY date(scheduled_at)
      `,
      [startDateStr, endDateStr]
    );

    const distinctTotalCampaignsRow = await db.get<{ count: number }>(
      `
      SELECT COUNT(DISTINCT campaign_id) as count
      FROM publications
      WHERE status = 'published'
        AND published_at IS NOT NULL
        AND date(published_at) >= date(?)
        AND date(published_at) <= date(?)
      `,
      [startDateStr, endDateStr]
    );

    const publishedMap = new Map(
      publishedRows.map((r) => [r.day, { published: Number(r.published_count), campaigns: Number(r.campaigns_count) }])
    );
    const scheduledMap = new Map(
      scheduledRows.map((r) => [r.day, Number(r.scheduled_count)])
    );

    const intervals: ClippingHistoryInterval[] = [];
    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

    let goalsMetDays = 0;
    let totalPublished = 0;
    let totalScheduled = 0;

    for (let i = 0; i < 7; i++) {
      const current = new Date(monday);
      current.setUTCDate(monday.getUTCDate() + i);
      const dateKey = current.toISOString().slice(0, 10);

      const pubData = publishedMap.get(dateKey) || { published: 0, campaigns: 0 };
      const schedCount = scheduledMap.get(dateKey) || 0;

      const isGoalMet = pubData.published >= targetPosts && pubData.campaigns >= targetCampaigns;
      if (isGoalMet) goalsMetDays++;

      totalPublished += pubData.published;
      totalScheduled += schedCount;

      intervals.push({
        dateKey,
        label: `${dayNames[i]} ${current.getUTCDate()}`,
        publishedCount: pubData.published,
        scheduledCount: schedCount,
        distinctCampaignsCount: pubData.campaigns,
        isGoalMet,
        targetPosts,
        targetCampaigns
      });
    }

    return {
      status: 'success',
      summary: {
        period: 'week',
        referenceDate: targetDateStr,
        totalPublished,
        totalScheduled,
        distinctCampaigns: Number(distinctTotalCampaignsRow?.count || 0),
        goalsMetDays,
        goalsMissedDays: 7 - goalsMetDays,
        currentStreak,
        bestStreak
      },
      intervals
    };
  }

  if (period === 'month') {
    const refDate = new Date(targetDateStr + 'T12:00:00Z');
    const year = refDate.getUTCFullYear();
    const month = refDate.getUTCMonth(); // 0-11

    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));

    const startDateStr = firstDay.toISOString().slice(0, 10);
    const endDateStr = lastDay.toISOString().slice(0, 10);
    const daysInMonth = lastDay.getUTCDate();

    const publishedRows = await db.all<{
      day: string;
      published_count: number;
      campaigns_count: number;
    }>(
      `
      SELECT 
        date(published_at) as day,
        COUNT(*) as published_count,
        COUNT(DISTINCT campaign_id) as campaigns_count
      FROM publications
      WHERE status = 'published'
        AND published_at IS NOT NULL
        AND date(published_at) >= date(?)
        AND date(published_at) <= date(?)
      GROUP BY date(published_at)
      `,
      [startDateStr, endDateStr]
    );

    const scheduledRows = await db.all<{
      day: string;
      scheduled_count: number;
    }>(
      `
      SELECT 
        date(scheduled_at) as day,
        COUNT(*) as scheduled_count
      FROM publications
      WHERE scheduled_at IS NOT NULL
        AND date(scheduled_at) >= date(?)
        AND date(scheduled_at) <= date(?)
      GROUP BY date(scheduled_at)
      `,
      [startDateStr, endDateStr]
    );

    const distinctTotalCampaignsRow = await db.get<{ count: number }>(
      `
      SELECT COUNT(DISTINCT campaign_id) as count
      FROM publications
      WHERE status = 'published'
        AND published_at IS NOT NULL
        AND date(published_at) >= date(?)
        AND date(published_at) <= date(?)
      `,
      [startDateStr, endDateStr]
    );

    const publishedMap = new Map(
      publishedRows.map((r) => [r.day, { published: Number(r.published_count), campaigns: Number(r.campaigns_count) }])
    );
    const scheduledMap = new Map(
      scheduledRows.map((r) => [r.day, Number(r.scheduled_count)])
    );

    const intervals: ClippingHistoryInterval[] = [];
    let goalsMetDays = 0;
    let totalPublished = 0;
    let totalScheduled = 0;

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const curDate = new Date(Date.UTC(year, month, dayNum));
      const dateKey = curDate.toISOString().slice(0, 10);

      const pubData = publishedMap.get(dateKey) || { published: 0, campaigns: 0 };
      const schedCount = scheduledMap.get(dateKey) || 0;

      const isGoalMet = pubData.published >= targetPosts && pubData.campaigns >= targetCampaigns;
      if (isGoalMet) goalsMetDays++;

      totalPublished += pubData.published;
      totalScheduled += schedCount;

      intervals.push({
        dateKey,
        label: `${dayNum}`,
        publishedCount: pubData.published,
        scheduledCount: schedCount,
        distinctCampaignsCount: pubData.campaigns,
        isGoalMet,
        targetPosts,
        targetCampaigns
      });
    }

    return {
      status: 'success',
      summary: {
        period: 'month',
        referenceDate: targetDateStr,
        totalPublished,
        totalScheduled,
        distinctCampaigns: Number(distinctTotalCampaignsRow?.count || 0),
        goalsMetDays,
        goalsMissedDays: daysInMonth - goalsMetDays,
        currentStreak,
        bestStreak
      },
      intervals
    };
  }

  // period === 'year'
  const refDate = new Date(targetDateStr + 'T12:00:00Z');
  const year = refDate.getUTCFullYear();
  const yearStr = String(year);

  const monthlyPublishedRows = await db.all<{
    month_key: string;
    published_count: number;
    campaigns_count: number;
  }>(
    `
    SELECT 
      strftime('%Y-%m', published_at) as month_key,
      COUNT(*) as published_count,
      COUNT(DISTINCT campaign_id) as campaigns_count
    FROM publications
    WHERE status = 'published'
      AND published_at IS NOT NULL
      AND strftime('%Y', published_at) = ?
    GROUP BY strftime('%Y-%m', published_at)
    `,
    [yearStr]
  );

  const monthlyScheduledRows = await db.all<{
    month_key: string;
    scheduled_count: number;
  }>(
    `
    SELECT 
      strftime('%Y-%m', scheduled_at) as month_key,
      COUNT(*) as scheduled_count
    FROM publications
    WHERE scheduled_at IS NOT NULL
      AND strftime('%Y', scheduled_at) = ?
    GROUP BY strftime('%Y-%m', scheduled_at)
    `,
    [yearStr]
  );

  // Jours où l'objectif a été atteint dans chaque mois
  const metDaysRows = await db.all<{ month_key: string; met_days: number }>(
    `
    SELECT 
      strftime('%Y-%m', day) as month_key,
      COUNT(*) as met_days
    FROM (
      SELECT date(published_at) as day
      FROM publications
      WHERE status = 'published'
        AND published_at IS NOT NULL
        AND strftime('%Y', published_at) = ?
      GROUP BY date(published_at)
      HAVING COUNT(*) >= 5 AND COUNT(DISTINCT campaign_id) >= 5
    )
    GROUP BY month_key
    `,
    [yearStr]
  );

  const distinctTotalCampaignsRow = await db.get<{ count: number }>(
    `
    SELECT COUNT(DISTINCT campaign_id) as count
    FROM publications
    WHERE status = 'published'
      AND published_at IS NOT NULL
      AND strftime('%Y', published_at) = ?
    `,
    [yearStr]
  );

  const pubMap = new Map(monthlyPublishedRows.map((r) => [r.month_key, r]));
  const schedMap = new Map(monthlyScheduledRows.map((r) => [r.month_key, Number(r.scheduled_count)]));
  const metMap = new Map(metDaysRows.map((r) => [r.month_key, Number(r.met_days)]));

  const monthLabels = [
    'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
    'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'
  ];

  const intervals: ClippingHistoryInterval[] = [];
  let totalPublished = 0;
  let totalScheduled = 0;
  let totalGoalsMetDays = 0;

  for (let m = 1; m <= 12; m++) {
    const monthKey = `${yearStr}-${String(m).padStart(2, '0')}`;
    const pub = pubMap.get(monthKey);
    const schedCount = schedMap.get(monthKey) || 0;
    const metDays = metMap.get(monthKey) || 0;

    const pubCount = Number(pub?.published_count || 0);
    const campCount = Number(pub?.campaigns_count || 0);

    totalPublished += pubCount;
    totalScheduled += schedCount;
    totalGoalsMetDays += metDays;

    intervals.push({
      dateKey: monthKey,
      label: monthLabels[m - 1],
      publishedCount: pubCount,
      scheduledCount: schedCount,
      distinctCampaignsCount: campCount,
      isGoalMet: metDays > 0,
      targetPosts: targetPosts * 30, // Indicateur indicatif mensuel
      targetCampaigns
    });
  }

  return {
    status: 'success',
    summary: {
      period: 'year',
      referenceDate: targetDateStr,
      totalPublished,
      totalScheduled,
      distinctCampaigns: Number(distinctTotalCampaignsRow?.count || 0),
      goalsMetDays: totalGoalsMetDays,
      goalsMissedDays: Math.max(0, 365 - totalGoalsMetDays),
      currentStreak,
      bestStreak
    },
    intervals
  };
}

function formatDisplayDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC'
    }).format(d);
  } catch {
    return dateStr;
  }
}
