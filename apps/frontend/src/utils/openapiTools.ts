export type ParsedOpenApiParameter = {
  name: string
  description: string
  type: string
  required: boolean
}

export type ParsedOpenApiTool = {
  name: string
  description: string
  method: string
  path: string
  parameters: ParsedOpenApiParameter[]
}

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getSchemaType = (schema: unknown) => {
  if (!isRecord(schema)) return 'string'
  if (typeof schema.type === 'string') return schema.type
  return 'string'
}

const parseParameters = (...sources: unknown[]): ParsedOpenApiParameter[] => {
  const parameters = sources.flatMap((source) => (Array.isArray(source) ? source : []))

  return parameters.filter(isRecord).map((parameter) => ({
    name: typeof parameter.name === 'string' ? parameter.name : '-',
    description: typeof parameter.description === 'string' ? parameter.description : '-',
    type: getSchemaType(parameter.schema),
    required: parameter.required === true,
  }))
}

export const parseOpenApiTools = (source: string): ParsedOpenApiTool[] => {
  if (!source.trim()) return []

  try {
    const document: unknown = JSON.parse(source)
    if (!isRecord(document) || !isRecord(document.paths)) return []

    const tools: ParsedOpenApiTool[] = []
    for (const [path, pathConfig] of Object.entries(document.paths)) {
      if (!isRecord(pathConfig)) continue

      for (const [method, operation] of Object.entries(pathConfig)) {
        const normalizedMethod = method.toLowerCase()
        if (!httpMethods.has(normalizedMethod) || !isRecord(operation)) continue

        const operationId =
          typeof operation.operationId === 'string' && operation.operationId.trim()
            ? operation.operationId.trim()
            : `${normalizedMethod.toUpperCase()} ${path}`
        const description =
          typeof operation.summary === 'string' && operation.summary.trim()
            ? operation.summary.trim()
            : typeof operation.description === 'string' && operation.description.trim()
              ? operation.description.trim()
              : '-'

        tools.push({
          name: operationId,
          description,
          method: normalizedMethod,
          path,
          parameters: parseParameters(pathConfig.parameters, operation.parameters),
        })
      }
    }

    return tools
  } catch {
    return []
  }
}
