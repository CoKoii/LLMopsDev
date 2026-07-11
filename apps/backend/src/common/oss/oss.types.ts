import type { getOssEnvironment } from "../config/env";

export type OssEnvironment = ReturnType<typeof getOssEnvironment>;

export type EnabledOssEnvironment = OssEnvironment & {
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
};

export interface SignedUploadUrl {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface OssObjectMetadata {
  size: number;
  contentType: string;
}
