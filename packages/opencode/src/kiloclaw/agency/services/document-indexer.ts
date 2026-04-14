// Document Indexer Service
// In-memory indexing for fast document search and metadata aggregation
// Phase 4 Task 2.2: Document Search & Indexing

import { Log } from "@/util/log"

// ============================================================================
// Types
// ============================================================================

export interface DocumentMetadata {
  id: string // fileId from Google Drive
  title: string
  type: "doc" | "sheet" | "slide" | "file" // document type
  mimeType: string
  owner?: {
    name?: string
    email?: string
  }
  lastModified: number // timestamp
  size: number // bytes
  tags: string[]
  content?: string // indexed content (plaintext)
  contentLength?: number // length of indexed content
  indexed: boolean
  indexedAt?: number
}

export interface SearchIndex {
  // Title index: title → [fileIds]
  titleIndex: Map<string, Set<string>>
  // Content index: word → [fileIds] (simplified)
  contentIndex: Map<string, Set<string>>
  // Metadata index: key:value → [fileIds]
  metadataIndex: Map<string, Set<string>>
  // All documents
  documents: Map<string, DocumentMetadata>
}

export interface SearchResult {
  document: DocumentMetadata
  score: number // relevance score 0-100
  matches: {
    title?: boolean
    content?: boolean
    metadata?: string[]
  }
}

// ============================================================================
// Document Indexer
// ============================================================================

export namespace DocumentIndexer {
  const log = Log.create({ service: "document-indexer" })

  // Global search index (per workspace)
  const indexes = new Map<string, SearchIndex>()

  /**
   * Initialize or get search index for workspace
   */
  function getIndex(workspaceId: string): SearchIndex {
    if (!indexes.has(workspaceId)) {
      indexes.set(workspaceId, {
        titleIndex: new Map(),
        contentIndex: new Map(),
        metadataIndex: new Map(),
        documents: new Map(),
      })
    }
    return indexes.get(workspaceId)!
  }

  /**
   * Index a document for search
   */
  export function indexDocument(workspaceId: string, metadata: DocumentMetadata): void {
    const index = getIndex(workspaceId)

    // Store document
    index.documents.set(metadata.id, metadata)

    // Index title
    if (metadata.title) {
      const titleTokens = tokenize(metadata.title)
      titleTokens.forEach((token) => {
        if (!index.titleIndex.has(token)) {
          index.titleIndex.set(token, new Set())
        }
        index.titleIndex.get(token)!.add(metadata.id)
      })
    }

    // Index content
    if (metadata.content) {
      const contentTokens = tokenize(metadata.content)
      contentTokens.forEach((token) => {
        if (!index.contentIndex.has(token)) {
          index.contentIndex.set(token, new Set())
        }
        index.contentIndex.get(token)!.add(metadata.id)
      })
    }

    // Index metadata
    const metadataFields = [
      `type:${metadata.type}`,
      `owner:${metadata.owner?.email || "unknown"}`,
      `modified:${Math.floor(metadata.lastModified / (1000 * 60 * 60 * 24))}d`, // day granularity
      ...metadata.tags.map((tag) => `tag:${tag}`),
    ]

    metadataFields.forEach((field) => {
      if (!index.metadataIndex.has(field)) {
        index.metadataIndex.set(field, new Set())
      }
      index.metadataIndex.get(field)!.add(metadata.id)
    })

    log.debug("indexed document", {
      workspaceId,
      documentId: metadata.id,
      title: metadata.title,
    })
  }

  /**
   * Search for documents by query
   */
  export function search(workspaceId: string, query: string, options: { limit?: number } = {}): SearchResult[] {
    const index = getIndex(workspaceId)
    const limit = options.limit || 50

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) {
      return []
    }

    // Find matching documents
    const matches = new Map<string, { score: number; matches: SearchResult["matches"] }>()

    // Search title
    queryTokens.forEach((token) => {
      const titleMatches = index.titleIndex.get(token) || new Set()
      titleMatches.forEach((docId) => {
        if (!matches.has(docId)) {
          matches.set(docId, { score: 0, matches: {} })
        }
        const m = matches.get(docId)!
        m.score += 50 // Title matches weighted high
        m.matches.title = true
      })
    })

    // Search content
    queryTokens.forEach((token) => {
      const contentMatches = index.contentIndex.get(token) || new Set()
      contentMatches.forEach((docId) => {
        if (!matches.has(docId)) {
          matches.set(docId, { score: 0, matches: {} })
        }
        const m = matches.get(docId)!
        m.score += 10 // Content matches weighted lower
        m.matches.content = true
      })
    })

    // Convert to results
    const results: SearchResult[] = []
    matches.forEach((match, docId) => {
      const doc = index.documents.get(docId)
      if (doc) {
        results.push({
          document: doc,
          score: Math.min(100, match.score),
          matches: match.matches,
        })
      }
    })

    // Sort by score
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, limit)
  }

  /**
   * Search by metadata field
   */
  export function searchByMetadata(
    workspaceId: string,
    key: string,
    value: string,
    options: { limit?: number } = {}
  ): DocumentMetadata[] {
    const index = getIndex(workspaceId)
    const limit = options.limit || 50

    const field = `${key}:${value}`
    const docIds = index.metadataIndex.get(field) || new Set()

    const results: DocumentMetadata[] = []
    docIds.forEach((docId) => {
      const doc = index.documents.get(docId)
      if (doc) {
        results.push(doc)
      }
    })

    return results.slice(0, limit)
  }

  /**
   * Get all documents of a specific type
   */
  export function getDocumentsByType(workspaceId: string, type: string): DocumentMetadata[] {
    return searchByMetadata(workspaceId, "type", type)
  }

  /**
   * Get all documents from a specific owner
   */
  export function getDocumentsByOwner(workspaceId: string, ownerEmail: string): DocumentMetadata[] {
    return searchByMetadata(workspaceId, "owner", ownerEmail)
  }

  /**
   * Get documents with a specific tag
   */
  export function getDocumentsByTag(workspaceId: string, tag: string): DocumentMetadata[] {
    return searchByMetadata(workspaceId, "tag", tag)
  }

  /**
   * Add tag to document
   */
  export function addTag(workspaceId: string, documentId: string, tag: string): void {
    const index = getIndex(workspaceId)
    const doc = index.documents.get(documentId)

    if (doc && !doc.tags.includes(tag)) {
      doc.tags.push(tag)

      // Update metadata index
      const field = `tag:${tag}`
      if (!index.metadataIndex.has(field)) {
        index.metadataIndex.set(field, new Set())
      }
      index.metadataIndex.get(field)!.add(documentId)

      log.debug("added tag", { workspaceId, documentId, tag })
    }
  }

  /**
   * Remove tag from document
   */
  export function removeTag(workspaceId: string, documentId: string, tag: string): void {
    const index = getIndex(workspaceId)
    const doc = index.documents.get(documentId)

    if (doc) {
      doc.tags = doc.tags.filter((t) => t !== tag)

      // Update metadata index
      const field = `tag:${tag}`
      const docIds = index.metadataIndex.get(field)
      if (docIds) {
        docIds.delete(documentId)
      }

      log.debug("removed tag", { workspaceId, documentId, tag })
    }
  }

  /**
   * Get index statistics
   */
  export function getStats(workspaceId: string): {
    totalDocuments: number
    indexedDocuments: number
    titleTerms: number
    contentTerms: number
    metadataFields: number
  } {
    const index = getIndex(workspaceId)

    return {
      totalDocuments: index.documents.size,
      indexedDocuments: Array.from(index.documents.values()).filter((d) => d.indexed).length,
      titleTerms: index.titleIndex.size,
      contentTerms: index.contentIndex.size,
      metadataFields: index.metadataIndex.size,
    }
  }

  /**
   * Clear index for workspace
   */
  export function clearIndex(workspaceId: string): void {
    indexes.delete(workspaceId)
    log.info("cleared index", { workspaceId })
  }

  /**
   * Clear all indexes
   */
  export function clearAllIndexes(): void {
    indexes.clear()
    log.warn("cleared all indexes")
  }

  /**
   * Export documents for backup/analysis
   */
  export function exportDocuments(workspaceId: string): DocumentMetadata[] {
    const index = getIndex(workspaceId)
    return Array.from(index.documents.values())
  }

  /**
   * Get document by ID
   */
  export function getDocument(workspaceId: string, documentId: string): DocumentMetadata | undefined {
    const index = getIndex(workspaceId)
    return index.documents.get(documentId)
  }

  /**
   * Update document metadata
   */
  export function updateDocument(
    workspaceId: string,
    documentId: string,
    updates: Partial<DocumentMetadata>
  ): void {
    const index = getIndex(workspaceId)
    const doc = index.documents.get(documentId)

    if (doc) {
      Object.assign(doc, updates)
      log.debug("updated document", { workspaceId, documentId })
    }
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Tokenize text for indexing
 * Simple word-based tokenization with lowercasing
 */
function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // Split on non-alphanumeric
      .split(/\W+/)
      // Remove empty strings
      .filter((t) => t.length > 0)
      // Remove very short tokens (stopwords)
      .filter((t) => t.length > 2)
  )
}
