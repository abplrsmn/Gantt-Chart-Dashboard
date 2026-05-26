---
name: skill-evolution
description: "Propose, validate, review, and approve supervised Projectia skills from recurring workflows or corrections."
---

# Skill Evolution

Use when Abe asks Projectia to adapt, turn a recurring workflow into a skill, make behavior more consistent, or implement a Mahoraga-style learned procedure.

## Workflow

1. Use recall to gather the smallest relevant source context.
2. Create a proposal, not an active skill, unless the user explicitly approves activation:
   - `npm run skill:evolve -- propose <name> --query "<recall query>" --description "<trigger description>"`
3. Inspect and edit the proposed `SKILL.md` so it is concrete, lean, and specific to the workflow.
4. Validate the proposal:
   - `node scripts/skill-evolution.js validate skill-proposals/<proposal>`
5. Smoke-test with at least one clear case and one ambiguous case.
6. Ask Abe before approving critical skills into `skills/`.
7. If approved:
   - `node scripts/skill-evolution.js approve skill-proposals/<proposal>`

## Safety

- Memory stores facts; skills store procedures.
- Critical workflows remain supervised until explicitly approved.
- Critical includes deploys, external messages, project writes, vendor approval routing, auth/session work, and destructive operations.
- Keep `SKILL.md` short. Move source snippets to `references/`.
- Every proposal should preserve its source recall context.

## Validation

- `node scripts/skill-evolution.js validate <proposal-or-skill-dir>`
- `npm run skill:evolve:list`
