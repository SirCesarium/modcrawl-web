import { analyzeJar, type AnalyzeOptions } from '@/lib/analyze'

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json(
      { ok: false, error: 'Failed to parse request body' },
      { status: 400 }
    )
  }

  const jarFile = formData.get('jar')
  if (!jarFile || !(jarFile instanceof File)) {
    return Response.json(
      { ok: false, error: 'Missing JAR file. Send a field named "jar"' },
      { status: 400 }
    )
  }

  if (!jarFile.name.toLowerCase().endsWith('.jar')) {
    return Response.json(
      { ok: false, error: 'File must have a .jar extension' },
      { status: 400 }
    )
  }

  const options: AnalyzeOptions = {
    type: formData.get('type') === 'true',
    metadata: formData.get('metadata') === 'true',
    dep: formData.get('dep') === 'true',
    includeJarInJar: formData.get('includeJarInJar') === 'true',
  }

  if (!options.type && !options.metadata && !options.dep) {
    return Response.json(
      { ok: false, error: 'Select at least one analysis: type, metadata, or dep' },
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
