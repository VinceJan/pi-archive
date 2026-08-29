# pi-archive

Codex-style session archiving for **Pi** and **Pi Web** — hide from list, searchable, recoverable, dual compatible.

- **Archive != Delete**: `/archive` moves `~/.pi/agent/sessions/<encoded>/<ts>_<uuid>.jsonl` → `~/.pi/agent/sessions/.archived/<encoded>/<ts>_<uuid>.jsonl` (Pi Web list only scans `sessions/`, so it disappears).
- **Search & Restore**: `/archived` lists, `/archived <query>` searches archived, `/unarchive <id>` moves back, `/archive-search <query>` searches all.
- **Dual Pi / Pi Web**: uses only `setStatus`/`setWidget`/`registerCommand` (both runtimes implement via `rpc-manager`).
- Cross-device safe: `rename` with `EXDEV` fallback `copy+unlink`.

## Install
```bash
pi install npm:pi-archive
# or
pi install github:VinceJan/pi-archive
```
Pi Web: Settings → Plugins → Add Plugin → `npm:pi-archive`

## Commands
| Command | Result |
|---|---|
| `/archive` or `/archive <id>` | Archive current or specified session |
| `/archived` | List archived |
| `/archived <query>` | Search archived content |
| `/unarchive <id>` | Restore |
| `/archive-search <query>` | Search all (active + archived) |

Status line shows `📦 Archived N · M active` (via `setStatus`).

## Layout
- Active: `~/.pi/agent/sessions/.archived/` excluded
- Archive: `sessions/.archived/` (primary) + `sessions-archive/` (legacy)
- No file is ever deleted by archive; delete remains `DELETE /api/sessions/[id]` in Pi Web.

## License
MIT
