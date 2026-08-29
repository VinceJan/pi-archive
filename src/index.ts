import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { archiveSession, unarchiveSession, listSessions, listArchived, searchArchived, searchAll } from "./core/archive.ts";

const STATUS_ID = "pi-archive";

function formatRef(p: string): string {
  return p.split("\\").join("/").split("/").slice(-2).join("/");
}

export default function(pi: ExtensionAPI) {
  let statusTimer: ReturnType<typeof setInterval> | undefined;

  async function updateStatus(ctx: any) {
    try {
      const [active, archived] = await Promise.all([listSessions(), listArchived()]);
      const txt = archived.length ? `📦 Archived ${archived.length} \u00b7 ${active.length} active` : `📦 Archived 0`;
      ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("dim", txt));
    } catch {
      ctx.ui.setStatus(STATUS_ID, undefined);
    }
  }

  pi.registerCommand("archive", {
    description: "Archive current or specified session (Codex-style hide, searchable, recoverable)",
    handler: async (args, ctx) => {
      const targetId = args.trim().split(/\s+/)[0] ?? "";
      let sessionPathOrId: string;
      if (targetId && !targetId.startsWith("-")) {
        sessionPathOrId = targetId;
      } else {
        const active = await listSessions();
        if (!active.length) { ctx.ui.notify("No active sessions to archive", "warning"); return; }
        sessionPathOrId = active[active.length - 1]!.id ?? active[active.length - 1]!.path;
      }
      try {
        const dest = await archiveSession(sessionPathOrId);
        ctx.ui.notify(`Archived \u2192 ${formatRef(dest)}`, "info");
        await updateStatus(ctx as any);
      } catch (e: any) {
        ctx.ui.notify(`Archive failed: ${e.message ?? String(e)}`, "error");
      }
    }
  });

  pi.registerCommand("archived", {
    description: "List/search archived sessions; /archived <query> to search",
    handler: async (args, ctx) => {
      const q = args.trim();
      if (q) {
        const results = await searchArchived(q, 20);
        if (!results.length) { ctx.ui.notify(`No archived match for: ${q}`, "info"); return; }
        const lines = results.map(r => `• ${r.ref.id ?? "?"} ${formatRef(r.ref.path)}${r.snippet ? ` \u00b7 ${r.snippet.slice(0,120)}` : ""}`);
        ctx.ui.notify(lines.join("\n"), "info");
      } else {
        const archived = await listArchived();
        if (!archived.length) { ctx.ui.notify("No archived sessions", "info"); return; }
        const lines = archived.slice(0, 20).map(r => `• ${r.id ?? "?"} ${formatRef(r.path)}`);
        const more = archived.length > 20 ? `\n...and ${archived.length - 20} more` : "";
        ctx.ui.notify(`Archived ${archived.length}:\n${lines.join("\n")}${more}\nUse /archived <query> to search, /unarchive <id> to restore`, "info");
      }
    }
  });

  pi.registerCommand("unarchive", {
    description: "Restore an archived session",
    handler: async (args, ctx) => {
      const targetId = args.trim().split(/\s+/)[0];
      if (!targetId) { ctx.ui.notify("Usage: /unarchive <id|path>", "warning"); return; }
      try {
        const dest = await unarchiveSession(targetId);
        ctx.ui.notify(`Restored \u2192 ${formatRef(dest)}`, "info");
        await updateStatus(ctx as any);
      } catch (e: any) {
        ctx.ui.notify(`Unarchive failed: ${e.message ?? String(e)}`, "error");
      }
    }
  });

  pi.registerCommand("archive-search", {
    description: "Search sessions (including archived)",
    handler: async (args, ctx) => {
      const q = args.trim();
      if (!q) { ctx.ui.notify("Usage: /archive-search <query>", "warning"); return; }
      const results = await searchAll(q, 20);
      if (!results.length) { ctx.ui.notify(`No match for: ${q}`, "info"); return; }
      const lines = results.map(r => `• ${r.ref.id ?? "?"} ${formatRef(r.ref.path)}${r.ref.archived ? " [archived]" : ""}${r.snippet ? ` \u00b7 ${r.snippet.slice(0,120)}` : ""}`);
      ctx.ui.notify(lines.join("\n"), "info");
    }
  });

  pi.on("session_start", async (_e, ctx) => {
    await updateStatus(ctx);
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(() => { void updateStatus(ctx); }, 30_000);
    statusTimer.unref?.();
  });
  pi.on("session_shutdown", async () => {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = undefined;
  });
}
