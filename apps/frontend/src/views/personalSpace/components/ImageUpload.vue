<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { message } from 'antdv-next'
import { ref } from 'vue'
import { uploadFileApi } from '@/api'

const imageUrl = defineModel<string | undefined>('url')
const fileId = defineModel<number | undefined>('fileId')
const inputRef = ref<HTMLInputElement>()
const uploading = ref(false)

const chooseFile = () => {
  inputRef.value?.click()
}

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const [file] = input.files ?? []
  input.value = ''

  if (!file) {
    return
  }
  if (!file.type.startsWith('image/')) {
    message.error('请选择图片文件')
    return
  }

  uploading.value = true
  try {
    const uploaded = await uploadFileApi(file)
    imageUrl.value = uploaded.url
    fileId.value = uploaded.id
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <button class="image-upload" type="button" :disabled="uploading" @click="chooseFile">
    <img v-if="imageUrl" :src="imageUrl" alt="" />
    <span v-else class="empty">
      <Plus class="plus" />
      <span>{{ uploading ? '上传中' : '上传图片' }}</span>
    </span>
    <input ref="inputRef" type="file" accept="image/*" @change="handleFileChange" />
  </button>
</template>

<style scoped lang="scss">
.image-upload {
  width: 7.2rem;
  height: 7.2rem;
  border: 0.1rem dashed #d1d5db;
  border-radius: 0.6rem;
  background: var(--touch-bg);
  color: var(--font-color);
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  display: grid;
  place-items: center;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  input {
    display: none;
  }
}

.empty {
  display: grid;
  place-items: center;
  gap: 0.4rem;
  font-size: 1.2rem;
}

.plus {
  width: 1.8rem;
  height: 1.8rem;
}
</style>
