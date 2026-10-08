import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, resolve } from 'node:path'
import process from 'node:process'

if (process.platform !== 'win32') {
  throw new Error('This public bundle driver currently supports Windows only')
}

const root = resolve(import.meta.dirname, '..')
const profile = process.argv.includes('--fast') ? 'fast-release' : 'release'
const home = homedir()
const cargoHome = process.env.CVR_PUBLIC_CARGO_HOME
if (
  !cargoHome ||
  resolve(cargoHome).toLowerCase().startsWith(home.toLowerCase())
) {
  throw new Error(
    'CVR_PUBLIC_CARGO_HOME must specify a build-only cache outside the user profile',
  )
}
const sources = [
  home,
  home.replaceAll('\\', '/'),
  root,
  root.replaceAll('\\', '/'),
  cargoHome,
  cargoHome.replaceAll('\\', '/'),
]
const encodedFlags = [...new Set(sources)].flatMap((source) => [
  '--remap-path-prefix',
  source + '=/build',
])
encodedFlags.push('-C', 'link-arg=/PDBALTPATH:%_PDB%')
const env = { ...process.env, CARGO_HOME: cargoHome }
delete env.RUSTFLAGS
env.PATH = resolve(home, '.cargo', 'bin') + delimiter + env.PATH
env.CARGO_ENCODED_RUSTFLAGS = encodedFlags.join('\x1f')
env.NODE_OPTIONS ||= '--max-old-space-size=4096'

const run = (args) => {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(args[0] + ' failed (' + result.status + ')')
}

run(['scripts/prebuild.mjs', 'x86_64-pc-windows-msvc'])
const command = [
  'node_modules/@tauri-apps/cli/tauri.js',
  'build',
  '--ci',
  '--bundles',
  'nsis',
  '--',
  '--locked',
]
if (profile === 'fast-release') command.push('--profile', profile)
const localOverride = resolve(root, '.git/windows-local-build.json')
if (existsSync(localOverride)) command.splice(5, 0, '--config', localOverride)
run(command)

const binary =
  'target/' +
  (profile === 'release' ? 'release' : profile) +
  '/clash-verge-rev-app.exe'
const services = [
  'cvr-app-service.exe',
  'cvr-app-service-install.exe',
  'cvr-app-service-uninstall.exe',
].map((name) => 'src-tauri/resources/' + name)
for (const file of [binary, ...services]) {
  if (!existsSync(resolve(root, file))) {
    throw new Error('Missing expected binary: ' + file)
  }
}
run(['scripts/check-public-bundle.mjs', binary, ...services])
console.log('Public Windows build passed local-path inspection.')
