import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// API development input
export interface ApiDevelopmentInput {
  spec?: ApiSpec
  resources: ResourceDefinition[]
  style?: "rest" | "graphql" | "grpc"
}

// API development output
export interface ApiDevelopmentOutput {
  endpoints: Endpoint[]
  schemas: Record<string, SchemaDefinition>
  recommendations: string[]
  summary: string
}

export interface ApiSpec {
  name: string
  version: string
  basePath?: string
}

export interface ResourceDefinition {
  name: string
  pluralName?: string
  operations: Operation[]
}

export interface Operation {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  description?: string
  requestBody?: {
    contentType?: string
    schema?: string
  }
  responses?: Record<string, { description: string; schema?: string }>
}

export interface Endpoint {
  method: string
  path: string
  description: string
  requestSchema?: string
  responseSchema?: string
}

export interface SchemaDefinition {
  type: "object" | "array" | "primitive"
  properties?: Record<string, { type: string; format?: string }>
  required?: string[]
  example?: string
}

// REST conventions
const REST_CONVENTIONS = {
  pluralize: true,
  nestedResources: true,
  versioning: true,
}

function generateEndpoints(resources: ResourceDefinition[]): Endpoint[] {
  const endpoints: Endpoint[] = []

  for (const resource of resources) {
    const pluralName = resource.pluralName || resource.name + "s"
    const basePath = `/${pluralName}`

    for (const op of resource.operations) {
      let path = op.path.startsWith("/") ? op.path : `${basePath}${op.path ? "/" + op.path : ""}`

      endpoints.push({
        method: op.method,
        path,
        description: op.description || `${op.method} ${path}`,
        requestSchema: op.requestBody?.schema,
        responseSchema: op.responses?.["200"]?.schema,
      })
    }
  }

  return endpoints
}

function generateSchemas(resources: ResourceDefinition[]): Record<string, SchemaDefinition> {
  const schemas: Record<string, SchemaDefinition> = {}

  for (const resource of resources) {
    schemas[resource.name] = {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id"],
    }

    schemas[`${resource.name}List`] = {
      type: "array",
    }

    schemas[`${resource.name}Create`] = {
      type: "object",
      properties: {
        // Placeholder - would be derived from resource fields
      },
    }

    schemas[`${resource.name}Update`] = {
      type: "object",
    }
  }

  return schemas
}

export const ApiDevelopmentSkill: Skill = {
  id: "api-development" as SkillId,
  version: "1.0.0",
  name: "API Development",
  inputSchema: {
    type: "object",
    properties: {
      spec: {
        type: "object",
        properties: {
          name: { type: "string" },
          version: { type: "string" },
          basePath: { type: "string" },
        },
      },
      resources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            pluralName: { type: "string" },
            operations: { type: "array" },
          },
        },
      },
      style: {
        type: "string",
        enum: ["rest", "graphql", "grpc"],
        description: "API style (default: rest)",
      },
    },
    required: ["resources"],
  },
  outputSchema: {
    type: "object",
    properties: {
      endpoints: { type: "array" },
      schemas: { type: "object" },
      recommendations: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
  capabilities: ["api-design", "endpoint-generation", "schema-creation", "rest-conventions"],
  tags: ["api", "development", "rest", "graphql", "design"],

  async execute(input: unknown, _context: SkillContext): Promise<ApiDevelopmentOutput> {
    const log = Log.create({ service: "kiloclaw.skill.api-development" })
    log.info("executing API development")

    const { spec, resources, style = "rest" } = input as ApiDevelopmentInput

    if (!resources || resources.length === 0) {
      return {
        endpoints: [],
        schemas: {},
        recommendations: ["Provide resource definitions to generate API"],
        summary: "No resources provided for API development",
      }
    }

    const endpoints = generateEndpoints(resources)
    const schemas = generateSchemas(resources)

    const recommendations: string[] = []

    if (style === "rest") {
      recommendations.push("Follow REST conventions: plural nouns, proper HTTP methods")
      recommendations.push("Use OpenAPI/Swagger for documentation")
      recommendations.push("Implement consistent error responses with error codes")
      recommendations.push("Consider pagination for list endpoints")
      recommendations.push("Use API versioning for breaking changes (e.g., /v1/, /v2/)")
    }

    if (style === "graphql") {
      recommendations.push("Define types and relationships clearly")
      recommendations.push("Implement DataLoader for N+1 query prevention")
      recommendations.push("Use persisted queries for production")
    }

    if (style === "grpc") {
      recommendations.push("Use Protocol Buffers for schema definition")
      recommendations.push("Implement client streaming and bidirectional streaming where needed")
      recommendations.push("Consider gRPC-Web for browser clients")
    }

    const summary = `Generated ${endpoints.length} endpoint(s) for ${resources.length} resource(s) using ${style} style`

    log.info("API development completed", { endpoints: endpoints.length })

    return { endpoints, schemas, recommendations, summary }
  },
}
