# Aryaduta CAPEX Project Dashboard
*Full-stack Project Monitoring & Operations Command Center — Aryaduta Hotels Group*

---

## Overview

A custom-built, full-stack **CAPEX (Capital Expenditure) Project Management Dashboard** built for **Aryaduta Hotels Group, IDEA-Tech Division**. The system provides end-to-end visibility across all capital projects — from initial brief through design, procurement, execution, and final handover — with live data, interactive Gantt charts, S-curve tracking, and AI-assisted operations.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router, `force-dynamic`) |
| Frontend | React 19, Tailwind CSS 4 |
| Charts | Recharts, Chart.js, Three.js (3D) |
| Backend | Next.js Route Handlers (Node.js runtime) |
| Database | PostgreSQL (via `pg` connection pool) |
| Auth | Custom HMAC-SHA256 signed cookie token |
| Password | bcryptjs (cost 12) |
| Integrations | Google Calendar, Google Chat webhook, OpenClaw (Telegram AI gateway) |
| Icons | Lucide React |
| Date Utils | date-fns |

---

## Architecture

```
Browser / Telegram
      │
      ├─ Next.js App Router (pages + API routes)
      │       ├─ /dashboard/*          → React client pages
      │       └─ /api/*                → Server Route Handlers
      │
      ├─ middleware.ts                  → HMAC auth + role-based access
      │
      ├─ PostgreSQL (pg pool)          → primary data store
      │
      └─ External APIs
              ├─ Google Calendar       → meeting scheduling
              ├─ Google Chat webhook   → push notifications
              └─ OpenClaw gateway      → Telegram AI bot
```

---

## Authentication & Authorization

### Flow
1. User POSTs `email` + `password` to `/api/auth/login`
2. Server fetches user by email, runs `bcrypt.compare(password, hash)`
3. On success: creates HMAC-SHA256 signed cookie (`auth_token`, 30-day expiry)
4. Token format: `base64url(payload).hmac_sha256_hex`
5. `middleware.ts` verifies token on every request to `/dashboard/*` and selected `/api/*` routes

### Roles
| Role | Access |
|------|--------|
| `admin` | Full `/dashboard` access |
| `pm` | Limited to `/dashboard/projects/*` |

### Relevant Files
- `src/lib/auth.ts` — token encode/decode, `authenticateUser()`, `createAuthCookie()`
- `middleware.ts` — route protection, role-based redirect
- `src/app/api/auth/login/route.ts` — login handler
- `src/app/api/auth/logout/route.ts` — logout handler

---

## Database Schema

### Core Tables

#### `projects`
Primary project record.
```
id, project_code, project_name
unit_id → master_units
priority_id → master_priorities
current_phase_id → master_phases
overall_status_id → master_statuses
category_id → master_project_categories
start_date, end_date
overall_progress_pct, summary_brief, contract_amount
address, blocker_note, next_action_note
created_at, updated_at
```

#### `project_phases`
One row per phase per project (5 rows per project). Each phase has its own set of date columns:

| Phase | Start Column | End Column |
|-------|-------------|-----------|
| Operational Brief | `received_date` | `normalized_deadline_date` |
| Design | `start_design_date` | `design_approval_date` |
| Project Control | `tender_start_date` | `aps_spk_released_date` |
| Project Management | `commence_date` | `end_contract_date` |
| Handover | `bast_1_date` | `bast_2_date` |

Also carries: `progress_pct`, `notes`, `brief_text`, `actual_phase_completion_date`, `current_site_progress`, `deviation_days`, `budget_capex`, `phase_contract_amount`, `working_drawing_status`

#### S-Curve Tracking
```
project_tasks          — id, project_id, weight_pct
project_task_progress_periods — id, project_task_id, period_order,
                                period_start, planned_weight, actual_weight
```

#### Master / Lookup Tables
```
master_phases           — id, phase_code, phase_name, phase_order
master_priorities       — id, priority_code, priority_name, color_hex, level (1=Critical…4=Low)
master_statuses         — id, entity_type, status_code, status_label, color
master_units            — id, unit_code, unit_name
master_project_categories — id, category_code, category_name
master_roles            — id, role_name
master_people           — id, employee_code, full_name, nickname, department, job_title, email
master_acc              — id, person_id, email, password_hash, is_admin, role, is_active
```

#### Relational / Audit Tables
```
project_people          — id, project_id, phase_id, raw_person_name, raw_organization_name
project_change_logs     — id, project_id, entity_type, action_type, field_name,
                          old_value, new_value, change_summary, changed_by_name, created_at
chat_reminder_logs      — id, channel, target_type, reminder_type, message_body,
                          message_payload (jsonb), dedupe_key, run_key, is_simulated
```

---

## API Routes

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Validate bcrypt password, issue auth cookie |
| POST | `/api/auth/logout` | Clear auth cookie |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | (not listed — use gantt) |
| POST | `/api/projects` | Create project + auto-seed 5 phase rows + audit log |
| GET | `/api/projects/[id]` | Full project detail with all phase data |
| PATCH | `/api/projects/[id]` | Update single field (role-gated), writes audit log |
| DELETE | `/api/projects/[id]` | Delete project, best-effort audit log |
| GET | `/api/projects/gantt` | All projects with phase pivots + S-curve CTE |
| GET | `/api/projects/[id]/scurve` | S-curve data by period |
| GET | `/api/projects/[id]/audit` | Paginated change log |
| POST | `/api/projects/[id]/audit` | Manual audit log entry |
| GET | `/api/projects/[id]/attachments` | List file attachments |
| POST/DELETE | `/api/projects/[id]/attachments` | Add/remove attachment |
| GET | `/api/projects/[id]/people` | Team members on project |
| POST/DELETE | `/api/projects/[id]/people` | Assign/remove team member |

### Master Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/master/options` | Units, phases, priorities, statuses — auto-seeds defaults if missing |

### Operations & AI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ops/plan` | Parse free-text ops command → structured intent |
| POST | `/api/meetings/schedule` | Schedule Google Calendar event |
| POST | `/api/ai-telemetry` | Track AI model usage/cost |
| GET | `/api/reminder-logs/latest` | Latest reminder summary |

---

## Frontend Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/dashboard` | `page.tsx` | KPI cards, performance chart, active projects, reminder feed |
| `/dashboard/projects` | `projects/page.tsx` | Project list with date range filter |
| `/dashboard/projects/gantt` | `ProjectGanttDB` | Interactive Gantt chart (drag-to-reschedule, filters, S-curve) |
| `/dashboard/projects/list` | `projects/list/page.tsx` | Tabular project list |
| `/dashboard/projects/summary-matrix` | `ProjectSummaryMatrix` | Excel-style phase × project matrix with inline editing |
| `/dashboard/projects/[id]` | `projects/[id]/page.tsx` | Project detail — full edit, phase management, S-curve, audit |
| `/dashboard/projects/[id]/audit` | `audit/page.tsx` | Change audit log |
| `/dashboard/projects/[id]/weekly-progress` | `weekly-progress/page.tsx` | Weekly task completion tracking |
| `/dashboard/alerts` | `alerts/page.tsx` | Alert/notification dashboard |
| `/dashboard/performance` | `performance/page.tsx` | KPI & performance metrics |
| `/dashboard/team/[teamName]` | `team/[teamName]/page.tsx` | Team-specific task view |
| `/dashboard/controls` | `controls/page.tsx` | System controls & settings |

---

## Core Logic

### 1. Project Phase System

Every project has exactly **5 phases** in fixed order:

```
1. Operational Brief  →  2. Design  →  3. Project Control  →  4. Project Management  →  5. Handover
```

- Each phase stored as a separate row in `project_phases` with its own date columns
- `projects.current_phase_id` tracks active phase
- Phase creation is automatic: `POST /api/projects` inserts all 5 rows with `progress_pct = 0`
- Phase date columns are phase-specific (see schema above)

### 2. Gantt Chart Logic (`ProjectGanttDB.tsx`)

**Data flow:**
```
GET /api/projects/gantt
  └→ SQL: projects JOIN all 5 phase pivots + S-curve CTE
       └→ Each project row contains all phase dates + S-curve latest
            └→ Frontend builds visual segments per phase
```

**Phase bar rendering:**
- Each project renders multiple phase bars across the timeline
- Bar position: `(phaseStart - timelineStart) / totalDays * 100%`
- Bar width: `(phaseEnd - phaseStart) / totalDays * 100%`
- Drag-to-reschedule: mousedown → mousemove → PATCH `/api/projects/[id]` with new dates

**Progress calculation (fallback chain):**
1. Extract `XX%` from `current_site_progress` text
2. Keyword match: `"defect"→95`, `"finishing"→90`, `"resume"→60`, `"start"→10`, `"mobilization"→5`
3. Time-elapsed ratio: `(today − commence) / (end_contract − commence)` capped at 95%
4. `actual_phase_completion_date` exists → 100%

**Deadline risk:**
```
daysRemaining < 0   → overdue
daysRemaining ≤ 14  → near
else                → normal
```

**Today indicator:** Vertical red dashed line at `(today − timelineStart) / totalDays * 100%`. Clipped by `overflow-hidden` on the overlay container; sticky column uses `z-20` above overlay `z-10` and solid background to prevent bleed-through on scroll.

**Priority color config:**
```
CRITICAL → #ef4444   HIGH → #f97316   MID → #eab308   LOW → #22c55e
```

### 3. S-Curve (`/api/projects/gantt` CTE)

Window function accumulates `planned_weight` and `actual_weight` by `period_order`:

```sql
SUM(SUM(planned_weight)) OVER (PARTITION BY project_id ORDER BY period_order) AS target_progress
SUM(SUM(actual_weight))  OVER (PARTITION BY project_id ORDER BY period_order) AS actual_progress
```

Returns cumulative `target_progress`, `actual_progress`, and `progress_variance` for each project.

### 4. Summary Matrix (`ProjectSummaryMatrix.tsx`)

- Fetches same Gantt data from `/api/projects/gantt`
- Renders as wide horizontal table (min-width 2200px) with sticky Unit + Description columns
- Uses `border-separate border-spacing-0` (NOT `border-collapse`) to prevent sticky column rendering gaps
- All cells are inline-editable via `InlineCell` component → PATCH `/api/projects/[id]`
- Filters: Phase, Priority, text search (all derived from loaded data, no extra API call)

### 5. Audit Log

Every data change writes to `project_change_logs`:
- **Field**: `entity_type = 'project'` (required NOT NULL)
- **Who**: `changed_by_name` from `getAuthUserFromCookie()` → `user.fullName ?? user.email ?? 'System'`
- **What**: `field_name`, `old_value`, `new_value`, `change_summary`, `action_type`
- Action types: `project_created`, `project_updated`, `field_updated`, `phase_updated`, `progress_updated`, `deadline_delayed`, `deadline_accelerated`, `attachment_added`, `project_deleted`

---

## AI & Automation Layer

### NLP Intent Parser (`src/lib/ops-intent.ts`)

Zero-dependency regex-based NLP. Parses free-text commands in English and Bahasa Indonesia into structured `ParsedIntent` objects.

**Three parse strategies (in order):**
1. **Pipe format**: `TASK | title = X | deadline = Y | team = Z`
2. **Key-value block**: Multi-line `key: value` pairs
3. **Natural language**: Pattern-matching with Indonesian/English weekday and month normalization

**Output intents:** `meeting`, `task`, `project`, `unknown`

**Date parsing supports:** ISO dates, named dates (`hari ini`, `besok`, `lusa`), weekdays in EN/ID (`monday`/`senin`), full date strings (`15 Juni 2026`)

**Time parsing supports:** `HH:MM`, `jam 9 siang`, `nanti sore` → `16:00`, `nanti malam` → `19:00`

### Google Chat (`src/lib/gchat.ts`)
Simple webhook POST — sends `{ text }` to `GCHAT_WEBHOOK_URL`.

### OpenClaw / Telegram (`src/lib/openclaw.ts`)
HTTP POST to `OPENCLAW_WEBHOOK_URL` with `{ groupId, message }` and optional `x-api-key` header. Powers the Telegram AI agent that translates chat commands into ClickUp/GCal API actions using the system prompt defined in `docs/openclaw-system-prompt.md`.

### AI Telemetry (`/api/ai-telemetry`)
Tracks token usage and estimated cost across providers (Claude, GPT-4, DeepSeek) for OpenClaw agent sessions.

### Meeting Scheduling (`/api/meetings/schedule`)
`POST` with normalized meeting input → creates Google Calendar event. Uses `src/lib/meeting.ts` for timezone-aware datetime construction (`Asia/Jakarta`).

---

## Project Creation Workflow

```
User fills AddProjectModal
  └→ POST /api/projects
       ├─ Resolve unit_name → unit_id (ILIKE match on master_units)
       ├─ generateCode(name) → "ABC-2026-472" format
       ├─ INSERT projects (progress=0)
       ├─ INSERT 5 project_phases rows (all phases, progress=0)
       ├─ UPDATE phase date cols for selected current_phase
       ├─ UPDATE extra_phases dates if provided
       └─ INSERT project_change_logs (entity_type='project', action_type='project_created')
```

## Field Update Workflow

```
User edits field in project detail
  └→ PATCH /api/projects/[id] { field, value, change_summary }
       ├─ Lookup field in FIELD_MAP → { table, column, phaseId? }
       ├─ Capture old_value from DB
       ├─ UPDATE projects or project_phases
       └─ INSERT project_change_logs (entity_type='project', action_type='field_updated')
```

## Reminder Workflow

```
Cron / external trigger → POST /api/capex/reminder (or reminder-logs)
  └→ getDailyProjectSummary()
       └→ Buckets projects: handover / inProgress / nearDeadline / overdue
            └→ formatDailySummary() → markdown text
                 └→ sendOpenClawMessage() → Telegram group
                      └→ INSERT chat_reminder_logs (audit, dedupe_key)
```

---

## Environment Variables

Lihat `docs/ENV_README.md` untuk setup lengkap.

---

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 14+

### Install

```bash
npm install
```

### Database Setup

```bash
# Run schema scripts in scripts/ directory (in order):
# 1. create_master_acc.sql  — accounts table + admin seed
# 2. create_chat_reminder_logs.sql — reminder audit table

# Seed initial data
node seed_postgres.js
```

### Migrate Passwords (first run if upgrading from plaintext)

```bash
npm run migrate:pw
```

### Development

```bash
npm run dev
# → http://localhost:3000/dashboard
```

### Build

```bash
npm run build
npm run start
```

---

## Directory Structure

```
/
├── src/
│   ├── app/
│   │   ├── api/                    # Backend Route Handlers
│   │   │   ├── auth/               # login, logout
│   │   │   ├── projects/           # CRUD + gantt + scurve + audit + people + attachments
│   │   │   ├── master/options/     # Lookup data with auto-seed
│   │   │   ├── meetings/           # Google Calendar scheduling
│   │   │   ├── ops/plan/           # NLP intent parser
│   │   │   ├── ai-telemetry/       # AI usage tracking
│   │   │   └── reminder-logs/      # Reminder audit
│   │   └── dashboard/              # Frontend pages
│   │       ├── page.tsx            # Home / KPI dashboard
│   │       ├── projects/
│   │       │   ├── gantt/          # Interactive Gantt chart
│   │       │   ├── list/           # Tabular list
│   │       │   ├── summary-matrix/ # Excel-style matrix
│   │       │   └── [id]/           # Project detail + audit + weekly progress
│   │       ├── team/[teamName]/    # Team task view
│   │       ├── alerts/             # Alerts dashboard
│   │       ├── performance/        # KPI metrics
│   │       └── controls/           # System controls
│   ├── components/dashboard/       # Reusable React components
│   │   ├── ProjectGanttDB.tsx      # Full Gantt implementation
│   │   ├── ProjectSummaryMatrix.tsx # Summary matrix table
│   │   ├── SCurveCharts.tsx        # S-curve visualization
│   │   ├── AddProjectModal.tsx     # New project form
│   │   ├── AnimatedDropdown.tsx    # Reusable animated dropdown
│   │   └── DateRangePicker.tsx     # Date range filter
│   └── lib/                        # Core business logic
│       ├── auth.ts                 # Token auth, bcrypt
│       ├── db.ts                   # PostgreSQL pool singleton
│       ├── project-gantt.ts        # Gantt data model + phase windows
│       ├── project-summary.ts      # Daily summary buckets
│       ├── project-summary-format.ts # Markdown formatter
│       ├── project-summary-send.ts # Telegram/notification dispatch
│       ├── ops-intent.ts           # NLP parser (EN + ID)
│       ├── meeting.ts              # Meeting normalization
│       ├── gchat.ts                # Google Chat sender
│       └── openclaw.ts             # OpenClaw/Telegram sender
├── scripts/
│   ├── create_master_acc.sql       # Account table schema
│   ├── create_chat_reminder_logs.sql # Reminder audit schema
│   ├── migrate_pw_to_bcrypt.js     # One-time password migration
│   ├── memory-recall.js            # AI context memory indexer
│   └── skill-evolution.js          # Skill pipeline
├── docs/                           # Project documentation
├── data/                           # Normalized CSV exports
├── middleware.ts                   # Auth + RBAC middleware
├── next.config.ts
└── seed_postgres.js                # Database seeder
```

---

## Key Design Decisions

- **`border-separate border-spacing-0`** on summary matrix table — prevents sticky column rendering gaps that occur with `border-collapse` + `position: sticky`
- **`z-20` on sticky columns** vs `z-10` on Gantt overlay — prevents today indicator line from bleeding through sticky column during horizontal scroll
- **`overflow-hidden` on Gantt overlay container** — clips any absolutely-positioned children (today line, range indicators) at the timeline boundary
- **Solid backgrounds on sticky cells** — semi-transparent backgrounds allow Gantt bars and row highlights to show through on scroll; all sticky elements use fully opaque backgrounds
- **`force-dynamic`** on all API routes — bypasses Next.js route cache so ClickUp/DB updates reflect instantly
- **`SET jit = off`** on Gantt query connection — PostgreSQL JIT compilation adds seconds of overhead for this type of wide dashboard JOIN; disabling it drops latency to milliseconds
- **`entity_type = 'project'`** required on `project_change_logs` and `master_statuses` — both tables have NOT NULL constraints; omitting this field silently fails the INSERT

---

*Built by Abraham Pilar Osman — IDEA-Tech Division, Aryaduta Hotels Group*
*Internship project, Feb–Jul 2026*
