export function getCurrentMonthRange() {
  const now = new Date();

  const periodStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );

  const periodEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return { periodStart, periodEnd };
}
