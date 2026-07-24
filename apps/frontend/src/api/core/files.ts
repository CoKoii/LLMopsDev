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

interface UploadRequestOptions {
  suppressErrorNotify?: boolean
}

export const createUploadIntentApi = async (
  file: File,
  options: UploadRequestOptions = {},
): Promise<UploadIntent> => {
  return request.post(
    '/files/upload-intents',
    {
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size: file.size,
    },
    { suppressErrorNotify: options.suppressErrorNotify },
  )
}

export const completeUploadApi = async (
  id: number,
  options: UploadRequestOptions = {},
): Promise<UploadedFile> => {
  return request.post(`/files/${id}/complete`, undefined, {
    suppressErrorNotify: options.suppressErrorNotify,
  })
}

export const uploadFileApi = async (
  file: File,
  options: UploadRequestOptions = {},
): Promise<UploadedFile> => {
  const intent = await createUploadIntentApi(file, options)
  const response = await fetch(intent.upload.url, {
    method: intent.upload.method,
    headers: intent.upload.headers,
    body: file,
  })

  if (!response.ok) {
    throw new Error('文件上传失败')
  }

  return completeUploadApi(intent.file.id, options)
}
