# ClickUp Dashboard Debugging Checklist

Use this when the user wants fast triage.

## 1. Identify the stack

Check:

- `package.json`
- lockfile
- framework config files
- PM2 ecosystem config

Capture:

- package manager
- install command
- build command
- production start command
- expected port
- required env vars

## 2. Check host/runtime alignment

- `node -v`
- `npm -v` / `pnpm -v` / `yarn -v`
- compare against `engines` or `.nvmrc`
- verify cwd used by PM2

## 3. Reproduce exactly

Prefer the real commands in use:

- install
- build
- start
- PM2 start/restart

If PM2 is failing, inspect:

- `pm2 status`
- `pm2 logs <name> --lines 200`
- `pm2 describe <name>`

## 4. Classify the failure

### Install failure

Look for:

- unsupported Node version
- lockfile/package-manager mismatch
- missing system dependencies
- postinstall script errors

### Build failure

Look for:

- TypeScript errors
- missing env vars at build time
- framework config mistakes
- imports that only exist in dev

### Runtime failure

Look for:

- unhandled exception on boot
- wrong output directory or start file
- missing env vars at runtime
- port already in use
- binding to wrong interface

### Data/API failure

Look for:

- invalid ClickUp token
- wrong workspace/list IDs
- null handling bugs
- pagination bugs
- timezone/reporting mismatch

## 5. Validate ClickUp wiring

Search for:

- `clickup`
- `api.clickup.com`
- token env vars
- list IDs / team IDs / space IDs
- webhook handlers
- custom field IDs

Confirm that referenced env vars exist and are named consistently.

## 6. Patch minimally

Prefer the smallest fix that restores service.

Examples:

- add missing env var fallback
- fix PM2 cwd/script
- run build before start
- align Node version
- handle null/optional field from ClickUp payload

## 7. Re-test and report

After patching:

- rerun build/start
- verify PM2 stays online
- check logs again
- summarize:
  - root cause
  - fix applied
  - any remaining manual steps
