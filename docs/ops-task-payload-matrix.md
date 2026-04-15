# Ops Task Payload Matrix (Telegram/WA -> /api/ops/task)

This matrix validates parser + router + target resolver behavior for real chat payloads.

## Required inbound fields

- `text` or `message`: command/body text.
- Optional metadata: `groupName`, `chatTitle`, `group`, `source`, `messageId`, `conversationId`.
- Optional explicit target selectors (top-level or `target`/`context`): `team`, `folder`, `list`, `space`.

## Routing precedence

1. Explicit selectors (`list`/`folder`/`space`) from payload or command.
2. PROJECT + `unit` -> CAPEX default.
3. Group/keyword rules.
4. Intent team fallback.
5. System fallback (`tech`).

## Matrix

### Case 1 - TASK with explicit list in payload

Payload:

```json
{
  "message": "TASK | title=Fix API timeout | due=2026-04-18",
  "groupName": "IDEA Tech",
  "source": "whatsapp",
  "list": "Backend Sprint"
}
```

Expected:

- `routing.source = explicit-target`
- `target.listName = Backend Sprint`
- Should not route to CAPEX.

### Case 2 - TASK with explicit folder + space in command

Payload:

```json
{
  "text": "TASK | title=Update KPI deck | folder=Data Team | space=IDEA | due=2026-04-20",
  "source": "telegram"
}
```

Expected:

- `routing.source = explicit-target`
- Resolver searches folder `Data Team` under space `IDEA`.

### Case 3 - PROJECT with unit only

Payload:

```json
{
  "text": "PROJECT | title=Renovasi Lab IPA | unit=SDN 1 | progress=25% | end=2026-05-01",
  "chatTitle": "Project Monitoring"
}
```

Expected:

- `routing.source = project-default`
- `routing.useCapexDefault = true`
- Task routed to CAPEX default list.

### Case 4 - PROJECT with explicit list override

Payload:

```json
{
  "text": "PROJECT | title=Renovasi Lab IPA | unit=SDN 1 | list=Unit Projects",
  "team": "tech"
}
```

Expected:

- `routing.source = explicit-target`
- `routing.useCapexDefault = false`
- Explicit `list` wins over CAPEX default.

### Case 5 - Plain natural language + team fallback

Payload:

```json
{
  "text": "tolong buatin task deploy backend staging hari ini",
  "groupName": "IDEA Tech"
}
```

Expected:

- Parsed as task.
- No explicit selector.
- Routed by keyword/group/intent to technical team target.

### Case 6 - Missing title

Payload:

```json
{
  "text": "TASK | due=2026-04-19",
  "source": "whatsapp"
}
```

Expected:

- `executed = false` with follow-up from parser.
- No task created.

### Case 7 - Invalid explicit target

Payload:

```json
{
  "text": "TASK | title=Test bad route",
  "folder": "Folder Yang Tidak Ada",
  "space": "IDEA"
}
```

Expected:

- HTTP 400.
- Error contains target resolution detail (`not found` / `unable to resolve`).

## Quick manual test command (PowerShell)

```powershell
$payload = @{
  text = "TASK | title=Fix API timeout | due=2026-04-18"
  groupName = "IDEA Tech"
  list = "Backend Sprint"
  source = "whatsapp"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/ops/task" -Method POST -ContentType "application/json" -Body $payload
```
