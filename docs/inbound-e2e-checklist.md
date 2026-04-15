# Inbound E2E Checklist (Telegram/WA -> ClickUp)

Use this checklist to verify live forwarding path from gateway to `/api/ops/task`.

## 1. Pre-check service health

- Ensure gateway service process is running.
- Ensure app API is reachable (local or deployed).
- Ensure ClickUp env vars are loaded:
  - `CLICKUP_API_TOKEN`
  - `CLICKUP_TEAM_ID`
  - `CAPEX_TARGET_SPACE_NAME` (optional default)
  - `CAPEX_TARGET_LIST_NAME` (optional default)

## 2. Confirm forwarding target

- Verify gateway forwards to the correct URL:
  - `POST /api/ops/task`
- Verify headers include `Content-Type: application/json`.

## 3. Validate payload shape from gateway

Gateway should send at least:

```json
{
  "text": "TASK | title=Test Forward | due=2026-04-20",
  "groupName": "IDEA Tech",
  "source": "whatsapp",
  "messageId": "optional",
  "conversationId": "optional"
}
```

Optional selectors that should be honored:

```json
{
  "team": "tech",
  "folder": "Engineering",
  "list": "Backend Sprint",
  "space": "IDEA"
}
```

## 4. Run 4 live test messages

- Test A (explicit list): `TASK | title=E2E explicit list | due=2026-04-20` + `list=Backend Sprint`
- Test B (project default): `PROJECT | title=Renovasi Lab | unit=SDN 1 | end=2026-05-01`
- Test C (project explicit override): `PROJECT | title=Renovasi Lab | unit=SDN 1 | list=Unit Projects`
- Test D (natural language fallback): `tolong buatin task deploy backend staging besok`

## 5. Verify API response contract

For successful execution expect:

- `success = true`
- `executed = true`
- `routing.source` available
- `task.id` and `task.url` returned
- `target.listId` returned

For missing title expect:

- `executed = false` and follow-up intent output

For invalid selector expect:

- HTTP `400` with target resolution error text

## 6. Verify ClickUp side effects

- Task created in expected list/folder/space.
- Assignee resolved correctly when provided.
- Due/start dates are correctly converted.

## 7. Observability checks

- Gateway log contains forward success event.
- App log contains request received and route selected.
- No silent fallback to wrong destination.

## 8. Rollback safety

If misrouting is detected:

- Temporarily disable forwarding from gateway.
- Keep `/api/ops/task` for manual API testing.
- Re-enable only after selector/path issue is fixed.
