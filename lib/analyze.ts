import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import { URL } from 'url'

const execFileAsync = promisify(execFile)
const MODCRAWL_PATH = path.join(process.cwd(), 'modcrawl')
const MAX_FILE_SIZE = 100 * 1024 * 1024
const EXEC_TIMEOUT = 30_000
const DOWNLOAD_TIMEOUT = 60_000

export function checkBinary(): string | null {
  if (!existsSync(MODCRAWL_PATH)) {
    return `modcrawl binary not found at ${MODCRAWL_PATH}. This API requires the modcrawl CLI to be installed alongside the server.`
  }
  try {
    const stat = statSync(MODCRAWL_PATH)
    if (!(stat.mode & 0o111)) {
      return `modcrawl binary at ${MODCRAWL_PATH} is not executable. Run: chmod +x ${MODCRAWL_PATH}`
    }
  } catch {
    return `Cannot access modcrawl binary at ${MODCRAWL_PATH}`
  }
  return null
}

const ZIP_MAGIC = Buffer.from([0x50, 0x4B])

export interface AnalyzeOptions {
  type: boolean
  metadata: boolean
  dep: boolean
  includeJarInJar: boolean
}

function validateJar(buffer: Buffer): void {
  if (buffer.length < 4) {
    throw new Error('File is too small to be a valid JAR')
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  }
  if (!buffer.subarray(0, 2).equals(ZIP_MAGIC)) {
    throw new Error('Invalid JAR file: missing ZIP magic bytes')
  }
}

function getCmdArgs(options: AnalyzeOptions, tmpPath: string): { cmd: string; args: string[] }[] {
  const commands: { cmd: string; args: string[] }[] = []

  if (options.type) {
    commands.push({ cmd: 'type', args: ['type', tmpPath] })
  }
  if (options.metadata) {
    commands.push({ cmd: 'metadata', args: ['metadata', '-j', tmpPath] })
  }
  if (options.dep) {
    const depArgs = ['dep', '-j']
    if (options.includeJarInJar) depArgs.push('--include-jar-in-jar')
    depArgs.push(tmpPath)
    commands.push({ cmd: 'dependencies', args: depArgs })
  }

  return commands
}

function isPrivateIP(hostname: string): boolean {
  const parts = hostname.split('.').map(Number)
  if (parts.length === 4 && !parts.some(isNaN)) {
    if (parts[0] === 127) return true
    if (parts[0] === 10) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
  }
  return hostname === 'localhost' || hostname === '0.0.0.0' || hostname.endsWith('.local') || hostname.endsWith('.internal')
}

export async function fetchJarFromUrl(urlStr: string, signal?: AbortSignal): Promise<Buffer> {
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    throw new Error('Invalid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed')
  }

  if (isPrivateIP(parsed.hostname)) {
    throw new Error('URL points to a private or local network address')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)
  const combined = signal ? combineSignals(signal, controller.signal) : controller.signal

  try {
    const res = await fetch(urlStr, {
      signal: combined,
      redirect: 'follow',
    })

    if (!res.ok) {
      throw new Error(`Download failed: server returned ${res.status} ${res.statusText}`)
    }

    const contentLength = res.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${contentLength} bytes (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`)
    }

    const chunks: Buffer[] = []
    let total = 0

    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_FILE_SIZE) {
        reader.cancel()
        throw new Error(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
      }
      chunks.push(Buffer.from(value))
    }

    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timeout)
  }
}

function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason)
      return controller.signal
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true })
  }
  return controller.signal
}

export async function analyzeJar(buffer: Buffer, options: AnalyzeOptions) {
  validateJar(buffer)

  const tmpPath = path.join('/tmp', `modcrawl-${randomUUID()}.jar`)

  try {
    await writeFile(tmpPath, buffer)

    const commands = getCmdArgs(options, tmpPath)
    const results: Record<string, unknown> = {}

    for (const { cmd, args } of commands) {
      const { stdout } = await execFileAsync(MODCRAWL_PATH, args, {
        timeout: EXEC_TIMEOUT,
      })
      const trimmed = stdout.trim()

      if (cmd === 'type') {
        const parts = trimmed.split(':')
        results.type = parts.length > 1 ? parts.slice(1).join(':').trim() : trimmed
      } else {
        try {
          results[cmd] = JSON.parse(trimmed)
        } catch {
          results[cmd] = trimmed
        }
      }
    }

    return { ok: true as const, results }
  } finally {
    unlink(tmpPath).catch(() => {})
  }
}
