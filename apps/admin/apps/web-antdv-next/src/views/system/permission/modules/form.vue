<script lang="ts" setup>
import type { AdminApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import { createAdminPermissionApi, updateAdminPermissionApi } from '#/api';

const emit = defineEmits<{ success: [] }>();
const current = ref<AdminApi.Permission>();

const [Form, formApi] = useVbenForm({
  schema: [
    {
      component: 'Input',
      componentProps: { placeholder: '例如：knowledge:read' },
      fieldName: 'code',
      label: '权限代码',
      rules: 'required',
    },
    {
      component: 'Textarea',
      componentProps: { rows: 3, placeholder: '描述权限的用途' },
      fieldName: 'description',
      label: '权限描述',
    },
    {
      component: 'Switch',
      defaultValue: true,
      fieldName: 'status',
      label: '启用',
    },
  ],
  showDefaultActions: false,
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = (await formApi.getValues()) as {
      code: string;
      description?: string;
      status: boolean;
    };
    const payload = {
      code: values.code.trim(),
      description: values.description?.trim(),
      status: values.status,
    };
    modalApi.lock();
    try {
      if (current.value)
        await updateAdminPermissionApi(current.value.id, payload);
      else await createAdminPermissionApi(payload);
      message.success(current.value ? '权限已更新' : '权限已创建');
      emit('success');
      modalApi.close();
    } catch {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    current.value = modalApi.getData<AdminApi.Permission>();
    formApi.reset();
    await nextTick();
    if (current.value) formApi.setValues(current.value);
    else formApi.setValues({ status: true });
  },
});

const title = computed(() => (current.value ? '编辑权限' : '新建权限'));
</script>

<template>
  <Modal :title="title" class="w-150">
    <Form class="mx-4" />
  </Modal>
</template>
