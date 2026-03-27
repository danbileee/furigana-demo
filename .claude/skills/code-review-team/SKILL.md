---
name: code-review-team
description: Orchestrate a specialized team of expert reviewers to evaluate code changes in a GitHub PR. Reviewers assess code quality, feature-goal alignment against the Milestone PRD, and consistency with codebase patterns. Generates a detailed GitHub PR review comment with critical issues, suggestions, and test gaps. Use this whenever you need a multi-disciplinary code review before merging a PR, especially for features tied to a milestone.
compatibility: Requires Claude Code with agent spawning capability. All reviewers use Claude Sonnet.
---

# Code Review Team Skill

Orchestrates a multi-disciplinary code review by spawning parallel expert reviewers who analyze a PR against the feature goal (Milestone PRD), codebase patterns, and code quality standards. Produces a GitHub PR review comment synthesizing all findings.

## When to Use

- Before merging a PR: Validate code quality and feature-goal alignment
- Milestone features: Ensure PR achieves the intended goal
- High-risk changes: Catch cross-functional issues before they ship
- Codebase consistency: Verify the code follows existing patterns
- Complex PRs: Get feedback from backend, frontend, performance, security, and infra perspectives

## What User Provide

1. **PR link** (e.g., `https://github.com/owner/repo/pull/123`)
2. **Milestone PRD** (file path or inline text) — defines the feature goal
3. **Task Plan** (file path or inline text) — background context on intended scope

## What You Return

A **detailed GitHub PR review comment** containing:

- Executive summary + final verdict
- Critical issues (with file:line references)
- Important improvements (non-blocking)
- Test gaps
- Trade-offs and decisions
- Suggestions
- High-impact questions

## Core Principle

**The code changes are the coder's final decision.** Reviewers evaluate whether the code achieves the feature goal (from the Milestone PRD) and is high quality, secure, and consistent with codebase patterns. The Task Plan is background context only — NOT a grading rubric.

## How It Works

**You (the current session) are the orchestrator.** Read `references/orchestrator.md` first for the full process.

As orchestrator, you:

1. Gather context: fetch PR diff, read Milestone PRD and Task Plan, analyze codebase
2. Spawn 6 reviewer agents in parallel (all using Claude Sonnet):
   - **Backend**: API contracts, data integrity, transactions
   - **Frontend**: UI behavior, UX consistency, state management
   - **Performance**: Scalability, regression risks
   - **Security**: Auth, data exposure, compliance
   - **Infrastructure**: Deployment, observability, operational burden
   - **Test Strategy**: Test coverage, missing validation, PR approval criteria

3. Reviewers independently evaluate the PR against the feature goal and codebase patterns
4. Cross-review: Each reviewer reads 2 others' findings to surface conflicts
5. Synthesize: Deduplicate, resolve conflicts, prioritize (PRD misalignment > production risk > user impact > code quality)
6. Output: Generate the final GitHub PR review comment

## Review Output Structure

### Each Reviewer Produces

1. **Context Alignment Summary**: Feature goal alignment, code quality assessment
2. **Summary**: What the PR does, overall evaluation
3. **Strengths**: Good design decisions, well-implemented aspects
4. **Inline Comments**: Specific issues with file:line, severity, category, description, mitigation
5. **Risks**: Runtime risks, edge cases, regressions
6. **Missing Considerations**: Feature gaps, oversight issues
7. **Questions**: High-impact clarifications only

### Final PR Comment Includes

1. 🔍 **Summary** — What PR does, feature goal alignment, final verdict
2. 🚨 **Critical Issues (Must Fix)** — PRD misalignment, production risk
3. ⚠️ **Important Improvements** — Non-blocking, meaningful issues
4. 🧪 **Test Gaps** — Missing validation of feature requirements
5. ⚖️ **Trade-offs & Decisions** — Conflicts and chosen direction
6. 💡 **Suggestions** — Nice-to-have improvements
7. ❓ **Questions** — High-impact only

## Key Principles

- **Feature goal > code elegance**: Does it achieve the PRD goal?
- **Consistency > local optimization**: Does it fit the codebase?
- **Simplicity > over-engineering**: Is it maintainable?
- **Pragmatism > perfectionism**: Is it production-ready?

## Reference Files

- `references/orchestrator.md` — **Read first.** Your role, context gathering, synthesis process, final PR comment structure
- `references/backend-reviewer.md` — API design, data integrity, transactions
- `references/frontend-reviewer.md` — UI behavior, UX consistency, state management
- `references/performance-reviewer.md` — Scalability, regression, profiling
- `references/security-reviewer.md` — Auth, data exposure, compliance
- `references/infrastructure-reviewer.md` — Deployment, observability, ops
- `references/test-strategy-reviewer.md` — Coverage, validation, approval criteria
