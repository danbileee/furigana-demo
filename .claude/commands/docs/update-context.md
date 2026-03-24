---
description: Validate and update documentation to keep fresh contexts for AI workflow
allowed_tools: [Bash, Read, Edit, Write, Glob, Grep]
---

## Process

**1. Compare remote vs local**

Run the following to understand what has changed locally since the last push:

```bash
git fetch origin main
git log origin/main..HEAD --oneline
git diff origin/main..HEAD --stat
```

**2. Validate documentation**

Review the diff and determine whether the following files need updating:

- `README.md` (root level) — update if new features, setup steps, commands, or project structure have changed
- `.claude/CLAUDE.md` — update if new tools, conventions, workflow rules, or project patterns have been introduced

For each file:

- Read the current content
- Compare against what has changed in the local commits
- If the file is outdated or missing information, update it to reflect the current state of the project

**3. Commit documentation updates**

If any documentation was updated:

- Stage only the changed doc files: `git add README.md .claude/CLAUDE.md`
- Commit with: `docs: update README and CLAUDE.md to reflect latest changes`
- Verify the commit was created with `git log --oneline -3`

**4. Push to the remote**

Run `git push`
