import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const STATUSES = ["WISHLIST", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"] as const;
const DAY = 24 * 60 * 60 * 1000;

// Monday of the week containing the date, as YYYY-MM-DD
function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const offset = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - offset);
  return x.toISOString().slice(0, 10);
}

router.get("/summary", async (_req, res) => {
  const applications = await prisma.application.findMany({
    where: { userId: res.locals.userId },
    select: {
      status: true,
      appliedAt: true,
      history: {
        orderBy: { changedAt: "asc" },
        select: { toStatus: true, changedAt: true },
      },
    },
  });

  // Funnel: how many applications are in each status right now
  const funnel = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<
    (typeof STATUSES)[number],
    number
  >;
  for (const a of applications) funnel[a.status]++;

  // Response rate: applications that ever reached INTERVIEW or OFFER,
  // out of all applications that left the wishlist
  const total = applications.length;
  const applied = total - funnel.WISHLIST;
  const responded = applications.filter((a) =>
    a.history.some((h) => h.toStatus === "INTERVIEW" || h.toStatus === "OFFER")
  ).length;
  const responseRate = applied > 0 ? Math.round((responded / applied) * 1000) / 10 : 0;

  // Applications per week, based on the applied date
  const weeks: Record<string, number> = {};
  for (const a of applications) {
    if (!a.appliedAt) continue;
    const key = weekStart(a.appliedAt);
    weeks[key] = (weeks[key] ?? 0) + 1;
  }
  const perWeek = Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));

  // Average days spent in each stage, from the status history
  const sums: Record<string, { total: number; n: number }> = {};
  for (const a of applications) {
    for (let i = 0; i < a.history.length - 1; i++) {
      const current = a.history[i];
      const next = a.history[i + 1];
      const entry = (sums[current.toStatus] ??= { total: 0, n: 0 });
      entry.total += next.changedAt.getTime() - current.changedAt.getTime();
      entry.n++;
    }
  }
  const avgDaysPerStage = Object.entries(sums).map(([status, { total, n }]) => ({
    status,
    avgDays: Math.round((total / n / DAY) * 10) / 10,
  }));

  res.json({ total, applied, responded, responseRate, funnel, perWeek, avgDaysPerStage });
});

export default router;