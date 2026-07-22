<script setup lang="ts">
import type { PluginItem } from '@/api'
import { parseOpenApiTools } from '@/utils/openapiTools'
import { Settings } from '@lucide/vue'
import { Button, Drawer } from 'antdv-next'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    plugin?: PluginItem
    loading?: boolean
    showEdit?: boolean
  }>(),
  {
    loading: false,
    showEdit: false,
  },
)

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  edit: [plugin: PluginItem]
}>()

const tools = computed(() => parseOpenApiTools(props.plugin?.openapiSchema ?? ''))
</script>

<template>
  <Drawer
    v-model:open="open"
    title="工具详情"
    placement="right"
    :size="380"
    :closable="{ placement: 'end' }"
  >
    <div v-if="plugin" class="plugin-detail__body" :class="{ 'is-loading': loading }">
      <section class="plugin-detail__summary">
        <div class="plugin-detail__icon">
          <img v-if="plugin.icon" :src="plugin.icon" alt="" />
          <span v-else>{{ plugin.name.slice(0, 1) }}</span>
        </div>
        <div class="plugin-detail__title">
          <h3>{{ plugin.name }}</h3>
          <p>
            {{ plugin.published ? '已发布' : '未发布' }}
            <span v-if="plugin.category"> · {{ plugin.category.name }}</span>
            <span> · {{ tools.length }} 工具</span>
          </p>
        </div>
      </section>

      <p class="plugin-detail__description">
        {{ plugin.description || '暂无描述' }}
      </p>

      <Button v-if="showEdit" class="plugin-detail__edit" @click="emit('edit', plugin)">
        <template #icon>
          <Settings class="btn-icon" />
        </template>
        编辑
      </Button>

      <section class="plugin-detail__tools">
        <p class="plugin-detail__count">包含 {{ tools.length }} 个工具</p>
        <div v-if="tools.length === 0" class="plugin-detail__empty">暂无可用工具</div>
        <template v-else>
          <article
            v-for="tool in tools"
            :key="`${tool.method}-${tool.path}-${tool.name}`"
            class="plugin-detail__tool"
          >
            <h4>{{ tool.name }}</h4>
            <p>{{ tool.description }}</p>
            <div class="plugin-detail__path">
              <span>{{ tool.method.toUpperCase() }}</span>
              <span>{{ tool.path }}</span>
            </div>
            <div v-if="tool.parameters.length" class="plugin-detail__params">
              <div
                v-for="parameter in tool.parameters"
                :key="`${tool.name}-${parameter.name}`"
                class="plugin-detail__param"
              >
                <div>
                  <strong>{{ parameter.name }}</strong>
                  <span>{{ parameter.type }}</span>
                  <em v-if="parameter.required">必填</em>
                </div>
                <p>{{ parameter.description }}</p>
              </div>
            </div>
          </article>
        </template>
      </section>
    </div>
  </Drawer>
</template>

<style scoped lang="scss">
.plugin-detail__body {
  overflow-y: auto;

  &.is-loading {
    opacity: 0.62;
  }
}

.plugin-detail__summary {
  display: flex;
  gap: 1.2rem;
  align-items: center;
}

.plugin-detail__icon {
  display: grid;
  width: 4rem;
  height: 4rem;
  flex: none;
  place-items: center;
  overflow: hidden;
  border-radius: 0.8rem;
  background: #f2f4f7;
  color: #5f6775;
  font-size: 1.6rem;
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.plugin-detail__title {
  min-width: 0;

  h3 {
    margin: 0 0 0.4rem;
    overflow: hidden;
    color: #202938;
    font-size: 1.5rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    color: #7b8493;
    font-size: 1.2rem;
  }
}

.plugin-detail__description {
  margin: 1.4rem 0 1.6rem;
  color: #5f6775;
  font-size: 1.3rem;
  line-height: 1.7;
}

.plugin-detail__edit {
  width: 100%;
  height: 3.6rem;
  margin-bottom: 2rem;
}

.plugin-detail__count {
  margin: 0 0 0.8rem;
  color: #7b8493;
  font-size: 1.2rem;
}

.plugin-detail__tools {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.plugin-detail__empty,
.plugin-detail__tool {
  border: 0.1rem solid #edf0f4;
  border-radius: 0.8rem;
  background: #fff;
}

.plugin-detail__empty {
  padding: 1.6rem;
  color: #9aa1ad;
  font-size: 1.3rem;
}

.plugin-detail__tool {
  padding: 1.4rem;

  h4 {
    margin: 0 0 0.6rem;
    color: #202938;
    font-size: 1.4rem;
    font-weight: 700;
  }

  > p {
    margin: 0;
    color: #5f6775;
    font-size: 1.2rem;
    line-height: 1.6;
  }
}

.plugin-detail__path {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 0.1rem solid #edf0f4;
  color: #7b8493;
  font-size: 1.2rem;
  line-height: 1.5;

  span:first-child {
    flex: none;
    color: #1d4ed8;
    font-weight: 700;
  }

  span:last-child {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
}

.plugin-detail__params {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-top: 1rem;
}

.plugin-detail__param {
  div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
    color: #303846;
    font-size: 1.2rem;
  }

  strong {
    font-weight: 700;
  }

  span,
  em {
    color: #7b8493;
    font-style: normal;
  }

  em {
    color: #dc2626;
  }

  p {
    margin: 0.4rem 0 0;
    color: #7b8493;
    font-size: 1.2rem;
    line-height: 1.5;
  }
}

.btn-icon {
  width: 1.4rem;
  height: 1.4rem;
}
</style>
