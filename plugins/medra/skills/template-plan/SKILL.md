---
name: template-plan
description: Template for medra/changes/<change>/plan.md — the technical approach of a full-track change, its Constitution Check, test strategy and decisions. Filled by the author during plan and approved at the plan gate.
user-invocable: false
---

# Skill: Template — Plan

## Purpose

The plan decides how a full-track change satisfies its approved deltas, and proves the approach against the constitution before any task is written. The author fills it during plan. The author decomposes tasks from it, the implementer follows its test strategy and decisions, and the reviewer judges it against the constitution and the deltas. A later change that MODIFIES one of these requirements reads its `## Decisions`, through `last_changed_by`, to learn why the design is what it is.

## Placement

| Item | Value |
|---|---|
| Path | `medra/changes/<change>/plan.md`, plus `contracts/<name>.<ext>` when an interface is defined or changed (OpenAPI, JSON Schema, protobuf, event schemas) |
| Lifecycle | draft → approved (plan gate) → archived with the change |
| Exists only | on the full track |

## Structure

Anchored. The six anchors are mandatory and stay in order: Summary, Constitution Check, Complexity Tracking, Test Strategy, Decisions, with the title first. Freehand sections go between Test Strategy and Decisions. Copy `${CLAUDE_SKILL_DIR}/template.md` to the placement path, fill the anchors, then compose the freehand body.

## Sections

### Plan: change-name

The title, using the exact change name.

### Summary

**Why:** reviewers and the tasks step get the whole approach at a glance.

**Fill rules:** write 3–6 sentences covering what is built, where it lives, and how it satisfies the delta requirements, citing their IDs.

### Constitution Check

**Why:** the gate. One row per live article proves the plan was checked against every principle.

**Fill rules:**
- Write exactly one row per live article from the context pack, with the article's gate question copied verbatim.
- `pass` needs evidence pointing to this plan. `n/a` needs a reason. `fail` needs a Complexity Tracking row.

**Example:** `| III | Does every scenario map to a test task ordered before its implementation? | pass | Test Strategy maps AUTH-004.S1–S3; tasks will order [TEST] first |`

### Complexity Tracking

**Why:** an accepted violation becomes an explicit, justified decision instead of a silent drift.

**Fill rules:** write "None." when every article passes. Otherwise write one row per `fail`: the violation, the justification, and why the simpler compliant alternative was rejected.

### Test Strategy

**Why:** the implementer's test map, and the source of the `[TEST]` tasks.

**Fill rules:**
- Name the focused test command and the framework.
- Map every scenario ID in the deltas to one level (contract → integration → e2e → unit, from most to least external) and to a test location.
- When `testing.mode` is `none`, write `No automated tests.` with the reason, and describe the manual verification instead.

### Decisions

**Why:** future changes to these requirements read this section first, through `last_changed_by`, so rejected alternatives are not proposed again.

**Fill rules:** write one `### D-NN` per consequential choice, each with Choice, Alternatives and Rationale. A choice is consequential when reversing it would rewrite more than one task.

**Example:**

```markdown
### D-02: Store reset tokens hashed

**Choice:** SHA-256 hash of the token in `reset_tokens`, raw token only in the email.
**Alternatives:** Raw token in the table; signed JWT with no storage.
**Rationale:** A table dump must not grant account access. A JWT cannot be revoked early (AUTH-005).
```

### Freehand body

Between Test Strategy and Decisions, add a `##` section only for what this change needs: architecture, data model, interfaces, migration, rollout, or research. Each section earns its place by containing a decision or a constraint the tasks depend on. Point at `contracts/` files instead of inlining schemas.

## Writing Standards

- **Inside the fence.** Plan only what the approved deltas and the proposal's In scope require. Record extra work as a new proposal idea instead of planning it.
- **Grounded.** Name only the paths, modules and dependencies you verified in the codebase.
- **Bounded.** Aim for under 150 lines. Schemas and long examples go in `contracts/`.
- **Language.** Prose follows `medra/config.yaml`. Anchor headings, table headers, `pass`, `fail`, `n/a` and the `**Choice:**`, `**Alternatives:**` and `**Rationale:**` labels stay in English.

## Quality Checklist

- [ ] All six anchors are present, in order, and freehand sections sit only between Test Strategy and Decisions.
- [ ] The Constitution Check has exactly one row per live article, and every `pass` cites evidence.
- [ ] Every `fail` has a Complexity Tracking row, and Complexity Tracking reads "None." when there is no fail.
- [ ] The Test Strategy maps every delta scenario ID to a level and a location, or states `No automated tests.` with a reason.
- [ ] Every Decision has Choice, Alternatives and Rationale.
- [ ] Every path or module named was checked against the codebase.
- [ ] Nothing in the plan exceeds the proposal's In scope.
- [ ] `medra validate <change> --stage plan` exits `0`.
