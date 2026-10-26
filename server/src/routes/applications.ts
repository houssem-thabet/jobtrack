import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const statusEnum = z.enum(["WISHLIST", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"]);

const baseSchema = z.object({
  company: z.string().trim().min(1).max(120),
  position: z.string().trim().min(1).max(120),
  status: statusEnum.optional(),
  link: z.url().nullish(),
  location: z.string().trim().max(120).nullish(),
  source: z.string().trim().max(120).nullish(),
  salary: z.string().trim().max(120).nullish(),
  notes: z.string().max(5000).nullish(),
  appliedAt: z.coerce.date().nullish(),
  followUpAt: z.coerce.date().nullish(),
});

const createSchema = baseSchema.extend({
  status: statusEnum.default("WISHLIST"),
});
const updateSchema = baseSchema.partial();

const listQuerySchema = z.object({
  status: statusEnum.optional(),
  q: z.string().trim().optional(),
  sort: z.enum(["createdAt", "company", "appliedAt", "followUpAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Create
router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: z.flattenError(parsed.error).fieldErrors });
    return;
  }
  const data = parsed.data;
  const application = await prisma.application.create({
    data: {
      ...data,
      userId: res.locals.userId,
      history: { create: { fromStatus: null, toStatus: data.status } },
    },
    include: { history: true },
  });
  res.status(201).json(application);
});

// List with filters, search, sorting and pagination
router.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ errors: z.flattenError(parsed.error).fieldErrors });
    return;
  }
  const { status, q, sort, order, page, limit } = parsed.data;

  const where: Prisma.ApplicationWhereInput = {
    userId: res.locals.userId,
    ...(status && { status }),
    ...(q && {
      OR: [
        { company: { contains: q, mode: "insensitive" } },
        { position: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.application.findMany({
      where,
      orderBy: { [sort]: order } as Prisma.ApplicationOrderByWithRelationInput,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.application.count({ where }),
  ]);

  res.json({ items, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// Get one, with its status history
router.get("/:id", async (req, res) => {
  const application = await prisma.application.findFirst({
    where: { id: req.params.id, userId: res.locals.userId },
    include: { history: { orderBy: { changedAt: "asc" } } },
  });
  if (!application) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json(application);
});

// Update (any subset of fields). A status change is logged automatically.
router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: z.flattenError(parsed.error).fieldErrors });
    return;
  }
  const existing = await prisma.application.findFirst({
    where: { id: req.params.id, userId: res.locals.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const data = parsed.data;
  const newStatus = data.status;
  const statusChanged = newStatus !== undefined && newStatus !== existing.status;

  const updated = await prisma.application.update({
    where: { id: existing.id },
    data: {
      ...data,
      // first time an application becomes "applied", stamp the date if none was given
      ...(newStatus === "APPLIED" &&
        !existing.appliedAt &&
        data.appliedAt === undefined && { appliedAt: new Date() }),
      ...(statusChanged && {
        history: { create: { fromStatus: existing.status, toStatus: newStatus } },
      }),
    },
    include: { history: { orderBy: { changedAt: "asc" } } },
  });
  res.json(updated);
});

// Delete
router.delete("/:id", async (req, res) => {
  const { count } = await prisma.application.deleteMany({
    where: { id: req.params.id, userId: res.locals.userId },
  });
  if (count === 0) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.status(204).end();
});

export default router;