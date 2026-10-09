/**
 * 把 cloud/src/functions/<name>/index.ts 分别打包成可上传的云函数目录 cloudfunctions/<name>/。
 * 共享代码和第三方依赖都打进 index.js，云端只需安装 wx-server-sdk。
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(__dirname, '..')
const srcDir = join(root, 'cloud/src/functions')
const outDir = join(root, 'cloudfunctions')

/** 云函数运行时选择 Node.js 18 及以上 */
const NODE_TARGET = 'node18'

/** 云端安装的 wx-server-sdk 与本地类型检查用的版本保持一致 */
function wxServerSdkVersion(): string {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    devDependencies?: Record<string, string>
  }
  const version = pkg.devDependencies?.['wx-server-sdk']
  if (!version) throw new Error('package.json 的 devDependencies 里缺少 wx-server-sdk')
  return version
}

function listFunctions(): string[] {
  return readdirSync(srcDir).filter((name) => {
    const dir = join(srcDir, name)
    return statSync(dir).isDirectory() && existsSync(join(dir, 'index.ts'))
  })
}

async function buildFunction(name: string, sdkVersion: string): Promise<void> {
  const fnOut = join(outDir, name)
  // 每次都清空重建，避免源码里删掉的文件（如 config.json）残留在上传目录
  rmSync(fnOut, { recursive: true, force: true })
  mkdirSync(fnOut, { recursive: true })

  await build({
    entryPoints: [join(srcDir, name, 'index.ts')],
    outfile: join(fnOut, 'index.js'),
    bundle: true,
    platform: 'node',
    target: NODE_TARGET,
    format: 'cjs',
    tsconfig: join(root, 'cloud/tsconfig.json'),
    external: ['wx-server-sdk'],
    legalComments: 'none',
    logLevel: 'warning',
  })

  const pkg = {
    name,
    version: '1.0.0',
    private: true,
    main: 'index.js',
    dependencies: { 'wx-server-sdk': sdkVersion },
  }
  writeFileSync(join(fnOut, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)

  // 函数自己的 config.json（权限、触发器）原样带上
  const config = join(srcDir, name, 'config.json')
  if (existsSync(config)) copyFileSync(config, join(fnOut, 'config.json'))
}

async function main(): Promise<void> {
  const names = listFunctions()
  if (names.length === 0) throw new Error(`没有在 ${srcDir} 找到云函数`)

  // 清掉已经不存在的函数目录，避免上传过期代码
  if (existsSync(outDir)) {
    for (const entry of readdirSync(outDir)) {
      if (!names.includes(entry)) rmSync(join(outDir, entry), { recursive: true, force: true })
    }
  }

  const sdkVersion = wxServerSdkVersion()
  for (const name of names) {
    await buildFunction(name, sdkVersion)
    console.info(`✓ cloudfunctions/${name}`)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
