import type { CleanedDocument } from "../document-cleaner/document-cleaner.types";
import { DocumentChunkerService } from "./document-chunker.service";

const createCleanedDocument = (
  blocks: CleanedDocument["blocks"],
): CleanedDocument => {
  const text = blocks.map((block) => block.text).join("\n\n");

  return {
    title: "thought-chain.md",
    format: "md",
    contentType: "text/markdown",
    text,
    characterCount: text.length,
    blocks,
    metadata: {
      parser: "test",
      blockCount: blocks.length,
      cleaner: "test",
      removedBlockCount: 0,
      originalCharacterCount: text.length,
      rules: [],
    },
  };
};

describe("DocumentChunkerService", () => {
  it("keeps split code chunks contextualized with their parent section", () => {
    const chunker = new DocumentChunkerService();
    const chunks = chunker.createChunks({
      knowledgeId: 1,
      documentId: 1,
      documentName: "thought-chain.md",
      contentType: "text/markdown",
      chunkConfig: { maxSegmentLength: 100 },
      document: createCleanedDocument([
        {
          id: "block-1",
          type: "heading",
          text: "可折叠的",
          level: 1,
          headingPath: ["可折叠的"],
        },
        {
          id: "block-2",
          type: "paragraph",
          text: "配置 collapsible 可开启对思维链节点内容区域的折叠功能",
          headingPath: ["可折叠的"],
        },
        {
          id: "block-3",
          type: "paragraph",
          text: Array.from(
            { length: 10 },
            () =>
              "In the process of internal desktop applications development, many different design specs and implementations would be involved.",
          ).join(" "),
          headingPath: ["可折叠的"],
        },
        {
          id: "block-4",
          type: "code",
          text: `<script setup lang="ts">
import { Card } from 'ant-design-vue';
</script>
<template>
  <Card />
</template>`,
          language: "vue",
          headingPath: ["可折叠的"],
        },
      ]),
    });
    const codeChunk = chunks.find((chunk) =>
      chunk.text.includes("<script setup"),
    );

    expect(codeChunk).toBeDefined();
    expect(codeChunk?.text).toContain("可折叠的");
    expect(codeChunk?.text).toContain("配置 collapsible");
    expect(codeChunk?.text).toContain("```vue");
    expect(codeChunk?.searchText).toContain("配置 collapsible");
    expect(codeChunk?.metadata.sectionId).toBe("section-1");
    expect(codeChunk?.metadata.contextualized).toBe(true);
  });
});
