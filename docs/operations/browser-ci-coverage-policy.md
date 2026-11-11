# Browser CI coverage policy

PRs select coverage automatically from the complete merge-base diff. The selection
job uses full Git history and includes deleted paths and both sides of renames.
No GitHub API file-list pagination or PR-supplied shell text is used.

The full browser suite can be omitted only when every changed file belongs to:

- README.md, CHANGELOG.md, or Markdown under docs/;
- top-level release unit tests matching tests/release/*.test.mjs;
- JSON catalog evidence under config/observed/;
- config/authorization-surface.json;
- scripts/lib/private-retention-policy-audit.mjs.

These changes still run quality, unit, Android, migration, dependency and secret
checks, plus CodeQL. Audit inventories still require protected production
verification independently of browser testing. A PR author cannot opt out with a
label, commit message or manual flag. The allowlist is code-reviewed.

All other paths require the existing full web/WCAG, mobile UI, appearance,
production-build and route-recovery suites. This includes runtime code, shared
packages, generated database types, database migrations, configuration not listed
above, dependencies, browser fixtures, Playwright specs, workflows and the selector
itself. Unknown events, empty or malformed evidence, missing history, oversized
diffs and mixed changes require full coverage.

Main pushes always run full browser coverage for the exact merged commit. The
protected release publisher continues requiring the successful Browser smoke tests
check on that SHA. PR-only omissions cannot substitute for main release evidence.

The Browser smoke tests check keeps its stable name and always reports a result.
For an eligible PR it validates the successful selection decision without
installing dependencies or Chromium. The selection job's summary records whether
full coverage is required and why. If selection fails, the browser gate fails;
it does not silently pass. When full tests fail, the job remains failed.

Before opening each PR, assess the affected behavior and document coverage in its
description. Broaden coverage if new evidence shows a supposedly safe path affects
browser behavior. This CI policy changes no application runtime or production data.
