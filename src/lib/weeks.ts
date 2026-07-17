// ISO-8601 week helpers — shared by the Dashboard page and the HTML export so
// both group prices into the same week columns.

// ISO-8601 week of a "YYYY-MM-DD" date (weeks start Monday). Same-week dates
// share a key so a scrape that straddled two days collapses into one column.
export function isoWeek(dateStr: string): { key: string; label: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  dt.setUTCDate(dt.getUTCDate() - day + 3); // Thursday of this week
  const isoYear = dt.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((dt.getTime() - firstThu.getTime()) / (7 * 24 * 3600 * 1000));
  return { key: `${isoYear}-W${String(week).padStart(2, "0")}`, label: `W${week}` };
}

// Group a sorted date list into ISO weeks (ascending).
export function groupWeeks(dates: string[]): { key: string; label: string; dates: string[] }[] {
  const map = new Map<string, { key: string; label: string; dates: string[] }>();
  for (const d of dates) {
    const { key, label } = isoWeek(d);
    if (!map.has(key)) map.set(key, { key, label, dates: [] });
    map.get(key)!.dates.push(d);
  }
  const weeks = [...map.values()];
  weeks.forEach((w) => w.dates.sort());
  weeks.sort((a, b) => a.key.localeCompare(b.key));
  return weeks;
}
