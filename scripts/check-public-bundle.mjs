import { readFileSync, statSync } from 'node:fs'
import process from 'node:process'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: node scripts/check-public-bundle.mjs <executable>...')
  process.exitCode = 2
} else {
  const disallowed = [
    /[a-z]:[\\/]Users[\\/](?!Public[\\/]|Default[\\/])[^\\/\x00]{1,100}[\\/]/i,
    /[a-z]:[\\/]Downloads[\\/](?:cwapi|workspaces)[^\\/\x00]{0,100}/i,
    /\/home\/[^/\x00]{1,100}\//i,
    /\/Users\/[^/\x00]{1,100}\//i,
  ]
  let failed = false
  for (const file of files) {
    try {
      const path = file.replaceAll('\\', '/')
      const buffer = readFileSync(path)
      const encodings = [buffer.toString('latin1'), buffer.toString('utf16le')]
      const leaked = disallowed.some((pattern) =>
        encodings.some((value) => pattern.test(value)),
      )
      console.log(
        (leaked ? 'FAIL' : 'PASS') +
          ' path metadata: ' +
          path +
          ' (' +
          statSync(path).size +
          ' bytes)',
      )
      if (leaked) failed = true
    } catch (error) {
      failed = true
      console.error(
        'FAIL unable to inspect: ' +
          file +
          ' (' +
          (error.code ?? error.name) +
          ')',
      )
    }
  }
  if (failed) process.exitCode = 1
}
