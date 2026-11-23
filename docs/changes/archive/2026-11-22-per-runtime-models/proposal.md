# Proposal: per-runtime-models

## Why

Teams using both **Claude Code** (`haiku`, `sonnet`, `opus`) and **Google Antigravity** (`flash_lite`, `flash`, `pro`) in the same repository cannot configure distinct per-tool model tiers in `docs/config-flow.yaml`: a single flat `models:` map forces one runtime to fall back to `inherit` instead of applying its own tiers. Adding optional `models.claude` and `models.antigravity` sections alongside runtime detection (`--runtime`, `MEDRA_RUNTIME`, environment markers, and Antigravity skill rewrite) lets both tools route models independently while keeping flat `models:` configs backward-compatible.

## What Changes

- **Per-runtime `models` config (`MODIFIED REQ PLUG-005`):** Support optional `models.claude` and `models.antigravity` nested mappings in `docs/config-flow.yaml` (`cli/src/core.js`, `cli/src/validate.js`), preserving flat `models:` keys and resolving in precedence `models[runtime][role] -> models[runtime][stage] -> models[runtime].default -> models[role] -> models[stage] -> models.default -> inherit`.
- **Runtime detection & CLI flag (`cli/src/step.js`, `cli/bin/medra.js`, `cli/src/install.js`):** Add `--runtime <claude|antigravity>` to `medra step`, support `MEDRA_RUNTIME` and environment auto-detection (`CLAUDECODE` / `CLAUDE_CODE_ENTRYPOINT` vs `ANTIGRAVITY_AGENT`), and have `medra install --target antigravity` pass `--runtime antigravity` in installed Antigravity skill `medra step` invocations.
- **Docs & Release `2.1.0` (`README.md`, `CHANGELOG.md`, `PLUG-003`):** Document `models.claude` and `models.antigravity` in `README.md`, bump version to `2.1.0`, update `CHANGELOG.md`, and sync plugin bundles.

## Scope

### In scope
- `cli/src/core.js`, `cli/src/validate.js`, `cli/src/step.js`, `cli/src/install.js`, `cli/bin/medra.js`
- `cli/test/per-runtime-models.test.js` and `cli/test/install-misc.test.js`
- `README.md`, `CHANGELOG.md`, `cli/package.json`, `plugins/medra/.claude-plugin/plugin.json`, `cli/plugin/`, `.agents/plugins/medra/`

### Out of scope
- Changing `compileStep` envelope structure or `fallback: "inherit"` contract
- Adding model tiers for runtimes other than `claude` and `antigravity`

## Track

**Track:** fast
**Rationale:** Focused extension to `models:` resolution, config validation, `--runtime` flag, docs, and `2.1.0` release bump.
**Security:** not-relevant
**Security rationale:** Model tier selection is non-security configuration; no trust boundaries, hooks, or `MEDRA_SUBAGENT=1` checks are altered.

## Capabilities

| Capability | Action | Requirements |
|---|---|---|
| runtime-plugin | modified | PLUG-005 |

## Impact

- **Code:** `cli/src/core.js`, `cli/src/validate.js`, `cli/src/step.js`, `cli/src/install.js`, `cli/bin/medra.js`, `cli/test/per-runtime-models.test.js`, `cli/test/install-misc.test.js`
- **Interfaces:** `docs/config-flow.yaml` (`models.claude`, `models.antigravity`), `medra step --runtime <claude|antigravity>`
- **Data:** None.
- **Dependencies:** None.

## Open Questions

None.
