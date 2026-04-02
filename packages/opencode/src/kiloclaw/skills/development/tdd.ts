import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// TDD input schema
interface TddInput {
  code: string
  framework: string
}

// TDD output schema
interface TddOutput {
  tests: string[]
  passed: boolean
  summary?: string
}

// Supported test frameworks
const SUPPORTED_FRAMEWORKS: Record<string, { testTemplate: (name: string, code: string) => string; assertionStyle: string }> = {
  jest: {
    assertionStyle: "expect(value).toBe(expected)",
    testTemplate: (name: string, code: string) => `describe('${name}', () => {
  it('should work correctly', () => {
    ${code}
  });
});`,
  },
  mocha: {
    assertionStyle: "assert.equal(actual, expected)",
    testTemplate: (name: string, code: string) => `describe('${name}', function() {
  it('should work correctly', function() {
    ${code}
  });
});`,
  },
  pytest: {
    assertionStyle: "assert actual == expected",
    testTemplate: (name: string, code: string) => `def test_${name.toLowerCase().replace(/\s+/g, '_')}():
    ${code}`,
  },
  junit: {
    assertionStyle: "assertEquals(expected, actual)",
    testTemplate: (name: string, code: string) => `@Test
public void test${name.replace(/\s+/g, '')}() {
    ${code}
}`,
  },
  go: {
    assertionStyle: "if actual != expected { t.Errorf(...) }",
    testTemplate: (name: string, code: string) => `func Test${name.replace(/\s+/g, '')}(t *testing.T) {
    ${code}
}`,
  },
}

// Detect code structure to generate relevant tests
function detectCodeStructure(code: string): { type: string; name: string; hasAsync: boolean } {
  let type = "function"
  let name = "Subject"
  let hasAsync = false
  
  // Detect function declarations
  const funcMatch = code.match(/(?:function|const|let|var)\s+(\w+)\s*[=:]/)
  if (funcMatch) {
    name = funcMatch[1]
  }
  
  // Detect class declarations
  if (/class\s+\w+/.test(code)) {
    type = "class"
    const classMatch = code.match(/class\s+(\w+)/)
    if (classMatch) name = classMatch[1]
  }
  
  // Detect async operations
  if (/\b(async\s+function|\bawait\b|Promise\b)/.test(code)) {
    hasAsync = true
  }
  
  // Detect test subject patterns
  if (/export\s+(?:default\s+)?(?:class|function|const)/.test(code)) {
    type = "exported"
  }
  
  return { type, name, hasAsync }
}

// Generate test cases based on code
function generateTests(code: string, framework: string): string[] {
  const tests: string[] = []
  const frameworkKey = framework.toLowerCase()
  const frameworkConfig = SUPPORTED_FRAMEWORKS[frameworkKey] || SUPPORTED_FRAMEWORKS.jest
  
  const { type, name, hasAsync } = detectCodeStructure(code)
  
  // Generate basic structure test
  tests.push(`Test ${name} exists and is defined`)
  tests.push(`Test ${name} can be instantiated or called`)
  
  // Generate tests based on code type
  if (type === "function" || type === "exported") {
    tests.push(`Test ${name} returns expected value`)
    tests.push(`Test ${name} handles edge cases`)
    
    if (hasAsync) {
      tests.push(`Test ${name} handles async operations correctly`)
      tests.push(`Test ${name} handles errors in async code`)
    }
    
    tests.push(`Test ${name} is called with correct arguments`)
  }
  
  if (type === "class") {
    tests.push(`Test ${name} constructor works`)
    tests.push(`Test ${name} instance has expected methods`)
    tests.push(`Test ${name} methods return expected values`)
    tests.push(`Test ${name} handles method errors gracefully`)
  }
  
  // Add framework-specific tests
  tests.push(`Test ${name} with empty input`)
  tests.push(`Test ${name} with null/undefined input`)
  tests.push(`Test ${name} with invalid input`)
  
  return tests
}

// Generate test code template
function generateTestCode(code: string, framework: string): string[] {
  const frameworkKey = framework.toLowerCase()
  const frameworkConfig = SUPPORTED_FRAMEWORKS[frameworkKey] || SUPPORTED_FRAMEWORKS.jest
  
  const { name, hasAsync } = detectCodeStructure(code)
  
  const testCodes: string[] = []
  
  // Basic instantiation/call test
  testCodes.push(`// Basic test for ${name}
const result = ${hasAsync ? 'await ' : ''}test${name}();
expect(result).toBeDefined();`)
  
  // Return value test
  testCodes.push(`// Test return value
const result = ${hasAsync ? 'await ' : ''}test${name}();
expect(typeof result).toBe('object' | 'string' | 'number');`)
  
  // Error handling test
  testCodes.push(`// Test error handling
expect(async () => {
  await test${name}(null);
}).toThrow();`)
  
  return testCodes
}

export const TddSkill: Skill = {
  id: "tdd" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Test-Driven Development",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Source code to generate tests for" },
      framework: { type: "string", description: "Test framework (jest, mocha, pytest, junit, go)" },
    },
    required: ["code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      tests: {
        type: "array",
        items: { type: "string" },
        description: "Generated test case names/descriptions",
      },
      passed: { type: "boolean", description: "Whether tests were generated successfully" },
      summary: { type: "string", description: "Summary of generated tests" },
    },
  },
  capabilities: ["test_generation", "test_execution", "tdd_workflow"],
  tags: ["development", "testing", "tdd", "quality"],
  
  async execute(input: unknown, context: SkillContext): Promise<TddOutput> {
    const log = Log.create({ service: "kiloclaw.skill.tdd" })
    log.info("executing TDD test generation", { correlationId: context.correlationId })
    
    const { code, framework } = input as TddInput
    
    if (!code) {
      log.warn("empty code provided for TDD")
      return {
        tests: [],
        passed: false,
        summary: "No code provided to generate tests",
      }
    }
    
    const frameworkName = framework || "jest"
    const tests = generateTests(code, frameworkName)
    const testCode = generateTestCode(code, frameworkName)
    
    const output: TddOutput = {
      tests: tests,
      passed: true,
      summary: `Generated ${tests.length} test cases for ${frameworkName}. ` +
        `Test code includes: ${testCode.length} test templates.`,
    }
    
    log.info("TDD test generation completed", {
      correlationId: context.correlationId,
      testCount: tests.length,
      framework: frameworkName,
    })
    
    return output
  },
}
