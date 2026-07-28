# Gantt Chart Dashboard

Gantt Chart Dashboard is a web application for planning work, tracking progress, and keeping a team aligned. It gives everyone one shared place to see projects, schedules, responsibilities, updates, and possible delays.

You do not need to be a project-management expert to use it. Create a project, add its dates and current stage, then use the dashboard to see what is on track and what needs attention.

## What problem does it solve?

When a team manages work through separate spreadsheets, chats, and documents, it is hard to answer simple questions:

- What is currently being worked on?
- Which projects are close to their deadline?
- Who is involved in each project?
- Is the real progress matching the plan?
- What changed since the last update?

This dashboard brings those answers together in one place.

## Main features

### Visual project timeline

The Gantt Chart displays each project on a timeline. You can quickly see its start date, target end date, active stage, priority, and whether it is close to or past its deadline. Dates can also be updated directly from the dashboard.

### Project details in one place

Each project has its own detail page for information such as:

- Project name, code, location, and priority
- Current stage and overall status
- Start date, target date, and actual progress
- Team members and stakeholders
- Notes, blockers, next actions, and supporting files
- Change history

### Flexible project stages

The dashboard starts with five common stages:

`Operational Brief → Design → Project Control → Project Management → Handover`

You can manage stages, priorities, statuses, units, and people from **Master Setup**. This makes the dashboard adaptable to different kinds of teams and projects.

### S-Curve progress tracking

S-Curve compares planned progress with actual progress over time. It helps the team spot when a project is falling behind its expected pace.

Progress can be entered manually or imported from a supported Excel schedule file.

### Helpful dashboard views

The application includes several ways to review work:

| Page | What it helps you do |
| --- | --- |
| Dashboard | Get a quick overview of active projects, progress, and important updates. |
| Projects | Browse and search all projects. |
| Gantt Chart | View the schedule of all projects on one timeline. |
| Summary Matrix | Compare project information in a wide table. |
| Performance | Review project KPI and performance information. |
| Alerts | Find projects that may need attention. |
| Weekly Report | Review weekly progress and priorities. |
| Team | View work by team or department. |
| Chat | Discuss work internally and ask the built-in AI assistant about dashboard data. |

### Team, files, and activity history

Add people to a project, attach supporting documents, and keep notes in the project page. Important updates are recorded in the activity history so the team can understand what changed and when.

## A simple workflow

1. Create a project and enter its basic information.
2. Select the stage that is currently active.
3. Add the planned dates, priority, team members, and notes.
4. Update progress and dates whenever work changes.
5. Review the Dashboard, Gantt Chart, Alerts, and Weekly Report regularly.
6. Use the activity history when you need to check past changes.

## Technology

The dashboard is built with:

- Next.js and React for the web application
- TypeScript for maintainable code
- PostgreSQL for project data
- Tailwind CSS for the interface
- Recharts and Chart.js for charts
- Optional Google Calendar, Google Chat webhook, and Gemini AI integrations

## Run it locally

### Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer

### 1. Install dependencies

```bash
npm install
```

### 2. Create your environment file

Create a file named `.env` in the project root. It contains private settings such as database access and API keys. Do not upload this file to GitHub.

At minimum, configure your database and authentication secret:

```env
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=gantt_dashboard
AUTH_SECRET=replace_with_a_long_random_value
```

Optional integrations use additional variables, such as `GEMINI_API_KEY`, `GCHAT_WEBHOOK_URL`, and Google Calendar credentials.

### 3. Prepare the database

The `scripts/` folder contains SQL and migration scripts for the database. Run the scripts required by your environment before starting the application.

### 4. Start the dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Useful commands

```bash
npm run dev          # Start local development
npm run build        # Create a production build
npm run start        # Run the production build
npm run lint         # Check code style and common issues
npx tsc --noEmit     # Check TypeScript types
```

## Security notes

- Keep passwords, API keys, and database credentials in `.env` or a secure secret manager.
- Never commit `.env` files, private documents, or sensitive user data.
- Use strong passwords for dashboard accounts.
- Review access permissions and file-sharing rules before making the dashboard public.

## Project structure

```text
src/
  app/          Pages and API routes
  components/   Reusable interface components
  lib/          Database, authentication, and application logic
scripts/        Database setup and migration scripts
public/         Static files
docs/           Additional project documentation
```

---

Built to make project schedules easier to see, understand, and manage.
