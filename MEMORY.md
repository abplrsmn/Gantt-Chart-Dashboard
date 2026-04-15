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
