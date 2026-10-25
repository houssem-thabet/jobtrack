import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const sign = (userId: string) =>
  jwt.sign({ sub: userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });

router.post("/register", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ errors: z.flattenError(parsed.error).fieldErrors });
    return;
  }
  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 12) },
  });
  res
    .cookie("token", sign(user.id), cookieOptions)
    .status(201)
    .json({ id: user.id, email: user.email });
});

router.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.cookie("token", sign(user.id), cookieOptions).json({ id: user.id, email: user.email });
});

router.post("/logout", (_req, res) => {
  res.clearCookie("token", cookieOptions).status(204).end();
});

router.get("/me", requireAuth, async (_req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: res.locals.userId },
    select: { id: true, email: true },
  });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;