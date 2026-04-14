// Document Exporter Service
// Stream-based Google Drive file export with multi-format support
// ADR-004: Document Export & Parsing (no temp files, stream-based)
// Phase 4 Task 2.1: Document Download & Export

import { Log } from "@/util/log"

// ============================================================================
// Types & Constants
// ============================================================================

export const EXPORT_FORMATS = {
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ODP: "application/vnd.oasis.opendocument.presentation",
  ODT: "application/vnd.oasis.opendocument.text",
  ODS: "application/vnd.oasis.opendocument.spreadsheet",
  CSV: "text/csv",
  TSV: "text/tab-separated-values",
  PLAINTEXT: "text/plain",
  JPEG: "image/jpeg",
  PNG: "image/png",
  SVG: "image/svg+xml",
} as const

export type ExportFormat = (typeof EXPORT_FORMATS)[keyof typeof EXPORT_FORMATS]

export interface ExportOptions {
  format: ExportFormat
  timeout?: number // Default 30s
  maxSize?: number // Default 10MB
}

export interface ExportResult {
  buffer: Buffer
  mimeType: ExportFormat
  size: number
  downloadedAt: number
}

export interface ParsedContent {
  text: string
  metadata: {
    title?: string
    author?: string
    created?: number
    modified?: number
    pages?: number
    rowCount?: number
    columnCount?: number
  }
  format: ExportFormat
}

// ============================================================================
// Export Service
// ============================================================================

export namespace DocumentExporter {
  const log = Log.create({ service: "document-exporter" })

  // Default options
  const DEFAULT_TIMEOUT_MS = 30000 // 30 seconds
  const DEFAULT_MAX_SIZE = 10 * 1024 * 1024 // 10MB
  const CHUNK_SIZE = 64 * 1024 // 64KB chunks

  /**
   * Export file from Google Drive as stream
   * Supports: PDF, DOCX, XLSX, PPTX, CSV, plaintext, images
   *
   * Returns Buffer (never writes to disk)
   */
  export async function exportFromDrive(
    accessToken: string,
    fileId: string,
    options: ExportOptions
  ): Promise<ExportResult> {
    const timeout = options.timeout || DEFAULT_TIMEOUT_MS
    const maxSize = options.maxSize || DEFAULT_MAX_SIZE

    log.info("exporting file from drive", {
      fileId,
      format: options.format,
      timeout,
    })

    try {
      // Build export URL
      const url = new URL("https://www.googleapis.com/drive/v3/files/" + fileId + "/export")
      url.searchParams.set("mimeType", options.format)

      // Fetch with timeout
      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "kiloclaw/1.0",
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutHandle))

      if (!response.ok) {
        const errorText = await response.text()
        log.error("export failed", {
          fileId,
          status: response.status,
          statusText: response.statusText,
        })
        throw new Error(`Export failed: ${response.status} ${response.statusText}`)
      }

      // Stream to buffer with size limit
      const chunks: Buffer[] = []
      let totalSize = 0
      const startTime = Date.now()

      if (!response.body) {
        throw new Error("Response has no body")
      }

      const reader = response.body.getReader()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          totalSize += value.length

          if (totalSize > maxSize) {
            log.warn("file exceeds max size", { fileId, totalSize, maxSize })
            throw new Error(`File exceeds maximum size of ${maxSize} bytes`)
          }

          chunks.push(Buffer.from(value))
        }
      } finally {
        reader.releaseLock()
      }

      const buffer = Buffer.concat(chunks)
      const duration = Date.now() - startTime

      log.info("export completed", {
        fileId,
        size: buffer.length,
        durationMs: duration,
      })

      return {
        buffer,
        mimeType: options.format,
        size: buffer.length,
        downloadedAt: Date.now(),
      }
    } catch (error) {
      log.error("export error", {
        fileId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get export MIME type for Google Docs document
   */
  export function getDocsExportMimeType(format: ExportFormat): string {
    const docsFormats = {
      [EXPORT_FORMATS.PDF]: "application/pdf",
      [EXPORT_FORMATS.DOCX]: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      [EXPORT_FORMATS.PLAINTEXT]: "text/plain",
      [EXPORT_FORMATS.CSV]: "text/csv",
    }
    return docsFormats[format as keyof typeof docsFormats] || format
  }

  /**
   * Get export MIME type for Google Sheets
   */
  export function getSheetsExportMimeType(format: ExportFormat): string {
    const sheetsFormats = {
      [EXPORT_FORMATS.XLSX]: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      [EXPORT_FORMATS.CSV]: "text/csv",
      [EXPORT_FORMATS.TSV]: "text/tab-separated-values",
      [EXPORT_FORMATS.PLAINTEXT]: "text/plain",
      [EXPORT_FORMATS.PDF]: "application/pdf",
    }
    return sheetsFormats[format as keyof typeof sheetsFormats] || format
  }

  /**
   * Get export MIME type for Google Slides
   */
  export function getSlidesExportMimeType(format: ExportFormat): string {
    const slidesFormats = {
      [EXPORT_FORMATS.PDF]: "application/pdf",
      [EXPORT_FORMATS.PPTX]: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      [EXPORT_FORMATS.ODP]: "application/vnd.oasis.opendocument.presentation",
      [EXPORT_FORMATS.PLAINTEXT]: "text/plain",
      [EXPORT_FORMATS.JPEG]: "image/jpeg",
      [EXPORT_FORMATS.PNG]: "image/png",
      [EXPORT_FORMATS.SVG]: "image/svg+xml",
    }
    return slidesFormats[format as keyof typeof slidesFormats] || format
  }

  /**
   * Check if format is supported for document type
   */
  export function isSupportedFormat(documentType: "docs" | "sheets" | "slides", format: ExportFormat): boolean {
    const supported = {
      docs: [EXPORT_FORMATS.PDF, EXPORT_FORMATS.DOCX, EXPORT_FORMATS.ODT, EXPORT_FORMATS.PLAINTEXT, EXPORT_FORMATS.CSV],
      sheets: [EXPORT_FORMATS.XLSX, EXPORT_FORMATS.ODS, EXPORT_FORMATS.CSV, EXPORT_FORMATS.TSV, EXPORT_FORMATS.PDF, EXPORT_FORMATS.PLAINTEXT],
      slides: [EXPORT_FORMATS.PDF, EXPORT_FORMATS.PPTX, EXPORT_FORMATS.ODP, EXPORT_FORMATS.PLAINTEXT, EXPORT_FORMATS.JPEG, EXPORT_FORMATS.PNG, EXPORT_FORMATS.SVG],
    }
    return (supported[documentType] as ExportFormat[]).includes(format)
  }

  /**
   * Get content type header for response
   */
  export function getContentType(format: ExportFormat): string {
    return format // The format is already the MIME type
  }

  /**
   * Get file extension for format
   */
  export function getFileExtension(format: ExportFormat): string {
    const extensions: Record<ExportFormat, string> = {
      [EXPORT_FORMATS.PDF]: "pdf",
      [EXPORT_FORMATS.DOCX]: "docx",
      [EXPORT_FORMATS.ODT]: "odt",
      [EXPORT_FORMATS.XLSX]: "xlsx",
      [EXPORT_FORMATS.ODS]: "ods",
      [EXPORT_FORMATS.PPTX]: "pptx",
      [EXPORT_FORMATS.ODP]: "odp",
      [EXPORT_FORMATS.CSV]: "csv",
      [EXPORT_FORMATS.TSV]: "tsv",
      [EXPORT_FORMATS.PLAINTEXT]: "txt",
      [EXPORT_FORMATS.JPEG]: "jpg",
      [EXPORT_FORMATS.PNG]: "png",
      [EXPORT_FORMATS.SVG]: "svg",
    }
    return extensions[format] || "bin"
  }

  /**
   * Get suggested filename
   */
  export function getSuggestedFilename(documentTitle: string, format: ExportFormat): string {
    const ext = getFileExtension(format)
    const sanitized = documentTitle.replace(/[^a-z0-9._-]/gi, "_").substring(0, 100)
    return `${sanitized}.${ext}`
  }
}

// ============================================================================
// Content Parser
// ============================================================================

export namespace ContentParser {
  const log = Log.create({ service: "content-parser" })

  /**
   * Parse exported content based on format
   * Returns structured text + metadata
   *
   * Note: This is a simplified version.
   * In production, use specialized libraries:
   * - PDF: pdfjs-dist
   * - DOCX: docx-parser
   * - XLSX: xlsx
   * - PPTX: pptxparse
   */
  export async function parseContent(buffer: Buffer, format: ExportFormat): Promise<ParsedContent> {
    log.info("parsing content", {
      format,
      size: buffer.length,
    })

    try {
      const formatStr = String(format).toLowerCase()

      if (formatStr.includes("plaintext") || formatStr.includes("text/plain")) {
        return parsePlaintext(buffer)
      }

      if (formatStr.includes("csv")) {
        return parseCSV(buffer)
      }

      if (formatStr.includes("pdf")) {
        return parsePDF(buffer)
      }

      if (formatStr.includes("docx") || formatStr.includes("wordprocessingml")) {
        return parseDOCX(buffer)
      }

      if (formatStr.includes("xlsx") || formatStr.includes("spreadsheetml")) {
        return parseXLSX(buffer)
      }

      log.warn("unsupported format for parsing", { format })
      return {
        text: `[Binary content: ${String(format)}]`,
        metadata: { title: "Unknown" },
        format,
      }
    } catch (error) {
      log.error("parse error", {
        format,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        text: `[Error parsing ${String(format)}]`,
        metadata: { title: "Parse Error" },
        format,
      }
    }
  }

  /**
   * Parse plaintext content
   */
  function parsePlaintext(buffer: Buffer): ParsedContent {
    const text = buffer.toString("utf-8")
    const lines = text.split("\n")

    return {
      text,
      metadata: {
        title: lines[0]?.substring(0, 100) || "Untitled",
      },
      format: EXPORT_FORMATS.PLAINTEXT,
    }
  }

  /**
   * Parse CSV content
   */
  function parseCSV(buffer: Buffer): ParsedContent {
    const text = buffer.toString("utf-8")
    const lines = text.split("\n")
    const columnCount = lines[0]?.split(",").length || 0
    const rowCount = lines.length

    return {
      text,
      metadata: {
        title: "CSV Data",
        rowCount,
        columnCount,
      },
      format: EXPORT_FORMATS.CSV,
    }
  }

  /**
   * Parse PDF content (simplified - extracts metadata only)
   * In production, use: import PDFParser from 'pdf2json'
   */
  function parsePDF(buffer: Buffer): ParsedContent {
    // Simplified: just return buffer info
    // In production, use pdf2json or pdfjs
    return {
      text: "[PDF document - requires specialized parser for full text extraction]",
      metadata: {
        title: "PDF Document",
      },
      format: EXPORT_FORMATS.PDF,
    }
  }

  /**
   * Parse DOCX content (simplified - extracts structure)
   * In production, use: import { parseDocx } from 'docx-parser'
   */
  function parseDOCX(buffer: Buffer): ParsedContent {
    // Simplified: just return buffer info
    // In production, use docx-parser or jszip
    return {
      text: "[DOCX document - requires specialized parser for full text extraction]",
      metadata: {
        title: "Word Document",
      },
      format: EXPORT_FORMATS.DOCX,
    }
  }

  /**
   * Parse XLSX content (simplified - extracts structure)
   * In production, use: import XLSX from 'xlsx'
   */
  function parseXLSX(buffer: Buffer): ParsedContent {
    // Simplified: just return buffer info
    // In production, use xlsx library
    return {
      text: "[XLSX spreadsheet - requires specialized parser for full data extraction]",
      metadata: {
        title: "Spreadsheet",
      },
      format: EXPORT_FORMATS.XLSX,
    }
  }

  /**
   * Extract summary from content
   * Useful for quick preview of large documents
   */
  export function extractSummary(parsed: ParsedContent, maxLength: number = 500): string {
    const text = parsed.text
    if (text.length <= maxLength) {
      return text
    }

    // Find sentence boundary near maxLength
    const truncated = text.substring(0, maxLength)
    const lastPeriod = truncated.lastIndexOf(".")
    const lastNewline = truncated.lastIndexOf("\n")

    const boundary = Math.max(lastPeriod, lastNewline)
    if (boundary > maxLength * 0.8) {
      return truncated.substring(0, boundary + 1) + "..."
    }

    return truncated + "..."
  }
}
