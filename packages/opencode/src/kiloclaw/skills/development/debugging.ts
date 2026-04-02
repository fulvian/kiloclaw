import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Debugging input schema
interface DebuggingInput {
  code: string
  error: string
}

// Debugging output schema
interface DebuggingOutput {
  diagnosis: string
  steps: string[]
  likelyCause?: string
  suggestedFix?: string
}

// Common error patterns and their diagnoses
const ERROR_PATTERNS = [
  {
    pattern: /undefined\s+is\s+not\s+(?:a\s+)?function|is\s+not\s+a\s+function/i,
    diagnosis: "Function Not Defined or Wrong Type",
    cause: "The code is calling a function that doesn't exist or is not of function type",
    steps: [
      "Check if the function is defined before being called",
      "Verify the function name is spelled correctly",
      "Ensure the function is imported or defined in the correct scope",
      "Check if the object containing the method is properly initialized",
    ],
    fix: "Add proper function definition or import statement",
  },
  {
    pattern: /undefined|null\s+(?:is|has)\s+(?:not\s+)?(?:a\s+)?|cannot\s+read\s+(?:property|properties)/i,
    diagnosis: "Null or Undefined Reference",
    cause: "A variable or property is being accessed before it was initialized",
    steps: [
      "Add null/undefined checks before accessing the property",
      "Ensure the variable is initialized before use",
      "Check if API responses or DOM elements exist before accessing",
      "Use optional chaining (?.) to safely access nested properties",
    ],
    fix: "Add conditional checks or use optional chaining",
  },
  {
    pattern: /maximum\s+call\s+stack|recursion|stack\s+overflow/i,
    diagnosis: "Infinite Recursion or Stack Overflow",
    cause: "A function calls itself infinitely or chains of function calls are too deep",
    steps: [
      "Check for base case in recursive functions",
      "Verify termination conditions are reachable",
      "Look for circular dependencies between functions",
      "Check if event listeners are being added in a loop",
    ],
    fix: "Add proper base case or convert recursion to iteration",
  },
  {
    pattern: /syntax\s+error|parse\s+error|unexpected\s+(?:token|character)/i,
    diagnosis: "Syntax Error",
    cause: "The code has invalid syntax that prevents parsing",
    steps: [
      "Check for matching braces, brackets, and parentheses",
      "Verify string literals are properly closed",
      "Look for missing commas between array/object elements",
      "Check for invalid characters or encoding issues",
    ],
    fix: "Fix syntax errors according to language rules",
  },
  {
    pattern: /type\s+error|cannot\s+assign|invalid\s+type|incompatible\s+type/i,
    diagnosis: "Type Error",
    cause: "A value has an unexpected type or type mismatch",
    steps: [
      "Check the actual type of values being assigned",
      "Verify function parameters have correct types",
      "Look for implicit type conversions",
      "Ensure API responses match expected types",
    ],
    fix: "Add type assertions or convert values to expected types",
  },
  {
    pattern: /permission\s+denied|access\s+denied|EACCES|EPERM/i,
    diagnosis: "Permission or Access Error",
    cause: "The code doesn't have required permissions to access a resource",
    steps: [
      "Check file/directory permissions",
      "Verify API keys or credentials are set correctly",
      "Ensure the process has required system privileges",
      "Check firewall or network access rules",
    ],
    fix: "Grant proper permissions or use correct credentials",
  },
  {
    pattern: /network\s+error|fetch\s+failed|connection\s+refused|ECONNREFUSED/i,
    diagnosis: "Network Error",
    cause: "Network request failed due to connectivity or configuration issues",
    steps: [
      "Check if the target server is running and accessible",
      "Verify URL and port configuration",
      "Check firewall and proxy settings",
      "Ensure CORS headers allow the request",
    ],
    fix: "Fix network configuration or handle errors gracefully",
  },
  {
    pattern: /timeout|timed?\s*out|ETIMEDOUT|ESOCKETTIMEDOUT/i,
    diagnosis: "Timeout Error",
    cause: "An operation took too long and was terminated",
    steps: [
      "Increase timeout duration if operation is legitimate",
      "Optimize the operation to complete faster",
      "Check network latency and bandwidth",
      "Consider implementing pagination for large data sets",
    ],
    fix: "Increase timeout or optimize the operation",
  },
]

// Analyze code for potential issues
function analyzeCode(code: string, error: string): { likelyCause: string; codeIssues: string[] } {
  const codeIssues: string[] = []
  
  // Check for common code issues that might cause errors
  if (/undefined/.test(code) && !/\?\.?/.test(code)) {
    codeIssues.push("Code contains undefined references without optional chaining")
  }
  
  if (/async\s+function.*await(?!\s*\.)/.test(code)) {
    codeIssues.push("Async function may be missing await or .catch()")
  }
  
  if (/addEventListener.*addEventListener/s.test(code)) {
    codeIssues.push("Potential duplicate event listener registration")
  }
  
  if (/for\s*\(\s*let\s+\w+\s*=\s*0.*\.push/.test(code)) {
    codeIssues.push("Array modification during iteration can cause issues")
  }
  
  // Analyze error message for clues
  let likelyCause = "Unknown error cause - requires manual investigation"
  
  if (error) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(error)) {
        likelyCause = pattern.cause
        break
      }
    }
  }
  
  return { likelyCause, codeIssues }
}

export const DebuggingSkill: Skill = {
  id: "debugging" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Debugging",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Source code with the bug" },
      error: { type: "string", description: "Error message or stack trace" },
    },
    required: ["code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      diagnosis: { type: "string", description: "Root cause diagnosis of the issue" },
      steps: {
        type: "array",
        items: { type: "string" },
        description: "Steps to resolve the issue",
      },
      likelyCause: { type: "string", description: "Most likely cause of the error" },
      suggestedFix: { type: "string", description: "Suggested code fix" },
    },
  },
  capabilities: ["bug_detection", "root_cause", "error_analysis"],
  tags: ["development", "debugging", "troubleshooting"],
  
  async execute(input: unknown, context: SkillContext): Promise<DebuggingOutput> {
    const log = Log.create({ service: "kiloclaw.skill.debugging" })
    log.info("executing debugging analysis", { correlationId: context.correlationId })
    
    const { code, error } = input as DebuggingInput
    
    if (!code) {
      log.warn("empty code provided for debugging")
      return {
        diagnosis: "No code provided",
        steps: ["Provide code to analyze"],
        likelyCause: "No code was provided",
        suggestedFix: "Include the problematic code",
      }
    }
    
    // Find matching error pattern
    let diagnosis = "Unable to determine specific error type"
    let steps: string[] = ["Review code manually", "Check error stack trace"]
    let suggestedFix = "Please provide more context"
    
    for (const errorPattern of ERROR_PATTERNS) {
      if (error && errorPattern.pattern.test(error)) {
        diagnosis = errorPattern.diagnosis
        steps = errorPattern.steps
        suggestedFix = errorPattern.fix
        break
      }
    }
    
    // If no error pattern matched but we have error text, provide general guidance
    if (!error && diagnosis === "Unable to determine specific error type") {
      diagnosis = "Analyzing code for potential issues"
      steps = [
        "Review the code for common programming errors",
        "Check variable initialization",
        "Verify function calls are correct",
        "Look for race conditions in async code",
      ]
    }
    
    // Analyze code for additional context
    const { likelyCause, codeIssues } = analyzeCode(code, error || "")
    
    // Build final response
    const output: DebuggingOutput = {
      diagnosis,
      steps,
      likelyCause,
      suggestedFix,
    }
    
    log.info("debugging analysis completed", {
      correlationId: context.correlationId,
      diagnosis,
      codeIssueCount: codeIssues.length,
    })
    
    return output
  },
}
