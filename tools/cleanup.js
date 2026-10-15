/* eslint-disable */
const fs = require('fs')
const Path = require('path')
/* eslint-enable */

const BUILD_FOLDERS = ['cjs', 'esm', 'umd', 'types']

const folder = process.argv.slice(2)[0]

// Only the known build folders can be removed; anything else is rejected
if (folder && !BUILD_FOLDERS.includes(folder)) {
  console.error(`Invalid folder "${folder}". Expected one of: ${BUILD_FOLDERS.join(', ')}`)
  process.exit(1)
}

const targets = folder ? [folder] : BUILD_FOLDERS

targets.forEach((target) => {
  fs.rmSync(Path.join(__dirname, '../dist', target), { recursive: true, force: true })
})
