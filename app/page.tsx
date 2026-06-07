'use client'

import { useState, useRef, useCallback, type FormEvent, type DragEvent, type ReactNode } from 'react'

interface Results {
  type?: string
  metadata?: Record<string, unknown>
  dependencies?: unknown
}

function camelToLabel(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, s => s.toUpperCase())
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm leading-relaxed">
      <span className="text-zinc-400 dark:text-zinc-500 truncate">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function Tag({ children }: { children: string }) {
  return (
    <span className="inline-block rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  )
}

function Badge({ children, variant = 'default' }: { children: string; variant?: 'default' | 'required' | 'optional' | 'incompatible' | 'embedded' }) {
  const colors = {
    default: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    required: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
    optional: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300',
    incompatible: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
    embedded: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300',
  }
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${colors[variant]}`}>
      {children}
    </span>
  )
}

function renderDepItem(dep: Record<string, unknown>, i: number): ReactNode {
  const name = dep.name ?? dep.modId ?? dep.id
  const kind = dep.kind ?? dep.type
  const vr = dep.version_range as Record<string, unknown> | undefined
  const versionRange = vr?.raw ?? dep.versionRange ?? dep.version ?? ''

  const badgeVariant = (() => {
    const k = String(kind ?? '').toLowerCase()
    if (k === 'required') return 'required' as const
    if (k === 'optional') return 'optional' as const
    if (k === 'incompatible') return 'incompatible' as const
    return 'default' as const
  })()

  return (
    <div key={i} className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${badgeVariant === 'required' ? 'bg-blue-500' : badgeVariant === 'optional' ? 'bg-yellow-400' : badgeVariant === 'incompatible' ? 'bg-red-400' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
        <span className="text-sm font-medium truncate">{name ? String(name) : 'unknown'}</span>
        {badgeVariant !== 'default' && <Badge variant={badgeVariant}>{kind as string}</Badge>}
      </div>
      {versionRange && (
        <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 font-mono">{String(versionRange)}</span>
      )}
    </div>
  )
}

function renderValue(value: unknown, depth = 0): ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-zinc-400 italic">—</span>
  }

  if (typeof value === 'string') {
    if (!value || value === 'null') return <span className="text-zinc-400 italic">—</span>
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return (
        <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline truncate block">
          {value}
        </a>
      )
    }
    return <span>{value}</span>
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="font-mono text-xs">{String(value)}</span>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-zinc-400 italic">—</span>

    const allStrings = value.every(v => typeof v === 'string')
    const allDepObjs = value.every(v => typeof v === 'object' && v && ('modId' in v || 'id' in v))

    if (allStrings) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, i) => <Tag key={i}>{item}</Tag>)}
        </div>
      )
    }

    if (allDepObjs) {
      return (
        <div className="flex flex-col gap-2">
          {value.map((item, i) => renderDepItem(item as Record<string, unknown>, i))}
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-2">
        {value.map((item, i) => {
          if (typeof item === 'object' && item) {
            const obj = item as Record<string, unknown>
            const firstVal = Object.values(obj).find(v => typeof v === 'string')
            return (
              <div key={i} className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-2 text-sm">
                {firstVal ? String(firstVal) : `Item ${i + 1}`}
              </div>
            )
          }
          return <span key={i} className="text-sm">{String(item)}</span>
        })}
      </div>
    )
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (depth === 0 && Object.keys(obj).length === 1) {
      const [, modData] = Object.entries(obj)[0]
      if (modData && typeof modData === 'object') {
        return <MetadataFields data={modData as Record<string, unknown>} />
      }
    }
    return <MetadataFields data={obj} />
  }

  return <span>{String(value)}</span>
}

function MetadataFields({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => {
    if (v === null || v === undefined) return false
    if (Array.isArray(v) && v.length === 0) return false
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return false
    return true
  })

  return (
    <div className="flex flex-col gap-2">
      {entries.map(([key, value]) => {
        const label = camelToLabel(key)
        const isObject = typeof value === 'object' && value !== null && !Array.isArray(value)
        const isArray = Array.isArray(value)
        const isSimple = !isObject && !isArray

        if (isSimple) {
          return <Field key={key} label={label}>{renderValue(value, 1)}</Field>
        }

        return (
          <div key={key} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
            {renderValue(value, 1)}
          </div>
        )
      })}
    </div>
  )
}

function TypeCard({ type: modType }: { type: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex items-center gap-3">
      <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Type</span>
      <span className="rounded-lg bg-blue-100 dark:bg-blue-900 px-3 py-1 text-sm font-semibold text-blue-700 dark:text-blue-300">
        {modType}
      </span>
    </div>
  )
}

function MetadataCard({ metadata: data }: { metadata: Record<string, unknown> }) {
  const innerData = (() => {
    const keys = Object.keys(data)
    if (keys.length === 1) {
      const v = data[keys[0]]
      if (v && typeof v === 'object') return v as Record<string, unknown>
    }
    return data
  })()

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
      <h3 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Metadata</h3>
      <MetadataFields data={innerData} />
    </div>
  )
}

function DepCard({ data }: { data: unknown }) {
  const obj = data && typeof data === 'object' ? data as Record<string, unknown> : null
  const depList = obj && Array.isArray(obj.dependencies) ? obj.dependencies as Record<string, unknown>[] : null
  const jarInJar = obj && Array.isArray(obj.jar_in_jar) ? obj.jar_in_jar as Record<string, unknown>[] : null

  const hasDeps = depList !== null && depList.length > 0
  const hasJars = jarInJar !== null && jarInJar.length > 0

  if (!hasDeps && !hasJars) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
        <h3 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-2">Dependencies</h3>
        <p className="text-sm text-zinc-500 italic">No dependencies found</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
      <h3 className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Dependencies</h3>

      {hasDeps && (
        <div className="flex flex-col gap-2">
          {depList.map((dep, i) => renderDepItem(dep, i))}
        </div>
      )}

      {hasJars && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Embedded JARs</span>
          <div className="flex flex-col gap-1">
            {jarInJar.map((jar, i) => {
              const path = jar.path ?? jar.file ?? `jar-${i + 1}`
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                  <Badge variant="embedded">JAR-in-JAR</Badge>
                  <span className="font-mono text-xs truncate">{String(path)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [sourceMode, setSourceMode] = useState<'file' | 'url'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [jarUrl, setJarUrl] = useState('')
  const [type, setType] = useState(true)
  const [metadata, setMetadata] = useState(true)
  const [dep, setDep] = useState(false)
  const [includeJarInJar, setIncludeJarInJar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Results | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.name.toLowerCase().endsWith('.jar')) {
      setFile(f)
      setSourceMode('file')
    }
  }, [])

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const onDragLeave = () => setDragging(false)

  const canSubmit = sourceMode === 'file' ? !!file : jarUrl.trim().length > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError(null)
    setResults(null)

    const formData = new FormData()
    formData.set('type', String(type))
    formData.set('metadata', String(metadata))
    formData.set('dep', String(dep))
    formData.set('includeJarInJar', String(includeJarInJar))

    if (sourceMode === 'file' && file) {
      formData.set('jar', file)
    } else if (sourceMode === 'url') {
      formData.set('url', jarUrl.trim())
    }

    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: formData })
      let data: Record<string, unknown>
      try {
        data = await res.json()
      } catch {
        const text = await res.text().catch(() => '')
        setError(`Server returned ${res.status}. ${text.slice(0, 200)}`)
        return
      }
      if (data.ok) {
        setResults(data.results as Results)
      } else {
        setError((data.error as string) ?? 'Unknown error')
      }
    } catch {
      setError('Cannot reach the server. This app requires the modcrawl CLI to run on the server. See README for self-hosting instructions.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh p-4 sm:p-8">
      <main className="w-full max-w-xl flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">modcrawl</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Analyze a Minecraft mod/plugin JAR to inspect its metadata, type, and dependencies.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-800">
            <button type="button" onClick={() => setSourceMode('file')} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${sourceMode === 'file' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'}`}>
              Upload file
            </button>
            <button type="button" onClick={() => setSourceMode('url')} className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${sourceMode === 'url' ? 'bg-white dark:bg-zinc-700 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700'}`}>
              Download URL
            </button>
          </div>

          {sourceMode === 'file' ? (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-sm cursor-pointer transition-colors ${
                dragging
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".jar"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setSourceMode('file')
                }}
              />
              {file ? (
                <span className="font-medium text-blue-600 dark:text-blue-400">{file.name}</span>
              ) : (
                <>
                  <span className="font-medium">Drop a JAR file here</span>
                  <span className="text-zinc-400 dark:text-zinc-500">or click to browse</span>
                </>
              )}
            </div>
          ) : (
            <input
              type="text"
              value={jarUrl}
              onChange={(e) => setJarUrl(e.target.value)}
              placeholder="https://example.com/mod.jar"
              className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}

          <fieldset className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={type} onChange={(e) => setType(e.target.checked)} className="accent-blue-600" />
              Mod type (NeoForge, Fabric, ...)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={metadata} onChange={(e) => setMetadata(e.target.checked)} className="accent-blue-600" />
              Metadata
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={dep} onChange={(e) => {
                setDep(e.target.checked)
                if (!e.target.checked) setIncludeJarInJar(false)
              }} className="accent-blue-600" />
              Dependencies
            </label>
            {dep && (
              <label className="flex items-center gap-2 text-sm ml-5 text-zinc-500 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={includeJarInJar}
                  onChange={(e) => setIncludeJarInJar(e.target.checked)}
                  className="accent-blue-600"
                />
                Include JAR-in-JAR
              </label>
            )}
          </fieldset>

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </form>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {results && (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">Results</h2>
            {results.type && <TypeCard type={results.type} />}
            {results.metadata && <MetadataCard metadata={results.metadata} />}
            {results.dependencies != null && <DepCard data={results.dependencies} />}
          </section>
        )}
      </main>
    </div>
  )
}
