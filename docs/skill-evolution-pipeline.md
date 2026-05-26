# Skill Evolution Pipeline

Projectia's skill evolution pipeline turns repeated lessons, corrections, and workflows into supervised local skills.

## Purpose

- Memory stores facts and context.
- Skills store repeatable procedures.
- The pipeline creates skill proposals from recall context, validates them, and only activates them after approval.

## Commands

Create a proposal:

```bash
node scripts/skill-evolution.js propose capex-project-input \
  --query "CAPEX project input natural language milestone vendor approval" \
  --description "Normalize CAPEX/project input from Telegram into approved dashboard workflow."
```

Validate a proposal:

```bash
node scripts/skill-evolution.js validate skill-proposals/<proposal>
```

List proposals:

```bash
node scripts/skill-evolution.js list
```

Approve a proposal into `skills/`:

```bash
node scripts/skill-evolution.js approve skill-proposals/<proposal>
```

## Guardrails

- Proposals live in `skill-proposals/` and are not active skills.
- Approval copies a validated proposal into `skills/<name>/`.
- Critical workflows such as deploys, project writes, vendor approval, and external messages should stay supervised.
- Every proposed skill should include source recall context and smoke test ideas.

## Current Test Proposal

- `skill-proposals/20260526T030505Z-capex-project-input`
- Status: proposed, not active
- Purpose: normalize CAPEX/project input from Telegram into the approved dashboard workflow.
