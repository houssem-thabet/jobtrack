import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.token;
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as jwt.JwtPayload;
    res.locals.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}