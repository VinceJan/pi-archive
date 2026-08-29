import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { copyFile, mkdir, readdir, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { existsSync } from "node:fs";

export function sessionsDir(): string { return join(getAgentDir(), "sessions"); }
export function archivedDir(): string { return join(sessionsDir(), ".archived"); }
export function legacyArchivedDir(): string { return join(getAgentDir(), "sessions-archive"); }

async function ensureDir(dir: string): Promise<void> { await mkdir(dir, { recursive: true }); }

export interface SessionRef { id?: string; path: string; archived: boolean; encodedCwd?: string; }

function parseSessionIdFromFileName(name: string): string | undefined {
  const m = name.match(/_([^_]+)\.jsonl$/);
  return m ? m[1] : undefined;
}

async function walkSessions(root: string, archived: boolean): Promise<SessionRef[]> {
  const out: SessionRef[] = [];
  let top: string[] = [];
  try { top = await readdir(root); } catch { return out; }
  for (const entry of top) {
    if (entry === ".archived" && !archived) continue;
    const full = join(root, entry);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        const files = await readdir(full);
        for (const f of files) {
          if (!f.endsWith(".jsonl")) continue;
          const fp = join(full, f);
          out.push({ id: parseSessionIdFromFileName(f), path: fp, archived, encodedCwd: entry });
        }
      } else if (entry.endsWith(".jsonl")) {
        out.push({ id: parseSessionIdFromFileName(entry), path: full, archived, encodedCwd: undefined });
      }
    } catch {}
  }
  return out;
}

export async function listSessions(): Promise<SessionRef[]> {
  const all = await walkSessions(sessionsDir(), false);
  return all.filter(r => !r.path.includes("/.archived/"));
}

export async function listArchived(): Promise<SessionRef[]> {
  const primary = await walkSessions(archivedDir(), true);
  const legacy = await walkSessions(legacyArchivedDir(), true);
  return [...primary, ...legacy];
}

export async function listAllIncludingArchived(): Promise<SessionRef[]> {
  const [active, archived] = await Promise.all([listSessions(), listArchived()]);
  return [...active, ...archived];
}

function archivedTargetPath(sourcePath: string): string {
  const sDir = sessionsDir();
  const aDir = archivedDir();
  if (sourcePath.startsWith(sDir + "/")) {
    const rel = sourcePath.slice(sDir.length + 1);
    return join(aDir, rel);
  }
  return join(aDir, "_unknown", basename(sourcePath));
}

function activeTargetPath(archivedPath: string): string {
  const aDir = archivedDir();
  const lDir = legacyArchivedDir();
  const sDir = sessionsDir();
  if (archivedPath.startsWith(aDir + "/")) {
    const rel = archivedPath.slice(aDir.length + 1);
    return join(sDir, rel);
  }
  if (archivedPath.startsWith(lDir + "/")) {
    const rel = archivedPath.slice(lDir.length + 1);
    return join(sDir, rel);
  }
  return join(sDir, basename(archivedPath));
}

async function moveFile(source: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest));
  try {
    await rename(source, dest);
  } catch (e: any) {
    if (e && (e.code === "EXDEV" || String(e.message).includes("EXDEV"))) {
      await copyFile(source, dest);
      await unlink(source);
    } else {
      throw e;
    }
  }
}

export async function archiveSession(sessionIdOrPath: string): Promise<string> {
  const target = await resolveSessionPath(sessionIdOrPath);
  if (!target) throw new Error(`Session not found: ${sessionIdOrPath}`);
  if (target.archived) throw new Error(`Session already archived: ${target.path}`);
  const dest = archivedTargetPath(target.path);
  if (existsSync(dest)) throw new Error(`Archive destination already exists: ${dest}`);
  await moveFile(target.path, dest);
  return dest;
}

export async function unarchiveSession(sessionIdOrPath: string): Promise<string> {
  const target = await resolveSessionPath(sessionIdOrPath);
  if (!target) throw new Error(`Session not found: ${sessionIdOrPath}`);
  if (!target.archived) throw new Error(`Session is not archived: ${target.path}`);
  const dest = activeTargetPath(target.path);
  if (existsSync(dest)) throw new Error(`Active destination already exists: ${dest}`);
  await moveFile(target.path, dest);
  return dest;
}

export async function resolveSessionPath(sessionIdOrPath: string): Promise<SessionRef | null> {
  if (sessionIdOrPath.includes("/") || sessionIdOrPath.includes("\\")) {
    try {
      const s = await stat(sessionIdOrPath);
      if (s.isFile()) {
        const archived = sessionIdOrPath.includes("/.archived/") || sessionIdOrPath.includes("\.archived\\") || sessionIdOrPath.startsWith(legacyArchivedDir());
        return { id: parseSessionIdFromFileName(basename(sessionIdOrPath)), path: sessionIdOrPath, archived };
      }
    } catch {}
  }
  const all = await listAllIncludingArchived();
  const byId = all.find(r => r.id === sessionIdOrPath);
  if (byId) return byId;
  const byPath = all.find(r => r.path === sessionIdOrPath || basename(r.path) === basename(sessionIdOrPath));
  return byPath ?? null;
}

export async function searchArchived(query: string, limit = 20): Promise<Array<{ ref: SessionRef; snippet?: string }>> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const archived = await listArchived();
  const results: Array<{ ref: SessionRef; snippet?: string }> = [];
  for (const ref of archived) {
    try {
      const content = await readFile(ref.path, "utf8");
      const lower = content.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 120);
        const snippet = content.slice(start, idx + q.length + 120).replace(/\s+/g, " ").slice(0, 240);
        results.push({ ref, snippet });
      } else if (ref.id && ref.id.toLowerCase().includes(q)) {
        results.push({ ref });
      }
      if (results.length >= limit) break;
    } catch {}
  }
  return results;
}

export async function searchAll(query: string, limit = 20): Promise<Array<{ ref: SessionRef; snippet?: string }>> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const all = await listAllIncludingArchived();
  const results: Array<{ ref: SessionRef; snippet?: string }> = [];
  for (const ref of all) {
    try {
      const content = await readFile(ref.path, "utf8");
      const lower = content.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx !== -1) {
        const start = Math.max(0, idx - 120);
        const snippet = content.slice(start, idx + q.length + 120).replace(/\s+/g, " ").slice(0, 240);
        results.push({ ref, snippet });
      } else if (ref.id && ref.id.toLowerCase().includes(q)) {
        results.push({ ref });
      }
      if (results.length >= limit) break;
    } catch {}
  }
  return results;
}
