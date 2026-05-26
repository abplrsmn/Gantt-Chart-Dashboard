# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

### Browser Automation

- OpenClaw browser tool is enabled.
- Default browser profile: `openclaw`.
- Browser driver/transport: OpenClaw CDP at `http://127.0.0.1:18800`.
- Chromium executable: `/usr/bin/chromium`.
- Persistent OpenClaw browser profile directory: `/home/ahgadmin/.openclaw/browser/openclaw/user-data`.
- `user` profile exists as an existing-session/Chrome-MCP profile, but was not running during the 2026-05-26 audit.
- Verified working on 2026-05-26:
  - `openclaw.browser` status/profiles/tabs
  - start headless browser
  - open `https://cc.aryaduta.com/dashboard`
  - snapshot and screenshot the Aryaduta Dashboard login screen
  - type/click on a smoke-test page
- Authenticated dashboard/ClickUp/Google browser work still needs a login/session step; the local browser automation layer itself is functional.

### Memory Recall

- Dependency-free recall index script: `scripts/memory-recall.js`.
- Generated index directory: `.memory-index/` (ignored by git).
- Commands:
  - `npm run recall:build` rebuilds the index.
  - `npm run recall -- "query text" 8` searches memory/docs/knowledge/skills.
  - `npm run recall -- "query text" --limit 5 --type daily-memory` searches with filters.
  - `npm run recall -- "query text" --json` returns machine-readable results.
  - `npm run recall:context -- "query text" --limit 5` returns compact model-ready context.
  - `npm run recall:stats` shows index stats.
- Indexed sources: `MEMORY.md`, `memory/*.md`, `TOOLS.md`, `OPS_STATE.md`, `USER.md`, `AGENTS.md`, `docs/`, `knowledge/`, and `skills/`.
- First verified on 2026-05-26: 63 files, 235 chunks, 3,913 terms. Queries for project attachments and browser automation returned the expected memory/docs.
- Recall v2 upgrade on 2026-05-26 adds automatic stale-index rebuild, line references, chunk ids, source type/path filters, exact phrase boost, JSON output, and compact context mode.

### Skill Evolution

- Pipeline script: `scripts/skill-evolution.js`.
- Active helper skill: `skills/skill-evolution/SKILL.md`.
- Proposal directory: `skill-proposals/`.
- Commands:
  - `npm run skill:evolve -- propose <name> --query "query" --description "trigger description"`
  - `node scripts/skill-evolution.js validate skill-proposals/<proposal>`
  - `npm run skill:evolve:list`
  - `node scripts/skill-evolution.js approve skill-proposals/<proposal>`
- Guardrail: proposals are not active until approved into `skills/`.
- First test proposal: `skill-proposals/20260526T030505Z-capex-project-input`.

### 9Router

- Installed globally on Linux: `/usr/bin/9router`.
- Version checked on 2026-05-26: `0.4.59`.
- NPM global package: `9router@0.4.59`.
- Default server port from local README/help: `20128`.
- Dashboard URL when running: `http://localhost:20128/dashboard`.
- OpenAI-compatible endpoint when running: `http://localhost:20128/v1`.
- Data directory: `/home/ahgadmin/.9router` (12M at audit time).
- Audit result on 2026-05-26: installed but not running; no PM2/systemd user service found; default port was not listening; no obvious DB/config file yet, only runtime package files.
- Later status on 2026-05-26 11:06 WIB: 9Router was running as `node /usr/bin/9router --no-browser --skip-update`, with child `next-server`, listening on `0.0.0.0:20128`. Local/LAN/Tailscale checks returned HTTP 307 from `/dashboard` to `/login`.
- Current status on 2026-05-26 11:55 WIB: 9Router is managed by PM2 as process name `9router`, running `/usr/bin/9router --no-browser --skip-update`. PM2 process list was saved with `pm2 save`. It listens on `0.0.0.0:20128`, and `/dashboard` redirects to `/login`.
- Server access URLs while running:
  - Local Linux: `http://127.0.0.1:20128/dashboard`
  - LAN: `http://10.21.38.102:20128/dashboard`
  - Tailscale: `http://100.80.142.33:20128/dashboard`
- Security note: prefer LAN/Tailscale or SSH local forwarding for dashboard access. Avoid public tunnels for 9Router unless there is a deliberate auth/exposure decision because it is an AI provider/model gateway.
