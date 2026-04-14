---
name: ux-review-team
description: Orchestrate a collaborative team of Chief Product Officer, Chief Technology Officer, and Lead UI/UX Designer to transform a PRD into a high-quality UX concept and critically evaluate it. Each agent brings their perspective, debates trade-offs, and synthesizes a unified UX direction. Use this whenever you need to design or rigorously evaluate product UX from multiple disciplines, identify aha and wow moments, stress-test ideas against technical constraints, and produce a decision-ready UX review document.
compatibility: Requires Claude Code with agent spawning capability. CPO, CTO, and Designer agents use Claude Sonnet.
---

# UX Review Team Skill

Orchestrates a collaborative team of specialized agents (CPO, CTO, Lead Designer) to design a high-quality UX concept from a PRD and evaluate it across emotional impact, technical feasibility, and usability—producing a synthesized, actionable UX review.

## When to Use

- **Before detailed design work**: Transform a PRD into a validated UX direction
- **High-stakes features**: Pressure-test UX ideas across CPO (retention), CTO (performance), Designer (clarity) perspectives
- **Competitive differentiation**: Identify breakthrough UX moments and competitive advantages
- **Risk discovery**: Uncover conflicts between emotional goals, technical constraints, and usability
- **Decision readiness**: Get a detailed document that resolves trade-offs and guides implementation

## What User Provides

1. **PRD or feature brief** (file path or inline text) — what the product should do
2. **Reference document** (optional) — product strategy, mission, positioning to align UX with
3. **Context** (optional) — target users, known constraints, competitive set

## What You Return

A **synthesized UX review document** (`ux-review.md`) containing:

- **UX Concept Overview**: Core idea, target user, problem, key flows
- **Aha & Wow Moment Design**: Where users understand instantly and feel delight
- **Reference Alignment**: How UX aligns with product strategy/mission
- **UX Evaluation Scorecard**: Aha metrics (understanding, navigation), Wow metrics (delight, engagement), Lovability metrics (retention, differentiation)
- **Competitive Analysis**: Key competitors, insights, differentiation strategy
- **Critical UX Issues**: High-impact problems that must be addressed
- **Improvement Opportunities**: Concrete UX enhancements
- **Breakthrough Ideas**: High-impact, non-obvious ideas (≥1 bold, risky, high-potential)
- **Technical Enablers**: Tech decisions that improve UX
- **Final Verdict**: Is this lovable? What's missing?

## How It Works

**You (the current session) are the orchestrator.** Read `references/orchestrator.md` first for the full process.

As orchestrator, you:

1. Read the PRD and establish alignment (target users, core problem, success criteria)
2. Spawn 3 named agents using sonnet model in sequence:
   - **CPO** (Chief Product Officer)
   - **CTO** (Chief Technology Officer)
   - **Designer** (Lead UI/UX Designer)
3. Facilitate cross-discussion where agents challenge each other's assumptions
4. Force additional debate if convergence is too fast (you are responsible for tension)
5. Synthesize all perspectives into a unified, decision-ready UX review document
6. Write final output to `.taskmaster/docs/plans/{yyyy-mm-dd}/ux-review.md`

## Key Principles

- **Lovability over correctness**: Does the UX delight users and keep them coming back?
- **Clarity over comprehensiveness**: Clear aha moment + focused wow moments beat feature completeness
- **Technical reality > ideal design**: A beautiful idea that can't be built is worse than no idea
- **Debate creates clarity**: Forced conflict between CPO/CTO/Designer produces better decisions than consensus

## Reference Files

- `references/orchestrator.md` — **Read first.** Your role, 7-phase workflow, final document structure, cross-discussion management
- `references/cpo.md` — CPO agent instructions (emotional impact, cohesion, retention)
- `references/cto.md` — CTO agent instructions (technical enablers, performance, architecture)
- `references/designer.md` — Designer agent instructions (usability, interaction, competitor insights, breakthrough ideas)
