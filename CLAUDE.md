# Solvane working agreement

A WeChat mini program that helps people turn ideas they have in Chinese into idiomatic English and practice reciting them. Design and progress: [README.md](README.md).

## How we work

- **Ask the owner before launching WeChat DevTools** (smoke tests, screenshots, deploying through DevTools), and finish static checks first. Once approved, drive it through `scripts/devtools.ts` (`withAutomator()` / `runDevtoolsCli()`). No need to hide the window or quit it afterwards; leave it open for next time. `pnpm preview` does not need DevTools and can be used directly for the owner's real-device acceptance

- Language: chat with the owner in Chinese. Everything written into the repository is English: code comments, docs, stage docs, test titles, script output, commit messages, PR descriptions
- Exceptions that stay Chinese:
  - UI text the user sees (templates, toasts, `AppError` / `CloudError` messages, user-facing labels), because the product is for Chinese speakers
  - Anything sent to the LLM: prompts in `cloud/src/prompts/` and the JSON-repair feedback in `cloud/src/lib/llm/json.ts`
  - Strings that must match external Chinese text: WeChat and Tencent Cloud error messages (e.g. the regexes in `scripts/mp-ci.ts`), the DevTools data directory in `scripts/devtools.ts`
  - Test fixtures that model Chinese input or output
  - Chinese UI or console labels quoted after an English gloss so readers can find them, e.g. `Me → User ID (「我的 → 用户 ID」)`
- Discuss new requirements and settle the details before writing code
- Work in stages; every stage must go through all six steps of [docs/REVIEW.md](docs/REVIEW.md) before it is merged
- Stage docs live in `docs/stages/`; start each stage by writing its task list and acceptance criteria. Earlier stages are summarized in [CHANGELOG.md](CHANGELOG.md)

## Common commands

```bash
pnpm dev          # development build (watch), output to dist/mp-weixin
pnpm build        # production build
pnpm build:cloud  # bundle cloud functions into cloudfunctions/
pnpm check        # run before every commit: format, lint, types, tests, build (also runs before git push)
pnpm smoke        # smoke test: drives DevTools and screenshots each page (needs login and the service port; ask the owner first)
pnpm preview      # generate the preview QR code at .ci/preview.png
pnpm upload       # upload a development version / update the trial version
pnpm deploy:cloud # deploy cloud functions (optionally by name); if the IP whitelist blocks it, use pnpm deploy:cloud:devtools
pnpm cloud:config # write .keys/cloud.env into each cloud function's environment variables and set timeouts
pnpm showcase     # render docs/showcase/flow.html to WebP and MP4 in light and dark (tools from SHOWCASE_TOOLS, see scripts/showcase.ts)
```

Open the **repository root** in WeChat DevTools (the root `project.config.json` points to the build output and the cloud function directory).

## Layout

- `src/`: mini program frontend. The three tabs are in `src/pages/index/tabs/`; other pages go into subpackages `src/pkg-*/`
- `src/components/sv-*/`: base components, auto-registered by easycom; register every new one in `src/components.d.ts`
- `cloud/src/functions/<name>/`: cloud function source; `index.ts` is the entry, business logic goes in `handlers.ts`
- `cloud/src/lib/`: code shared by cloud functions
- `shared/`: types and constants shared by frontend and backend
- `cloudfunctions/`, `dist/`: build output, not committed

## Coding conventions

- **New cloud function action**: declare its input and output in `shared/api.ts` first, implement it in that function's `handlers.ts`, and call it from the frontend with `callCloud()`
- **New cloud function**: the entry is just `export const main = createFunction('<name>', handlers)` (`cloud/src/lib/cloud.ts`); never initialize the SDK in individual functions
- **Errors**: throw `AppError` for expected business errors (its message is shown to the user, in Chinese); anything else is turned into `INTERNAL` by the router
- **Styles**: use only the variables in `src/styles/tokens.scss`; no hard-coded colors or animation parameters; check both light and dark mode. Icon tiles use `--sv-tint-*`; text and icons on the accent color use `--sv-text-on-accent`
- **Looping animations**: add `animation-play-state: var(--sv-play)` so tabs in the background pause automatically
- **Style mixins** (`src/styles/mixins.scss`): `sv-hit-area` expands small tap targets to 44px; `sv-appear` fades content in when it replaces a skeleton; `sv-spinning` for loading spinners. Put `@include` after plain declarations (otherwise Sass emits the mixed-decls deprecation warning)
- **Navigation**: use `navigateTo()` from `src/utils/nav.ts`, which guards against double taps
- **State updates**: in high-frequency callbacks (scrolling, recording, playback), update reactive state only when the value actually changes (see `useCollapsingTitle`)

## Security rules

- Secrets live only in cloud function environment variables or encrypted in the database; never in the frontend, the repository or logs
- Files in `.keys/` (code-upload key, `cloud.env` with cloud function secrets): **never read, print or copy their contents**; use them only through scripts, and script output must never contain any value
- New cloud function environment variable: declare it in `cloud/src/function-config.ts`, document it in `cloud.env.example`, and push it with `pnpm cloud:config`
- Cloud function logs never print payloads
- All data access goes through cloud functions and checks ownership by `OPENID`
- The repository is public: never write environment IDs, OpenIDs, IP addresses or other deployment details into tracked files, commit messages or PRs

## Known pitfalls

- The uni-app compiler relies on undeclared transitive dependencies, so pnpm needs `shamefullyHoist: true` (see `pnpm-workspace.yaml`)
- `vue` is pinned to 3.4.21 as required by uni-app; don't upgrade it casually
- `package.json` must not set `"type": "module"`, or uni's Vite plugin fails to load
- Object-syntax `style` in the mini program drops `-webkit-` prefixes; build a string when a prefix is needed (see `sv-icon`)
- To use global style classes (such as `.sv-headline`) inside a component, set `styleIsolation: 'apply-shared'` in `defineOptions`
- Import the cloud SDK as `import * as cloud from 'wx-server-sdk'`; the type declaration of `DYNAMIC_CURRENT_ENV` is wrong and is asserted once in `lib/cloud.ts`
- A native `button` with `disabled` gets WeChat's built-in gray style with specificity (0,2,1); `sv-button` overrides it, so take care when using a native button directly
- Page style selectors don't reach into child components (style isolation), but CSS variables are inherited; use variables to control styles across components
- **Don't add a class to an `sv-*` component for layout**: the class is passed to the child's root node, but the parent's styles can't reach it. Wrap it in your own `view` outside the component or inside the slot (checked by `src/conventions.test.ts`)
- ESLint matches a template component `<word-picker>` with a script variable of the same camelCase name `wordPicker` and reports the component as unused; give the state variable a different name
- Put new panels that rely on `position: fixed` (`sv-sheet` etc.) outside the page's scroll-view
- Every `wx.cloud.callFunction` errMsg starts with `cloud.callFunction:fail`, so regexes that classify errors by message must not loosely match `function`
- The cloud function runtime is Node.js 16.13 (the default when the deploy tool created the functions; it can't be changed afterwards): **there is no global `fetch`**, so send HTTP requests with `defaultFetch` from `cloud/src/lib/http.ts`; the bundle targets node16, so don't use Node 18+ APIs (`structuredClone`, `Array.prototype.findLast`, etc.)
- The code-upload key in `.keys/` can deploy cloud functions; guard it, and reset it in the WeChat MP console if you suspect a leak
- `miniprogram-ci` tasks keep a network connection open and the process doesn't exit on its own; scripts must call `process.exit` when done
- The DevTools CLI exits with 0 even when part of a command fails; judge by its output (`failIf` in `runDevtoolsCli`)
