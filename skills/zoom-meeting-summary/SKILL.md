---
name: zoom-meeting-summary
description: Summarize Zoom meetings from transcript text, exported chat, pasted notes, or meeting recap text. Use when asked to create a concise meeting summary, extract action items, capture decisions, identify follow-ups, or turn meeting discussion into intern-report style notes. Useful for Zoom transcript cleanup, executive summaries, task lists, and structured post-meeting writeups.
---

# Zoom Meeting Summary

Summarize Zoom meeting material into clear, structured notes. Prefer concise outputs unless the user asks for detailed minutes.

## Inputs this skill handles

Use this skill when the user provides any of the following:
- raw Zoom transcript text
- Zoom meeting recap text
- exported Zoom chat
- pasted meeting notes
- mixed transcript + chat + notes

If the user provides audio/video instead of text, first obtain or generate a transcript before summarizing.

## Default output

Unless the user specifies another format, produce:
1. **Meeting summary** — 1 short paragraph
2. **Key decisions** — bullet list
3. **Action items** — bullet list with owner if known
4. **Open questions / follow-ups** — bullet list

If the content is thin or informal, say so briefly instead of inventing details.

## Workflow

### 1. Inspect the source material

Identify what was provided:
- transcript only
- chat only
- notes only
- combined materials

Look for:
- meeting topic
- participants or speakers
- explicit decisions
- tasks, deadlines, and owners
- unresolved questions

### 2. Clean the material mentally before summarizing

Normalize obvious transcript noise:
- remove filler repetition
- ignore false starts unless meaning depends on them
- collapse duplicate statements
- ignore greetings/small talk unless relevant
- treat auto-transcription mistakes cautiously

Do not over-clean to the point of changing meaning.

### 3. Extract the important substance

Prioritize:
- decisions made
- assigned tasks
- blockers or risks
- next steps
- timeline mentions
- unresolved items

De-prioritize:
- banter
- repeated acknowledgements
- side chatter with no consequence

### 4. Format based on user intent

Match the output style to the request:
- **quick summary** → short paragraph + top bullets
- **meeting minutes** → structured sectioned notes
- **action-oriented summary** → emphasize tasks, owners, deadlines
- **intern report / daily log** → formal, worklog-friendly prose
- **executive summary** → concise, outcome-focused, low detail

## Output patterns

### Short summary

Use when the user wants something quick.

```markdown
**Summary**
Short paragraph.

**Action items**
- Item
- Item
```

### Standard structured summary

```markdown
**Meeting summary**
Short paragraph.

**Key decisions**
- Decision

**Action items**
- Owner — task (deadline if known)

**Open questions / follow-ups**
- Item
```

### Intern report style

Use a more formal tone and convert the meeting into work activity language.

```markdown
During today's Zoom meeting, the team discussed ...
Key points included ...
The agreed follow-up actions were ...
```

Keep it factual and professional.

## Rules

- Do not invent owners, deadlines, or decisions.
- If attribution is uncertain, say `owner not specified`.
- If a statement sounds tentative, mark it as tentative rather than final.
- If multiple speakers disagree and no resolution appears, record it as an open issue.
- If the transcript is messy, mention uncertainty briefly.
- Preserve important technical terms, names, and project labels.

## Handling speaker attribution

If speaker labels exist, use them when useful.
If labels are missing or unreliable:
- avoid fake attribution
- summarize by content instead of by speaker

Only produce speaker-by-speaker notes when the user explicitly asks.

## Handling low-quality transcripts

When the transcript is noisy:
- rely on repeated consistent ideas
- avoid quoting dubious phrases
- summarize at a slightly higher level
- mention that the transcript may contain recognition errors

## Optional deeper outputs

Provide these only when asked, or when clearly useful:
- speaker-by-speaker recap
- chronological minutes
- risks/blockers section
- decisions log
- task table rewritten as bullets if tables are awkward for the surface
- polished follow-up message or email draft

## References

If this skill grows, store format examples or templates under `references/` and keep this file concise.
