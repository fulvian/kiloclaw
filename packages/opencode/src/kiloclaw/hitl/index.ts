// Kiloclaw HITL (Human-in-the-Loop) - Barrel exports

// Checkpoint system
export {
  CheckpointRegistry,
  CheckpointRegistry$,
  Checkpoint,
  requiresCheckpoint,
  getRequiredApprovalType,
  type HitlCheckpoint,
  type ApprovalResult,
} from "./checkpoint"

// Approval workflow
export {
  ApprovalHandler,
  ApprovalHandler$,
  Approval,
  determineApprovalType,
  type ApprovalRequest,
  type ApprovalResponse,
  ApprovalType,
} from "./approval"

// Irreversible action detection
export {
  IRREVERSIBLE_ACTIONS,
  isIrreversible,
  classifyAction,
  requiresExplicitConfirmation,
  shouldBlockByDefault,
  getSafetyRecommendation,
  IrreversibleActions,
  type ActionClassification,
  type IrreversibleAction,
} from "./irreversible"
