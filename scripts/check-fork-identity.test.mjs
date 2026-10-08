import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'

const read = (path) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const json = (path) => JSON.parse(read(path))
const id = 'io.github.aaaynmmm.clash-verge-rev-app'
const common = json('src-tauri/tauri.conf.json')

test('desktop identities, protocols and update signatures belong to this fork', () => {
  assert.equal(common.productName, 'Clash Verge Rev App')
  assert.equal(common.mainBinaryName, 'clash-verge-rev-app')
  assert.equal(common.identifier, id)
  assert.notEqual(
    common.plugins.updater.pubkey,
    'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQyOEMyRjBCQkVGOUJEREYKUldUZnZmbStDeStNMHU5Mmo1N24xQXZwSVRYbXA2NUpzZE5oVzlqeS9Bc0t6RVV4MmtwVjBZaHgK',
  )
  assert.deepEqual(common.plugins['deep-link'].desktop.schemes, [
    'clash-verge-rev-app',
  ])
  for (const name of [
    'tauri.windows.conf',
    'tauri.macos.conf',
    'tauri.linux.conf',
    'webview2.x64',
    'webview2.x86',
    'webview2.arm64',
  ]) {
    const config = json(`src-tauri/${name}.json`)
    assert.equal(config.identifier, id)
    const update = config.plugins?.updater ?? common.plugins.updater
    assert.equal(update.pubkey, common.plugins.updater.pubkey)
    assert.ok(
      update.endpoints.every((url) =>
        url.startsWith(
          'https://github.com/AAAYNMMM/clash-verge-rev-app/releases/',
        ),
      ),
    )
  }
  assert.match(
    read('src-tauri/src/utils/init.rs'),
    /Software\\\\Classes\\\\clash-verge-rev-app/,
  )
  assert.doesNotMatch(
    read('src-tauri/src/utils/init.rs'),
    /Classes\\\\Clash(?:\\\\|")/,
  )
})

test('GUI and compiled helpers share independent service, IPC and core namespaces', () => {
  assert.match(
    read('src-tauri/Cargo.toml'),
    /path = "\.\.\/crates\/clash-verge-rev-app-service"/,
  )
  const service = 'crates/clash-verge-rev-app-service/'
  for (const file of [
    'src/channel.rs',
    'src/lib.rs',
    'src/execution_windows.rs',
    'src/execution_windows_lock.rs',
  ]) {
    const code = read(service + file)
    assert.doesNotMatch(
      code,
      /clash-verge-service|"clash_verge_service"|verge-mihomo|io\.github\.clash-verge-rev/,
    )
  }
  assert.doesNotMatch(
    read(service + 'src/bin/shared/mod.rs'),
    /io\.github\.clashverge\.helper|uninstall_old_service/,
  )
  assert.match(read(service + 'src/channel.rs'), /clash_verge_rev_app_service/)
  assert.match(read(service + 'src/channel.rs'), /cvr-app-service/)
  assert.match(
    read(service + 'resources/info.plist.tmpl'),
    /<string>cvr-app-service<\/string>/,
  )
  assert.ok(
    common.bundle.externalBin.every((name) =>
      name.startsWith('sidecar/cvr-app-mihomo'),
    ),
  )
  assert.match(
    read('scripts/prebuild.mjs'),
    /upstream service downloads are forbidden/,
  )
})

test('install and uninstall never perform upstream cleanup or global TCP reset', () => {
  const installer = read('src-tauri/packages/windows/installer.nsi')
  assert.match(installer, /RejectUpstreamDirectory/)
  assert.doesNotMatch(
    installer,
    /netsh int tcp|LegacyUninstallLoop|LegacyUserLoop/,
  )
  const mutations = installer
    .split('\n')
    .filter((line) => /Delete|KillProcess|StopService|RemoveService/.test(line))
    .join('\n')
  assert.doesNotMatch(
    mutations,
    /(?:Clash Verge|clash-verge)(?:\.exe|\.lnk|"|\\)/,
  )
  assert.doesNotMatch(
    mutations,
    /io\.github\.clash-verge-rev|"clash_verge_service"/,
  )
  assert.match(
    read('src-tauri/src/utils/schtasks.rs'),
    /TASK_NAME_USER: &str = "Clash Verge Rev App"/,
  )
  const linux = json('src-tauri/tauri.linux.conf.json').bundle.linux
  for (const pkg of [linux.deb, linux.rpm]) {
    assert.deepEqual(pkg.provides, ['clash-verge-rev-app'])
    for (const key of ['conflicts', 'replaces', 'obsoletes'])
      assert.equal(pkg[key], undefined)
  }
  assert.match(
    read('src-tauri/packages/linux/clash-verge-rev-app.desktop'),
    /MimeType=x-scheme-handler\/clash-verge-rev-app;/,
  )
})

test('default listener ports and assets cannot silently revert to upstream', () => {
  const constants = read('src-tauri/src/constants.rs')
  for (const port of [17895, 17896, 17897, 17898, 17899, 19097])
    assert.ok(constants.includes(String(port)))
  assert.match(read('src-tauri/src/config/clash.rs'), /CVR-App-TUN/)
  assert.match(read('src/assets/image/logo.svg'), /REV APP/)
  assert.match(read('src/assets/image/icon_light.svg'), /linearGradient/)
  assert.ok(!common.bundle.icon.some((path) => path.endsWith('Assets.car')))
  assert.ok(
    !existsSync(new URL('../src-tauri/icons/Assets.car', import.meta.url)),
  )
  assert.doesNotMatch(
    read('.github/workflows/release.yml'),
    /ClashVergeRev\.ClashVergeRev|submit-to-winget|notify-telegram/,
  )
})
