---
name: template-proposal
description: Template for docs/changes/<change>/proposal.md — why a change exists, its scope fence, its track and the capabilities it touches. Filled by the author during propose and approved at the proposal gate.
user-invocable: false
---

# Skill: Template — Proposal

## Purpose

The proposal states why a change is worth making and draws its boundary before any design. The author fills it during propose, together with the deltas. Humans approve it at the proposal gate and in pull requests. The author's plan and tasks stay inside its scope fence, and the reviewer checks scope creep against it. Its track decides whether a plan is written at all.

## Placement

| Item | Value |
|---|---|
| Path | `docs/changes/<change>/proposal.md` |
| Lifecycle | draft → approved (proposal gate) → archived with the change |
| Naming | The change name is kebab-case and starts with a verb (`add-password-reset`), validated by `medra new` |

## Structure

Fixed. Copy `${CLAUDE_SKILL_DIR}/template.md` to the placement path, then fill it section by section. A section that does not apply says so in one line.

## Sections

### Proposal: change-name

The title, using the exact change name.

### Why

**Why:** reviewers approve the problem before the solution, and the archive index keeps the first sentence forever.

**Fill rules:** write 2–5 sentences: who has the problem, what it costs them, and why now. The first sentence must stand alone. Leave the solution to What Changes.

**Example:** "Locked-out users can only regain access by emailing support, which takes 2 days on average. Support handles about 40 such tickets a week."

### What Changes

**Why:** the behavior summary a non-author reads before opening the deltas.

**Fill rules:** write one bullet per behavior change, from the user's point of view. Implementation belongs in the plan.

### Scope

**Why:** the fence that the plan, the tasks and every review hold the change to.

**Fill rules:** write both In scope and Out of scope. Give every out-of-scope item its reason, and name adjacent work a reviewer might expect to see.

### In scope

The deliverables, one bullet each.

### Out of scope

The exclusions, one bullet each with its reason. Example: "SMS delivery of reset links — email covers 98% of users; revisit with the 2FA work."

### Track

**Why:** it decides whether a plan and separate tasks gate follow.

**Fill rules:** write `fast` or `full`, matching `.medra.yaml`. The Rationale names which classification criteria fired, or that none did.

### Capabilities

**Why:** it binds the proposal to its delta files. The CLI cross-checks this table against them.

**Fill rules:** write one row per delta file. Operation is `new`, `modified` or `removed`, and Requirements lists the IDs, or `—` for a new capability.

### Impact

**Why:** reviewers spot blast radius before approving.

**Fill rules:** fill all four lines (code, interfaces, data, dependencies). Write "None." where nothing changes, and never delete a line.

### Open Questions

**Why:** the readiness gate. Validation fails while any marker remains in the proposal or its deltas.

**Fill rules:** list each open `[NEEDS CLARIFICATION: …]` marker while drafting. At the gate the section reads "None."

## Writing Standards

- **Markers instead of guesses.** Write `[NEEDS CLARIFICATION: {specific question}]` wherever the intent leaves a behavior open, and resolve every marker with the user before the gate.
- **Stands alone.** A teammate who missed the conversation must be able to judge the proposal. Write nothing like "as discussed".
- **Bounded.** The whole proposal fits on one screen: about 60 lines. Detail goes in the deltas and the plan.
- **Language.** Prose follows `docs/config-flow.yaml`. Headings, `**Track:**`, `**Rationale:**` and the marker syntax stay in English.

## Quality Checklist

- [ ] Every heading in the template is present, in order.
- [ ] The first sentence of Why stands alone and names who has the problem.
- [ ] Every Out of scope item carries a reason.
- [ ] The Track equals the change's track, and the Rationale names the criteria.
- [ ] The Capabilities rows and the delta files match one-to-one, with matching operations.
- [ ] All four Impact lines are filled.
- [ ] Open Questions reads "None." and no marker remains anywhere in the change.
- [ ] `medra validate <change> --stage proposal` exits `0`.
