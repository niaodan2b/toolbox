#!/usr/bin/env bun
// 发布新版本：bun run release <patch|minor|major>

import { spawnSync } from 'node:child_process'

const LEVELS = new Set(['patch', 'minor', 'major'])
const level = process.argv[2]

if (!LEVELS.has(level)) {
  console.error('usage: bun run release <patch|minor|major>')
  process.exit(1)
}

/** 依次执行命令，任一失败立即以相同退出码退出 */
function run(command, args) {
  const { status } = spawnSync(command, args, { stdio: 'inherit' })
  if (status !== 0) {
    process.exit(status ?? 1)
  }
}

run(process.execPath, ['run', 'check'])
run(process.execPath, ['run', 'tauri-version', level, '--no-lock', '-m', 'release v%s'])
run('git', ['push', '--follow-tags'])
