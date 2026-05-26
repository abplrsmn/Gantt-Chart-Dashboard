# Recall Context
Query: CAPEX project input natural language milestone vendor approval attachment audit log
Generated: 2026-05-26T03:05:05.913Z

## 1. Interaction Rules
Source: MEMORY.md:63 (long-term-memory, score 34.22)

- Project input is not just raw data capture; it must respect workflow authority. Example mental model: a Project Management PIC can submit project timing plus detailed S-curve/task breakdown relevant to that phase. - Approval layer is required before vendor-originated input becomes final. Reason: vendors may participate in group chats with PICs, and vendor ...

## 2. Vendor approval model
Source: OPS_STATE.md:102 (ops-state, score 26.17)

### Vendor approval model - Vendors may provide updates, but vendor-originated input must not auto-write into authoritative project data. - This rule applies both in group chats and direct messages; vendor DM must not bypass approval. - Vendor input should be treated as a proposed update pending PIC review. - When vendor-originated input is detected, notify ...

## 3. 2026-05-13.md
Source: memory/2026-05-13.md:24 (daily-memory, score 23.52)

...esign. Updated live DB: PR/Operational Brief completed/progress 100, Design in_progress/progress 0, project current_phase_id=2 and overall_progress_pct=10; added audit log and verified `/api/projects/250`. - Abe changed `ALV - Renovasi Lobby Hotel` priority to Critical. Updated live DB `projects.priority_id` to CRITICAL, added audit log, and verified `/api/p...

## 4. Data model
Source: OPS_STATE.md:78 (ops-state, score 23.15)

### Data model - Project data has 2 linked layers: - Chart date-range accuracy rule: Project Gantt and S-curve project-level timelines must use the master `projects.start_date` to `projects.end_date` range exactly. Do not extend hover/axis labels to calendar week boundaries or fallback phase dates when master dates exist. 1. summary milestone tracking (`proj...

## 5. 2026-04-23.md
Source: memory/2026-04-23.md:1 (daily-memory, score 22.85)

- Established CAPEX chat-input rule for ClickUp dashboard: normalize natural-language project input into a fixed "versi rapi" structure. - Canonical CAPEX "versi rapi" format now remembered: - Unit - Project Name - Operational Brief: Brief, Received Date, Budget/CAPEX - Design: Start Design Date, Design Approval, Duration, Brief, Working Drawing - Project Co...

## 6. Interaction Rules
Source: MEMORY.md:54 (long-term-memory, score 22.66)

- If a CAPEX input includes dates but no explicit phase, default it to Operational Brief first instead of assuming Project Management. - Project linking rule: identify projects primarily by `unit + normalized project name`, then link all detailed records to the resolved `project_id`. - CAPEX/project data model has two linked layers: (1) summary milestone tra...
