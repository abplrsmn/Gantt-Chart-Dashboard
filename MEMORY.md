# MEMORY.md

## Projects

### ClickUp Dashboard
- Purpose: build a Telegram-first task management system so staff do not need to open ClickUp directly for routine task/project input.
- Core product flow: staff submit task/project information through Telegram -> bot/agent collects and structures the data -> system creates or updates tasks in ClickUp -> data appears in the dashboard for monitoring and operational control.
- Dashboard purpose:
  - monitor department performance
  - track deadlines and task progress
  - provide AI agents control/operations pages
  - give management visibility across departments
- Main operating model:
  - Telegram is the primary user interface for staff
  - ClickUp is the execution/task database layer
  - Dashboard is the monitoring/control layer
- Agent role: receive staff input from Telegram, normalize/map it into ClickUp-compatible fields, help drive automations, and support dashboard/ops workflows.
- Project location: `C:\Users\AHO IT\Projects\clickup-dashboard` on the user's Windows PC.
- Runtime/deploy context mentioned so far: Node.js app managed/deployed with PM2.
- Important note: this is not just a reporting dashboard; it is a Telegram-to-ClickUp operational system with monitoring and agent-control features.
- CAPEX chat input rule to remember: when a user gives CAPEX data in natural language, present/normalize it into a fixed "versi rapi" structure with the same project created/updated across all five milestones, even if non-current phases are still empty and should be stored as `-`.
- CAPEX "versi rapi" canonical structure:
  - Unit
  - Project Name
  - Operational Brief: Brief, Received Date, Budget/CAPEX
  - Design: Start Design Date, Design Approval, Duration, Brief, Working Drawing
  - Project Control: Tender Start, APS/SPK Released, Duration, Contract Amount
  - Project Management: Commence Date, End Contract, Actual Completion, Deviation, Current Site Progress
  - Handover: BAST-1, BAST-2
- CAPEX execution rule: if only one phase is provided, still ensure the same project exists in the other milestone parents with placeholder `-` values so Milestone Phase stays structurally complete.

- Project phase date-range mindset: first set a master project date range (`project_start_date` to `project_end_date`) as the container/guardrail; then split/segment the five milestone phases inside that range with their own phase start/end dates. Phase dates should stay inside the project range, avoid invalid overlaps when workflow is linear, and remain `-`/empty until provided. Natural-language input should normalize project range first, then map any provided phase ranges into the corresponding phase fields.
- Chart date-range accuracy rule: Project Gantt and S-curve project-level timelines must use the master `projects.start_date` to `projects.end_date` range exactly. Do not extend hover/axis labels to calendar week boundaries or fallback phase dates when master dates exist.

## Telegram Groups
- `-1003543183529` = Tech
- `-1003883437610` = Project Team
- `-1003746956793` = Data & Digital
- These are confirmed by Abe as the Telegram target groups to use for ClickUp/dashboard summary and reminder jobs.

## Interaction Rules
- Assistant identity/name preference: use **Projectia**; do not refer to yourself as Cici.
- If a task/project request is understandable from natural language or pipe-format, parse it cleanly and ask only one short clarification if a truly critical field is ambiguous.
- Do not repeatedly ask for confirmation when the data is already present.
- Strip misleading prefixes like `TASK |` or `PROJECT |` from titles when they are just command markers.
- Prefer explicit fields when present: `team`, `folder`, `list`, `assignee`, `pic`, `due`, `deadline`.
- Keep responses short when a task is straightforward.
- Abe wants meaningful day-to-day work/context written into `memory/YYYY-MM-DD.md` so specific progress and discussions can be recalled across sessions.
- Use `MEMORY.md` only for durable context: preferences, recurring rules, long-term project understanding, and decisions likely to matter again.
- Shared rule memory expectation: if Abe defines a workflow rule in DM/private chat, treat it as shared operational memory for the same project/system unless it is explicitly marked private or person-specific. Do not act like the rule was only local to that chat when the same workflow comes up in group sessions.
- Delete semantics rule: when Abe says to delete project data/phase data, interpret that as actual record deletion where feasible, not merely clearing fields/nulling values, unless Abe explicitly asks to keep the row and only empty the contents.
- For project/CAPEX input over Telegram, do NOT force rigid templates. Abe should be able to write in natural language casually, and the agent should infer whether the message is creating/updating project summary data or S-curve execution data.
- For ambiguous project/CAPEX updates, ask at most one short clarification only when a critical field is truly unclear (for example: unit ambiguity, duplicate project names, unclear week period, or unclear whether to create a new project vs update an existing one).
- If a CAPEX input includes dates but no explicit phase, default it to Operational Brief first instead of assuming Project Management.
- Project linking rule: identify projects primarily by `unit + normalized project name`, then link all detailed records to the resolved `project_id`.
- CAPEX/project data model has two linked layers: (1) summary milestone tracking in `projects` + `project_phases`, and (2) detailed execution/S-curve tracking inside the same project.
- S-curve data should not be modeled as fake milestone phases. It represents detailed in-project work breakdown, weighted items, time-bucketed plan vs actual progress, and cumulative progress.
- Prefer a lean S-curve schema: keep existing `projects` and `project_phases`, and add only the minimum needed detailed tables (target design: one table for S-curve items/work breakdown linked to `project_id`, and one table for per-period planned/actual progress linked to those items) instead of over-normalizing into many low-value tables.
- When receiving natural-language S-curve updates, infer whether the message is about: (a) summary/milestone dates, (b) S-curve structure/work items and weights, or (c) S-curve planned/actual progress by period.
- CAPEX/project workflow now includes phase-based ownership: each of the 5 milestone phases has its own PIC/account/role, and that phase ownership matters for who is allowed to create/update data.
- Project Details UI rule: do not show a single project-level PIC in Project Description. Each phase has its own PIC, and the phase card's Assigned By value should be sourced from that same phase-specific PIC so each phase can show a different responsible person.
- Audit log rule: Telegram/Project Team project updates should create `project_change_logs` entries when the project can be resolved, so updates are visible in the Project Details Audit Log.
- Project input is not just raw data capture; it must respect workflow authority. Example mental model: a Project Management PIC can submit project timing plus detailed S-curve/task breakdown relevant to that phase.
- Approval layer is required before vendor-originated input becomes final. Reason: vendors may participate in group chats with PICs, and vendor input should not auto-commit directly into the authoritative project records.
- Vendor governance rule: vendor messages in groups should be treated as proposed updates pending PIC review/approval, not as automatically trusted project updates.
- Vendor governance rule: vendors should also not be allowed to bypass approval by DMing direct input that auto-writes to the project system. Direct vendor input should remain gated by approval unless explicitly changed later.
- Preferred approval model: PIC can review vendor-submitted updates first, then approve/reject/revise before the system treats those updates as final project data.
- Approval messaging rule: when vendor-originated input is detected, the system should notify the relevant PIC with a concise review summary: who submitted it, which unit/project/phase it appears to affect, what structured values were extracted, and an invitation to approve / revise / reject.
- Approval routing rule: infer the responsible PIC primarily from the affected phase. Example: schedule/site progress/sub-task execution usually routes to Project Management PIC; tender/SPK/contract routes to Project Control PIC; design dates/drawings route to Design PIC.
- Final-write rule: vendor-originated data should only become authoritative project data after PIC approval (or PIC revision then approval). Rejected vendor input should remain as history/audit but not overwrite final project records.
- Abe’s desired project-input behavior: when a project update/creation includes attachment files (photos/docs) in chat, the system should treat those files as project attachments linked to the resolved project record, ideally visible in the dashboard Project Details attachment section.
- The live dashboard now has attachment plumbing added for project details: `/api/projects/[id]` loads `project_attachments`, Project Details renders them, and the unified CAPEX/project ops flow attempts to persist inbound attachment metadata by resolving the target project from `unit + normalized project name`.
- Important caution to remember: this attachment flow has been verified at DB/API/UI level, but not yet end-to-end from a real Telegram/project-group attachment message after deployment. Do not overclaim that every inbound file is safely linked until that live chat payload has been tested.
- Safe response rule for future project/group chats: if Abe sends a project update with files, treat them as intended project attachments and process them through the attachment path; confirm success carefully unless the resulting Project Details attachment entry has been checked.
