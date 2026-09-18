<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { AdminApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { message } from 'antdv-next';

import { useVbenForm } from '#/adapter/form';
import {
  createAdminRoleApi,
  getAdminPermissionListApi,
  updateAdminRoleApi,
} from '#/api';

const emit = defineEmits<{ success: [] }>();
const current = ref<AdminApi.Role>();
const permissions = ref<AdminApi.Permission[]>([]);

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    fieldName: 'roleName',
    label: '角色名称',
    rules: 'required',
  },
  {
    component: 'Textarea',
    componentProps: { rows: 3, placeholder: '描述该角色的职责范围' },
    fieldName: 'description',
    label: '角色描述',
  },
  {
    component: 'Select',
    componentProps: {
      class: 'w-full',
      mode: 'multiple',
      options: [],
      placeholder: '请选择权限',
      showSearch: true,
    },
    fieldName: 'permissionIds',
    label: '权限',
  },
  {
    component: 'Switch',
    defaultValue: true,
    fieldName: 'status',
    label: '启用',
  },
];

const [Form, formApi] = useVbenForm({ schema, showDefaultActions: false });
const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const values = (await formApi.getValues()) as {
      description?: string;
      permissionIds?: number[];
      roleName: string;
      status: boolean;
    };
    const payload = {
      description: values.description?.trim(),
      permissions: values.permissionIds ?? [],
      roleName: values.roleName.trim(),
      status: values.status,
    };
    modalApi.lock();
    try {
      if (current.value) await updateAdminRoleApi(current.value.id, payload);
      else await createAdminRoleApi(payload);
      message.success(current.value ? '角色已更新' : '角色已创建');
      emit('success');
      modalApi.close();
    } catch {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    current.value = modalApi.getData<AdminApi.Role>();
    formApi.reset();
    if (!permissions.value.length) {
      const result = await getAdminPermissionListApi({
        page: 1,
        pageSize: 200,
      });
      permissions.value = result.items;
      formApi.setState((previous) => ({
        schema: previous.schema?.map((item) =>
          item.fieldName === 'permissionIds'
            ? {
                ...item,
                componentProps: {
                  ...item.componentProps,
                  options: permissions.value.map((permission) => ({
                    label: permission.code,
                    value: permission.id,
                  })),
                },
              }
            : item,
        ),
      }));
    }
    await nextTick();
    if (current.value) {
      formApi.setValues({
        description: current.value.description ?? '',
        permissionIds:
          current.value.permissions?.map((permission) => permission.id) ?? [],
        roleName: current.value.roleName,
        status: current.value.status,
      });
    }
  },
});

const title = computed(() => (current.value ? '编辑角色' : '新建角色'));
</script>

<template>
  <Modal :title="title" class="w-150">
    <Form class="mx-4" />
  </Modal>
</template>
