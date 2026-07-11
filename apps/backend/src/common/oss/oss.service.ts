import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OSS from "ali-oss";
import { getOssEnvironment } from "../config/env";
import type {
  EnabledOssEnvironment,
  OssObjectMetadata,
  OssEnvironment,
  SignedUploadUrl,
} from "./oss.types";

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

const requireEnabledConfig = (
  config: OssEnvironment,
): EnabledOssEnvironment => {
  const missingKeys = [
    ["OSS_BUCKET", config.bucket],
    ["OSS_ACCESS_KEY_ID", config.accessKeyId],
    ["OSS_ACCESS_KEY_SECRET", config.accessKeySecret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(`启用 OSS 时必须配置 ${missingKeys.join(", ")}`);
  }

  return config as EnabledOssEnvironment;
};

const createClient = (config: OssEnvironment) => {
  if (!config.enabled) {
    return undefined;
  }

  const enabledConfig = requireEnabledConfig(config);

  return new OSS({
    region: enabledConfig.region,
    bucket: enabledConfig.bucket,
    accessKeyId: enabledConfig.accessKeyId,
    accessKeySecret: enabledConfig.accessKeySecret,
    secure: true,
  });
};

@Injectable()
export class OssService {
  private readonly config: OssEnvironment;
  private readonly client?: OSS;

  constructor(configService: ConfigService) {
    this.config = getOssEnvironment(configService);
    this.client = createClient(this.config);
  }

  get enabled() {
    return this.config.enabled;
  }

  get uploadMaxSize() {
    return this.config.uploadMaxSize;
  }

  get tempExpiresInHours() {
    return this.config.tempExpiresInHours;
  }

  private ensureEnabled(): OSS {
    if (!this.client) {
      throw new ServiceUnavailableException("OSS 服务未启用");
    }

    return this.client;
  }

  createUploadUrl(objectKey: string, contentType: string): SignedUploadUrl {
    const client = this.ensureEnabled();
    const expires = this.config.uploadExpiresIn;
    const expiresAt = new Date(Date.now() + expires * 1000);
    const headers = { "Content-Type": contentType };

    return {
      method: "PUT",
      url: client.signatureUrl(objectKey, {
        method: "PUT",
        expires,
        "Content-Type": contentType,
      }),
      headers,
      expiresAt,
    };
  }

  getPublicUrl(objectKey: string) {
    if (this.config.publicBaseUrl) {
      return `${trimTrailingSlash(this.config.publicBaseUrl)}/${objectKey}`;
    }

    if (!this.config.bucket) {
      return "";
    }

    const host = `${this.config.region}.aliyuncs.com`;
    return `https://${this.config.bucket}.${host}/${objectKey}`;
  }

  async deleteObject(objectKey: string) {
    await this.ensureEnabled().delete(objectKey);
  }

  async copyObject(sourceKey: string, targetKey: string) {
    await this.ensureEnabled().copy(targetKey, sourceKey);
  }

  async headObject(objectKey: string): Promise<OssObjectMetadata> {
    const result = await this.ensureEnabled().head(objectKey);
    const headers = result.res.headers as Record<string, string | undefined>;
    const size = Number(headers["content-length"] ?? 0);

    return {
      size,
      contentType: headers["content-type"] ?? "",
    };
  }
}
