import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/prisma";

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const creds = { email: "a@test.com", password: "password123" };

describe("auth", () => {
  it("registers a user and sets a cookie", async () => {
    const res = await request(app).post("/api/auth/register").send(creds);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(creds.email);
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const res = await request(app).post("/api/auth/register").send(creds);
    expect(res.status).toBe(409);
  });

  it("rejects a short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "b@test.com", password: "123" });
    expect(res.status).toBe(400);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    await request(app).post("/api/auth/register").send(creds);
    const ok = await request(app).post("/api/auth/login").send(creds);
    expect(ok.status).toBe(200);
    const bad = await request(app)
      .post("/api/auth/login")
      .send({ ...creds, password: "wrongpassword" });
    expect(bad.status).toBe(401);
  });

  it("protects /me and returns the user when logged in", async () => {
    const anonymous = await request(app).get("/api/auth/me");
    expect(anonymous.status).toBe(401);

    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(creds);
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(creds.email);
  });
});