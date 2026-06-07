import { analyzeJar, fetchJarFromUrl, checkBinary, type AnalyzeOptions } from '@/lib/analyze'

function getOptions(formData: FormData): AnalyzeOptions | null {
  const options: AnalyzeOptions = {
    type: formData.get('type') === 'true',
    metadata: formData.get('metadata') === 'true',
    dep: formData.get('dep') === 'true',
    includeJarInJar: formData.get('includeJarInJar') === 'true',
  }

  if (!options.type && !options.metadata && !options.dep) return null
  return options
}

export async function POST(request: Request) {
  const binaryIssue = checkBinary()
  if (binaryIssue) {
    return Response.json({ ok: false, error: binaryIssue }, { status: 501 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json(
      { ok: false, error: 'Failed to parse request body' },
      { status: 400 }
    )
  }

  const options = getOptions(formData)
  if (!options) {
    return Response.json(
      { ok: false, error: 'Select at least one analysis: type, metadata, or dep' },
      { status: 400 }
    )
  }

  const jarFile = formData.get('jar')
  const jarUrl = formData.get('url')

  if (jarFile instanceof File && jarFile.size > 0) {
    if (!jarFile.name.toLowerCase().endsWith('.jar')) {
      return Response.json(
        { ok: false, error: 'File must have a .jar extension' },
        { status: 400 }
      )
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(await jarFile.arrayBuffer())
    } catch {
      return Response.json(
        { ok: false, error: 'Failed to read file' },
        { status: 400 }
      )
    }

    try {
      const result = await analyzeJar(buffer, options)
      return Response.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed'
      return Response.json({ ok: false, error: message }, { status: 500 })
    }
  }

  if (typeof jarUrl === 'string' && jarUrl.trim()) {
    try {
      const buffer = await fetchJarFromUrl(jarUrl.trim())
      const result = await analyzeJar(buffer, options)
      return Response.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download or analysis failed'
      return Response.json({ ok: false, error: message }, { status: 500 })
    }
  }

  return Response.json(
    { ok: false, error: 'Send a JAR file (field "jar") or a download URL (field "url")' },
    { status: 400 }
  )
}
