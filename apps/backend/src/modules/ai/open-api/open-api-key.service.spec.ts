import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { OpenApiKey } from "./entities/open-api-key.entity";
import { hashOpenApiKey, OpenApiKeyService } from "./open-api-key.service";

const createStoredKey = (overrides: Partial<OpenApiKey> = {}) =>
  Object.assign(new OpenApiKey(), {
    id: 1,
    userId: 7,
    keyPrefix: "llmops-v1/abcdefgh",
    keySuffix: "wxyz",
    secretHash: "hash",
    status: true,
    remark: null,
    createdAt: new Date("2026-08-02T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    lastUsedAt: null,
    ...overrides,
  });

describe(OpenApiKeyService.name, () => {
  const repository = {
    create: jest.fn((value: Partial<OpenApiKey>) => createStoredKey(value)),
    save: jest.fn(async (value: OpenApiKey) => value),
    find: jest.fn(),
    findOne: jest.fn(),
    softRemove: jest.fn(),
  };
  const service = new OpenApiKeyService(
    repository as unknown as Repository<OpenApiKey>,
  );

  beforeEach(() => jest.clearAllMocks());

  it("returns the secret once and stores only its hash", async () => {
    const result = await service.create(
      { status: true, remark: "客服系统" },
      7,
    );
    const persisted = repository.create.mock.calls[0]?.[0];

    expect(result.secret).toMatch(/^llmops-v1\/[A-Za-z0-9_-]+$/);
    expect(persisted?.secretHash).toBe(hashOpenApiKey(result.secret));
    expect(persisted).not.toHaveProperty("secret");
    expect(result.key).toContain("****");
  });

  it("never returns a complete key from the list", async () => {
    repository.find.mockResolvedValue([createStoredKey()]);

    const [result] = await service.list(7);

    expect(result?.key).toBe("llmops-v1/abcdefgh****wxyz");
    expect(result).not.toHaveProperty("secretHash");
    expect(result).not.toHaveProperty("secret");
  });

  it("does not update a key owned by another user", async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.update(1, { status: false }, 8),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
