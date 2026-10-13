# Changelog

Notable changes to Solvane, one section per development stage, newest first.

## 1.2.0 — M7: Public release preparation (2026-10-13)

**Shipped**

- The source is available under the PolyForm Noncommercial License 1.0.0 (`LICENSE.md`).
- Everything written for developers is now English: README, docs, comments, test titles, script output and logs. UI text and LLM prompts stay Chinese.
- The stage docs for M0 to M6 are condensed into this changelog.
- README header with badges, and a Contributing section: issues are welcome, pull requests are not accepted for now.
- Fix: the Me and Saved tabs scroll to the bottom again. The scroll-view height was only defined in the Practice tab, and component styles are isolated; every tab now defines it, and a convention test checks this.

**Decisions**

- A noncommercial license rather than an OSI license, so commercial licensing stays with the author.
- Deployment details (environment IDs, how the upload key is protected) are kept out of tracked files.
- The UI must not change: comparing the 1.1.0 build with this one shows identical templates and identical Chinese text, apart from one developer-only error message.

## 1.1.0 — M6: Pro membership (2026-10-11)

**Shipped**

- Recording and scoring are separate. A recitation is saved as soon as it is submitted and can be played back right away; scoring is an optional step on the new practice record page, which offers playback, Score, Share this recitation and Recite again. Unscored practices show "Not scored" in the session's practice records instead of a score.
- Unscored recitations can be shared. Before sharing, only the recognition and alignment steps run (`assess.prepareShare`) to get lyric timings, and word highlighting in the lyrics player uses ASR word timestamps. Scoring later continues from step 3 without recognizing the audio again.
- Pro membership and free uses. Every non-Pro user has 5 free uses in total, with no monthly reset. Creating a session (first version plus analysis) and scoring each cost one; revisions, switching versions, demo reading, recording, playback and sharing are free. When the uses run out, starting a session or scoring opens the Pro sheet (price 9.9 CNY a month, benefits, how to get Pro, copy user ID) and no job is started. Existing sessions and reports stay available.
- The Me tab shows a Membership row (Free with N uses left, Pro with expiry date, or Admin), and the sheet for starting a new session shows the remaining uses.
- Member management for admins (`pkg-admin/members`): avatar, nickname (or the last 4 characters of the user ID), membership status and uses for every member; grant 30 days, extend by 30 days or end Pro, each confirmed with the resulting expiry date. Admins also get a Manage group on the Me tab with member management and LLM configuration.
- LLM configuration is global only and managed by admins. Members no longer see the LLM settings; generation and scoring use the admin's configuration. Members see "ask the admin to configure the LLM" when it is missing, admins see a link to the configuration page.
- Demo reading highlights by sentence instead of by word (each sentence is its own audio clip), because TTS word timings did not line up with the audio.

**Decisions**

- Pro is granted manually by an admin; in-app payment is not integrated yet. Payment would become one more way to grant the same 30 days, so the membership model will not change.
- Each grant adds 30 days: from today if the user has no Pro or it has expired, otherwise from the current expiry date. After expiry the user is back on the free plan with the uses they had left. Admins (`ADMIN_OPENIDS`) always count as Pro. Concurrent grants use a conditional update on the expiry date so no days are lost.
- A use is reserved atomically when a job starts (a conditional update that only succeeds while `freeUsed < 5`) and refunded if the job fails. Retrying the same session or recording never charges twice. Counting started on release day; earlier sessions and scores are not counted, and old practices without `scoreRequested` count as scored.
- `compose.create` only checks the quota; the use is charged when the first version is generated, so a session left ungenerated after a network drop costs nothing.
- `assess.score` is idempotent per recording, so the front end calls it on every attempt instead of `advance`, and a lost request can always be sent again.
- Submitting a recording only wraps the PCM as WAV (a header, no external service), so playback is available immediately. The practice remembers its uploaded file (`sourceFileID`), and submitting the same file again returns the existing practice instead of creating a duplicate.
- New `accounts` collection keyed by OpenID (`freeUsed`, `proUntil`, `grants[]`), created on first use. Limits and the display price live in `shared/constants.ts` (`PRO`), the expiry calculation in `shared/account.ts`, shared by front end and cloud. Running out raises `AppError('QUOTA_EXCEEDED')`, which the front end turns into the Pro sheet.
- Members' previously saved LLM configurations, including encrypted keys, are removed from the database.

## 1.0.0 — M5: Polish (2026-10-10)

M5 completes V1 (M0 to M5).

**Shipped**

- Every async view has loading, empty and error states with retry, including the report, saved lists, all sessions, my shares, and settings and profile on the Me tab. Retrying no longer flashes the empty state. When a list already has content, a failed refresh shows a "Could not refresh - Retry" bar above it; a failed page load in history shows a retry row at the bottom.
- Recovery paths: a failed speech recognition offers Speak again, and a failed recitation submission keeps the recording so it can be submitted again without reciting again.
- Tap targets: sheet close buttons, chips, small buttons and all small icon buttons get a 44px hit area (`sv-hit-area`) without changing their look. Press feedback was added to lyric lines, word picker chips, report words and the send button.
- Motion: a one-off `.sv-appear` fade when a skeleton is replaced by content; report score bars grow from 0 in sync with the score ring; the recite panel cross-fades between states at a fixed height; the lyrics player has a dark skeleton.
- Consistent copy: "X failed to load" error titles, one generic fallback message, the same Retry and Recite again labels everywhere. Deleting an expression card is confirmed with "Delete card" so it cannot be mistaken for the system Cancel.
- Robustness: temporary URLs (avatar, report playback, demo reading, lyrics audio) are refreshed after 90 minutes or on a playback error, and the lyrics player resumes at the same position; all navigation goes through `navigateTo()` in `src/utils/nav.ts`, which ignores repeated taps; saving is guarded against double submission; moving to the background while recording cancels the recording with a notice; timers are cleared on unload; pages leave room for the bottom safe area.
- Error logging: failed cloud calls and uncaught exceptions go to WeChat real-time logs with location, error code and message only, never content. Expected business results (bad input, not found, cancelled) are not logged.
- Design tokens: one spin duration and keyframes (`--sv-dur-spin`, `sv-spin`), `--sv-shadow-glow`, and shared constants where two timings must match (waveform transition and recorder refresh interval, trace highlight animation and its clear timer).

**Decisions**

- Detailed technical error messages, with error codes and the setting to check, stay visible to users. The app is used by a small group through the trial version, and these messages are what make configuration problems diagnosable.
- The user ID, cloud latency and the note that share recipients must be trial members stay on the Me tab for the same reason.
- Exceptions that do not come from the cloud use "Something went wrong, please try again" rather than a network message, so program errors are not blamed on the network.
- Package size needed no work: the main package is about 0.7 MB, every subpackage is under 130 KB, and on-demand component loading is enabled.

## 0.5.0 — M4: Sharing (2026-10-10)

**Shipped**

- Share a recitation with WeChat friends as a mini program card from the bottom of the report (Share this recitation). Each practice has at most one share; sharing it again reuses the existing one.
- Lyrics player (`pkg-share/play`), used both for the sender's preview and by recipients: a fixed immersive dark theme, an English line and a Chinese line per sentence, the current sentence enlarged, highlighted and scrolled to the center while its words light up as they are spoken. Tap a sentence to play from there; play/pause, a draggable progress bar and times at the bottom; auto-follow pauses for 3 seconds after manual scrolling. Sentences that were not recited are shown but are not highlighted or tappable. The header shows the title and the author's avatar and nickname.
- Shares contain only the recording and the Chinese and English text, no scores or analysis. Recipients must be members of the mini program's trial version. A revoked share shows "Share revoked"; a Practice too button leads to the home page.
- Profile: avatar and nickname are set with WeChat's avatar and nickname components on the first share, and can be edited from the profile card on the Me tab. Avatars are stored under `avatars/`.
- My shares (`pkg-share/mine`): title, first sentence and date; open, send again or revoke. Revoking invalidates the link and deletes the audio copy.
- Cover image: a 5:4 picture with a gradient background, the title and the first English sentence, drawn on a hidden canvas.
- `data` actions: `getProfile`, `updateProfile`, `createShare`, `getShare` (readable by anyone with the link; returns only snapshot fields and temporary URLs), `listShares`, `revokeShare`.

**Decisions**

- Creating a share copies the recording to `shares/`, so the link keeps working after the practice is removed by the keep-latest-3 cleanup.
- A share is a snapshot (`shares` collection): sentences with their time ranges, word timings mapped onto the original text (the same structure as demo reading timings), the author, the audio and the first sentence, so the list never loads full sentences.
- The share ID is derived from the practice, so concurrent or retried requests cannot create a second share; any extra audio copy is deleted.
- No new cloud function: the 10-second timeout of `data` is enough to copy a recording of up to 2 MB.
- Every sentence is rendered word by word and the current one only changes color, so highlighting never changes line wrapping or row positions. Rows are measured after rendering, once the top and bottom padding is set from the lyrics area height.
- A canvas cannot read CSS variables, so cover colors are taken from the token gradient and defined in one place. The player's dark palette is a `.sv-stage` variable set on the page root, which child components inherit.
- A nickname rejected by WeChat's content check is cleared with a notice. An audio URL that fails to load shows a reload option instead of a dead play button, and a temporarily unavailable recording is not reported as revoked.

## 0.4.0 — M3: Saved items and history (2026-10-10)

**Shipped**

- Save sessions with the bookmark icon in the session title bar. Unsaving only removes the bookmark; the session stays in history.
- Save expressions from three places: key expressions and slang in the analysis; English sentences (long-press a sentence to open a word picker, tap a word, or tap the first and last word of a phrase); and the word detail sheet in the report. A "Saved - Choose folder" toast with light haptic feedback appears for 3 seconds instead of a sheet, so saving several in a row is not interrupted.
- Expression cards (`pkg-library/expression`): the expression, Chinese meaning, usage, example, an editable note, tags and folder, plus playback of the whole phrase. Items from the analysis reuse its content; words and phrases saved elsewhere are explained by the LLM (`compose.explainExpression`) from the original sentence at the user's English level. The card shows right away, and a failed explanation can be retried.
- Tracing: "Saved from" lists each source sentence with the expression highlighted, the session title and date. Tapping one opens the session at that version and scrolls to and highlights the sentence. "Also appears in" lists up to 20 other uses across all sessions and versions, newest first.
- Folders, shared by expressions and sessions, up to 3 levels: create, rename, move, reorder in edit mode, and delete, choosing each time whether to move the contents up a level or delete them too. Browsing works level by level like the Files app, with uncategorized items at the root. Tags: up to 10 per item and 12 characters per tag; tap a tag to filter.
- Saved tab: an Expressions / Sessions toggle, an iOS-style search bar (expressions by text, meaning and note; sessions by title, original text, polished Chinese and English) and a + button for top-level folders.
- History (`pkg-library/history`), opened from View all under recent sessions: every session by last update, loaded page by page, searchable by title, original Chinese, polished Chinese and the English of all versions.
- Standard pronunciation (`speech.ttsWord`) accepts phrases as well as single words.

**Decisions**

- The Saved tab holds only what the user saved; the full history has its own page. Deleting sessions and spaced-repetition review are left for later (review is planned for V2).
- Saving the same expression twice merges into one card. The merge key ignores case, surrounding punctuation and extra whitespace; sources accumulate, and the same sentence is never recorded twice. Unsaving an expression deletes its card after confirmation.
- "Also appears in" uses rules, not the LLM: case and punctuation are ignored, common inflections match (-s, -es, -ed, -ing, doubled consonants, dropped e, about 150 irregular verbs), and placeholders such as sb, sth, someone and one's match 1 to 3 arbitrary words.
- A folder move must keep the whole subtree within 3 levels. Deleting a folder together with its contents only unsaves its sessions but deletes its expression cards. Moving contents up renames clashing subfolders ("Name 2") to keep sibling names unique.
- Opening a source saves that version as the session's current version before locating the sentence, so later job results do not switch the page back.
- Folder counts, tags and merge keys use queries that fetch only the saved-item fields instead of whole sessions with every version and analysis.
- The shared library components live in the main package (about 690 KB) because the session, report and library subpackages all use them. The sheets are rendered by the page outside its scroll-view and shared through provide / inject.
- Data: new `folders` and `expressions` collections (each source records session, version, sentence index, sentence text and entry point); sessions gain `starredAt`.

## 0.3.0 — M2: Reading aloud and recitation assessment (2026-10-09)

**Shipped**

- Demo reading with Tencent Cloud TTS large-model voices (WeWinny, female; WeJames, male) at normal or slow speed, chosen on the Me tab. The word being read is highlighted, and tapping a sentence replays just that sentence.
- Recite page (`pkg-recite/recite`): the text is hidden by default; Hint first reveals each word's first letter, then the whole sentence, and each sentence can also be revealed on its own. Tap to record, up to 60 seconds.
- Four-step assessment in the new `assess` cloud function (`start`, `advance`, `get`, `list`):
  1. Transcribe: wrap the PCM as WAV for playback and run English ASR with word timestamps.
  2. Align: the LLM compares what was said with the original, reconstructs the sentence the user meant to say, and classifies every difference as misread, rephrased, omitted, added or grammar error.
  3. Score: assess each sentence's audio slice in parallel with SOE sentence mode, using the reconstructed text as reference.
  4. Report: the LLM writes a summary, pronunciation advice and recitation advice.
- Report page (`pkg-recite/report`): progress while assessing, then a total score ring, four sub-scores, words colored by accuracy, a comparison with the original, advice, and Recite again. Tapping a word shows its pronunciation problems and plays both the standard pronunciation (`speech.ttsWord`) and the user's own clip.
- The session page gets Listen and Start reciting buttons on the English card and a practice records section with the latest 3 scores.

**Decisions**

- Total score = pronunciation 40% + fluency 20% + content recall 25% + expression correctness 15%. A rephrasing that keeps the meaning and is idiomatic is not penalized.
- SOE's free-speaking mode returns neither timestamps nor phonemes, so step 1 uses English ASR (`16k_en`) for word timings, and step 3 uses sentence mode (up to 30 words, with phonemes) per sentence. Longer sentences fall back to paragraph mode, which returns scores only.
- SOE has only a WebSocket API and no Node SDK, so the client is written on `ws` with HMAC-SHA1 signing. Audio is streamed at real-time rate (6400 bytes every 200 ms for 16 kHz mono) to stay within the service's rate limit.
- An assessment does not fit in one 60-second cloud function call, so it is split into steps that the front end drives one at a time. Each step has a 55-second budget, writes its result to the database and can be polled after a client timeout; the M1 job lock allows one step per practice at a time. A sentence is only started if the remaining time covers its send time plus 10 seconds; sentences that could not be assessed are marked `unscored`, and the report says so instead of treating them as not recited.
- ASR word timings are imprecise, so audio slices extend into the surrounding pauses (up to 400 ms before and 800 ms after, split at the midpoint between sentences; the last slice runs to the end), and punctuation right before a sentence counts as its start. SOE returns lowercase words, so the original capitalization is restored.
- TTS accepts at most 500 letters per request, so demo reading is synthesized per sentence and cached on the version by voice and speed. Tencent Cloud has no British voice, so the demo stays American even when the accent setting is British.
- Each session keeps only its latest 3 practices; older ones and their audio are deleted when a new practice starts, except practices whose job is still running. Files are deleted only after a step's result has been written, so a retry never loses its input.
- Tencent Cloud and SOE errors carry the error code and a short reason, and SOE errors are classified by code first.
- LLM configuration loading moved into a shared module used by `compose` and `assess`; `mapLimit` moved to `lib/concurrency.ts`.

## 0.2.0 — M1: Composing expressions (2026-10-09)

**Shipped**

- Voice input on the Practice tab: tap the mic to start (up to 60 seconds), with a live volume waveform, a timer, and Done and Cancel; the app warns when a recording is under 1 second and during the last 10 seconds. The recognized text opens in a confirm sheet for editing, and typed input uses the same sheet. Guidance is shown when microphone permission is denied.
- Generation: tapping Generate opens the session page at once with a skeleton, which fills in with the polished Chinese, the recommended English, sentence-by-sentence Chinese and English pairs, alternatives and a title, then the analysis (key expressions, slang, culture notes and a Chinglish comparison).
- Revision: an input bar and quick requests (more casual, more formal, shorter, add slang). Each revision creates a new version, and the user can switch between versions.
- Settings: English level and accent on the Me tab; an LLM configuration page with a per-user configuration and an admin-only global default; the user ID on the Me tab for admin setup.
- Cloud functions: `compose` (`create`, `generate`, `revise`, `analyze`, and LLM configuration read, save and test), `speech` (`recognize`, using Tencent Cloud one-sentence Chinese ASR) and `data` (settings, sessions, recent sessions, current version). Only `compose` and `speech` need secrets.
- Components: `sv-sheet`, `sv-field` and version tabs.

**Decisions**

- The mini program stops waiting for a cloud function after about 15 seconds, while LLM generation can take longer. Results of generation jobs are therefore always written to the database first; when the call times out, the front end polls the session every 2 seconds for up to 70 seconds, and stops when the page is closed.
- One job (generate, revise or analyze) runs per session at a time, enforced by a conditional database update. A job running for more than 70 seconds is treated as interrupted and can be retried. While any job runs, sending a revision is disabled with the reason shown.
- Generation has two steps: first the polished Chinese, English, sentence pairs, alternatives and title, then the analysis.
- A generic OpenAI-compatible LLM client with presets for DeepSeek, Qwen, Kimi, Zhipu, Doubao and custom endpoints; a preset only fills in the endpoint, and the model name is editable. JSON output is validated against a schema and retried once on failure. Providers that reject JSON mode are remembered per endpoint and model and called without it from then on.
- User input is marked in prompts as content to process, never as instructions. Prompts adapt to the user's English level and accent.
- API keys are stored encrypted with AES-256-GCM and only shown masked; endpoints must be public HTTPS hosts; changing the endpoint host requires entering the key again, so a key is never sent to another provider. Lookup order: the user's own configuration, then the admin's global default, then a prompt to configure (global only since 1.1.0).
- Audio is recorded as 16 kHz mono PCM (about 1.9 MB per 60 seconds) to compute the live volume, and is deleted right after recognition. `speech.recognize` only accepts `.pcm` files under `voice-input/`.
- Tap to record replaced the original press-and-hold design, which was awkward to use. Text inputs write their initial value only once so Chinese IME composition is not interrupted, and sheets follow the keyboard height with a short transition.
- Only a successful generation or revision moves a session to the top of recent sessions; analyzing or browsing does not.
- CloudBase runs cloud functions on Node.js 16, which has no global `fetch`; HTTP goes through `lib/http.ts`, which falls back to `node-fetch`, and bundles target node16.

## 0.1.0 — M0: Scaffold (2026-10-09)

**Shipped**

- uni-app with Vue 3, Vite and TypeScript, targeting only WeChat mini programs and building to `dist/mp-weixin`. The root `project.config.json` lets WeChat DevTools open the repository root and find both the mini program and the cloud functions.
- Checks: ESLint with Vue and TypeScript rules, Prettier, type checking for the front end (vue-tsc, including templates), front-end tests, cloud functions and scripts, and Vitest unit tests. `pnpm check` runs them all plus both builds, in GitHub Actions on push and pull request and in a git pre-push hook.
- A shared contract in `shared/` with the cloud function actions and a uniform response shape, called type-safely from the front end through `callCloud()`. Cloud functions are written in TypeScript and bundled per function with esbuild into `cloudfunctions/`, starting with `data.ping`.
- Design tokens: light and dark CSS variable sets that follow the system theme.
- Base components: a navigation bar whose large title collapses on scroll, a frosted-glass tab bar, button, card, skeleton and icon.
- App shell: a single page with three tabs (Practice, Saved, Me), animated tab switching and placeholder content.
- Scripts: a smoke test that drives WeChat DevTools and takes screenshots, and `miniprogram-ci` scripts for preview QR codes, uploads and cloud function deployment.
- Process docs: `docs/REVIEW.md` (review process and checklist) and `CLAUDE.md` (collaboration conventions).

**Decisions**

- Every cloud function entry is a single `createFunction(name, handlers)` call (`cloud/src/lib/cloud.ts`), which initializes the SDK and resolves the caller once. The router rejects array payloads.
- Cloud call errors are classified carefully: timeouts first, "not deployed" only when the function name is unknown, other execution errors as such, and anything unrecognized as `INTERNAL`.
- Looping animations use `animation-play-state: var(--sv-play)`, which is paused on background tabs. Icon tiles use `--sv-tint-*` and text on accent colors uses `--sv-text-on-accent`; no hard-coded colors, so dark mode works everywhere.
- Layout classes are never put on `sv-*` components, because style isolation keeps the parent's styles from reaching them; a wrapper view is used instead, enforced by `src/conventions.test.ts`.
- Each cloud function build clears its output directory first and reads the `wx-server-sdk` version from `package.json`.
