# Development and review process

Every stage (M0, M1, …) must go through the six steps below before it is merged into `main`. If any step fails, go back to development.

## Process

| Step                | What happens                                                                          | Output                   |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------ |
| 1. Kickoff          | Write the task list and acceptance criteria in `docs/stages/M<n>.md`                  | Stage doc                |
| 2. Development      | Develop on a `stage/m<n>-<topic>` branch in small commits, one feature at a time      | Commits                  |
| 3. Automated checks | `pnpm check` passes locally; GitHub Actions passes after pushing                      | Green CI                 |
| 4. Code review      | An independent review agent checks every change in the stage against the list below   | Review log               |
| 5. Smoke test       | `pnpm smoke` takes screenshots automatically; the owner then accepts on a real device | Screenshots + acceptance |
| 6. Merge            | Merge through a PR, bump the version, tag it, update the README progress              | Version tag              |

## Step 3: automated checks

`pnpm check` runs, in order:

1. `format:check`: Prettier formatting
2. `lint`: ESLint (Vue and TypeScript rules)
3. `typecheck`: three type checks: frontend (vue-tsc, including templates), cloud functions, scripts
4. `test`: Vitest unit tests
5. `build`: build the WeChat mini program
6. `build:cloud`: bundle the cloud functions

CI runs the same `pnpm check` on every push to `main` and on every PR.

## Step 4: code review

- **Independent review**: a review agent that took no part in development reads the stage's full diff against `main` (`git diff main...HEAD`), looks specifically for correctness problems, and goes through the checklist below item by item.
- **Handle every finding**: either fix it or record in the review log why it is not fixed. After fixing, run step 3 again.
- **Record**: write the conclusions into the "Review log" of `docs/stages/M<n>.md` and summarize them in a PR comment.

### Checklist

**Correctness**

- [ ] Edge cases: empty data, very long input, repeated taps, network loss, concurrent requests
- [ ] Async flows: races (an old request returning after a newer one), callbacks still changing state after the page is unloaded
- [ ] Every `callCloud` handles failure and gives the user visible feedback
- [ ] Every call from a cloud function to an external service has a timeout and returns a clear error code on failure

**Security and privacy**

- [ ] Secrets appear only in cloud function environment variables or encrypted storage; never in frontend code, the repository or logs
- [ ] Cloud functions check data ownership by `OPENID`; nobody can read or write someone else's data
- [ ] Database collections are "readable and writable by cloud functions only"
- [ ] LLM output is treated as data only: its structure is validated, and it is never spliced into code or database queries
- [ ] Share endpoints expose only the necessary snapshot fields
- [ ] The repository is public: no environment IDs, OpenIDs, IP addresses or deployment details in tracked files, commit messages or PRs

**API conventions**

- [ ] New actions declare their input and output in `shared/api.ts` first
- [ ] Cloud functions always return `ApiResult`; error messages are written for the user, in Chinese
- [ ] Types and constants shared by frontend and backend live in `shared/`

**Mini program specifics**

- [ ] High-frequency events (scrolling, recording frames, playback progress) are throttled and update state only when needed
- [ ] Package size: the main package stays lean, new pages go into subpackages first; check the size after building
- [ ] Permissions (recording etc.) guide the user after a denial, and the privacy agreement declares them
- [ ] iOS and Android differences (frosted glass, audio formats, safe areas) are handled

**UI and interaction**

- [ ] Colors, radii and motion all use variables from `src/styles/tokens.scss`
- [ ] Both light and dark mode are checked
- [ ] Loading, empty and error states are all designed
- [ ] Tap targets are at least 44px and give feedback when pressed
- [ ] UI copy is consistent in tone and concise

**Code quality**

- [ ] Consistent with surrounding code; no dead code or debug output
- [ ] New `sv-*` components are registered in `src/components.d.ts`
- [ ] Pure logic (parsing, calculations, alignment algorithms, etc.) has unit tests
- [ ] Comments, test titles, logs and script output are in English; the exceptions listed in `CLAUDE.md` (UI text, anything sent to the LLM, strings matching external Chinese text, Chinese fixtures) stay Chinese

**Docs**

- [ ] README progress and repository layout are updated
- [ ] The stage doc's task list is checked off

## Step 5: smoke test

**Ask the owner first**: the smoke test launches WeChat DevTools, so it runs only after static checks pass and the owner agrees.

**Automated part**: `pnpm smoke`

- Prerequisites: WeChat DevTools is logged in, and the "service port" is enabled under Settings → Security
- The script builds the mini program, drives DevTools (starting it in the background if it isn't running, and leaving it open afterwards), opens each key page and saves a screenshot to `.smoke/`
- **Every screenshot must be checked by eye**: automation catches exceptions, not broken layouts
- The script fails if any page throws an uncaught exception or logs `console.error`
- Every stage adds its new pages to `ROUTES` in `scripts/smoke.ts`

**Manual part**: the owner accepts the stage on a real device

- Scan the QR code from `pnpm preview` (`.ci/preview.png`), or update the trial version with `pnpm upload`
- Confirm each acceptance criterion in the stage doc and record the result in the review log

## Step 6: merge

1. PR title: `M<n>: <stage name>`; the description includes the task list, a summary of the review log, and screenshots
2. After CI passes, every review finding is handled and real-device acceptance passes, merge with a merge commit
3. Bump the version in `package.json` (M0 → 0.1.0, M1 → 0.2.0, and so on) and tag `v0.<n+1>.0`. Merging M5 completed V1 as version 1.0.0 (tag `v1.0.0`); from V2 on, each stage bumps the minor version (1.1.0, 1.2.0, …)
4. **Before tagging, confirm the merge really happened** (the latest commit on `main` is this merge commit), then tag that commit
5. Update the README progress and add the stage to `CHANGELOG.md`

## Stage doc template

```markdown
# M<n> · <stage name>

- **Branch**: `stage/m<n>-<topic>`
- **Goal**: one sentence

## Tasks

- [ ] …

## Acceptance criteria

1. …

## Review log

### Automated checks

### Code review (finding → resolution)

### Smoke test

### Real-device acceptance
```
