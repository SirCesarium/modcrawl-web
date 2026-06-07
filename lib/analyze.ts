import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'

const execFileAsync = promisify(execFile)
const MODCRAWL_PATH = path.join(process.cwd(), 'modcrawl')
const MAX_FILE_SIZE = 100 * 1024 * 1024
const EXEC_TIMEOUT = 30_000

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
