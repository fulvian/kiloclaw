export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"

const POLICY: Record<string, Record<string, PolicyLevel>> = {
  gmail: {
    "messages.search": "SAFE",
    "messages.list": "SAFE",
    "messages.get": "SAFE",
    "drafts.create": "NOTIFY",
    "drafts.get": "SAFE",
    "drafts.list": "SAFE",
    "messages.send": "CONFIRM",
    "messages.create": "CONFIRM",
    "messages.modify": "CONFIRM",
    "messages.trash": "CONFIRM",
    "messages.delete": "CONFIRM",
  },
  calendar: {
    "events.list": "SAFE",
    "events.get": "SAFE",
    "events.search": "SAFE",
    "events.insert": "CONFIRM",
    "events.create": "CONFIRM",
    "events.update": "CONFIRM",
    "events.patch": "CONFIRM",
    "events.delete": "CONFIRM",
  },
  drive: {
    "files.search": "SAFE",
    "files.list": "SAFE",
    "files.get": "SAFE",
    "permissions.list": "SAFE",
    "files.share": "CONFIRM",
    "files.create": "CONFIRM",
    "files.update": "CONFIRM",
    "files.copy": "CONFIRM",
    "files.move": "CONFIRM",
    "files.delete": "CONFIRM",
    "permissions.create": "CONFIRM",
    "permissions.update": "CONFIRM",
  },
  docs: {
    "documents.get": "SAFE",
    "documents.list": "SAFE",
    "documents.search": "SAFE",
    "documents.create": "CONFIRM",
    "documents.update": "CONFIRM",
    "documents.delete": "CONFIRM",
  },
  sheets: {
    "spreadsheets.get": "SAFE",
    "spreadsheets.list": "SAFE",
    "spreadsheets.search": "SAFE",
    "spreadsheets.values.get": "SAFE",
    "spreadsheets.values.batchget": "SAFE",
    "spreadsheets.values.update": "CONFIRM",
    "spreadsheets.values.append": "CONFIRM",
    "spreadsheets.values.clear": "CONFIRM",
    "spreadsheets.delete": "CONFIRM",
  },
}

const ALIAS: Record<string, Record<string, string>> = {
  gmail: {
    search: "messages.search",
    list: "messages.list",
    read: "messages.get",
    get: "messages.get",
    send: "messages.send",
    draft: "drafts.create",
    create_draft: "drafts.create",
    "gmail.search": "messages.search",
    "gmail.read": "messages.get",
    "gmail.send": "messages.send",
    "gmail.draft": "drafts.create",
    "gmail.delete": "messages.delete",
    bulk_send: "gmail.bulk_send",
    "gmail.bulk_send": "gmail.bulk_send",
  },
  calendar: {
    list: "events.list",
    read: "events.get",
    get: "events.get",
    search: "events.search",
    create: "events.insert",
    insert: "events.insert",
    update: "events.update",
    delete: "events.delete",
    "calendar.list": "events.list",
    "calendar.read": "events.get",
    "calendar.create": "events.insert",
    "calendar.update": "events.update",
    "calendar.delete": "events.delete",
  },
  drive: {
    search: "files.search",
    list: "files.list",
    read: "files.get",
    get: "files.get",
    share: "files.share",
    create: "files.create",
    update: "files.update",
    delete: "files.delete",
    share_public: "drive.share_public",
    "drive.search": "files.search",
    "drive.read": "files.get",
    "drive.share": "files.share",
    "drive.create": "files.create",
    "drive.delete": "files.delete",
    "drive.share_public": "drive.share_public",
  },
  docs: {
    read: "documents.get",
    get: "documents.get",
    search: "documents.search",
    list: "documents.list",
    create: "documents.create",
    update: "documents.update",
    delete: "documents.delete",
    "docs.read": "documents.get",
    "docs.update": "documents.update",
    "docs.delete": "documents.delete",
  },
  sheets: {
    read: "spreadsheets.get",
    get: "spreadsheets.get",
    search: "spreadsheets.search",
    list: "spreadsheets.list",
    update: "spreadsheets.values.update",
    delete: "spreadsheets.delete",
    "sheets.read": "spreadsheets.get",
    "sheets.update": "spreadsheets.values.update",
    "sheets.delete": "spreadsheets.delete",
  },
}

function normalizeService(service: string): string {
  return service.trim().toLowerCase()
}

function normalizeOperationToken(operation: string): string {
  return operation.trim().toLowerCase().replace(/\s+/g, "_")
}

function stripServicePrefix(service: string, operation: string): string {
  const prefix = `${service}.`
  if (operation.startsWith(prefix)) {
    return operation.slice(prefix.length)
  }
  return operation
}

function normalizeOperation(service: string, operation: string): string {
  const svc = normalizeService(service)
  const raw = normalizeOperationToken(operation)
  if (!raw) return ""

  const alias = ALIAS[svc]
  if (!alias) return stripServicePrefix(svc, raw)

  const exact = alias[raw]
  if (exact) return exact

  const stripped = stripServicePrefix(svc, raw)
  const mapped = alias[stripped]
  if (mapped) return mapped

  return stripped
}

function isHardDeny(service: string, operation: string): boolean {
  const svc = normalizeService(service)
  const op = normalizeOperation(svc, operation)

  if (svc === "gmail" && (op === "gmail.bulk_send" || op === "messages.bulk_send")) {
    return true
  }
  if (svc === "drive" && (op === "drive.share_public" || op === "files.share_public")) {
    return true
  }
  if (/permanent(?:ly)?[_\.]?(delete|remove)/.test(op)) {
    return true
  }
  if (/(delete|remove)[_\.]?permanent(?:ly)?/.test(op)) {
    return true
  }
  if (/hard[_\.]?delete/.test(op)) {
    return true
  }
  if (/trash[._](empty|purge)/.test(op) || /(empty|purge)[._]trash/.test(op)) {
    return true
  }

  return false
}

export namespace GWorkspaceAgency {
  export function getPolicy(service: string, operation: string): PolicyLevel {
    const svc = normalizeService(service)
    if (isHardDeny(svc, operation)) {
      return "DENY"
    }

    const op = normalizeOperation(svc, operation)
    const level = POLICY[svc]?.[op]
    if (level) {
      return level
    }

    return "DENY"
  }

  export function requiresApproval(service: string, operation: string): boolean {
    const level = getPolicy(service, operation)
    return level === "CONFIRM" || level === "HITL"
  }

  export const normalize = normalizeOperation
}
