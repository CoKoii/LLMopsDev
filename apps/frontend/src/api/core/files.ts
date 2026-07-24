import request from '../request'

export interface UploadedFile {
  id: number
  originalName: string
  contentType: string
  size: number
  url: string
  status: 'pending' | 'uploaded' | 'used'
}

interface UploadIntent {
  file: UploadedFile
  upload: {
    method: 'PUT'
    url: string
    headers: Record<string, string>
    expiresAt: string
  }
}

export const createUploadIntentApi = async (file: File): Promise<UploadIntent> => {
  return request.post('/files/upload-intents', {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  })
}

export const completeUploadApi = async (id: number): Promise<UploadedFile> => {
  return request.post(`/files/${id}/complete`)
}

export const uploadFileApi = async (file: File): Promise<UploadedFile> => {
  const intent = await createUploadIntentApi(file)
  const response = await fetch(intent.upload.url, {
    method: intent.upload.method,
    headers: intent.upload.headers,
    body: file,
  })

  if (!response.ok) {
    throw new Error('文件上传失败')
  }

  return completeUploadApi(intent.file.id)
}
