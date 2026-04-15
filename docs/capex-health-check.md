# CAPEX Health Check Endpoint

Use this endpoint to diagnose CAPEX list fallback behavior in deployed environments.

## Endpoint

- `GET /api/capex/health`

## What it returns

- Effective CAPEX config used by runtime:
  - `capexTargetSpaceName`
  - `capexTargetListName`
- Whether ClickUp credentials are configured:
  - `clickupTeamIdConfigured`
  - `clickupTokenConfigured`
- Resolved target list (when successful)
- Debug scan output:
  - Spaces searched
  - Match count per space
  - Exact candidate matches found

## Why this helps

It tells you if deploy fails because:

- env values differ from local
- preferred space does not exist
- list exists but under another space/folder
- token/team config is missing

## Quick checks

1. Open deployed URL: `/api/capex/health`
2. Confirm `clickupTokenConfigured = true` and `clickupTeamIdConfigured = true`
3. Confirm `capexTargetListName` equals expected ClickUp list name
4. Check `debug.matches` for where the list was found
