import type { CleanedDocument } from "../document-cleaner/document-cleaner.types";
import type { ParsedDocumentBlock } from "../document-parser/document-parser.types";
import type { DocumentChunkerInput } from "./document-chunker.types";
import { DocumentChunkerService } from "./document-chunker.service";

const createInput = (
  blocks: ParsedDocumentBlock[],
  title = "测试文档.md",
): DocumentChunkerInput => {
  const document: CleanedDocument = {
    title,
    format: "markdown",
    contentType: "text/markdown",
    text: "",
    characterCount: 0,
    blocks,
    metadata: {
      parser: "test",
      blockCount: blocks.length,
      cleaner: "basic",
      removedBlockCount: 0,
      originalCharacterCount: 0,
      rules: [],
    },
  };
  return {
    knowledgeId: 1,
    documentId: 1,
    documentName: title,
    contentType: "text/markdown",
    document,
  };
};

const heading = (text: string, level = 1, id = `h-${text}`) =>
  ({
    id,
    type: "heading",
    text,
    level,
  }) satisfies ParsedDocumentBlock;

const paragraph = (text: string, id = `p-${text.slice(0, 8)}`) =>
  ({
    id,
    type: "paragraph",
    text,
  }) satisfies ParsedDocumentBlock;

describe(DocumentChunkerService.name, () => {
  const service = new DocumentChunkerService();

  it("每个分块都带 Markdown 标题路径，首块不重复注入", () => {
    const chunks = service.createChunks(
      createInput([
        heading("用户系统", 1, "h1"),
        heading("登录模块", 2, "h2"),
        heading("登录接口", 3, "h3"),
        paragraph(
          "用户登录接口路径为 POST /api/login，参数为 username 与 password。",
        ),
      ]),
    );

    expect(chunks.length).toBe(1);
    const text = chunks[0]?.text ?? "";
    expect(text).toContain("# 用户系统");
    expect(text).toContain("## 登录模块");
    expect(text).toContain("### 登录接口");
    expect(text).toContain("POST /api/login");
    expect(chunks[0]?.metadata.headingPath).toEqual([
      "用户系统",
      "登录模块",
      "登录接口",
    ]);
  });

  it("长章节拆成多块时，后续块注入标题路径且不重复段落", () => {
    const longText = Array.from(
      { length: 60 },
      (_, index) =>
        `第 ${index + 1} 段：登录流程中的具体实现细节说明，用于验证分块后的标题路径注入行为。`,
    ).join("。\n");
    const chunks = service.createChunks(
      createInput([
        heading("用户系统", 1, "h1"),
        heading("登录模块", 2, "h2"),
        paragraph(longText),
      ]),
    );

    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks[0];
    const second = chunks[1];
    expect(first?.text).toContain("# 用户系统");
    expect(first?.text).toContain("## 登录模块");
    // 后续块带标题路径前缀
    expect(second?.text).toContain("# 用户系统");
    expect(second?.text).toContain("## 登录模块");
  });

  it("无标题文档以文档标题作为一级标题兜底", () => {
    const chunks = service.createChunks(
      createInput([paragraph("纯文本内容，没有任何标题结构。")], "readme.txt"),
    );

    expect(chunks.length).toBe(1);
    expect(chunks[0]?.text).toContain("# readme");
  });

  it("标题后跟超长段落时不产生孤立标题块", () => {
    const longParagraph = Array.from(
      { length: 50 },
      (_, index) =>
        `这是前言部分的第 ${index + 1} 句，介绍背景与动机，内容足够长以触发分块。`,
    ).join("。\n");
    const chunks = service.createChunks(
      createInput([heading("前 言", 1, "h-intro"), paragraph(longParagraph)]),
    );

    const headingOnly = chunks.filter(
      (chunk) =>
        chunk.metadata.blockTypes.every((type) => type === "heading") &&
        chunk.text.trim() === "# 前 言",
    );
    expect(headingOnly).toHaveLength(0);
    // 标题并入正文块
    expect(chunks[0]?.text).toContain("# 前 言");
    expect(chunks[0]?.text).toContain("这是前言部分");
  });

  it("层级路径去重：单章节多块时后续块注入完整标题路径", () => {
    const longText = Array.from(
      { length: 70 },
      (_, index) =>
        `第 ${index + 1} 条接口说明：接口入参与返回结构细节，包含字段类型、默认值与校验规则等完整描述。`,
    ).join("。\n");
    const chunks = service.createChunks(
      createInput([
        heading("第一章 绪论", 1, "h-c1"),
        heading("1.1 开发背景", 2, "h-s1"),
        paragraph(longText),
      ]),
    );

    expect(chunks.length).toBeGreaterThan(1);
    const last = chunks[chunks.length - 1];
    expect(last?.text).toContain("# 第一章 绪论");
    expect(last?.text).toContain("## 1.1 开发背景");
    expect(last?.metadata.headingPath).toEqual(["第一章 绪论", "1.1 开发背景"]);
  });
});
