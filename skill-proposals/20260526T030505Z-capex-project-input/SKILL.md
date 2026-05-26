---
name: capex-project-input
description: "Normalize CAPEX/project input from Telegram into approved dashboard workflow."
---

# capex-project-input

Use this skill when a Telegram/group/private-chat message appears to create, update, review, or attach data to a CAPEX/project record in the ClickUp dashboard workflow.

## Source Context

Review `references/recall-context.md` before expanding this workflow. It contains the recall snippets used to draft this proposal.

## Workflow

1. Determine whether the message is:
   - project summary / milestone tracking
   - detailed S-curve structure
   - S-curve planned/actual progress
   - project attachment intent
   - vendor-originated proposed update
2. Resolve project identity primarily by `unit + normalized project name`.
3. If the input is summary-level CAPEX data, normalize to the canonical five-phase structure:
   - Operational Brief
   - Design
   - Project Control
   - Project Management
   - Handover
4. If dates are provided but no phase is explicit, default the summary write to Operational Brief.
5. Keep project-level date range separate from phase date segments. Project Gantt and S-curve timelines should use `projects.start_date` to `projects.end_date` exactly when master dates exist.
6. If only one phase is provided, ensure the same project remains structurally represented across the other milestone parents with placeholder `-` values where required by the workflow.
7. For attachment-bearing messages, treat files/photos/docs as intended project attachments for the resolved project, but confirm storage cautiously unless the Project Details attachment entry has been checked.
8. For vendor-originated input, do not write final project data directly. Route the parsed proposal to the relevant phase PIC for approve / revise / reject.
9. Ask at most one concise clarification when a critical field is truly ambiguous, such as duplicate project names, unclear unit, unclear week period, or create-vs-update ambiguity.
10. When an official update is executed and the project can be resolved, create an audit log entry so it appears in Project Details.
11. Write meaningful durable notes to `memory/YYYY-MM-DD.md` when the workflow changes or produces reusable context.

## Safety

- This is a proposal until approved into `skills/`; do not treat it as an active skill yet.
- Do not perform external writes, project writes, deploys, destructive actions, or authority-sensitive updates unless the user explicitly requested that action and required fields are clear.
- Vendor-originated data must remain proposed/pending until PIC approval.
- If source context conflicts with live files or current user instructions, prefer the newest explicit user instruction and document the conflict.

## Smoke Test Ideas

- Run recall for the trigger phrase and confirm the expected rule/source appears.
- Clear input: `Unit AME, project NEW GYM, received 12 Mei, budget 500jt` should normalize to Operational Brief and preserve other phases as placeholders.
- Ambiguous input: `update progress lobby 40% minggu ini` should ask one clarification if unit/project cannot be resolved.
- Vendor input: proposed site progress should route to Project Management PIC review instead of final write.
- Attachment input: file with clear unit/project should process as project attachment but avoid overclaiming UI visibility until verified.
