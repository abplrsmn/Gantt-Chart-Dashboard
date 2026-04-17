# ?? ClickUp CAPEX Dashboard
*Operational Monitoring & Integration Command Center*

## ?? Overview
This project is a custom-built, full-stack Command Center tailored for CAPEX (Capital Expenditure) Project Management. It serves as a unified dashboard that bridges raw financial/planning data (Excel/CSV seeds) with live operational execution data from **ClickUp**.

Furthermore, the system is deeply integrated with **Google Workspace (Calendar & Chat)** and **Telegram (via OpenClaw)** to automate meetings, status updates, and critical deadline reminders.

---

## ?? Architecture
The platform leverages a modern, Serverless-first architecture:
- **Framework**: Next.js 16.2.3 (App Router)
- **Frontend**: React 18, Tailwind CSS, customized UI with Light-mode support.
- **Backend API**: Next.js Route Handlers (`src/app/api/*`)
- **Integrations**:
    - `ClickUp API v2` (Tasks, Lists, Webhooks, Custom Fields)
    - `Google APIs` (Calendar scheduling, GChat Webhooks for interactive messaging)
    - `OpenClaw API` (Telegram automated gateway)
- **Data Strategy**: Hybrid. It does not use a traditional relational database (RDBMS). Instead, it relies on real-time API aggregation (ClickUp) patched dynamically over local normalized seed JSON files (`data/capex-*`).

---

## ?? Core Workflows & Logic

### 1. The Data Merging Engine (`src/lib/capex.ts`)
Because ClickUp tasks often lack the comprehensive metadata present in initial planning documents, the app uses a **Reconciliation Workflow**:
- **Step A (Seed Load)**: Load base project mappings from `data/capex-summary.normalized.json`.
- **Step B (Live Tasks)**: Fetch live Tasks from specific ClickUp Lists (e.g., "CAPEX Gantt 2026").
- **Step C (Merge)**: Merge the two sources using common identifiers (`Task Name`, `Hotel Code`, or `Unit`).
- **Step D (Phase Calculation)**: The critical `resolvePhase` function determines a project's current architectural state (Design, Control, Project Management, Handover, Done) by first enforcing the *explicit Phase* defined from the Seed data, and if missing, calculating it based on historical start/end date milestones (e.g., "Bast 1" or "Commence Date" custom fields) from ClickUp.

### 2. Interactive Analytics (The Frontend)
- **CAPEX Gantt Monitor** (`/dashboard/capex-gantt`): Requests merged data from `/api/capex/projects`. Parses phase progression into a customized, color-coded Gantt timeline logic. Route cache is explicitly bypassed (`force-dynamic`) to ensure ClickUp updates reflect instantly.
- **Team Dashboards** (`/dashboard/team/[teamName]`): Dynamically routes and fetches ClickUp lists targeted to specific departments (e.g., Design, Civil, ME). Handles robust error states and mapping for large ClickUp task constraints.

### 3. AI Assistant & Automated Notification System
- **OpenClaw AI Integration**:
  The system utilizes OpenClaw not just as a dumb gateway, but to power an **AI Agent Assistant**. Through this integration, users can interact contextually via Telegram to check project statuses, pass & assign new operational tasks, and automatically request meeting schedules. The AI translates natural language chat commands into strict ClickUp/GCal API actions.
- **Telegram Reminder Engine** (`/api/capex/reminder`):
  Calculates if a project is "At Risk" (approaching or past its deadline). Forms a conversational summary and posts an HTTP payload to the OpenClaw gateway. Triggered via external Cron payloads or via manual API invoke.
- **GChat Integration & Smart Scheduling** (`/api/gchat/*`, `/api/meetings/*`):
  Listens to webhook interactions from Google Chat. Working alongside the AI, managers can trigger updates, confirm phases, or schedule GCal/Zoom meetings dynamically based on context directly from work chat interfaces.

---

## ?? Directory Structure Detailed

```text
/
+-- data/                       # Root data seeds
�   +-- capex-summary.normalized.json   # Background master mapper data
�   +-- project_normalized_presentable.csv
+-- docs/                       # Project documentation
�   +-- ENV_README.md           # Environment variable setup details
�   +-- capex-health-check.md   # Deployment health check guide
�   +-- ops-task-payload-matrix.md
+-- src/
�   +-- app/
�   �   +-- api/                # ?? BACKEND ROUTES
�   �   �   +-- capex/          # Merging logics, health checks & Telegram Reminders
�   �   �   +-- clickup/        # Live bidirectional ClickUp sync (Create/Update tasks)
�   �   �   +-- google/         # OAuth & Calendar Event creation
�   �   �   +-- meetings/       # Smart Zoom/Meet schedule builder
�   �   �   +-- gchat/          # Google Chat webhook endpoints
�   �   +-- dashboard/          # ??? FRONTEND ROUTES
�   �       +-- capex-gantt/    # Interactive timeline graphical UI
�   �       +-- team/           # Dynamic team specific tasks grid
�   �       +-- controls/       # Control panel
�   �       +-- alerts/         # Performance & alerts view
�   +-- components/             # Reusable React components (Gantt, Sidebar, Navs)
�   +-- lib/                    # ?? CORE BUSINESS LOGIC
�       +-- capex.ts            # Phase calculation & ClickUp + JSON Data Merger
�       +-- clickup.ts          # Core ClickUp API wrapper
�       +-- google.ts           # Core Google Auth & Calendar wrapper
+-- package.json
+-- eslint.config.mjs
+-- tsconfig.json
+-- next.config.ts
```

---

## ?? Development Setup

### Prerequisites
- Node.js 18+ (v20+ recommended)
- Valid ClickUp API Token & Team ID
- Valid Google Cloud Console credentials (for OAuth & Calendar API)
- OpenClaw API details (for Telegram integrations)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment Variables:**
   Refer to `docs/ENV_README.md` and populate your `.env` file:
   ```env
   CLICKUP_API_TOKEN="..."
   CLICKUP_TEAM_ID="..."
   OPENCLAW_WEBHOOK_URL="..."
   GOOGLE_CLIENT_ID="..."
   ```

3. **Run the Development Server:**
   ```bash
   npm run dev
   ```
   Dashboard is deployed and served locally at `http://localhost:3000/dashboard`

### Verification & Testing
- **Build check**: `npm run build` (Ensures server actions and dynamic routes pass compiler checks).
- **Trigger Application Reminder (Telegram)**:
  ```bash
  curl -X POST http://localhost:3000/api/capex/reminder -H "Content-Type: application/json" -d '{"dryRun":true, "daysAhead":7}'
  ```

---
*Architected and maintained for strict operational visibility and workflow automation.*
