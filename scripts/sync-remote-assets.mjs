import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const defaultSourcePath = process.env.BIANBU_REMOTE_SCRIPT_SOURCE || path.resolve(repoRoot, '..', 'bianbu_agent_proxy.sh')
const defaultAssetDir = path.join(repoRoot, 'assets')

export function normalizeLf (text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function sha256 (text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function extractVersion (scriptText, variableName) {
  const regex = new RegExp(`${variableName}="\\$\\{${variableName}:-([^"\\n]+)\\}"|${variableName}="([^"]+)"`)
  const match = normalizeLf(scriptText).match(regex)
  const version = match?.[1] || match?.[2]
  if (!version) {
    throw new Error(`Unable to find ${variableName} in remote script`)
  }
  return version.trim()
}

export async function syncRemoteAssets ({ sourcePath = defaultSourcePath, assetDir = defaultAssetDir } = {}) {
  const resolvedSourcePath = path.resolve(sourcePath)
  const resolvedAssetDir = path.resolve(assetDir)
  const scriptPath = path.join(resolvedAssetDir, 'bianbu_agent_proxy.sh')
  const metadataPath = path.join(resolvedAssetDir, 'bianbu_agent_proxy.meta.json')

  const rawScript = await fs.readFile(resolvedSourcePath, 'utf8')
  const script = normalizeLf(rawScript)
  const scriptVersion = extractVersion(script, 'SCRIPT_VERSION')
  const serverVersion = extractVersion(script, 'SERVER_VERSION')
  const metadata = {
    fileName: path.basename(scriptPath),
    sourceFile: path.basename(resolvedSourcePath),
    scriptVersion,
    serverVersion,
    sha256: sha256(script),
    bytes: Buffer.byteLength(script, 'utf8'),
    generatedAt: new Date().toISOString(),
  }

  await fs.mkdir(resolvedAssetDir, { recursive: true })
  await fs.writeFile(scriptPath, script, 'utf8')
  await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  return {
    scriptPath,
    metadataPath,
    metadata,
  }
}

async function main () {
  const result = await syncRemoteAssets()
  console.log(`Synced remote installer:`)
  console.log(`  source   ${defaultSourcePath}`)
  console.log(`  script   ${result.scriptPath}`)
  console.log(`  meta     ${result.metadataPath}`)
  console.log(`  version  script=${result.metadata.scriptVersion} server=${result.metadata.serverVersion}`)
  console.log(`  sha256   ${result.metadata.sha256}`)
}

if (process.argv[1] === __filename) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
