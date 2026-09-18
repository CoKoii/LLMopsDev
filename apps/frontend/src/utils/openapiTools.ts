export type ParsedOpenApiParameter = {
  name: string
  description: string
  type: string
  required: boolean
  in: string
  configurable?: boolean
  configLabel?: string
  enumValues?: Array<string | number | boolean>
  defaultValue?: unknown
  minimum?: number
  maximum?: number
  multipleOf?: number
  maxLength?: number
}

export type ParsedOpenApiTool = {
  name: string
  description: string
  method: string
  path: string
  parameters: ParsedOpenApiParameter[]
}

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
const requestBodyContentTypes = ['application/json', 'application/x-www-form-urlencoded'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const resolveJsonPointer = (document: Record<string, unknown>, reference: string): unknown => {
  if (!reference.startsWith('#/')) return undefined

  let current: unknown = document
  const segments = reference
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))

  for (const segment of segments) {
    if (!isRecord(current)) return undefined
    current = current[segment]
  }

  return current
}

const resolveReference = (
  value: unknown,
  document: Record<string, unknown>,
  seen = new Set<string>(),
): unknown => {
  if (!isRecord(value) || typeof value.$ref !== 'string') return value
  if (seen.has(value.$ref)) return value

  const resolved = resolveJsonPointer(document, value.$ref)
  if (resolved === undefined) return value

  seen.add(value.$ref)
  return resolveReference(resolved, document, seen)
}

const getSchemaType = (schema: unknown) => {
  if (!isRecord(schema)) return 'string'
  if (Array.isArray(schema.type)) {
    return schema.type.find((item) => typeof item === 'string' && item !== 'null') ?? 'string'
  }
  if (typeof schema.type === 'string') return schema.type
  return 'string'
}

const numberValue = (value: unknown) => (typeof value === 'number' ? value : undefined)

const parseSchemaMeta = (schema: unknown) => {
  if (!isRecord(schema)) return {}
  const enumValues = Array.isArray(schema.enum)
    ? schema.enum.filter(
        (item): item is string | number | boolean =>
          typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
      )
    : undefined

  return {
    enumValues: enumValues?.length ? enumValues : undefined,
    defaultValue: schema.default,
    minimum: numberValue(schema.minimum),
    maximum: numberValue(schema.maximum),
    multipleOf: numberValue(schema.multipleOf),
    maxLength: numberValue(schema.maxLength),
  }
}

const parseConfigMeta = (...sources: unknown[]) => {
  const records = sources.filter(isRecord)
  const configurable = records
    .map((record) => record['x-llmops-configurable'])
    .find((value) => typeof value === 'boolean')
  const configLabel = records
    .map((record) => record['x-llmops-label'])
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)

  return {
    configurable,
    configLabel: configLabel?.trim(),
  }
}

const parseParameter = (
  parameter: Record<string, unknown>,
  document: Record<string, unknown>,
): ParsedOpenApiParameter => {
  const schema = resolveReference(parameter.schema, document)

  return {
    name: typeof parameter.name === 'string' ? parameter.name : '-',
    description: typeof parameter.description === 'string' ? parameter.description : '-',
    type: getSchemaType(schema),
    in: typeof parameter.in === 'string' ? parameter.in : 'query',
    required: parameter.required === true,
    ...parseConfigMeta(parameter, schema),
    ...parseSchemaMeta(schema),
  }
}

const parseParameters = (
  document: Record<string, unknown>,
  ...sources: unknown[]
): ParsedOpenApiParameter[] => {
  const parameters = sources.flatMap((source) => (Array.isArray(source) ? source : []))

  return parameters
    .map((parameter) => resolveReference(parameter, document))
    .filter(isRecord)
    .map((parameter) => parseParameter(parameter, document))
}

const getRequestBodySchema = (
  requestBodyValue: unknown,
  document: Record<string, unknown>,
): { required: boolean; schema: unknown } | null => {
  const requestBody = resolveReference(requestBodyValue, document)
  if (!isRecord(requestBody) || !isRecord(requestBody.content)) return null

  for (const contentType of requestBodyContentTypes) {
    const mediaType = resolveReference(requestBody.content[contentType], document)
    if (isRecord(mediaType)) {
      return {
        required: requestBody.required === true,
        schema: resolveReference(mediaType.schema, document),
      }
    }
  }

  return null
}

const parseRequestBodyParameters = (
  requestBodyValue: unknown,
  document: Record<string, unknown>,
): ParsedOpenApiParameter[] => {
  const requestBody = getRequestBodySchema(requestBodyValue, document)
  const schema = resolveReference(requestBody?.schema, document)
  if (!requestBody || !isRecord(schema) || !isRecord(schema.properties)) return []

  const requiredFields = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : []

  return Object.entries(schema.properties).map(([name, propertySchema]) => {
    const resolvedSchema = resolveReference(propertySchema, document)
    const description =
      isRecord(resolvedSchema) && typeof resolvedSchema.description === 'string'
        ? resolvedSchema.description
        : '-'

    return {
      name,
      description,
      type: getSchemaType(resolvedSchema),
      in: 'body',
      required: requestBody.required && requiredFields.includes(name),
      ...parseConfigMeta(resolvedSchema),
      ...parseSchemaMeta(resolvedSchema),
    }
  })
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
          parameters: [
            ...parseParameters(document, pathConfig.parameters, operation.parameters),
            ...parseRequestBodyParameters(operation.requestBody, document),
          ],
        })
      }
    }

    return tools
  } catch {
    return []
  }
}
