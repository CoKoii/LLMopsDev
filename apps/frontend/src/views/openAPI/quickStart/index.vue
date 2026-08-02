<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'
import { Button, message } from 'antdv-next'
import { computed, ref } from 'vue'

const mode = ref<'non-stream' | 'stream'>('non-stream')
const copied = ref('')
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api`).replace(
  /\/$/,
  '',
)

const requestExample = computed(
  () => `curl --location --request POST '${apiBaseUrl}/openapi/chat' \\
--header 'Authorization: Bearer {API_KEY}' \\
--header 'Content-Type: application/json' \\
--data-raw '{
  "app_id": 123,
  "end_user_id": "customer_10086",
  "conversation_id": "",
  "stream": ${mode.value === 'stream'},
  "query": "请介绍一下这个智能体"
}'`,
)

const responseExample = computed(() =>
  mode.value === 'stream'
    ? `event: session
data: {"conversation_id":"2c7f...","id":102}

data: {"content":"你好"}

event: meta
data: {"elapsed_ms":1280,"total_tokens":36}

data: [DONE]`
    : `{
  "data": {
    "id": "102",
    "conversation_id": "2c7f...",
    "app_id": 123,
    "end_user_id": "customer_10086",
    "answer": "你好，我可以为你提供帮助。",
    "status": "completed",
    "usage": {
      "elapsed_ms": 1280,
      "total_tokens": 36
    },
    "citations": []
  }
}`,
)

async function copyCode(value: string, key: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = key
    message.success('已复制')
    window.setTimeout(() => {
      if (copied.value === key) copied.value = ''
    }, 1500)
  } catch {
    message.error('复制失败，请手动复制')
  }
}
</script>

<template>
  <main class="quick-start">
    <section>
      <h2>概览</h2>
      <p>
        LLMOps 开放 API 将已保存正式版本的 AI 应用接入外部业务系统。API
        调用会复用应用的人设、模型、知识库与插件配置。
      </p>
    </section>

    <section>
      <h2>准备工作</h2>
      <p>调用前请先创建 API 密钥，并在应用编排页保存一个正式版本。</p>
    </section>

    <section>
      <h2>基础使用</h2>
      <div class="mode-tabs" role="tablist" aria-label="响应模式">
        <button :class="{ active: mode === 'non-stream' }" @click="mode = 'non-stream'">
          非流式 Chat
        </button>
        <button :class="{ active: mode === 'stream' }" @click="mode = 'stream'">流式 Chat</button>
      </div>

      <h3>请求 curl</h3>
      <div class="code-block">
        <header>
          <span>shell</span>
          <Button
            type="text"
            size="small"
            title="复制请求示例"
            aria-label="复制请求示例"
            @click="copyCode(requestExample, 'request')"
          >
            <template #icon>
              <Check v-if="copied === 'request'" :size="15" />
              <Copy v-else :size="15" />
            </template>
          </Button>
        </header>
        <pre><code>{{ requestExample }}</code></pre>
      </div>

      <h3>返回结果示例</h3>
      <div class="code-block">
        <header>
          <span>{{ mode === 'stream' ? 'event-stream' : 'json' }}</span>
          <Button
            type="text"
            size="small"
            title="复制返回示例"
            aria-label="复制返回示例"
            @click="copyCode(responseExample, 'response')"
          >
            <template #icon>
              <Check v-if="copied === 'response'" :size="15" />
              <Copy v-else :size="15" />
            </template>
          </Button>
        </header>
        <pre><code>{{ responseExample }}</code></pre>
      </div>
    </section>
  </main>
</template>

<style scoped lang="scss">
.quick-start {
  width: 100%;
  min-height: 100%;
  padding: 2.4rem;
  color: var(--font-color);
  background: var(--white);
  border-radius: 0.8rem;
}

section + section {
  margin-top: 2rem;
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  color: var(--font-active-color);
  font-size: 1.6rem;
  line-height: 2.4rem;
}

h3 {
  margin-top: 1.8rem;
  font-size: 1.4rem;
  font-weight: 500;
}

p {
  margin-top: 1rem;
  font-size: 1.4rem;
  line-height: 2.2rem;
}

.mode-tabs {
  display: flex;
  gap: 2rem;
  margin-top: 1.4rem;
  border-bottom: 0.1rem solid var(--border-color);
}

.mode-tabs button {
  height: 3.6rem;
  padding: 0;
  color: var(--font-light-color);
  font: inherit;
  background: transparent;
  border: 0;
  border-bottom: 0.2rem solid transparent;
  cursor: pointer;
}

.mode-tabs button.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

.code-block {
  margin-top: 1rem;
  overflow: hidden;
  color: #e5e7eb;
  background: #273244;
  border-radius: 0.8rem;
}

.code-block header {
  display: flex;
  min-height: 4rem;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.6rem;
  color: #f9fafb;
  background: #4b5565;
}

.code-block :deep(.ant-btn) {
  color: #f9fafb;
}

pre {
  min-height: 12rem;
  max-height: 42rem;
  margin: 0;
  padding: 1.8rem;
  overflow: auto;
  font-size: 1.3rem;
  line-height: 2rem;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 760px) {
  .quick-start {
    padding: 1.6rem;
  }
}
</style>
