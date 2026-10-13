/**
 * Bundle each cloud/src/functions/<name>/index.ts into an uploadable cloud function directory cloudfunctions/<name>/.
 * Shared code and third-party dependencies all go into index.js; the cloud only needs to install wx-server-sdk.
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

/** Matches the default cloud function runtime, Node.js 16.13 (what the deploy tool uses when creating functions) */
const NODE_TARGET = 'node16'

/** The wx-server-sdk installed in the cloud matches the version used for local type checking */
function wxServerSdkVersion(): string {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    devDependencies?: Record<string, string>
  }
  const version = pkg.devDependencies?.['wx-server-sdk']
  if (!version) throw new Error('wx-server-sdk is missing from devDependencies in package.json')
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
  // Always wipe and rebuild so files deleted from the source (such as config.json) don't linger in the upload directory
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
    // wx-server-sdk is installed in the cloud; bufferutil / utf-8-validate are ws's optional native speedups, not bundled
    external: ['wx-server-sdk', 'bufferutil', 'utf-8-validate'],
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

  // Copy the function's own config.json (permissions, triggers) as is
  const config = join(srcDir, name, 'config.json')
  if (existsSync(config)) copyFileSync(config, join(fnOut, 'config.json'))
}

async function main(): Promise<void> {
  const names = listFunctions()
  if (names.length === 0) throw new Error(`No cloud functions found in ${srcDir}`)

  // Remove directories of functions that no longer exist, to avoid uploading stale code
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
