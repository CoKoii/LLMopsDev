import { z } from "zod";
import {
  type JsonSchema,
  type OpenApiDocument,
  type OpenApiParameter,
  type OpenApiToolDefinition,
} from "./openapi-tool.types";
import {
  getRequestBodyConfig,
  isRecord,
  resolveReference,
} from "./openapi-tool.utils";

const createZodSchema = (
  schemaValue: unknown,
  document: OpenApiDocument,
): z.ZodTypeAny => {
  const resolvedSchema = resolveReference(schemaValue, document);
  const schema: JsonSchema | null = isRecord(resolvedSchema)
    ? resolvedSchema
    : null;
  if (!schema) return z.unknown();

  const enumValues = Array.isArray(schema.enum) ? schema.enum : undefined;
  if (enumValues?.length) {
    const stringValues = enumValues.filter(
      (item): item is string => typeof item === "string",
    );
    if (stringValues.length === enumValues.length && stringValues.length > 0) {
      const [first, ...rest] = stringValues;
      return z.enum([first, ...rest]);
    }
  }

  const typeValues = Array.isArray(schema.type)
    ? schema.type.filter((item): item is string => typeof item === "string")
    : typeof schema.type === "string"
      ? [schema.type]
      : [];
  const nullable =
    schema.nullable === true || typeValues.some((type) => type === "null");
  const type = typeValues.find((item) => item !== "null");

  let zodSchema: z.ZodTypeAny;
  switch (type) {
    case "boolean":
      zodSchema = z.boolean();
      break;
    case "integer":
      zodSchema = z.number().int();
      break;
    case "number":
      zodSchema = z.number();
      break;
    case "array":
      zodSchema = z.array(createZodSchema(schema.items, document));
      break;
    case "object":
      zodSchema = createObjectZodSchema(schema, document);
      break;
    case "string":
      zodSchema = z.string();
      break;
    default:
      zodSchema = z.unknown();
      break;
  }

  if (typeof schema.description === "string" && schema.description.trim()) {
    zodSchema = zodSchema.describe(schema.description.trim());
  }

  return nullable ? zodSchema.nullable() : zodSchema;
};

const createObjectZodSchema = (
  schema: JsonSchema,
  document: OpenApiDocument,
): z.ZodTypeAny => {
  if (!isRecord(schema.properties)) return z.record(z.string(), z.unknown());

  const requiredFields = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === "string")
    : [];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, propertySchema] of Object.entries(schema.properties)) {
    const propertyZod = createZodSchema(propertySchema, document);
    shape[key] = requiredFields.includes(key)
      ? propertyZod
      : propertyZod.optional();
  }

  return z.object(shape);
};

const describeParameter = (parameter: OpenApiParameter) => {
  const location = typeof parameter.in === "string" ? parameter.in : "query";
  const description =
    typeof parameter.description === "string"
      ? parameter.description.trim()
      : "";
  return [location, description].filter(Boolean).join(" parameter. ");
};

export const createToolSchema = (definition: OpenApiToolDefinition) => {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const parameter of definition.parameters) {
    if (typeof parameter.name !== "string" || !parameter.name.trim()) continue;
    const parameterSchema = createZodSchema(
      parameter.schema,
      definition.document,
    );
    const describedSchema = parameterSchema.describe(
      describeParameter(parameter),
    );
    shape[parameter.name] =
      parameter.required === true
        ? describedSchema
        : describedSchema.optional();
  }

  const requestBody = getRequestBodyConfig(
    definition.operation.requestBody,
    definition.document,
  );
  if (requestBody) {
    const bodySchema = createZodSchema(
      requestBody.schema,
      definition.document,
    ).describe("HTTP request body.");
    shape.body = requestBody.required ? bodySchema : bodySchema.optional();
  }

  return z.object(shape);
};

export const createToolDescription = (definition: OpenApiToolDefinition) => {
  const summary =
    typeof definition.operation.summary === "string"
      ? definition.operation.summary.trim()
      : "";
  const description =
    typeof definition.operation.description === "string"
      ? definition.operation.description.trim()
      : "";

  return [
    definition.plugin.name,
    summary || description || definition.plugin.description || "",
    definition.operationId,
    definition.parameters
      .map((parameter) =>
        typeof parameter.name === "string" ? parameter.name : "",
      )
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join("\n");
};
