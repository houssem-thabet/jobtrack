if (!process.env.DATABASE_URL?.includes("jobtrack_test")) {
  throw new Error("Refusing to run tests against a non-test database");
}