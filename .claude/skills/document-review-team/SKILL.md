---
name: document-review-team
description: Orchestrate a specialized team of expert reviewers to evaluate documents (PRDs, milestone specs, roadmaps, design docs). Each reviewer independently analyzes the document against roadmap alignment, scope feasibility, and codebase patterns, then collaborates to resolve conflicts and produce a unified executive report. Use this whenever you need rigorous document validation before committing resources.
compatibility: Requires Claude Code with agent spawning capability. All reviewers use Claude Sonnet.
---

# Document Review Team Skill

Orchestrates a multi-disciplinary team review of strategic documents by spawning parallel expert reviewers who analyze the document, evaluate codebase feasibility, and synthesize findings into a unified executive report.

## When to Use

- Before greenlit work: Validate a PRD against your roadmap and architecture
- Feasibility pressure-testing: Challenge an ambitious design against technical reality
- Risk discovery: Identify cross-functional conflicts, hidden complexity, roadmap misalignment
- Milestone planning: Ensure scope is realistic before commitment
- Design review: Pressure-test any major proposal

## What User Provide

1. **Target document**: PRD, milestone spec, roadmap, design doc (markdown or text)
2. **Strategic context** (optional): Roadmap, product goals, constraints
3. **Codebase access**: The skill will analyze your current project structure

## What You Return

A **consolidated review report** in markdown containing:

- Executive judgment on feasibility and alignment
- Top 5 critical risks (with severity levels)
- Roadmap alignment verdict
- Feasibility assessment ("can we actually build this?")
- Cross-functional concerns and conflicts
- Prioritized next actions
- Open questions for stakeholders

## How It Works

**You (the current session) are the orchestrator.** Read `references/orchestrator.md` first before doing anything else — it defines how to run the review process, resolve conflicts, and produce the final report.

As orchestrator, you spawn 6 specialized reviewer agents in parallel:

- **Backend**: Data models, API design, architectural fit
- **Frontend**: UX completeness, interaction patterns, UI alignment
- **Performance**: Scalability assumptions, bottleneck risks
- **Security**: Data/auth/privacy implications, threat surface
- **Infrastructure**: Deployment, observability, operational burden
- **Test Strategy**: Testability, coverage gaps, regression risk

Each reviewer agent:

1. Uses sonnet model
2. Reads and understands the target document
3. Analyzes your codebase for patterns and constraints
4. Assesses alignment with roadmap direction
5. Identifies risks, gaps, and feasibility concerns
6. Produces a structured individual review

Once all reviewer agents complete, you (the orchestrator) collect their findings, run a cross-review pass where reviewers examine each other's outputs, then synthesize everything into the final consolidated report. Follow the process in `references/orchestrator.md` for how to evaluate, resolve conflicts, and structure that report.

## Review Output Structure

### Each Reviewer Produces

1. **Context Alignment Summary**: Roadmap alignment, scope fit, feasibility (✅ / ⚠️ / ❌)
2. **Summary**: What the milestone achieves, overall evaluation
3. **Key Strengths**: Well-defined aspects, strong decisions
4. **Key Risks**: Severity-rated [Low/Medium/High/Critical]
5. **Missing Requirements**: Gaps, edge cases, integration points
6. **Feasibility Concerns**: Codebase misalignment, hidden complexity, dependencies
7. **Suggested Improvements**: Scope adjustments, alternatives, safer rollout
8. **Open Questions**: High-impact clarifications only

### Final Report Includes

1. Executive Judgment (strong, opinionated)
2. Top 5 Critical Risks
3. Roadmap Alignment Assessment
4. Feasibility Verdict
5. Cross-Functional Concerns & Resolutions
6. Must-Fix Before Proceeding
7. Recommended Improvements (prioritized)
8. Deferred Considerations
9. Stakeholder Questions

## Key Principles

- **Feasibility > Ideal Design**: A well-written spec that can't be built is worse than no spec
- **Roadmap Alignment > Local Optimization**: Features that don't advance strategy are distractions
- **Simplicity > Over-Engineering**: Ship the simplest version that solves the problem
- **Clarity > Completeness Illusion**: Clear but incomplete is better than unclear but comprehensive

## Reference Files

- `references/orchestrator.md` — **Read first.** Your role, process, and final report structure
- `references/backend-reviewer.md` — Database, API, architecture
- `references/frontend-reviewer.md` — UX, interactions, UI patterns
- `references/performance-reviewer.md` — Scalability, bottlenecks
- `references/security-reviewer.md` — Auth, data, privacy, compliance
- `references/infrastructure-reviewer.md` — Deployment, ops, observability
- `references/test-strategy-reviewer.md` — Testability, coverage, regression
