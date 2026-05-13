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

## Shared Project/CAPEX Workflow Rules

These rules are safe to use across shared/group sessions and should be treated as the current operating model for project/CAPEX handling.

### Input style
- Users should be able to submit project/CAPEX updates in natural language; do not force rigid templates when the intent is understandable.
- The agent should infer whether the message is about:
  - project summary / milestone tracking
  - detailed S-curve structure (tahap, subtask, bobot)
  - S-curve planned/actual progress by period
- Ask at most one short clarification only when a critical field is ambiguous.

### Data model
- Project data has 2 linked layers:
  1. summary milestone tracking (`projects` + `project_phases`)
  2. detailed execution/S-curve tracking inside the same project
- S-curve is not a fake milestone. It represents detailed work breakdown inside a project, including tahap/subtask, bobot, and time-bucketed plan vs actual progress.
- Project identity should be resolved primarily by `unit + normalized project name`, then linked to the resolved `project_id`.
- If an inbound project input does not clearly specify which milestone phase it belongs to, default the summary-level write to **Operational Brief** until a more specific phase is explicitly identified.
- Attachment model exists in the DB via `project_attachments` (with fields including `project_id`, `phase_id`, `category_id`, `file_name`, `mime_type`, `file_url`, `source_channel`, and `source_message_id`), and Project Details already shows an Attachments section in the UI.
- As of 2026-05-08, the live app now includes attachment read/write plumbing for project detail attachments: `/api/projects/[id]` returns attachment rows, Project Details renders them, and the unified CAPEX ops route attempts to persist inbound attachment metadata into `project_attachments` by resolving the target project from `unit + project`.
- Important verification boundary: the dashboard attachment flow is verified at DB/API/UI level, but real inbound Telegram/project-group attachment payloads have not yet been end-to-end validated against a live user message after this deployment. Until that live message test is done, treat attachment auto-linking from chat as implemented but still pending final field-shape verification.

### Ownership and roles
- Each of the 5 milestone phases has its own PIC/account/role.
- Phase abbreviation mapping for Telegram/project input: PR = Operational Brief, HoD = Design, PC = Project Control, PM = Project Management. Users may use the short form or full phase name.
- In Project Details, do not show a single project-level PIC. The phase card Assigned By value should come from that phase's own PIC, because each phase may have a different responsible person.
- Project Team / Telegram project updates should write to `project_change_logs` whenever the project can be resolved, so they appear in the Project Details Audit Log.
- Phase ownership matters operationally: the responsible PIC is the authority for reviewing/updating data related to that phase.
- Typical routing guidance:
  - Design dates/drawings -> Design PIC
  - Tender/SPK/contract -> Project Control PIC
  - Site schedule, subtask execution, weekly actuals, S-curve detail -> Project Management PIC
  - Handover/BAST -> Handover PIC

### Vendor approval model
- Vendors may provide updates, but vendor-originated input must not auto-write into authoritative project data.
- This rule applies both in group chats and direct messages; vendor DM must not bypass approval.
- Vendor input should be treated as a proposed update pending PIC review.
- When vendor-originated input is detected, notify the relevant PIC with:
  - who submitted it
  - which unit/project/phase it appears to affect
  - the structured values extracted from the message
  - a request to approve / revise / reject
- Only after PIC approval (or PIC revision then approval) should vendor-originated data become final project data.
- Rejected vendor input should remain available as history/audit but must not overwrite final records.

### Response behavior in groups
- If the message is from the authorized PIC and the intent is clear, the agent may acknowledge it as an official update path.
- If the message is from a vendor, the agent should acknowledge receipt and route the parsed proposal to the relevant PIC for review instead of treating it as final.
- If Abe/project users send project input together with attachment files, treat those files as intended project attachments for the resolved project context.
- After this deployment, the system should attempt to store those attachments into `project_attachments` and expose them in Project Details, but until a real Telegram/project-group message is tested live, confirm storage cautiously (for example: "aku sudah proses attachment-nya untuk project ini" rather than overclaiming display success if not yet checked).
- Keep acknowledgements concise and operational.

## Telegram Group Policy
- Telegram group policy is currently set to `open` for faster onboarding/debugging.
- This is intended to let new groups (including IDEA Project) reach the bot without waiting for allowlist updates.
- Existing known groups still include IDEA Tech and IDEA Data & Digital in config history, but onboarding is no longer blocked by allowlist.

## Last Updated
- Updated during live debugging/deployment session on 2026-04-01 (Asia/Jakarta)
