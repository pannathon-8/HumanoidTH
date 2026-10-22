import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  authorizeAdminAction,
  createAdminSession,
  publicAccountRole,
  verifyAdminCredentials,
  verifyAdminSession
} from "../lib/admin-auth";

const originalEnv = {
  user: process.env.ADMIN_BASIC_USER,
  password: process.env.ADMIN_BASIC_PASSWORD,
  secret: process.env.ADMIN_SESSION_SECRET
};

function setAdminConfig() {
  process.env.ADMIN_BASIC_USER = "demo-admin@example.test";
  process.env.ADMIN_BASIC_PASSWORD = "correct-horse-battery";
  process.env.ADMIN_SESSION_SECRET = "test-session-secret-with-sufficient-entropy";
}

afterEach(() => {
  if (originalEnv.user === undefined) delete process.env.ADMIN_BASIC_USER;
  else process.env.ADMIN_BASIC_USER = originalEnv.user;
  if (originalEnv.password === undefined) delete process.env.ADMIN_BASIC_PASSWORD;
  else process.env.ADMIN_BASIC_PASSWORD = originalEnv.password;
  if (originalEnv.secret === undefined) delete process.env.ADMIN_SESSION_SECRET;
  else process.env.ADMIN_SESSION_SECRET = originalEnv.secret;
});

test("public role input cannot grant ADMIN", () => {
  assert.equal(publicAccountRole("ADMIN"), "USER");
  assert.equal(publicAccountRole("RESEARCHER"), "RESEARCHER");
});

test("admin sessions fail closed without configured secrets", async () => {
  delete process.env.ADMIN_BASIC_USER;
  delete process.env.ADMIN_BASIC_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  assert.equal(verifyAdminCredentials("demo-admin@example.test", "correct-horse-battery"), false);
  assert.equal(await verifyAdminSession("forged-token"), false);
});

test("forged cookies and non-admin database roles are denied", async () => {
  setAdminConfig();
  assert.equal(await verifyAdminSession("true"), false);
  assert.equal(await authorizeAdminAction("true", "demo-admin@example.test", "ADMIN"), false);
  const session = await createAdminSession("demo-admin@example.test");
  assert.equal(await authorizeAdminAction(session, "demo-admin@example.test", "USER"), false);
  assert.equal(await authorizeAdminAction(session, "another@example.test", "ADMIN"), false);
});

test("configured admin credentials issue a session accepted for the configured admin", async () => {
  setAdminConfig();
  assert.equal(verifyAdminCredentials("DEMO-ADMIN@example.test", "correct-horse-battery"), true);
  const session = await createAdminSession("demo-admin@example.test");
  assert.equal(await verifyAdminSession(session), true);
  assert.equal(await authorizeAdminAction(session, "demo-admin@example.test", "ADMIN"), true);
});
