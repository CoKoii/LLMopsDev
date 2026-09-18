import type { KnowledgeDocumentItem } from '../types'

export const hasDocumentFailed = (document: KnowledgeDocumentItem) =>
  document.parseStatus === 'failed' ||
  document.cleanStatus === 'failed' ||
  document.enhanceStatus === 'failed' ||
  document.chunkStatus === 'failed' ||
  document.embeddingStatus === 'failed' ||
  document.indexStatus === 'failed'

export const isDocumentReady = (document: KnowledgeDocumentItem) =>
  document.indexStatus === 'indexed'

export const resolveDocumentFailure = (document: KnowledgeDocumentItem) => {
  if (document.parseStatus === 'failed') return document.parseError || '解析失败'
  if (document.cleanStatus === 'failed') return document.cleanError || '清洗失败'
  if (document.enhanceStatus === 'failed') return document.enhanceError || '增强失败'
  if (document.chunkStatus === 'failed') return document.chunkError || '切片失败'
  if (document.embeddingStatus === 'failed') return document.embeddingError || '向量化失败'
  if (document.indexStatus === 'failed') return document.indexError || '入库失败'
  return '处理失败'
}

export const resolveDocumentProgress = (document: KnowledgeDocumentItem) => {
  if (document.indexStatus === 'indexed') return '处理完成'
  if (document.indexStatus === 'indexing') return '写入索引'
  if (document.embeddingStatus === 'embedding') return '向量化中'
  if (document.embeddingStatus === 'embedded') return '写入索引'
  if (document.embeddingStatus === 'queued') return '等待向量化'
  if (document.chunkStatus === 'chunking') return '切片中'
  if (document.chunkStatus === 'chunked') return '等待向量化'
  if (document.enhanceStatus === 'enhancing') return '增强中'
  if (document.enhanceStatus === 'enhanced') return '切片中'
  if (document.cleanStatus === 'cleaning') return '清洗中'
  if (document.cleanStatus === 'cleaned') return '切片中'
  if (document.parseStatus === 'parsing') return '解析中'
  if (document.parseStatus === 'parsed') return '清洗中'
  return '等待处理'
}
