# Solvane 协作约定

微信小程序，帮助用户把中文想法变成地道英文并练习背诵。设计与进度见 [README.md](README.md)。

## 工作方式

- 自动化测试不要打扰使用者：**启动开发者工具（冒烟测试、截图）前必须先得到使用者确认**，先做完静态检查；获准后只通过 `scripts/devtools.ts` 的 `withQuietDevtools()` 驱动。`pnpm preview` 不需要开发者工具，可以直接用来给使用者真机验收

- 和使用者用中文沟通；界面文案、文档、代码注释也用中文
- 新需求先讨论、敲定细节，再动手开发
- 按阶段推进，每个阶段必须完整走完 [docs/REVIEW.md](docs/REVIEW.md) 的六步流程才能合并
- 阶段文档放在 `docs/stages/`，开工先写任务清单和验收标准

## 常用命令

```bash
pnpm dev          # 开发构建（监听），输出到 dist/mp-weixin
pnpm build        # 生产构建
pnpm build:cloud  # 打包云函数到 cloudfunctions/
pnpm check        # 提交前必跑：格式、规范、类型、测试、构建（git push 前也会自动跑）
pnpm smoke        # 冒烟测试：后台驱动开发者工具并自动隐藏窗口（需已登录、开启服务端口）
pnpm preview      # 生成预览二维码 .ci/preview.png
pnpm upload       # 上传开发版 / 更新体验版
pnpm deploy:cloud # 部署云函数（可跟函数名）；IP 被白名单拦时用 pnpm deploy:cloud:devtools
pnpm cloud:config # 把 .keys/cloud.env 写入各云函数的环境变量并设置超时
```

微信开发者工具直接打开**仓库根目录**（根目录的 `project.config.json` 指向构建产物和云函数目录）。

## 目录约定

- `src/`：小程序前端。三个 tab 在 `src/pages/index/tabs/`，其他页面放分包 `src/pkg-*/`
- `src/components/sv-*/`：基础组件，easycom 自动注册；新增后必须登记到 `src/components.d.ts`
- `cloud/src/functions/<name>/`：云函数源码，`index.ts` 是入口，业务写在 `handlers.ts`
- `cloud/src/lib/`：云函数共享代码
- `shared/`：前后端共用的类型与常量
- `cloudfunctions/`、`dist/`：构建产物，不提交

## 编码约定

- **新增云函数接口**：先在 `shared/api.ts` 登记 action 的入参和出参，再在对应函数的 `handlers.ts` 实现，前端用 `callCloud()` 调用
- **新增云函数**：入口只写 `export const main = createFunction('<name>', handlers)`（`cloud/src/lib/cloud.ts`），不要在各函数里重复初始化 SDK
- **错误**：可预期的业务错误抛 `AppError`（message 是给用户看的中文）；其他异常由路由统一转成 `INTERNAL`
- **样式**：只用 `src/styles/tokens.scss` 里的变量，不写死颜色和动效参数；深浅色都要检查。图标方块用 `--sv-tint-*`，强调色上的文字和图标用 `--sv-text-on-accent`
- **循环动画**：加上 `animation-play-state: var(--sv-play)`，切到后台的 tab 会自动暂停
- **状态更新**：滚动、录音、播放等高频回调里，只在值真正变化时更新响应式状态（参考 `useCollapsingTitle`）

## 安全红线

- 密钥只放云函数环境变量或加密存库；不进前端、仓库、日志
- `.keys/` 里的文件（代码上传密钥、`cloud.env` 云函数密钥）**不要读取、打印或转存内容**，只通过脚本使用；脚本输出不能包含任何值
- 新增云函数环境变量时：在 `cloud/src/function-config.ts` 声明，在 `cloud.env.example` 加说明，用 `pnpm cloud:config` 下发
- 云函数日志不打印 payload
- 所有数据访问都经云函数，并按 `OPENID` 校验归属

## 已知的坑

- uni-app 编译器依赖未声明的传递依赖，pnpm 需要 `shamefullyHoist: true`（见 `pnpm-workspace.yaml`）
- `vue` 版本锁定在 uni-app 要求的 3.4.21，不要随意升级
- `package.json` 不能设 `"type": "module"`，否则 uni 的 vite 插件加载失败
- 小程序里对象写法的 `style` 会丢掉 `-webkit-` 前缀，需要前缀时拼字符串（见 `sv-icon`）
- 组件里要用全局样式类（如 `.sv-headline`），需在 `defineOptions` 里设置 `styleIsolation: 'apply-shared'`
- 云函数 SDK 要用 `import * as cloud from 'wx-server-sdk'`；`DYNAMIC_CURRENT_ENV` 的类型声明有误，已在 `lib/cloud.ts` 里统一断言
- 原生 `button` 带 `disabled` 时会套用微信内置的灰色样式，优先级 (0,2,1)；`sv-button` 已覆盖，直接用原生按钮时要注意
- 页面里的样式选择器进不了子组件（样式隔离），但 CSS 变量可以继承下去；需要跨组件控制样式时用变量
- **不要给 `sv-*` 组件加 class 来排版**：class 虽然会传到子组件根节点，但父组件的样式管不到它。要在组件外或插槽内包一层自己的 `view`（`src/conventions.test.ts` 会检查）
- `wx.cloud.callFunction` 的 errMsg 都以 `cloud.callFunction:fail` 开头，按错误文案归类时正则不能宽松匹配 `function`
- 云函数运行时是 Node.js 16.13（部署工具创建函数时的默认值，创建后改不了）：**没有全局 `fetch`**，发 HTTP 请求用 `cloud/src/lib/http.ts` 的 `defaultFetch`；打包目标是 node16，不要用 Node 18+ 才有的 API（`structuredClone`、`Array.prototype.findLast` 等）
- `miniprogram-ci` 受 IP 白名单限制，家用宽带 IP 会变；被拦时用 `pnpm deploy:cloud:devtools`
- 开发者工具命令行部分失败时退出码仍是 0，要看输出判断（`runDevtoolsCli` 的 `failIf`）
