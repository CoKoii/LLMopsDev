<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import { computed, onMounted, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { Button, Card, Empty, Spin, Table, Tag, message } from 'antdv-next';

import { getAdminOverviewApi, type AdminOpsApi } from '#/api';

const days = ref<7 | 30>(7);
const loading = ref(false);
const overview = ref<AdminOpsApi.Overview>();
const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

const summaryItems = computed(() => {
  const data = overview.value?.overview;
  return [
    {
      label: '活跃用户',
      value: data?.activeUsers ?? 0,
      hint: `共 ${data?.totalUsers ?? 0} 个用户`,
    },
    {
      label: '智能体',
      value: data?.activeApps ?? 0,
      hint: `已发布 ${data?.publishedApps ?? 0} 个`,
    },
    {
      label: '插件',
      value: data?.totalPlugins ?? 0,
      hint: `已发布 ${data?.publishedPlugins ?? 0} 个`,
    },
    {
      label: '知识库',
      value: data?.totalKnowledges ?? 0,
      hint: `${data?.totalDocuments ?? 0} 个文档 / ${data?.totalChunks ?? 0} 个片段`,
    },
    {
      label: '可用模型',
      value: data?.enabledModels ?? 0,
      hint: `知识库异常 ${data?.failedDocuments ?? 0} 项`,
    },
  ];
});

const topApps = computed(() => overview.value?.topApps ?? []);
const modelHealth = computed(() => overview.value?.modelHealth ?? []);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('zh-CN').format(value);

async function renderTrend() {
  if (!overview.value) return;
  await renderEcharts({
    color: ['#2563eb', '#0f766e', '#dc2626'],
    grid: { bottom: 24, containLabel: true, left: 12, right: 20, top: 36 },
    legend: { data: ['会话', '消息', '错误'] },
    series: [
      {
        data: overview.value.daily.map((item) => item.sessions),
        name: '会话',
        smooth: true,
        type: 'line',
      },
      {
        data: overview.value.daily.map((item) => item.messages),
        name: '消息',
        smooth: true,
        type: 'line',
      },
      {
        data: overview.value.daily.map((item) => item.errors),
        name: '错误',
        smooth: true,
        type: 'line',
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      boundaryGap: false,
      data: overview.value.daily.map((item) => item.date.slice(5)),
      type: 'category',
    },
    yAxis: { splitLine: { lineStyle: { type: 'dashed' } }, type: 'value' },
  });
}

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await getAdminOverviewApi(days.value);
    await renderTrend();
  } catch {
    message.error('运营数据加载失败');
  } finally {
    loading.value = false;
  }
}

watch(days, () => void loadOverview());
onMounted(() => void loadOverview());
</script>

<template>
  <Page auto-content-height>
    <div class="operations-page">
      <header class="page-header">
        <div>
          <h1>运营总览</h1>
          <p>实时了解平台资源、AI 调用和知识库处理状态</p>
        </div>
        <div class="period-switcher">
          <Button :type="days === 7 ? 'primary' : 'default'" @click="days = 7"
            >近 7 天</Button
          >
          <Button :type="days === 30 ? 'primary' : 'default'" @click="days = 30"
            >近 30 天</Button
          >
          <Button @click="loadOverview">刷新</Button>
        </div>
      </header>

      <Spin :spinning="loading">
        <div class="summary-grid">
          <Card v-for="item in summaryItems" :key="item.label" size="small">
            <div class="summary-label">{{ item.label }}</div>
            <div class="summary-value">{{ formatNumber(item.value) }}</div>
            <div class="summary-hint">{{ item.hint }}</div>
          </Card>
        </div>

        <div class="content-grid">
          <Card class="trend-card" title="调用趋势">
            <EchartsUI ref="chartRef" height="320px" />
          </Card>
          <Card title="热门智能体">
            <Table
              :columns="[
                { title: '智能体', dataIndex: 'name', key: 'name' },
                {
                  title: '会话数',
                  dataIndex: 'sessions',
                  key: 'sessions',
                  width: 100,
                },
              ]"
              :data-source="topApps"
              :pagination="false"
              row-key="appId"
              size="small"
            >
              <template #emptyText
                ><Empty description="暂无会话数据"
              /></template>
            </Table>
          </Card>
        </div>

        <Card title="模型健康状态">
          <Table
            :columns="[
              { title: '模型', dataIndex: 'modelName', key: 'modelName' },
              {
                title: '用途',
                dataIndex: 'usageType',
                key: 'usageType',
                width: 150,
              },
              {
                title: '启用',
                dataIndex: 'enabled',
                key: 'enabled',
                width: 90,
              },
              {
                title: '连通性',
                dataIndex: 'lastTestStatus',
                key: 'lastTestStatus',
                width: 110,
              },
              {
                title: '最近测试',
                dataIndex: 'lastTestedAt',
                key: 'lastTestedAt',
                width: 190,
              },
            ]"
            :data-source="modelHealth"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'enabled'">
                <Tag :color="record.enabled ? 'success' : 'default'">{{
                  record.enabled ? '启用' : '停用'
                }}</Tag>
              </template>
              <template v-else-if="column.key === 'lastTestStatus'">
                <Tag
                  :color="
                    record.healthy
                      ? 'success'
                      : record.lastTestStatus === 'failed'
                        ? 'error'
                        : 'default'
                  "
                >
                  {{
                    record.lastTestStatus === 'success'
                      ? '正常'
                      : record.lastTestStatus === 'failed'
                        ? '失败'
                        : '未测试'
                  }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'lastTestedAt'">
                {{
                  record.lastTestedAt
                    ? new Date(record.lastTestedAt).toLocaleString('zh-CN')
                    : '未测试'
                }}
              </template>
            </template>
          </Table>
        </Card>
      </Spin>
    </div>
  </Page>
</template>

<style scoped>
.operations-page {
  min-height: 100%;
  padding: 20px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.page-header h1 {
  margin: 0;
  font-size: 24px;
}
.page-header p {
  margin: 6px 0 0;
  color: var(--vben-color-text-2);
}
.period-switcher {
  display: flex;
  gap: 8px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.summary-label {
  color: var(--vben-color-text-2);
  font-size: 13px;
}
.summary-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}
.summary-hint {
  margin-top: 8px;
  color: var(--vben-color-text-3);
  font-size: 12px;
}
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}
.trend-card :deep(.ant-card-body) {
  min-height: 320px;
}
@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .content-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 680px) {
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
