# Delta: context-and-memory

**Capability:** `context-and-memory`

## ADDED Requirements

### REQ CTX-008: Self-contained compact task pack in step --md

The system SHALL enrich `medra step <change> --role <role> [--task <T-ID>] --md` (`fetch_command`) with a compact, bounded task pack containing deduplicated referenced `REQ` / scenario excerpts from the change's `specs/`, matching `tasks.md` task definitions (including `verify:` hints), and a concise summary of ratified `constitution.md` rules when available, without adding these payloads to default `medra step --json` coordinator output.

#### Scenario CTX-008.S1: Compact task pack present in --md and absent from default --json

- **Given** a change with ratified `docs/constitution.md`, delta `specs/`, and `tasks.md` referencing `REQ` IDs
- **When** `medra step <change> --role implementer --md` is invoked versus `medra step <change> --json`
- **Then** `--md` includes the compact constitution summary, matching `REQ` excerpts, and task lines, while default `--json` omits them and stays compact
