<script setup lang="ts">
import { Ellipsis } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ListBoxItem } from './types'

const props = defineProps<{
  items: ListBoxItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  edit: [item: ListBoxItem]
  delete: [item: ListBoxItem]
  open: [item: ListBoxItem]
}>()

const listItems = computed(() => props.items)
const activeActionId = ref<ListBoxItem['id']>()
const actionItems = [
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除', danger: true },
]

const handleAction = (key: string, item: ListBoxItem) => {
  activeActionId.value = undefined
  if (key === 'edit') {
    emit('edit', item)
  }
  if (key === 'delete') {
    emit('delete', item)
  }
}

const toggleActions = (item: ListBoxItem) => {
  activeActionId.value = activeActionId.value === item.id ? undefined : item.id
}

const closeActions = () => {
  activeActionId.value = undefined
}

const closeActionsWithEsc = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeActions()
  }
}

onMounted(() => {
  document.addEventListener('click', closeActions)
  document.addEventListener('keydown', closeActionsWithEsc)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeActions)
  document.removeEventListener('keydown', closeActionsWithEsc)
})
</script>

<template>
  <div class="items" v-if="listItems.length">
    <div class="item" v-for="item in listItems" :key="item.id" @click="emit('open', item)">
      <div class="head">
        <div class="title_image">
          <img :src="item.image" alt="" v-if="item.image" />
          <div class="placeholder" v-else>{{ item.title.slice(0, 1) }}</div>
          <div class="text">
            <div class="title">{{ item.title }}</div>
            <div class="desc">{{ item.description }}</div>
          </div>
        </div>
        <div class="actions" @click.stop>
          <button
            class="more"
            type="button"
            :class="{ active: activeActionId === item.id }"
            @click="toggleActions(item)"
          >
            <ellipsis class="icon" />
          </button>
          <div class="action-menu" v-if="activeActionId === item.id">
            <button
              v-for="action in actionItems"
              :key="action.key"
              type="button"
              :class="{ danger: action.danger }"
              @click="handleAction(action.key, item)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>
      <div class="content">{{ item.content }}</div>
      <div class="footer" v-if="item.footer">
        <img :src="item.authorImage" alt="" v-if="item.authorImage" />
        <span>{{ item.footer }}</span>
      </div>
    </div>
  </div>
  <div class="empty" v-else>
    {{ loading ? '加载中...' : '暂无数据' }}
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
        img,
        .placeholder {
          width: 4rem;
          height: 4rem;
          border-radius: 0.8rem;
          flex: none;
        }
        img {
          object-fit: cover;
        }
        .placeholder {
          display: grid;
          place-items: center;
          background: var(--touch-bg);
          color: var(--font-light-color);
          font-size: 1.6rem;
          font-weight: 700;
        }
        .text {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          .title {
            font-size: 1.6rem;
            font-weight: 700;
            color: var(--font-active-color);
          }
          .desc {
            font-size: 1.2rem;
            color: var(--font-light-color);
          }
        }
      }
      .actions {
        position: relative;
        flex: none;

        .more {
          cursor: pointer;
          padding: 0.8rem;
          border: 0;
          border-radius: 0.8rem;
          background: transparent;
          transition: background-color 0.12s ease;
          display: flex;
          justify-content: center;
          align-items: center;

          &:hover,
          &.active {
            background-color: var(--touch-bg);
          }

          .icon {
            opacity: 0.72;
            width: 1.6rem;
            height: 1.6rem;
            color: var(--font-light-color);
          }
        }

        .action-menu {
          position: absolute;
          top: calc(100% + 0.4rem);
          right: 0;
          z-index: 20;
          min-width: 8.8rem;
          padding: 0.4rem;
          border: 1px solid var(--border-color);
          border-radius: 0.6rem;
          background: var(--white);
          box-shadow: 0 1rem 3rem rgb(17 24 39 / 12%);

          button {
            width: 100%;
            height: 3.2rem;
            padding: 0 1rem;
            border: 0;
            border-radius: 0.4rem;
            background: transparent;
            color: var(--font-color);
            cursor: pointer;
            text-align: left;
            font-size: 1.4rem;

            &:hover {
              background: var(--touch-bg);
            }

            &.danger {
              color: #dc2626;

              &:hover {
                background: #fef2f2;
              }
            }
          }
        }
      }
    }
    .content {
      color: rgba(107, 114, 128, 1);
      line-height: 1.8rem;
      font-size: 1.4rem;
      min-height: 3.6rem;
      white-space: pre-line;
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

.empty {
  height: 24rem;
  display: grid;
  place-items: center;
  color: var(--font-light-color);
  font-size: 1.4rem;
}
</style>
