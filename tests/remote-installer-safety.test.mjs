import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'

const installerSource = new URL('../../bianbu_agent_proxy.sh', import.meta.url)
const installerScript = await fs.readFile(installerSource, 'utf8')

test('apply_release stages the new release before cutting over the live install', () => {
  const applyReleaseBlock = installerScript.match(/apply_release\(\) \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(applyReleaseBlock, /prepare_release_root/)
  assert.match(applyReleaseBlock, /activate_release_root/)
  assert.doesNotMatch(applyReleaseBlock, /cleanup_legacy_install/)
})

test('installer script includes automatic rollback hooks for failed upgrades', () => {
  assert.match(installerScript, /cleanup_failed_release/)
  assert.match(installerScript, /ROLLBACK_ON_EXIT/)
  assert.match(installerScript, /自动回滚/)
})