# Proactivity Limits Documentation

> Kiloclaw Proactive Framework - Phase 5 Implementation

## Overview

The Proactivity Framework enables Kiloclaw to take initiative within safe, configurable limits. It balances autonomous action with user trust through budget management, trigger controls, and confirmation modes.

## Core Concepts

### ProactivityPolicy

```typescript
interface ProactivityPolicy {
  allowedTriggers: TriggerSignal[]
  allowedProactions: ProactionType[]
  dailyBudget: number
  confirmationMode: ConfirmationMode
  maxTasksPerDay: number
}
```

### Trigger Signals

Four types of proactive triggers:

| Signal      | Description                   | Use Case                       |
| ----------- | ----------------------------- | ------------------------------ |
| `schedule`  | Time-based triggers           | Daily digests, periodic checks |
| `reminder`  | User-set reminders            | Contextual notifications       |
| `anomaly`   | Detected behavioral anomalies | Unusual activity alerts        |
| `threshold` | Metric thresholds exceeded    | Performance degradation alerts |

### Proaction Types

Actions the system can proactively take:

| Type           | Description                         | Default Limit |
| -------------- | ----------------------------------- | ------------- |
| `suggest`      | Suggest actions to user             | 50/day        |
| `notify`       | Notify user of information          | 30/day        |
| `act_low_risk` | Automatically act on low-risk items | 10/day        |

### Confirmation Modes

Controls how proactive actions are handled:

| Mode                | Behavior                                     |
| ------------------- | -------------------------------------------- |
| `none`              | No confirmation needed, act immediately      |
| `suggest_then_act`  | Confirm before acting on suggestions         |
| `explicit_approval` | Full approval flow for all proactive actions |

## Components

### Budget Manager

Tracks and limits proactive action consumption:

```typescript
const budget = new BudgetManager(100) // 100 actions per day

// Check if action is allowed
budget.checkLimit("act_low_risk") // returns boolean

// Consume budget
budget.consume(1, "act_low_risk") // returns boolean

// Get statistics
const stats = budget.getStats()
// { totalUsed: 5, totalLimit: 100, remaining: 95, byType: {...} }
```

### Trigger Evaluator

Matches trigger events to registered conditions:

```typescript
const evaluator = new TriggerEvaluator()

evaluator.register({
  signal: "schedule",
  name: "daily_report",
  description: "Daily summary report",
  enabled: true,
  config: { frequency: "0 9 * * *" },
})

const result = evaluator.evaluate(event)
if (result.matched) {
  // Execute matching tasks
}
```

### Proactive Scheduler

Manages task execution with budget awareness:

```typescript
const scheduler = new ProactiveScheduler(budgetManager)

scheduler.register({
  id: "daily-digest",
  name: "Daily Digest",
  trigger: dailyReportTrigger,
  action: async () => {
    /* send digest */
  },
  enabled: true,
})

const result = await scheduler.evaluateTrigger(event)
// { executed: ["daily-digest"], skipped: [], errors: [] }
```

### Limits Manager

Configures and validates proactivity limits:

```typescript
const limits = new ProactivityLimitsManager({
  maxProactiveActionsPerDay: 100,
  maxSuggestionsPerDay: 50,
  maxNotificationsPerDay: 30,
  maxLowRiskActionsPerDay: 10,
  confirmationMode: "suggest_then_act",
  allowedTriggers: ["schedule", "reminder", "anomaly", "threshold"],
  allowOverBudget: false,
})

// Check if trigger is allowed
limits.isTriggerAllowed("schedule") // true

// Get confirmation mode
limits.requiresExplicitApproval() // false (suggest_then_act mode)
```

## Default Configuration

```typescript
const DEFAULT_PROACTIVITY_LIMITS = {
  maxProactiveActionsPerDay: 100,
  maxSuggestionsPerDay: 50,
  maxNotificationsPerDay: 30,
  maxLowRiskActionsPerDay: 10,
  confirmationMode: "suggest_then_act",
  allowedTriggers: ["schedule", "reminder", "anomaly", "threshold"],
  allowOverBudget: false,
}
```

## Usage Examples

### Setting Up Proactive Tasks

```typescript
import { ProactiveScheduler } from "./proactive/scheduler"
import { BudgetManager } from "./proactive/budget"
import { Trigger, ProactionType } from "./proactive"

// Create budget manager
const budget = new BudgetManager(100)

// Create scheduler
const scheduler = new ProactiveScheduler(budget)

// Register a task
scheduler.register({
  id: "weather-alert",
  name: "Weather Alert",
  trigger: {
    signal: "threshold",
    name: "severe_weather",
    description: "Severe weather alert",
    enabled: true,
    config: { threshold: 0.8 },
  },
  action: async () => {
    // Send weather alert
    console.log("Weather alert sent!")
  },
  enabled: true,
})
```

### Checking Budget Before Action

```typescript
const budget = BudgetManager.create(100, {
  suggest: 50,
  notify: 30,
  actLowRisk: 10,
})

// Before taking action
if (budget.checkLimit("act_low_risk")) {
  // Safe to proceed
  budget.consume(1, "act_low_risk")
  // Execute action
} else {
  // Budget exceeded - suggest to user instead
}
```

### Configuring Confirmation Mode

```typescript
const limits = new ProactivityLimitsManager({
  confirmationMode: "explicit_approval",
})

// All proactive actions require explicit approval
limits.requiresExplicitApproval() // true
```

## Default Triggers

The system provides default trigger conditions:

```typescript
const DEFAULT_TRIGGERS = [
  { signal: "schedule", name: "daily_digest", description: "Daily summary" },
  { signal: "reminder", name: "user_reminder", description: "User reminders" },
  { signal: "anomaly", name: "behavioral_anomaly", description: "Anomaly detection" },
  { signal: "threshold", name: "metric_threshold", description: "Threshold alerts" },
]
```

## Testing

Run proactivity tests:

```bash
bun test test/kiloclaw/proactive.test.ts
```

## Safety Considerations

1. **Budget limits prevent abuse** - Users control daily limits
2. **Confirmation modes ensure oversight** - No silent autonomous actions for high-risk operations
3. **Trigger validation** - Only registered triggers can initiate proactivity
4. **Fallback to consultative** - When limits exceeded, suggest instead of act

## Configuration

### Environment Variables

```bash
# Enable/disable proactivity
KILOCLAW_PROACTIVE_ENABLED=true

# Daily budget (total actions)
KILOCLAW_PROACTIVE_DAILY_BUDGET=100

# Individual limits
KILOCLAW_PROACTIVE_MAX_SUGGESTIONS=50
KILOCLAW_PROACTIVE_MAX_NOTIFICATIONS=30
KILOCLAW_PROACTIVE_MAX_LOW_RISK=10

# Confirmation mode
KILOCLAW_PROACTIVE_CONFIRMATION_MODE=suggest_then_act
```
