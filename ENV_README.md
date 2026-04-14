# Environment Variables Guide

Copy `.env.example` to `.env.local` and fill in the secrets from your providers.

## Required
- `CLICKUP_API_TOKEN`
- `CLICKUP_TEAM_ID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_REFRESH_TOKEN`
- `GCHAT_WEBHOOK_URL`

## OpenClaw / telemetry
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `OPENCLAW_GATEWAY_AUTH_TOKEN`

## Optional
- `NEXT_PUBLIC_APP_URL`
- `CAPEX_REFERENCE_TODAY`
- `CAPEX_REFERENCE_WINDOW_START`
- `CAPEX_REFERENCE_WINDOW_END`

## Notes
- Never commit `.env`, `.env.local`, or other secret files.
- `.env.example` is safe to commit.
- If you change secrets, restart PM2 / rebuild the app.
