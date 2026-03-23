import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { extractVersion, normalizeLf, sha256, syncRemoteAssets } from '../scripts/sync-remote-assets.mjs'

test('normalizeLf converts CRLF and CR to LF', () => {
  assert.equal(normalizeLf('a\r\nb\rc\n'), 'a\nb\nc\n')
})

test('extractVersion supports shell defaults syntax', () => {
  const script = 'SCRIPT_VERSION="${SCRIPT_VERSION:-1.2.3}"\nSERVER_VERSION="${SERVER_VERSION:-2.3.4}"\n'
  assert.equal(extractVersion(script, 'SCRIPT_VERSION'), '1.2.3')
  assert.equal(extractVersion(script, 'SERVER_VERSION'), '2.3.4')
})

test('syncRemoteAssets writes normalized installer and metadata', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bianbu-sync-'))
  const sourcePath = path.join(tempRoot, 'source.sh')
  const assetDir = path.join(tempRoot, 'assets')
  const script = '#!/usr/bin/env bash\r\nSCRIPT_VERSION="${SCRIPT_VERSION:-9.9.9}"\r\nSERVER_VERSION="${SERVER_VERSION:-8.8.8}"\r\necho ok\r\n'
  await fs.writeFile(sourcePath, script, 'utf8')

  const result = await syncRemoteAssets({ sourcePath, assetDir })
  const writtenScript = await fs.readFile(result.scriptPath, 'utf8')
  const metadata = JSON.parse(await fs.readFile(result.metadataPath, 'utf8'))

  assert.equal(writtenScript.includes('\r'), false)
  assert.equal(metadata.scriptVersion, '9.9.9')
  assert.equal(metadata.serverVersion, '8.8.8')
  assert.equal(metadata.bytes, Buffer.byteLength(writtenScript, 'utf8'))
  assert.equal(metadata.sha256, sha256(writtenScript))
})
