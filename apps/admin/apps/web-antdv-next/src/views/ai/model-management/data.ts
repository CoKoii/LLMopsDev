import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridColumns } from '#/adapter/vxe-table';

export const usageTypeOptions = [
  { label: '通用对话', value: 'chat' },
  { label: '格式处理', value: 'structured' },
  { label: 'Embedding 模型', value: 'embedding' },
  { label: '多模态模型', value: 'multimodal' },
  { label: 'Rerank 模型', value: 'rerank' },
  { label: '语音识别', value: 'speech_to_text' },
  { label: '语音合成', value: 'text_to_speech' },
];

export const testStatusMeta = {
  failed: { color: 'error', text: '失败' },
  success: { color: 'success', text: '成功' },
  untested: { color: 'default', text: '未测试' },
} as const;

export function getUsageTypeText(value: string) {
  return usageTypeOptions.find((item) => item.value === value)?.label ?? value;
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '模型名称',
      },
      fieldName: 'name',
      label: '关键词',
    },
  ];
}

export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '例如：qwen-plus',
      },
      fieldName: 'modelName',
      label: '模型名称',
      rules: 'required',
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '例如：https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
      fieldName: 'baseUrl',
      label: 'Base URL',
      rules: 'required',
    },
    {
      component: 'InputPassword',
      componentProps: {
        allowClear: true,
        placeholder: '编辑时留空表示保留原 Key',
      },
      fieldName: 'apiKey',
      label: 'API Key',
    },
    {
      component: 'Switch',
      defaultValue: true,
      fieldName: 'enabled',
      label: '启用',
    },
    {
      component: 'Textarea',
      componentProps: {
        allowClear: true,
        placeholder:
          '语音合成自定义音色可填写 voice=音色ID；qwen-audio-3.0-tts-flash 默认 longanhuan_v3.6，plus 默认 longanlingxin',
        rows: 4,
      },
      fieldName: 'remark',
      label: '备注',
    },
  ];
}

export function useColumns(): VxeTableGridColumns {
  return [
    {
      align: 'left',
      field: 'modelName',
      minWidth: 200,
      title: '模型名称',
    },
    {
      align: 'left',
      field: 'baseUrl',
      minWidth: 260,
      title: 'Base URL',
    },
    {
      field: 'apiKeyConfigured',
      slots: { default: 'apiKeyConfigured' },
      title: 'API Key',
      width: 100,
    },
    {
      field: 'enabled',
      slots: { default: 'enabled' },
      title: '状态',
      width: 90,
    },
    {
      field: 'lastTestStatus',
      slots: { default: 'lastTestStatus' },
      title: '连通性',
      width: 120,
    },
    {
      field: 'lastTestedAt',
      formatter: 'formatDateTime',
      title: '最近测试',
      width: 170,
    },
    {
      align: 'left',
      field: 'lastTestMessage',
      minWidth: 180,
      title: '测试记录',
    },
    {
      field: 'updatedBy',
      title: '更新人',
      width: 90,
    },
    {
      field: 'updatedAt',
      formatter: 'formatDateTime',
      title: '更新时间',
      width: 170,
    },
    {
      field: 'action',
      fixed: 'right',
      showOverflow: false,
      slots: { default: 'action' },
      title: '操作',
      width: 260,
    },
  ];
}
