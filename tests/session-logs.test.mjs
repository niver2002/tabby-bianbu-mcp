import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const sourcePath = new URL('../src/sessionLogs.ts', import.meta.url)
const sourceCode = await fs.readFile(sourcePath, 'utf8')
const transpiled = ts.transpileModule(sourceCode, {
  compilerOptions: {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-logs-test-'))
const tempModulePath = path.join(tempDir, 'sessionLogs.mjs')
await fs.writeFile(tempModulePath, transpiled, 'utf8')
const sessionLogs = await import(pathToFileURL(tempModulePath).href)

test('createSessionName encodes kind action and UTC timestamp', () => {
  const sessionName = sessionLogs.createSessionName('maintenance', 'repair', new Date('2026-03-20T11:22:33Z'))
  assert.equal(sessionName, 'maintenance-repair-20260320T112233Z')
})

test('renderLocalSessionLog includes timestamps and session names', () => {
  const session = sessionLogs.createSessionLog({
    action: 'up',
    kind: 'maintenance',
    remotePath: '/tmp/bianbu_agent_proxy.sh',
    sessionName: 'maintenance-up-20260320T112233Z',
    startedAt: '2026-03-20T11:22:33Z',
  })
  sessionLogs.appendSessionLogEntry(session, {
    timestamp: '2026-03-20T11:22:34Z',
    level: 'info',
    message: 'Uploaded installer',
  })
  sessionLogs.appendSessionLogEntry(session, {
    timestamp: '2026-03-20T11:22:35Z',
    level: 'error',
    message: 'Health poll failed',
    details: '502 upstream timeout',
  })

  const text = sessionLogs.renderLocalSessionLog(session)

  assert.match(text, /session_name=maintenance-up-20260320T112233Z/)
  assert.match(text, /\[2026-03-20T11:22:34Z\] \[maintenance-up-20260320T112233Z\] \[INFO\] Uploaded installer/)
  assert.match(text, /\[2026-03-20T11:22:35Z\] \[maintenance-up-20260320T112233Z\] \[ERROR\] Health poll failed/)
  assert.match(text, /502 upstream timeout/)
})

test('buildLogDownloadPayload generates timestamped file names and combines remote artifacts', () => {
  const session = sessionLogs.createSessionLog({
    action: 'repair',
    kind: 'maintenance',
    remotePath: '/tmp/bianbu_agent_proxy.sh',
    remoteLogPath: '/tmp/bianbu_agent_proxy.sh.log',
    remoteStatusPath: '/tmp/bianbu_agent_proxy.sh.status.json',
    sessionName: 'maintenance-repair-20260320T112233Z',
    startedAt: '2026-03-20T11:22:33Z',
  })
  const payload = sessionLogs.buildRemoteLogDownloadPayload({
    downloadedAt: new Date('2026-03-20T12:00:00Z'),
    remoteLogText: '[2026-03-20T11:22:34Z] [bianbu_agent_proxy.sh] [maintenance-repair-20260320T112233Z] ok',
    remoteStatusText: '{"ok":true}',
    session,
  })

  assert.equal(payload.fileName, 'maintenance-repair-20260320T112233Z-remote-20260320T120000Z.log')
  assert.match(payload.content, /downloaded_at=2026-03-20T12:00:00Z/)
  assert.match(payload.content, /session_name=maintenance-repair-20260320T112233Z/)
  assert.match(payload.content, /--- remote_status ---/)
  assert.match(payload.content, /--- remote_log ---/)
})