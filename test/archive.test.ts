
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

let tmpRoot = "";
let agentDir = "";

async function setupEnv() {
  tmpRoot = await mkdtemp(join(tmpdir(), "pi-archive-test-"));
  agentDir = join(tmpRoot, "agent");
  process.env.PI_CODING_AGENT_DIR = agentDir;
  // also set for getAgentDir fallback if it reads homedir? we set env
  const sessions = join(agentDir, "sessions", "--test--");
  await mkdir(sessions, { recursive: true });
  // create two sessions
  await writeFile(join(sessions, "2026-08-29T00-00-00_11111111-1111-1111-1111-111111111111.jsonl"), '{"type":"session","id":"11111111-1111-1111-1111-111111111111"}\n{"role":"user","content":"hello world"}');
  await writeFile(join(sessions, "2026-08-29T01-00-00_22222222-2222-2222-2222-222222222222.jsonl"), '{"type":"session","id":"22222222-2222-2222-2222-222222222222"}\n{"role":"user","content":"secret archived query"}');
  return { sessions };
}

test("archive moves file to .archived and unarchive restores", async () => {
  const { sessions } = await setupEnv();
  const mod = await import("../src/core/archive.ts");
  let active = await mod.listSessions();
  assert.equal(active.length, 2);
  let archived = await mod.listArchived();
  assert.equal(archived.length, 0);
  // archive one
  const dest = await mod.archiveSession("11111111-1111-1111-1111-111111111111");
  assert.ok(dest.includes(".archived"), "dest should be in .archived");
  assert.ok(existsSync(dest));
  active = await mod.listSessions();
  assert.equal(active.length, 1);
  archived = await mod.listArchived();
  assert.equal(archived.length, 1);
  assert.equal(archived[0].id, "11111111-1111-1111-1111-111111111111");
  // search archived
  let results = await mod.searchArchived("hello", 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].ref.id, "11111111-1111-1111-1111-111111111111");
  // unarchive
  const restored = await mod.unarchiveSession("11111111-1111-1111-1111-111111111111");
  assert.ok(!restored.includes(".archived"));
  active = await mod.listSessions();
  assert.equal(active.length, 2);
  archived = await mod.listArchived();
  assert.equal(archived.length, 0);
});

test("searchAll finds both active and archived", async () => {
  await setupEnv();
  const mod = await import("../src/core/archive.ts");
  await mod.archiveSession("22222222-2222-2222-2222-222222222222");
  const results = await mod.searchAll("secret", 10);
  assert.equal(results.length, 1);
  assert.equal(results[0].ref.archived, true);
});

test("archive is idempotent error handling", async () => {
  await setupEnv();
  const mod = await import("../src/core/archive.ts");
  await mod.archiveSession("11111111-1111-1111-1111-111111111111");
  await assert.rejects(() => mod.archiveSession("11111111-1111-1111-1111-111111111111"), /already archived|not found/);
  await assert.rejects(() => mod.unarchiveSession("22222222-2222-2222-2222-222222222222"), /not archived/);
  await assert.rejects(() => mod.archiveSession("nonexistent-id-9999"), /not found/);
});

test("resolveSessionPath handles direct path", async () => {
  const { sessions } = await setupEnv();
  const mod = await import("../src/core/archive.ts");
  const direct = join(sessions, "2026-08-29T00-00-00_11111111-1111-1111-1111-111111111111.jsonl");
  const r = await mod.resolveSessionPath(direct);
  assert.ok(r);
  assert.equal(r.id, "11111111-1111-1111-1111-111111111111");
  assert.equal(r.archived, false);
});
