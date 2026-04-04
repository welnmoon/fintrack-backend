export function getPeriodRange(period: 'month' | 'year' | 'week' = 'month') {
  const now = new Date();

  let periodStart: Date;
  let periodEnd: Date;

  switch (period) {
    case 'week': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;

      periodStart = new Date(now);
      periodStart.setDate(now.getDate() + diffToMonday);
      periodStart.setHours(0, 0, 0, 0);

      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);

      break;
    }

    case 'year': {
      periodStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      periodEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    }

    case 'month':
    default: {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

      periodEnd = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      break;
    }
  }

  return { periodStart, periodEnd };
}

export function getLastNDaysRange(days: number) {
  const safeDays = Number.isFinite(days) ? Math.max(1, Math.floor(days)) : 1;
  const now = new Date();

  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (safeDays - 1));
  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = new Date(now);
  periodEnd.setHours(23, 59, 59, 999);

  return { periodStart, periodEnd };
}
