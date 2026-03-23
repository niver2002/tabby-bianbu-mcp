import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const sourcePath = new URL('../src/remoteRelease.ts', import.meta.url)
const sourceCode = await fs.readFile(sourcePath, 'utf8')
const transpiled = ts.transpileModule(sourceCode, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remote-release-test-'))
const tempModulePath = path.join(tempDir, 'remoteRelease.mjs')
await fs.writeFile(tempModulePath, transpiled, 'utf8')
const remoteRelease = await import(pathToFileURL(tempModulePath).href)

test('normalizeMcpUrl trims trailing slash', () => {
  assert.equal(remoteRelease.normalizeMcpUrl('https://example.com/mcp///'), 'https://example.com/mcp')
})

test('remoteDirName returns parent directory', () => {
  assert.equal(remoteRelease.remoteDirName('/tmp/bianbu_agent_proxy.sh'), '/tmp')
  assert.equal(remoteRelease.remoteDirName('bianbu_agent_proxy.sh'), '.')
})

test('buildDetachedInstallerCommand launches installer in background', () => {
  const command = remoteRelease.buildDetachedInstallerCommand(
    '/tmp/bianbu_agent_proxy.sh',
    'up',
    '/tmp/bianbu_agent_proxy.sh.log',
    '/tmp/bianbu_agent_proxy.sh.status.json',
    'maintenance-up-20260320T112233Z',
  )
  assert.match(command, /nohup bash -lc/)
  assert.match(command, /bash .*\/tmp\/bianbu_agent_proxy\.sh.* up >/)
  assert.match(command, /__BIANBU_UPGRADE_STARTED__/)
  assert.match(command, /status\.json/)
  assert.match(command, /SESSION_NAME=/)
  assert.match(command, /maintenance-up-20260320T112233Z/)
  assert.match(command, /rm -f/)
  assert.match(command, /bianbu_agent_proxy\.sh\.log/)
  assert.match(command, /bianbu_agent_proxy\.sh\.status\.json/)
})

test('parseRemoteInstallerStatus normalizes installer completion payload', () => {
  const status = remoteRelease.parseRemoteInstallerStatus('{"ok":true,"exit_code":0,"finished_at":"2026-03-20T10:00:00Z","log_path":"/tmp/bianbu_agent_proxy.sh.log","session_name":"maintenance-up-20260320T112233Z"}')

  assert.equal(status.ok, true)
  assert.equal(status.exitCode, 0)
  assert.equal(status.finishedAt, '2026-03-20T10:00:00Z')
  assert.equal(status.logPath, '/tmp/bianbu_agent_proxy.sh.log')
  assert.equal(status.sessionName, 'maintenance-up-20260320T112233Z')
})

test('parseRemoteHealth normalizes capabilities', () => {
  const health = remoteRelease.parseRemoteHealth({
    ok: true,
    script_version: '1.2.3',
    server_version: '2.3.4',
    file_root: '/srv',
    transport_mode: 'stateless',
    tools: ['rename_path', 'open_shell_session', 'upload_chunked_begin', 'download_chunked_begin'],
  })

  assert.equal(health.scriptVersion, '1.2.3')
  assert.equal(health.serverVersion, '2.3.4')
  assert.equal(health.fileRoot, '/srv')
  assert.equal(health.supports.renamePath, true)
  assert.equal(health.supports.shellSession, true)
  assert.equal(health.supports.chunkedTransfers, true)
})

test('loadBundledInstaller validates metadata hash', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'remote-installer-assets-'))
  const moduleDir = path.join(tempRoot, 'dist')
  const assetDir = path.join(tempRoot, 'assets')
  const script = '#!/usr/bin/env bash\nSCRIPT_VERSION="${SCRIPT_VERSION:-1.0.0}"\nSERVER_VERSION="${SERVER_VERSION:-1.0.1}"\n'
  await fs.mkdir(moduleDir, { recursive: true })
  await fs.mkdir(assetDir, { recursive: true })
  await fs.writeFile(path.join(assetDir, 'bianbu_agent_proxy.sh'), script, 'utf8')
  await fs.writeFile(path.join(assetDir, 'bianbu_agent_proxy.meta.json'), JSON.stringify({
    fileName: 'bianbu_agent_proxy.sh',
    sourceFile: 'bianbu_agent_proxy.sh',
    scriptVersion: '1.0.0',
    serverVersion: '1.0.1',
    sha256: createHash('sha256').update(script, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(script, 'utf8'),
    generatedAt: new Date().toISOString(),
  }), 'utf8')

  const installer = remoteRelease.loadBundledInstaller(moduleDir)
  assert.equal(installer.metadata.scriptVersion, '1.0.0')
  assert.equal(installer.metadata.serverVersion, '1.0.1')

  await fs.writeFile(path.join(assetDir, 'bianbu_agent_proxy.meta.json'), JSON.stringify({
    fileName: 'bianbu_agent_proxy.sh',
    sourceFile: 'bianbu_agent_proxy.sh',
    scriptVersion: '1.0.0',
    serverVersion: '1.0.1',
    sha256: 'deadbeef',
    bytes: Buffer.byteLength(script, 'utf8'),
    generatedAt: new Date().toISOString(),
  }), 'utf8')

  assert.throws(() => remoteRelease.loadBundledInstaller(moduleDir), /SHA-256 mismatch/)
})
