<script setup lang="ts">
import { Ellipsis } from '@lucide/vue'
import { computed } from 'vue'
import type { ListBoxItem } from './types'

const defaultItems: ListBoxItem[] = Array.from({ length: 17 }, (_, index) => ({
  id: index + 1,
  title: '电商智能客服',
  description: '月之暗面 · Moonshot (128k)',
  content:
    '## 任务 您的主要使命是通过“DALLE”工具赋能用户，激发他们的创造力。通过询问“您希望设计传达什么信息？”或“这个设计是为了什么场合？”等问题，引导用户分享他们想要创造的设计核心。',
  image: 'https://q1.qlogo.cn/g?b=qq&nk=2655252336&s=100',
  authorImage: 'https://q1.qlogo.cn/g?b=qq&nk=2655257336&s=100',
  footer: 'CaoKai · 最近编辑 05-15 16:05',
}))

const props = defineProps<{
  items?: ListBoxItem[]
}>()

const listItems = computed(() => props.items ?? defaultItems)
</script>

<template>
  <div class="items">
    <div class="item" v-for="item in listItems" :key="item.id">
      <div class="head">
        <div class="title_image">
          <img :src="item.image" alt="" v-if="item.image" />
          <div class="text">
            <div class="title">{{ item.title }}</div>
            <div class="desc">{{ item.description }}</div>
          </div>
        </div>
        <div class="more">
          <ellipsis class="icon" />
        </div>
      </div>
      <div class="content">{{ item.content }}</div>
      <div class="footer" v-if="item.footer">
        <img :src="item.authorImage" alt="" v-if="item.authorImage" />
        <span>{{ item.footer }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.items {
  display: grid;
  gap: 2rem;
  grid-template-columns: repeat(auto-fill, minmax(370px, 1fr));
  align-items: start;
  .item {
    display: flex;
    flex-direction: column;
    padding: 1.6rem;
    background-color: var(--white);
    border-radius: 0.8rem;
    border: 1px solid var(--border-color);
    cursor: pointer;
    &:hover {
      .head {
        .more {
          .icon {
            opacity: 1;
            visibility: visible;
          }
        }
      }
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.2rem;
      .title_image {
        display: flex;
        align-items: center;
        gap: 1.2rem;
        img {
          width: 4rem;
          height: 4rem;
          border-radius: 0.8rem;
        }
        .text {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          .title {
            font-size: 1.6rem;
            font-weight: 700;
          }
          .desc {
            font-size: 1.2rem;
            color: var(--font-light-color);
          }
        }
      }
      .more {
        cursor: pointer;
        padding: 0.8rem;
        border-radius: 0.8rem;
        transition: all 0.3s;
        display: flex;
        justify-content: center;
        align-items: center;
        &:hover {
          background-color: var(--touch-bg);
        }
        .icon {
          transition: all 0.3s;
          opacity: 0;
          visibility: hidden;
          width: 1.6rem;
          height: 1.6rem;
          color: var(--font-light-color);
        }
      }
    }
    .content {
      color: rgba(107, 114, 128, 1);
      line-height: 1.8rem;
      font-size: 1.4rem;
    }
    .footer {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      margin-top: 1.2rem;
      img {
        width: 1.6rem;
        height: 1.6rem;
        border-radius: 50%;
      }
      span {
        font-size: 1.2rem;
        color: var(--font-light-color);
      }
    }
  }
}
</style>
