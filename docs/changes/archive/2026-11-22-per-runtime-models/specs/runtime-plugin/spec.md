# Delta: runtime-plugin

**Capability:** `runtime-plugin`

## MODIFIED Requirements

### REQ PLUG-005: Optional subagent model overrides with per-runtime support and inherit fallback

The system SHALL default subagent model selection to `inherit`, support optional per-role (`author`, `implementer`, `reviewer`, `security`) and per-stage overrides in `docs/config-flow.yaml`—both as flat keys and under per-runtime `models.claude` and `models.antigravity` mappings—resolving in precedence `models[runtime][role] -> models[runtime][stage] -> models[runtime].default -> models[role] -> models[stage] -> models.default -> inherit` (using `--runtime <claude|antigravity>`, `MEDRA_RUNTIME`, runtime environment detection, or single-integration fallback), and fall back to `inherit` if a configured model or tier is unavailable on the active runtime.

#### Scenario PLUG-005.S2: Per-role and per-runtime subagent model resolution

- **Given** `docs/config-flow.yaml` configuring flat `models` (`{ verify: pro, security: flash }`) or per-runtime `models` (`{ claude: { apply: haiku, verify: opus }, antigravity: { apply: flash, verify: pro } }`)
- **When** `compileStep` builds `subagents[]` for `claude` vs `antigravity`
- **Then** `claude` receives `haiku`/`opus`, `antigravity` receives `flash`/`pro`, flat `models` continue to resolve identically, and unconfigured setups default to `inherit`
