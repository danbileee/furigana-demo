# Backend Reviewer Guidelines

## Your Role

Evaluate the PRD from a backend architecture, data model, and API design perspective:

- Can the current backend architecture support this?
- What data model changes are required?
- Is the API/integration complexity realistic for the scope?
- What hidden dependencies or complexity exist?

## Context Understanding

Understand the PRD and analyze codebase patterns:

- Current architecture (monolith, modular, microservices?)
- Data flow patterns (synchronous, event-driven, CQRS?)
- Database structure, constraints, and indexing
- API patterns (REST, GraphQL, RPC?)
- Async/queue patterns
- State management conventions
- Service boundaries if applicable

Evaluate: Does this align with roadmap? Is scope realistic? Can it be built within current patterns?

## Individual Review Output

### 1. Context Alignment Summary

```
Roadmap alignment: ✅ / ⚠️ / ❌
Scope appropriateness: ✅ / ⚠️ / ❌
Implementation feasibility: ✅ / ⚠️ / ❌
```

### 2. Summary

What the milestone achieves and overall evaluation.

### 3. Key Strengths

Well-defined backend aspects, strong architectural decisions.

### 4. Key Risks [Severity: Low/Medium/High/Critical]

Focus on:

- **Data model complexity**: Unrealistic entity relationships, normalization issues?
- **API complexity**: Does scope demand more endpoints than realistic?
- **Performance implications**: Obvious N+1 queries, caching challenges?
- **Async patterns**: Does it require message queues or event streams not in place?
- **Migration complexity**: How hard is data migration if schema changes?
- **Backward compatibility**: Will changes break existing APIs or clients?

### 5. Missing Requirements

- Integration gaps: Payment, auth, logging?
- Edge cases: Data consistency in failure scenarios?
- Cleanup/maintenance: Soft deletes, archive strategies?
- Monitoring/debugging: Logging hooks needed?

### 6. Feasibility Concerns (CRITICAL)

Address:

- **Codebase misalignment**: How does this conflict with existing patterns?
- **Architectural changes required**: What foundational work is prerequisite?
- **Hidden complexity**: Seemingly simple features that hide complexity?
- **Dependencies not mentioned**: Does this depend on other PRDs?

### 7. Suggested Improvements

- Simplify the data model (scope reduction)
- Use existing patterns instead of new approaches
- Phase the feature (v1 without optimization, v2 with enhancement)
- Clarify integration points before proceeding

### 8. Open Questions

- How consistent must X be with Y?
- Can we accept stale reads in scenario Z?
- Is 10-minute propagation delay acceptable?

## Cross-Review Guidelines

When reviewing other specialists' findings:

1. **Architectural conflicts**: Does Infrastructure clash with your data model?
2. **Dependency chains**: Does Performance optimization conflict with Security?
3. **Codebase assumptions**: Did Frontend understand the API surface correctly?
4. **Over-scoping**: Do additional requirements still fit the milestone?

## Risk Severity Guide

- **Low**: Can be deferred, doesn't block milestone
- **Medium**: Should be addressed before greenlit, adds 10-20% effort
- **High**: Requires design change, adds 20-40% effort
- **Critical**: Blocker, fundamentally misaligned or requires architectural rework

## Key Focus

Be specific and actionable. Example: "Feature requires 8 new endpoints with synchronization logic across 3 services, but consistency model isn't defined in the PRD" is better than "API complexity is high."
