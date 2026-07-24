export interface KnowledgeDocument {
  id: number
  name: string
  characterCount: number
  recallCount: number
  uploadedAt: string
  enabled: boolean
}

export interface UploadedKnowledgeFile {
  name: string
  size: number
}

const documentSeeds = [
  ['LLMOps 项目提示词.md', 4700, 18, '2024-06-11 23:31:47', false],
  ['课程Prompt提示词.txt', 2100, 0, '2024-04-07 09:22:00', true],
  ['Readme.md', 1700, 12, '2024-01-08 13:20:10', true],
  ['慕课LLMOps代码库.txt', 12500, 13, '2024-05-14 14:35:27', false],
  ['LLMOps 项目API文档.md', 95100, 154, '2024-01-07 12:18:04', true],
  ['基于工具调用的智能体设计与实现.md', 14800, 42, '2024-02-01 21:16:25', true],
] as const

const createStorageKey = (knowledgeId: number) => `knowledge-upload-documents:${knowledgeId}`

export const readUploadedDocuments = (knowledgeId: number): KnowledgeDocument[] => {
  const value = sessionStorage.getItem(createStorageKey(knowledgeId))
  if (!value) return []

  try {
    const items = JSON.parse(value) as KnowledgeDocument[]
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export const writeUploadedDocuments = (knowledgeId: number, documents: KnowledgeDocument[]) => {
  sessionStorage.setItem(createStorageKey(knowledgeId), JSON.stringify(documents))
}

const formatDateTime = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const createMockDocuments = () =>
  Array.from({ length: 21 }, (_, index): KnowledgeDocument => {
    const item = documentSeeds[index % documentSeeds.length]!
    return {
      id: 21 - index,
      name: item[0],
      characterCount: item[1],
      recallCount: item[2],
      uploadedAt: item[3],
      enabled: item[4],
    }
  })

export const createUploadedDocuments = (
  files: UploadedKnowledgeFile[],
  existingDocuments: KnowledgeDocument[],
) => {
  const nextId = Math.max(1000, ...existingDocuments.map((item) => item.id)) + files.length
  const uploadedAt = formatDateTime()

  return files.map((file, index): KnowledgeDocument => ({
    id: nextId - index,
    name: file.name,
    characterCount: Math.max(1, Math.round(file.size / 2)),
    recallCount: 0,
    uploadedAt,
    enabled: true,
  }))
}
