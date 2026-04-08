---
name: clickup-dashboard
description: Build, debug, deploy, and iterate on ClickUp dashboard web apps and related Node.js/PM2 services. Use when working on a custom ClickUp dashboard, ClickUp-driven internal tool, reporting UI, task analytics page, or a web app that consumes ClickUp API data. Trigger for requests about ClickUp dashboard architecture, environment variables, API integration, webhook handling, Node/npm errors, build failures, PM2 process issues, deployment troubleshooting, and production/runtime debugging.
---

# ClickUp Dashboard

## Overview

Use this skill to work on a ClickUp dashboard project end-to-end: understand the app, verify ClickUp integration points, debug local or server failures, and stabilize deployment under Node.js and PM2.

Prefer practical diagnosis over abstract advice. Read the repo first, identify the stack and run commands that reveal the actual failure mode.

## Default workflow

1. Identify the app shape.
   - Read `package.json`, lockfiles, `README`, `.env.example`, PM2 config (`ecosystem.config.js`, `ecosystem.config.cjs`, `ecosystem.config.json`), and framework config files.
   - Determine whether the app is Express, Next.js, Vite, React SPA, Nuxt, or another Node-based stack.
2. Verify ClickUp integration.
   - Search for ClickUp API calls, tokens, workspace/team/space/list IDs, webhooks, and sync jobs.
   - Check whether required env vars are documented and actually referenced in code.
3. Reproduce the failure.
   - Run the project’s real install/build/start commands.
   - Prefer the exact PM2 start script or npm script used in production.
4. Narrow the problem class.
   - Dependency/install issue
   - Type/build failure
   - Runtime crash
   - Misconfigured env vars/secrets
   - Reverse proxy / port binding mismatch
   - PM2 process definition or working-directory issue
   - ClickUp API auth/rate-limit/payload issue
5. Fix the smallest correct thing.
   - Patch config, scripts, env handling, or code.
   - Avoid speculative large refactors unless the user asks.
6. Re-test.
   - Re-run build/start.
   - Re-check PM2 status/logs.
   - Summarize root cause, fix, and any remaining risk.

## Repo inspection checklist

Start here before changing files:

- `package.json`
- package manager lockfile: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb`
- `.nvmrc` or engines field in `package.json`
- `.env.example`, `.env`, `.env.production`, `.env.local` if present
- PM2 config files
- framework configs such as `next.config.*`, `vite.config.*`, `tsconfig.json`
- deployment files: Dockerfile, nginx config snippets, CI/CD workflows, startup scripts

Questions to answer quickly:

- What command installs dependencies?
- What command builds?
- What command serves production traffic?
- Which port should the app bind to?
- Which env vars are mandatory?
- Is the app server-rendered or a static frontend with separate API?

## ClickUp-specific checks

When the app talks to ClickUp, inspect these areas carefully:

- API token source and naming (`CLICKUP_TOKEN`, `CLICKUP_API_KEY`, etc.)
- Workspace/team/space/list/folder IDs
- Webhook signing and secret validation if webhooks are used
- Pagination handling for task fetches
- Date/timezone normalization in reports and dashboards
- Rate-limit handling and retry logic
- Mapping of ClickUp custom fields and statuses
- Assumptions about completed/archived tasks

If API behavior looks wrong, verify whether the bug is caused by:

- wrong IDs for the target workspace/list
- missing scopes/permissions on the token
- stale custom-field IDs
- server-side timezone mismatch
- unhandled nulls or optional fields in ClickUp payloads

## PM2 and deployment workflow

For PM2-related issues, check in this order:

1. `pm2 status`
2. `pm2 logs <app>` or the configured out/error logs
3. PM2 app cwd, script, interpreter, and env
4. Node version on host versus repo expectation
5. Whether the app needs a build step before start
6. Whether the start command is using the correct port/host binding
7. Whether reverse proxy or firewall expects a different upstream port

Common PM2 failure patterns:

- Wrong working directory
- Starting source files directly instead of built output
- `npm start` assumes prior build that never ran
- Wrong Node version for framework/runtime
- Missing env file in PM2 environment
- App crashes because host binding is localhost-only instead of `0.0.0.0`
- Restart loop hiding the first real stack trace

## Debugging heuristics

Use short loops:

- reproduce
- inspect the first meaningful error
- patch one cause
- retry

Prefer:

- exact stack traces
- real command output
- searching the codebase for the symbol/file mentioned in the error

Avoid:

- guessing from only the last line of logs
- changing many unrelated dependencies at once
- rewriting app structure before confirming the root cause

## Safe change strategy

When editing a production-facing ClickUp dashboard:

- preserve existing env var names unless intentionally migrating
- keep API response shapes stable if frontend depends on them
- avoid broad dependency upgrades unless required for the fix
- note any follow-up needed for secrets, PM2 reload, migrations, or rebuilds

## Useful deliverables

Depending on the user request, produce one or more of these:

- root-cause summary for a deployment failure
- exact install/build/start command sequence
- cleaned PM2 ecosystem config
- env-var checklist for ClickUp integration
- minimal patch for API/runtime bug
- deployment runbook for future restarts

## References

Read these only when needed:

- `references/debugging-checklist.md` for a compact triage flow when a ClickUp dashboard app is failing to build, boot, or stay up under PM2.
