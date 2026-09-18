<script setup lang="ts">
import { Modal } from 'antdv-next'

defineOptions({
  inheritAttrs: false,
})

withDefaults(
  defineProps<{
    centered?: boolean
    keyboard?: boolean
    maskClosable?: boolean
  }>(),
  {
    centered: true,
    keyboard: true,
    maskClosable: true,
  },
)

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  ok: [event: MouseEvent]
  cancel: [event: MouseEvent | KeyboardEvent]
}>()
</script>

<template>
  <Modal
    v-bind="$attrs"
    v-model:open="open"
    :centered="centered"
    :keyboard="keyboard"
    :mask-closable="maskClosable"
    @ok="emit('ok', $event)"
    @cancel="emit('cancel', $event)"
  >
    <slot />
  </Modal>
</template>
