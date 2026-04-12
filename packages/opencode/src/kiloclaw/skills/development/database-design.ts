import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Database design input
export interface DatabaseDesignInput {
  entities: EntityDefinition[]
  requirements?: string[]
  scale?: "small" | "medium" | "large"
}

// Database design output
export interface DatabaseDesignOutput {
  schema: SchemaDefinition
  relationships: Relationship[]
  recommendations: string[]
  summary: string
}

export interface EntityDefinition {
  name: string
  fields: FieldDefinition[]
}

export interface FieldDefinition {
  name: string
  type: string
  required?: boolean
  unique?: boolean
  indexed?: boolean
  primaryKey?: boolean
  foreignKey?: string
}

export interface SchemaDefinition {
  tables: TableDefinition[]
}

export interface TableDefinition {
  name: string
  columns: ColumnDefinition[]
  constraints: string[]
}

export interface ColumnDefinition {
  name: string
  type: string
  nullable: boolean
  primaryKey?: boolean
  default?: string
}

export interface Relationship {
  from: string
  to: string
  type: "one-to-one" | "one-to-many" | "many-to-many"
  description: string
}

// Normalization rules
function checkNormalization(entities: EntityDefinition[]): string[] {
  const issues: string[] = []

  for (const entity of entities) {
    const fieldNames = entity.fields.map((f) => f.name)

    // Check for repeated groups
    const repeatedPatterns = fieldNames.filter((name, idx) => fieldNames.indexOf(name) !== idx || /\d+$/.test(name))
    if (repeatedPatterns.length > 0) {
      issues.push(`${entity.name}: Contains repeated field groups - consider normalization`)
    }

    // Check for derived data
    const derivedFields = entity.fields.filter(
      (f) => f.name.toLowerCase().includes("total") || f.name.toLowerCase().includes("sum"),
    )
    if (derivedFields.length > 0) {
      issues.push(`${entity.name}: Contains derived fields - these should be computed, not stored`)
    }
  }

  return issues
}

// Scale-based recommendations
function getScaleRecommendations(scale: "small" | "medium" | "large"): string[] {
  switch (scale) {
    case "small":
      return [
        "Use SQLite for simple single-instance deployments",
        "Avoid premature optimization - start simple",
        "Consider denormalization for read-heavy workloads",
      ]
    case "medium":
      return [
        "Use PostgreSQL for ACID compliance and advanced features",
        "Add indexes for frequently queried columns",
        "Consider read replicas for scaling reads",
        "Use connection pooling (e.g., pgBouncer)",
      ]
    case "large":
      return [
        "Use distributed databases (CockroachDB, PlanetScale, Aurora)",
        "Implement sharding strategy for horizontal scaling",
        "Use read replicas and caching (Redis, Memcached)",
        "Consider event sourcing for audit trails",
        "Implement CQRS pattern for complex domains",
      ]
  }
}

export const DatabaseDesignSkill: Skill = {
  id: "database-design" as SkillId,
  version: "1.0.0",
  name: "Database Design",
  inputSchema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            fields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  required: { type: "boolean" },
                  unique: { type: "boolean" },
                  indexed: { type: "boolean" },
                  primaryKey: { type: "boolean" },
                  foreignKey: { type: "string" },
                },
              },
            },
          },
        },
      },
      requirements: {
        type: "array",
        items: { type: "string" },
        description: "Functional requirements for the database",
      },
      scale: {
        type: "string",
        enum: ["small", "medium", "large"],
        description: "Expected scale of the application",
      },
    },
    required: ["entities"],
  },
  outputSchema: {
    type: "object",
    properties: {
      schema: {
        type: "object",
        properties: {
          tables: { type: "array" },
        },
      },
      relationships: { type: "array" },
      recommendations: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
  capabilities: ["database-design", "schema-creation", "normalization", "relationship-mapping"],
  tags: ["database", "design", "schema", "normalization"],

  async execute(input: unknown, _context: SkillContext): Promise<DatabaseDesignOutput> {
    const log = Log.create({ service: "kiloclaw.skill.database-design" })
    log.info("executing database design")

    const { entities, requirements = [], scale = "medium" } = input as DatabaseDesignInput

    if (!entities || entities.length === 0) {
      return {
        schema: { tables: [] },
        relationships: [],
        recommendations: ["Provide entity definitions to generate database schema"],
        summary: "No entities provided for database design",
      }
    }

    // Build schema
    const tables = entities.map((entity) => ({
      name: entity.name,
      columns: entity.fields.map((f) => ({
        name: f.name,
        type: f.type,
        nullable: !f.required,
        primaryKey: f.primaryKey,
      })),
      constraints: entity.fields.filter((f) => f.unique).map((f) => `UNIQUE(${f.name})`),
    }))

    // Detect relationships from foreign keys
    const relationships: Relationship[] = []
    for (const entity of entities) {
      for (const field of entity.fields) {
        if (field.foreignKey) {
          relationships.push({
            from: entity.name,
            to: field.foreignKey,
            type: "one-to-many",
            description: `${entity.name}.${field.name} references ${field.foreignKey}`,
          })
        }
      }
    }

    // Generate recommendations
    const recommendations: string[] = []
    recommendations.push(...getScaleRecommendations(scale))

    const normalizationIssues = checkNormalization(entities)
    if (normalizationIssues.length > 0) {
      recommendations.push(...normalizationIssues)
    }

    if (requirements.includes("audit")) {
      recommendations.push("Add created_at/updated_at timestamps and user tracking for audit trail")
    }

    if (requirements.includes("soft-delete")) {
      recommendations.push("Consider adding deleted_at column for soft delete instead of hard delete")
    }

    const summary = `Designed schema with ${tables.length} table(s) and ${relationships.length} relationship(s) for ${scale} scale`

    log.info("database design completed", { tables: tables.length, relationships: relationships.length })

    return { schema: { tables }, relationships, recommendations, summary }
  },
}
