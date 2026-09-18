<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { AdminApi } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { useVbenForm } from '#/adapter/form';
import { useVbenModal } from '@vben/common-ui';
import { message } from 'antdv-next';

import { getAdminRoleListApi, updateAdminUserApi } from '#/api';

const emit = defineEmits<{ success: [] }>();
const current = ref<AdminApi.User>();
const roles = ref<AdminApi.Role[]>([]);

const schema: VbenFormSchema[] = [
  {
    component: 'Input',
    componentProps: { disabled: true },
    fieldName: 'username',
    label: '用户名',
  },
  {
    component: 'Input',
    fieldName: 'nickname',
    label: '昵称',
    rules: 'required',
  },
  {
    component: 'Select',
    componentProps: {
      class: 'w-full',
      mode: 'multiple',
      options: [],
      placeholder: '请选择角色',
    },
    fieldName: 'roleIds',
    label: '角色',
  },
  {
    component: 'Select',
    componentProps: {
      class: 'w-full',
      options: [
        { label: '正常', value: 'active' },
        { label: '停用', value: 'disabled' },
        { label: '锁定', value: 'locked' },
      ],
    },
    fieldName: 'status',
    label: '状态',
    rules: 'required',
  },
];

const [Form, formApi] = useVbenForm({ schema, showDefaultActions: false });
const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid || !current.value) return;
    const values = (await formApi.getValues()) as {
      nickname: string;
      roleIds: number[];
      status: AdminApi.UserStatus;
    };
    modalApi.lock();
    try {
      await updateAdminUserApi(current.value.id, {
        profile: { nickname: values.nickname.trim() },
        roles: values.roleIds ?? [],
        status: values.status,
      });
      message.success('用户信息已更新');
      emit('success');
      modalApi.close();
    } catch {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) return;
    current.value = modalApi.getData<AdminApi.User>();
    formApi.reset();
    if (!roles.value.length) {
      const result = await getAdminRoleListApi({ page: 1, pageSize: 200 });
      roles.value = result.items;
      formApi.setState((previous) => ({
        schema: previous.schema?.map((item) =>
          item.fieldName === 'roleIds'
            ? {
                ...item,
                componentProps: {
                  ...item.componentProps,
                  options: roles.value.map((role) => ({
                    label: role.roleName,
                    value: role.id,
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
        nickname: current.value.profile?.nickname ?? current.value.username,
        roleIds: current.value.roles?.map((role) => role.id) ?? [],
        status: current.value.status,
        username: current.value.username,
      });
    }
  },
});

const title = computed(
  () => `编辑用户${current.value ? `：${current.value.username}` : ''}`,
);
</script>

<template>
  <Modal :title="title" class="w-150">
    <Form class="mx-4" />
  </Modal>
</template>
