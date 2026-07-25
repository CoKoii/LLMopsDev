<script setup lang="ts">
import { CircleCheck, CircleDot, CircleX, MessagesSquare, PanelTop, Send } from '@lucide/vue'
import { Button, Input, Tag } from 'antdv-next'
import type { Component } from 'vue'

type PublishChannel = {
  key: string
  title: string
  description: string
  icon: Component
  tone: string
  status: 'configured' | 'unconfigured'
  action: 'visit' | 'configure'
  link?: string
}

const publishChannels: PublishChannel[] = [
  {
    key: 'web',
    title: '网页版',
    description: '可通过访问PC网页立即开始对话。',
    icon: PanelTop,
    tone: '#e0f2fe',
    status: 'configured',
    action: 'visit',
    link: 'https://www.llmops-imooc.com/web-app/WNFEKnzu',
  },
  {
    key: 'wechat',
    title: '微信公众号（订阅号、服务号）',
    description: '接入微信公众号，自动回复用户消息，助力高效私域运营',
    icon: MessagesSquare,
    tone: '#dcfce7',
    status: 'unconfigured',
    action: 'configure',
  },
  {
    key: 'feishu',
    title: '飞书（Bot群聊机器人）',
    description: '在飞书中直接 @Bot 对话，提高工作生产力',
    icon: Send,
    tone: '#e0f2fe',
    status: 'unconfigured',
    action: 'configure',
  },
]
</script>

<template>
  <main class="publish-config">
    <div class="publish-config__notice">
      如应用访问链接或二维码意外泄露，请及时重新生成或进行停止分发，避免资源出现异常消耗
    </div>

    <div class="publish-config__table" role="table" aria-label="发布配置">
      <div class="publish-config__head" role="row">
        <span role="columnheader">发布渠道</span>
        <span role="columnheader">状态</span>
        <span role="columnheader">操作</span>
      </div>

      <article
        v-for="channel in publishChannels"
        :key="channel.key"
        class="publish-config__row"
        role="row"
      >
        <div class="publish-config__channel" role="cell">
          <div class="publish-config__icon" :style="{ background: channel.tone }">
            <component :is="channel.icon" :size="18" />
          </div>
          <div>
            <strong>{{ channel.title }}</strong>
            <span>{{ channel.description }}</span>
          </div>
        </div>

        <div class="publish-config__status" role="cell">
          <Tag v-if="channel.status === 'configured'" color="processing">
            <template #icon><CircleCheck :size="13" /></template>
            已发布
          </Tag>
          <Tag v-else>
            <template #icon><CircleX :size="13" /></template>
            未配置
          </Tag>
        </div>

        <div class="publish-config__operation" role="cell">
          <template v-if="channel.action === 'visit'">
            <Input class="publish-config__link" :value="channel.link" readonly />
            <Button type="primary">重新生成</Button>
            <Button>立即访问</Button>
          </template>
          <Button v-else type="primary">
            <template #icon><CircleDot :size="15" /></template>
            立即配置
          </Button>
        </div>
      </article>
    </div>
  </main>
</template>

<style scoped lang="scss">
.publish-config,
.publish-config *,
.publish-config *::before,
.publish-config *::after {
  box-sizing: border-box;
}

.publish-config {
  flex: 1;
  min-height: 0;
  padding: 2.4rem;
  overflow-y: auto;
}

.publish-config__notice {
  min-height: 3.6rem;
  padding: 0.9rem var(--space-4);
  color: var(--color-text);
  font-size: 1.4rem;
  line-height: 1.8rem;
  background: var(--color-primary-tint);
  border-radius: var(--radius-md);
}

.publish-config__table {
  display: grid;
  margin-top: 2rem;
}

.publish-config__head,
.publish-config__row {
  display: grid;
  grid-template-columns: minmax(38.4rem, 46%) minmax(12.8rem, 12%) minmax(38.4rem, 1fr);
  align-items: center;
}

.publish-config__head {
  min-height: 4.6rem;
  color: var(--color-text);
  font-size: 1.4rem;
  line-height: 2rem;
  background: var(--color-bg-soft);
}

.publish-config__head span {
  padding: 0 var(--space-4);
}

.publish-config__row {
  min-height: 6.4rem;
  border-bottom: 0.1rem solid var(--color-border-light);
}

.publish-config__channel,
.publish-config__operation {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-3);
  padding: 0 var(--space-4);
}

.publish-config__icon {
  display: grid;
  width: 3.6rem;
  height: 3.6rem;
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-primary);
  border-radius: var(--radius-md);
}

.publish-config__channel strong {
  display: block;
  color: var(--color-text-strong);
  font-size: 1.4rem;
  font-weight: 600;
  line-height: 2rem;
}

.publish-config__channel span {
  display: block;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  line-height: 1.8rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publish-config__status {
  padding: 0 var(--space-4);
}

.publish-config__operation {
  justify-content: flex-start;
}

.publish-config__link {
  min-width: 25.6rem;
}

@media (max-width: 700px) {
  .publish-config__head {
    display: none;
  }

  .publish-config__row {
    grid-template-columns: 1fr;
    gap: var(--space-3);
    align-items: start;
    padding: var(--space-4) 0;
  }

  .publish-config__status,
  .publish-config__operation {
    padding: 0 var(--space-4);
  }

  .publish-config__operation {
    flex-wrap: wrap;
  }
}
</style>
