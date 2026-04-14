// Google Workspace Native Adapter
// Direct Google API integration with exponential backoff

import { Log } from "@/util/log"

// ============================================================================
// Configuration
// ============================================================================

export interface RetryConfig {
  maxRetries: number
  baseBackoffMs: number
  maxBackoffMs: number
  jitterFactor: number
}

export interface AdapterConfig {
  baseUrl: string
  timeout: number
  retryConfig: RetryConfig
}

// ============================================================================
// Google API Error
// ============================================================================

export class GoogleAPIError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`Google API error ${status}: ${statusText}`)
    this.name = "GoogleAPIError"
  }
}

// ============================================================================
// GWorkspace Adapter
// ============================================================================

export namespace GWorkspaceAdapter {
  const log = Log.create({ service: "gworkspace.adapter" })

  const defaultConfig: AdapterConfig = {
    baseUrl: "https://www.googleapis.com",
    timeout: 30000,
    retryConfig: {
      maxRetries: 5,
      baseBackoffMs: 500,
      maxBackoffMs: 32000,
      jitterFactor: 0.1,
    },
  }

  const API_VERSION = {
    gmail: "gmail/v1",
    calendar: "calendar/v3",
    drive: "drive/v3",
    docs: "docs/v1",
    sheets: "sheets/v4",
  }

  /**
   * Make authenticated request to Google APIs
   */
  async function request<T>(
    accessToken: string,
    endpoint: string,
    options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
    config: AdapterConfig = defaultConfig,
  ): Promise<T> {
    const { method = "GET", body, params } = options

    const url = new URL(`${config.baseUrl}/${endpoint}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.timeout),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new GoogleAPIError(response.status, response.statusText, error)
    }

    return response.json()
  }

  /**
   * Calculate backoff with jitter
   */
  function calculateBackoff(attempts: number, baseMs: number, maxMs: number, jitterFactor: number): number {
    const exponential = Math.min(baseMs * Math.pow(2, attempts - 1), maxMs)
    const jitter = exponential * jitterFactor * Math.random()
    return Math.round(exponential + jitter)
  }

  /**
   * Check if should retry
   */
  function shouldRetry(error: GoogleAPIError, attempts: number, maxRetries: number): boolean {
    if (attempts >= maxRetries) return false
    if (error.status === 429 || (error.status >= 500 && error.status < 600)) return true
    return false
  }

  /**
   * Sleep helper
   */
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Execute with retry
   */
  async function withRetry<T>(
    accessToken: string,
    endpoint: string,
    options: { method?: string; body?: unknown; params?: Record<string, string> } = {},
    config: AdapterConfig = defaultConfig,
    attempts = 0,
  ): Promise<T> {
    try {
      return await request<T>(accessToken, endpoint, options, config)
    } catch (error) {
      const err = error as GoogleAPIError
      if (!shouldRetry(err, attempts, config.retryConfig.maxRetries)) {
        throw error
      }
      const backoff = calculateBackoff(
        attempts + 1,
        config.retryConfig.baseBackoffMs,
        config.retryConfig.maxBackoffMs,
        config.retryConfig.jitterFactor,
      )
      log.info("retrying request", { attempt: attempts + 1, backoffMs: backoff })
      await sleep(backoff)
      return withRetry<T>(accessToken, endpoint, options, config, attempts + 1)
    }
  }

  // ========================================================================
  // Gmail API
  // ========================================================================

  export async function gmailListMessages(accessToken: string, query: string, maxResults = 10) {
    return withRetry<{ messages: unknown[]; nextPageToken?: string }>(
      accessToken,
      `${API_VERSION.gmail}/users/me/messages`,
      { params: { q: query, maxResults: String(maxResults) } },
    )
  }

  export async function gmailGetMessage(accessToken: string, messageId: string) {
    return withRetry<unknown>(accessToken, `${API_VERSION.gmail}/users/me/messages/${messageId}`)
  }

  export async function gmailSendMessage(accessToken: string, to: string[], subject: string, body: string) {
    const raw = Buffer.from(`To: ${to.join(", ")}\r\nSubject: ${subject}\r\n\r\n${body}`).toString("base64")
    return withRetry<{ id: string; threadId: string }>(accessToken, `${API_VERSION.gmail}/users/me/messages/send`, {
      method: "POST",
      body: { raw },
    })
  }

  // ========================================================================
  // Calendar API
  // ========================================================================

  export async function calendarListCalendars(accessToken: string) {
    return withRetry<{ items: unknown[] }>(accessToken, `${API_VERSION.calendar}/users/me/calendarList`)
  }

  export async function calendarListEvents(
    accessToken: string,
    calendarId: string,
    options: { timeMin?: string; timeMax?: string; maxResults?: number } = {},
  ) {
    return withRetry<{ items: unknown[]; nextPageToken?: string }>(
      accessToken,
      `${API_VERSION.calendar}/calendars/${calendarId}/events`,
      { params: options as Record<string, string> },
    )
  }

  export async function calendarCreateEvent(
    accessToken: string,
    calendarId: string,
    event: {
      summary: string
      start: string
      end: string
      description?: string
      location?: string
      attendees?: string[]
    },
  ) {
    return withRetry<{ id: string; status: string }>(
      accessToken,
      `${API_VERSION.calendar}/calendars/${calendarId}/events`,
      {
        method: "POST",
        body: {
          summary: event.summary,
          start: { dateTime: event.start },
          end: { dateTime: event.end },
          description: event.description,
          location: event.location,
          attendees: event.attendees?.map((email) => ({ email })),
        },
      },
    )
  }

  // ========================================================================
  // Drive API
  // ========================================================================

  export async function driveSearchFiles(accessToken: string, query: string, pageSize = 10) {
    return withRetry<{ files: unknown[]; nextPageToken?: string }>(accessToken, `${API_VERSION.drive}/files`, {
      params: { q: query, pageSize: String(pageSize) },
    })
  }

  export async function driveListFiles(accessToken: string, folderId?: string, pageSize = 10) {
    const params: Record<string, string> = { pageSize: String(pageSize) }
    if (folderId) params.q = `'${folderId}' in parents`
    return withRetry<{ files: unknown[]; nextPageToken?: string }>(accessToken, `${API_VERSION.drive}/files`, {
      params,
    })
  }

  export async function driveGetFile(accessToken: string, fileId: string, fields?: string) {
    return withRetry<unknown>(accessToken, `${API_VERSION.drive}/files/${fileId}`, {
      params: fields ? { fields } : undefined,
    })
  }

  export async function driveCreatePermission(
    accessToken: string,
    fileId: string,
    permission: { type: string; email: string; role: string },
  ) {
    return withRetry<{ id: string }>(accessToken, `${API_VERSION.drive}/files/${fileId}/permissions`, {
      method: "POST",
      body: permission,
    })
  }

  // ========================================================================
  // Docs API
  // ========================================================================

  export async function docsGetDocument(accessToken: string, documentId: string) {
    return withRetry<unknown>(accessToken, `${API_VERSION.docs}/documents/${documentId}`)
  }

  // ========================================================================
  // Sheets API
  // ========================================================================

  export async function sheetsGetSpreadsheet(accessToken: string, spreadsheetId: string, ranges?: string) {
    const params: Record<string, string> = {}
    if (ranges) {
      params.ranges = ranges
      params.includeGridData = "true"
    }
    return withRetry<unknown>(accessToken, `${API_VERSION.sheets}/spreadsheets/${spreadsheetId}`, { params })
  }

  export async function sheetsCreateSpreadsheet(accessToken: string, title: string) {
    return withRetry<{ spreadsheetId: string; properties: { title: string } }>(
      accessToken,
      `${API_VERSION.sheets}/spreadsheets`,
      { method: "POST", body: { properties: { title }, sheets: [] } },
    )
  }

  export async function sheetsValuesUpdate(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: unknown[][],
  ) {
    return withRetry<{ updatedRows: number; updatedColumns: number }>(
      accessToken,
      `${API_VERSION.sheets}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      { method: "PUT", body: { values }, params: { valueInputOption: "USER_ENTERED" } },
    )
  }

  export async function sheetsValuesAppend(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: unknown[][],
  ) {
    return withRetry<{ updates: { updatedRows: number; updatedColumns: number } }>(
      accessToken,
      `${API_VERSION.sheets}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`,
      { method: "POST", body: { values }, params: { valueInputOption: "USER_ENTERED" } },
    )
  }

  export async function sheetsValuesClear(accessToken: string, spreadsheetId: string, range: string) {
    return withRetry<{ clearedRange: string }>(
      accessToken,
      `${API_VERSION.sheets}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
      { method: "POST" },
    )
  }

  // ========================================================================
  // Docs CRUD
  // ========================================================================

  export async function docsCreateDocument(accessToken: string, title: string) {
    return withRetry<{ documentId: string; title: string; revisionId?: string }>(
      accessToken,
      `${API_VERSION.docs}/documents`,
      { method: "POST", body: { title } },
    )
  }

  export async function docsUpdateDocument(accessToken: string, documentId: string, requests: unknown[]) {
    return withRetry<{ documentId: string; replies: unknown[]; writeControl?: unknown }>(
      accessToken,
      `${API_VERSION.docs}/documents/${documentId}:batchUpdate`,
      { method: "POST", body: { requests } },
    )
  }

  // ========================================================================
  // Drive CRUD
  // ========================================================================

  export async function driveCreateFile(
    accessToken: string,
    metadata: { name: string; mimeType?: string; parents?: string[] },
  ) {
    return withRetry<{ id: string; name: string; webViewLink: string }>(
      accessToken,
      `${API_VERSION.drive}/files`,
      { method: "POST", body: metadata },
    )
  }

  export async function driveUpdateFile(accessToken: string, fileId: string, metadata: Record<string, unknown>) {
    return withRetry<unknown>(accessToken, `${API_VERSION.drive}/files/${fileId}`, {
      method: "PATCH",
      body: metadata,
    })
  }

  export async function driveDeleteFile(accessToken: string, fileId: string): Promise<void> {
    return withRetry<void>(accessToken, `${API_VERSION.drive}/files/${fileId}`, { method: "DELETE" })
  }

  export async function driveCopyFile(accessToken: string, fileId: string, name: string) {
    return withRetry<{ id: string; name: string; webViewLink: string }>(
      accessToken,
      `${API_VERSION.drive}/files/${fileId}/copy`,
      { method: "POST", body: { name } },
    )
  }

  export async function driveMoveFile(
    accessToken: string,
    fileId: string,
    addParents?: string[],
    removeParents?: string[],
  ) {
    const params: Record<string, string> = {}
    if (addParents?.length) params.addParents = addParents.join(",")
    if (removeParents?.length) params.removeParents = removeParents.join(",")
    return withRetry<unknown>(accessToken, `${API_VERSION.drive}/files/${fileId}`, {
      method: "PATCH",
      body: { parents: addParents },
      params: params.addParents || params.removeParents ? params : undefined,
    })
  }

  // ========================================================================
  // Calendar CRUD
  // ========================================================================

  export async function calendarUpdateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: Record<string, unknown>,
  ) {
    return withRetry<{ id: string; status: string }>(
      accessToken,
      `${API_VERSION.calendar}/calendars/${calendarId}/events/${eventId}`,
      { method: "PUT", body: event },
    )
  }

  export async function calendarDeleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    return withRetry<void>(accessToken, `${API_VERSION.calendar}/calendars/${calendarId}/events/${eventId}`, {
      method: "DELETE",
    })
  }
}
