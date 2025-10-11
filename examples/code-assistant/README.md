# TDD Code Assistant Multi-Agent System

This example demonstrates a strict Test-Driven Development (TDD) workflow orchestrated through multiple specialized agents. The system enforces the RED → GREEN → REFACTOR cycle with rigorous quality gates and minimal, reversible changes.

## Overview

The TDD Code Assistant uses a router/manager pattern to coordinate six specialized agents:

1. **Router Manager** – Orchestrates the workflow, parses tasks, sets acceptance criteria, and routes to appropriate agents
2. **Architect** – Proposes minimal, coherent designs that satisfy acceptance criteria
3. **Planner** – Creates surgical, dependency-ordered TDD step sequences
4. **RED Agent** – Writes failing tests only (no implementation code)
5. **GREEN Agent** – Implements minimal code to make tests pass
6. **REFACTOR Agent** – Improves structure without changing behavior
7. **Quality Gate** – Validates outputs against quality criteria before proceeding

## Key Features

### Strict TDD Discipline

- **RED phase:** Only failing tests are written
- **GREEN phase:** Minimal implementation to pass tests
- **REFACTOR phase:** Structure improvements with identical behavior
- No mixing of phases—each step is atomic and reversible

### Shared Conventions

All agents operate under shared conventions:

- High rigor with precise, minimal outputs
- No chain-of-thought revelation
- Deterministic behavior and small steps
- File citations by path
- Conventional commit messages for every step

### Quality Gates

- Schema validity checking
- Minimality verification
- Determinism assessment
- Alignment with acceptance criteria
- Safety and guardrail compliance

## How to Run

Execute from the repository root:

```bash
eddie run --config examples/code-assistant/eddie.config.yaml
```

Or from the example directory:

```bash
cd examples/code-assistant
eddie run
```

## Workflow States

The system progresses through these states:

```
init → architect → planner → red → green → refactor → done
                                ↓
                              halt (on contradictions or quality gate failures)
```

### State Transitions

- **Vague task** → Route to Architect
- **Defined feature, unclear steps** → Route to Planner
- **Plan approved** → Route to RED
- **RED tests merged** → Route to GREEN
- **GREEN passes** → Route to REFACTOR
- **Contradictions detected** → HALT with fix proposal

## Agent Responsibilities

### Router Manager

- Parses user requests into testable tasks
- Builds acceptance criteria
- Routes to appropriate specialist agents
- Tracks state across TDD cycles
- Halts on contradictions or quality failures

**Output:** Routing decision with next agent and payload

### Architect

- Analyzes codebase architecture
- Proposes minimal design changes
- Identifies modified/new files
- Defines interfaces and data models
- Lists test surface and risks

**Output:** Design summary with implementation-ready notes

### Planner

- Creates atomic, reversible TDD steps
- Maintains RED/GREEN/REFACTOR boundaries
- Includes exact verification commands
- Maps acceptance criteria to steps
- Provides ordering rationale

**Output:** Step-by-step execution plan

### RED Agent

- Writes failing tests only
- No production code modifications
- Ensures tests fail for intended reason
- Uses existing test conventions
- Proposes minimal test scaffolding if needed

**Output:** Test files with expected failure description

### GREEN Agent

- Implements minimal code to pass tests
- No unsolicited refactors
- Preserves public contracts
- Only affects newly added tests
- No unrelated file changes

**Output:** Code changes with verification commands

### REFACTOR Agent

- Improves structure without behavior change
- Renames, extracts, deduplicates
- Never changes public contracts
- All tests must still pass
- Provides safety notes

**Output:** Refactoring changes with safety verification

### Quality Gate

- Validates schema compliance
- Checks minimality and determinism
- Verifies acceptance criteria alignment
- Blocks or passes with actionable feedback

**Output:** Pass/block status with reason

## Example Payloads

### Router → Architect

```json
{
  "phase": "route",
  "next_agent": "architect",
  "reason": "Feature request lacks concrete design",
  "assumptions": ["Pagination uses cursor-based strategy"],
  "acceptance_criteria": [
    "API returns nextCursor when more results exist",
    "Unit tests cover empty, single-page, multi-page"
  ],
  "payload": {
    "task": "Add cursor pagination to /media/search",
    "repo_map": "...",
    "constraints": ["keep response schema stable"]
  },
  "quality_gates": ["schema minimality", "reuse existing patterns"]
}
```

### Planner Step Sample

```json
{
  "plan_summary": "Add cursor pagination with minimal surface change",
  "steps": [
    {
      "name": "Expose nextCursor in contract",
      "phase": "RED",
      "goal": "Failing contract test for nextCursor on multi-page result",
      "changes": ["tests/api/search_pagination.spec.ts"],
      "verification": ["pnpm test -t search_pagination"],
      "commit_message": "test(api): add failing pagination contract tests"
    },
    {
      "name": "Implement cursor pagination",
      "phase": "GREEN",
      "goal": "Pass tests by adding cursor generator and slice logic",
      "changes": ["src/api/search.ts", "src/lib/cursor.ts"],
      "verification": ["pnpm test -t search_pagination"],
      "commit_message": "feat(api): implement cursor pagination to satisfy tests"
    },
    {
      "name": "Refactor cursor util",
      "phase": "REFACTOR",
      "goal": "Extract and name cursor helpers; keep behavior identical",
      "changes": ["src/lib/cursor.ts"],
      "verification": ["pnpm test"],
      "commit_message": "refactor(api): extract cursor helpers without behavior change"
    }
  ],
  "ordering_notes": ["Contract first, impl second, tidy last"],
  "handoff": "red"
}
```

## Test Conventions

The system supports multiple languages with default conventions:

### Node.js

- **Framework:** vitest
- **Paths:** `tests/**/*.spec.ts`
- **Naming:** `*.{spec,test}.ts`
- **Run:** `pnpm test`

### Python

- **Framework:** pytest
- **Paths:** `tests/`
- **Naming:** `test_*.py`
- **Run:** `pytest -q`

### Go

- **Framework:** go test
- **Paths:** `./...`
- **Naming:** `*_test.go`
- **Run:** `go test ./...`

## Commit Message Format

All agents produce conventional commit messages:

- **RED:** `test(<area>): add failing test for <behavior>`
- **GREEN:** `feat(<area>): implement <behavior> to satisfy tests`
- **REFACTOR:** `refactor(<area>): clarify <thing> without behavior change`
- **Test utility:** `test(<area>): add test helper <name>`

## Configuration

The system is configured via `eddie.config.yaml`:

- **Model:** gpt-4o (recommended for complex reasoning)
- **Provider:** OpenAI
- **Context:** Includes source and test files
- **Routing:** Confidence threshold 0.6, max depth 3
- **Tools:** file_read, file_write, bash (varies by agent)

## Customization

### Adding New Agents

1. Define agent in `eddie.config.yaml` under `subagents`
2. Create prompt template in `prompts/subagents/<agent>.jinja`
3. Extend the `tdd-base.jinja` layout
4. Define input/output schemas
5. Update router handoff rules

### Modifying Conventions

Edit `prompts/partials/conventions.jinja` to adjust:

- Output style requirements
- TDD contract rules
- Commit message formats
- Quality expectations

### Custom Test Conventions

Override test conventions in the config or pass them as context variables:

```yaml
context:
  variables:
    test_conventions:
      framework: jest
      paths: __tests__/**/*.test.ts
      naming: "*.test.ts"
      run: npm test
```

## Best Practices

1. **Start Small** – Begin with simple features to understand the workflow
2. **Trust the Process** – Let each agent complete its phase before moving on
3. **Review Quality Gates** – Pay attention to blocking reasons
4. **Commit Frequently** – Each phase produces a commit-ready change
5. **Iterate** – Use REFACTOR phase to improve incrementally

## Troubleshooting

### Agent Produces Invalid JSON

- Check the output schema in the agent's prompt
- Verify the agent isn't mixing conversational text with JSON
- Review the conventions partial for output style rules

### Tests Pass in RED Phase

- RED agent should revise tests to fail correctly
- Check that test assertions match expected behavior
- Verify test setup doesn't accidentally implement the feature

### GREEN Phase Changes Too Much

- Review minimality quality gate
- Ensure acceptance criteria are specific
- Break down the feature into smaller steps

### REFACTOR Changes Behavior

- All tests must pass before and after
- Use quality gate to verify behavior preservation
- If behavior must change, start a new RED cycle

## Architecture Notes

- **Jinja2 Templating** – All prompts use Jinja2 for variable interpolation and template inheritance
- **Layout Inheritance** – Agents extend `tdd-base.jinja` for consistent structure
- **Partial Reuse** – Shared conventions and briefings via partials
- **Context Variables** – Pass runtime state through template variables
- **Tool Restrictions** – Each agent has specific tool access (read-only vs. write)

## Further Reading

- [WORKFLOW.md](./WORKFLOW.md) – Detailed workflow documentation with examples
- [../../docs/subagents.md](../../docs/subagents.md) – General subagent documentation
- [../../apps/cli/AGENTS.md](../../apps/cli/AGENTS.md) – CLI agent architecture
- [../../AGENTS.md](../../AGENTS.md) – Top-level contribution guide

## License

This example is part of the Eddie project and follows the same license terms.
