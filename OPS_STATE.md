# OPS_STATE.md

Shared operational source of truth for the ClickUp dashboard / Telegram / Calendar setup.

## Live Systems

### ClickUp Dashboard
- Live repo path: `/home/ahgadmin/clickup-dashboard`
- Public dashboard: `https://cc.aryaduta.com/dashboard`
- Process manager: PM2
- PM2 app name: `clickup-dashboard`

## Verified Working

### Google Calendar integration
- Google OAuth routes exist and are live:
  - `/api/google/oauth/start`
  - `/api/google/oauth/callback`
- Google Calendar routes exist and are live:
  - `/api/google/calendar/create-event`
  - `/api/google/calendar/list-events`
  - `/api/google/calendar/delete-event`
- Google refresh-token flow has been configured in the live app env.
- Event creation to Google Calendar has been verified working from the live app.

### ClickUp Docs / Chat / Structure
- ClickUp Docs API access verified.
- ClickUp Chat channels API access verified.
- ClickUp workspace/space/folder structure API access verified.
- Dynamic organization structure endpoint exists:
  - `/api/clickup/structure`

### Task flow
- Dashboard task read path exists and works.
- ClickUp task write path now exists in live repo:
  - `/api/clickup/tasks/create`
- Natural-language task execution endpoint now exists:
  - `/api/ops/task`
- Direct task creation to ClickUp has been verified working for IDEA -> Tech.

### Meeting / planning flow
- Meeting schedule endpoint exists:
  - `/api/meetings/schedule`
- Ops planning endpoint exists:
  - `/api/ops/plan`
- Natural-language meeting parsing exists, but is NOT yet fully reliable.

## Known Gaps / Not Yet Reliable
- Group-chat natural-language meeting scheduling is not yet fully reliable.
- Group-chat natural-language task parsing is improved but assignee extraction is not yet fully reliable.
- Cross-context consistency (private chat vs group chat) has been a known issue.
- Do NOT claim the live repo or calendar backend is missing without re-checking this file and/or live facts.

## Operational Rules
- Before making claims about repo live state, deployed routes, integrations, or PM2 services, check this file first.
- Treat this file as the shared source of truth across private and group sessions.
- If behavior in a group contradicts this file, assume the group reasoning is stale until re-verified.

## Focus Areas Right Now
1. Reliability in IDEA Tech group
2. Reliability in IDEA Data & Digital group
3. Reliability in IDEA Project group
4. Group request -> parse -> execute for Google Calendar meetings
5. Group request -> parse -> execute for ClickUp task creation/assignment

## Telegram Group Policy
- Telegram group policy is currently set to `open` for faster onboarding/debugging.
- This is intended to let new groups (including IDEA Project) reach the bot without waiting for allowlist updates.
- Existing known groups still include IDEA Tech and IDEA Data & Digital in config history, but onboarding is no longer blocked by allowlist.

## Last Updated
- Updated during live debugging/deployment session on 2026-04-01 (Asia/Jakarta)
