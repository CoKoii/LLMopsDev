<script lang="ts" setup>
import type { AiModelApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import { createAiModelApi, updateAiModelApi } from '#/api';

import { useFormSchema } from '../data';

const emits = defineEmits(['success']);

const current = ref<Partial<AiModelApi.ModelConfig>>();

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;

    const values = (await formApi.getValues()) as AiModelApi.ModelPayload;
    const usageType = current.value?.usageType;
    if (!usageType) {
      message.warning('缺少模型分类');
      return;
    }
    const apiKey = values.apiKey?.trim();
    if (!current.value?.id && !apiKey) {
      message.warning('新增模型必须填写 API Key');
      return;
    }

    const payload: AiModelApi.ModelPayload = {
      baseUrl: values.baseUrl?.trim(),
      enabled: values.enabled,
      modelName: values.modelName?.trim(),
      remark: values.remark?.trim() || undefined,
      usageType,
    };
    if (apiKey) {
      payload.apiKey = apiKey;
    }

    modalApi.lock();
    try {
      if (current.value?.id) {
        await updateAiModelApi(current.value.id, payload);
      } else {
        await createAiModelApi(payload);
      }
      emits('success');
      modalApi.close();
    } catch {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;

    formApi.reset();
    current.value = modalApi.getData<Partial<AiModelApi.ModelConfig>>();
    await nextTick();

    if (current.value?.id) {
      formApi.setValues({
        ...current.value,
        apiKey: '',
      });
    } else {
      formApi.setValues({
        enabled: true,
      });
    }
  },
});

const title = computed(() => (current.value?.id ? '编辑模型' : '新增模型'));
</script>

<template>
  <Modal :title="title" class="w-150">
    <Form class="mx-4" />
  </Modal>
</template>
