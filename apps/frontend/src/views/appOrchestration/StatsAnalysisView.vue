<script setup lang="ts">
import { getAiAppStatsApi, type AiAppStats } from '@/api'
import {
  BotMessageSquare,
  Gauge,
  Hash,
  RefreshCw,
  UsersRound,
} from '@lucide/vue'
import { Button, Spin, message } from 'antdv-next'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'

const props = defineProps<{
  appId: number
}>()

type RangeDays = 7 | 30
type OverviewMetric = {
  key: string
  label: string
  value: string
  hint: string
  icon: Component
}

const rangeDays = ref<RangeDays>(7)
const loading = ref(false)
const stats = ref<AiAppStats>()
const tokenChartRef = ref<HTMLElement>()
const activityChartRef = ref<HTMLElement>()
const rangeOptions: RangeDays[] = [7, 30]
let tokenChart: echarts.ECharts | undefined
let activityChart: echarts.ECharts | undefined
let resizeObserver: ResizeObserver | undefined

const formatNumber = (value: number | undefined) =>
  value === undefined ? '-' : Math.round(value).toLocaleString('en-US')

const formatCompact = (value: number | undefined) => {
  if (value === undefined) return '-'
  if (Math.abs(value) >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`
  if (Math.abs(value) >= 10_000) return `${Number((value / 1_000).toFixed(1))}K`
  return Math.round(value).toLocaleString('en-US')
}

const formatTokenSpeed = (value: number | undefined) =>
  value === undefined ? '-' : `${value.toFixed(1)} Tokens/s`

const formatDate = (value?: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const overviewMetrics = computed<OverviewMetric[]>(() => {
  const overview = stats.value?.overview
  return [
    {
      key: 'tokens',
      label: 'Token消耗',
      value: formatNumber(overview?.tokens),
      hint: `近${rangeDays.value}天总消耗`,
      icon: Hash,
    },
    {
      key: 'token-speed',
      label: '输出速度',
      value: formatTokenSpeed(overview?.tokensPerSecond),
      hint: 'Token/s',
      icon: Gauge,
    },
    {
      key: 'sessions',
      label: '新增会话',
      value: formatNumber(overview?.sessions),
      hint: `近${rangeDays.value}天创建`,
      icon: BotMessageSquare,
    },
    {
      key: 'active-users',
      label: '活跃用户',
      value: formatNumber(overview?.activeUsers),
      hint: '参与对话的用户',
      icon: UsersRound,
    },
  ]
})

const dailyItems = computed(() => stats.value?.daily ?? [])
const recentMessages = computed(() => stats.value?.recentMessages ?? [])
const chartDates = computed(() => dailyItems.value.map((item) => item.date.slice(5)))
const showChartLabels = computed(() => rangeDays.value === 7)

type TooltipItem = {
  axisValueLabel?: string
  marker?: string
  seriesName?: string
  value?: unknown
}

function getTooltipItems(params: unknown) {
  return Array.isArray(params) ? (params as TooltipItem[]) : []
}

function tooltipValue(item: TooltipItem) {
  const value = Array.isArray(item.value) ? item.value.at(-1) : item.value
  if (typeof value !== 'number') return String(value ?? '-')
  if (item.seriesName?.includes('速度')) return formatTokenSpeed(value)
  return formatCompact(value)
}

function formatTooltip(params: unknown) {
  const items = getTooltipItems(params)
  if (!items.length) return ''
  return [
    `<strong>${items[0]?.axisValueLabel ?? ''}</strong>`,
    ...items.map(
      (item) =>
        `<span>${item.marker ?? ''}${item.seriesName ?? ''}</span><b>${tooltipValue(item)}</b>`,
    ),
  ].join('<br/>')
}

function createBaseChartOption(): EChartsOption {
  return {
    color: ['#2563eb', '#16a34a', '#7c3aed', '#f59e0b'],
    grid: { top: 48, right: 48, bottom: 34, left: 64 },
    legend: {
      top: 0,
      right: 0,
      itemHeight: 8,
      itemWidth: 14,
      textStyle: { color: '#64748b', fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(15, 23, 42, 0.92)',
      className: 'stats-chart-tooltip',
      formatter: formatTooltip,
      textStyle: { color: '#fff', fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      data: chartDates.value,
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b' },
    },
  }
}

function createTokenChartOption(): EChartsOption {
  return {
    ...createBaseChartOption(),
    axisPointer: { type: 'shadow' },
    yAxis: [
      {
        type: 'value',
        minInterval: 1,
        name: 'Token',
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#64748b', formatter: (value: number) => formatCompact(value) },
        nameTextStyle: { color: '#64748b' },
      },
      {
        type: 'value',
        name: '速度',
        splitLine: { show: false },
        axisLabel: { color: '#64748b', formatter: (value: number) => `${formatCompact(value)}/s` },
        nameTextStyle: { color: '#64748b' },
      },
    ],
    series: [
      {
        name: 'Token消耗',
        type: 'bar',
        barMaxWidth: 28,
        data: dailyItems.value.map((item) => item.tokens),
        itemStyle: {
          borderRadius: [5, 5, 0, 0],
          color: '#2563eb',
        },
        label: {
          show: showChartLabels.value,
          position: 'top',
          color: '#334155',
          fontSize: 11,
          formatter: ({ value }) => formatCompact(Number(value)),
        },
      },
      {
        name: '输出速度',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 3 },
        itemStyle: { color: '#16a34a' },
        data: dailyItems.value.map((item) => item.tokensPerSecond ?? null),
      },
    ],
  }
}

function createActivityChartOption(): EChartsOption {
  return {
    ...createBaseChartOption(),
    axisPointer: { type: 'shadow' },
    yAxis: [
      {
        type: 'value',
        minInterval: 1,
        name: '会话',
        splitLine: { lineStyle: { color: '#eef2f7' } },
        axisLabel: { color: '#64748b', formatter: (value: number) => formatCompact(value) },
        nameTextStyle: { color: '#64748b' },
      },
      {
        type: 'value',
        minInterval: 1,
        name: '用户',
        splitLine: { show: false },
        axisLabel: { color: '#64748b', formatter: (value: number) => formatCompact(value) },
        nameTextStyle: { color: '#64748b' },
      },
    ],
    series: [
      {
        name: '新增会话',
        type: 'bar',
        barMaxWidth: 30,
        data: dailyItems.value.map((item) => item.sessions),
        itemStyle: {
          borderRadius: [5, 5, 0, 0],
          color: '#7c3aed',
        },
        label: {
          show: showChartLabels.value,
          position: 'top',
          color: '#334155',
          fontSize: 11,
          formatter: ({ value }) => formatCompact(Number(value)),
        },
      },
      {
        name: '活跃用户',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 6,
        lineStyle: { width: 3 },
        itemStyle: { color: '#f59e0b' },
        data: dailyItems.value.map((item) => item.activeUsers),
      },
    ],
  }
}

function ensureCharts() {
  if (tokenChartRef.value && !tokenChart) tokenChart = echarts.init(tokenChartRef.value)
  if (activityChartRef.value && !activityChart) {
    activityChart = echarts.init(activityChartRef.value)
  }
}

async function renderCharts() {
  await nextTick()
  ensureCharts()
  tokenChart?.setOption(createTokenChartOption(), true)
  activityChart?.setOption(createActivityChartOption(), true)
}

async function loadStats() {
  if (!Number.isFinite(props.appId)) return
  loading.value = true
  try {
    stats.value = await getAiAppStatsApi(props.appId, rangeDays.value)
    await renderCharts()
  } catch (error) {
    message.error(error instanceof Error ? error.message : '统计数据加载失败')
  } finally {
    loading.value = false
  }
}

function setRange(days: RangeDays) {
  if (rangeDays.value === days) return
  rangeDays.value = days
}

function resizeCharts() {
  tokenChart?.resize()
  activityChart?.resize()
}

onMounted(() => {
  void loadStats()
  resizeObserver = new ResizeObserver(resizeCharts)
  if (tokenChartRef.value) resizeObserver.observe(tokenChartRef.value)
  if (activityChartRef.value) resizeObserver.observe(activityChartRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  tokenChart?.dispose()
  activityChart?.dispose()
})

watch([() => props.appId, rangeDays], () => {
  void loadStats()
})
</script>

<template>
  <main class="stats-analysis">
    <header class="stats-analysis__header">
      <h2>统计分析</h2>

      <div class="stats-analysis__actions">
        <div class="stats-range">
          <button
            v-for="days in rangeOptions"
            :key="days"
            type="button"
            :class="{ 'is-active': rangeDays === days }"
            @click="setRange(days)"
          >
            {{ days }}天
          </button>
        </div>
        <Button :loading="loading" @click="loadStats">
          <template #icon><RefreshCw :size="15" /></template>
          刷新
        </Button>
      </div>
    </header>

    <Spin :spinning="loading">
      <section class="stats-overview">
        <article v-for="metric in overviewMetrics" :key="metric.key" class="stats-card">
          <div class="stats-card__title">
            <span class="stats-card__icon">
              <component :is="metric.icon" :size="16" />
            </span>
            <span>{{ metric.label }}</span>
          </div>
          <strong>{{ metric.value }}</strong>
          <p>{{ metric.hint }}</p>
        </article>
      </section>

      <section class="stats-grid">
        <article class="stats-panel">
          <header>
            <h3>Token与输出速度</h3>
            <span>{{ stats?.range.start }} 至 {{ stats?.range.end }}</span>
          </header>
          <div ref="tokenChartRef" class="stats-chart"></div>
        </article>

        <article class="stats-panel">
          <header>
            <h3>用户活跃</h3>
            <span>{{ stats?.range.start }} 至 {{ stats?.range.end }}</span>
          </header>
          <div ref="activityChartRef" class="stats-chart"></div>
        </article>
      </section>

      <section class="stats-panel stats-panel--table">
        <header>
          <h3>回复消耗明细</h3>
        </header>
        <div class="stats-table">
          <div class="stats-table__row stats-table__row--head">
            <span>时间</span>
            <span>场景</span>
            <span>会话</span>
            <span>速度</span>
            <span>Token</span>
          </div>
          <div v-if="!recentMessages.length" class="stats-table__empty">暂无数据</div>
          <div v-for="item in recentMessages" :key="item.id" class="stats-table__row">
            <span>{{ formatDate(item.createdAt) }}</span>
            <span>{{ item.mode === 'debug' ? '调试' : '独立页' }}</span>
            <span>{{ item.title }}</span>
            <span>{{ formatTokenSpeed(item.tokensPerSecond) }}</span>
            <strong>{{ formatNumber(item.tokens) }}</strong>
          </div>
        </div>
      </section>
    </Spin>
  </main>
</template>

<style scoped lang="scss">
.stats-analysis,
.stats-analysis *,
.stats-analysis *::before,
.stats-analysis *::after {
  box-sizing: border-box;
}

.stats-analysis {
  flex: 1;
  min-height: 0;
  padding: 2.4rem;
  overflow-y: auto;
  color: var(--color-text);
  background: var(--color-white);
}

.stats-analysis__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: 2rem;
}

.stats-analysis__header h2,
.stats-panel h3 {
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.8rem;
  font-weight: 600;
  line-height: 2.4rem;
}

.stats-analysis__actions,
.stats-range {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.stats-range {
  padding: 0.2rem;
  background: var(--color-bg-soft);
  border-radius: var(--radius-md);
}

.stats-range button {
  height: 3.2rem;
  padding: 0 1.2rem;
  color: var(--color-text);
  font: inherit;
  font-size: 1.3rem;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.stats-range button.is-active {
  color: var(--color-primary);
  background: var(--color-white);
  box-shadow: 0 0.1rem 0.3rem rgba(17, 24, 39, 0.12);
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.6rem;
}

.stats-card,
.stats-panel {
  min-width: 0;
  background: var(--color-white);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.stats-card {
  min-height: 13.2rem;
  padding: 2rem;
}

.stats-card__title,
.stats-panel header {
  display: flex;
  align-items: center;
}

.stats-card__title {
  gap: var(--space-2);
  color: var(--color-text);
  font-size: 1.3rem;
  line-height: 2rem;
}

.stats-card__icon {
  display: grid;
  width: 3rem;
  height: 3rem;
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-primary-tint);
  border-radius: var(--radius-md);
}

.stats-card strong {
  display: block;
  margin-top: 1.8rem;
  overflow-wrap: anywhere;
  color: var(--color-text-strong);
  font-size: 2.8rem;
  font-weight: 650;
  line-height: 3.2rem;
}

.stats-card p {
  margin: 0.8rem 0 0;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  line-height: 1.8rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.6rem;
  margin-top: 1.6rem;
}

.stats-panel {
  padding: 2rem;
}

.stats-panel header {
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: 1.2rem;
}

.stats-panel h3 {
  font-size: 1.6rem;
  line-height: 2.2rem;
}

.stats-panel header > span {
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-size: 1.2rem;
}

.stats-chart {
  width: 100%;
  height: 32rem;
}

:global(.stats-chart-tooltip) {
  min-width: 14rem;
  line-height: 1.9;
}

:global(.stats-chart-tooltip strong) {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 600;
}

:global(.stats-chart-tooltip span) {
  display: inline-block;
  min-width: 8.4rem;
}

:global(.stats-chart-tooltip b) {
  float: right;
  margin-left: 1.2rem;
  font-weight: 650;
}

.stats-panel--table {
  margin-top: 1.6rem;
}

.stats-table {
  display: grid;
  overflow-x: auto;
}

.stats-table__row {
  display: grid;
  grid-template-columns: 16rem 8rem minmax(18rem, 1fr) 8rem 10rem;
  align-items: center;
  min-width: 66rem;
  min-height: 4.4rem;
  gap: var(--space-3);
  padding: 0 1rem;
  border-bottom: 0.1rem solid var(--color-border-light);
}

.stats-table__row--head {
  min-height: 3.6rem;
  color: var(--color-text-muted);
  font-size: 1.2rem;
  background: var(--color-bg-soft);
  border-radius: var(--radius-sm);
}

.stats-table__row:not(.stats-table__row--head) {
  color: var(--color-text);
  font-size: 1.3rem;
}

.stats-table__row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-table__row strong {
  color: var(--color-text-strong);
  font-size: 1.4rem;
  text-align: right;
}

.stats-table__empty {
  min-width: 66rem;
  padding: 3rem 1rem;
  color: var(--color-text-muted);
  font-size: 1.3rem;
  text-align: center;
}

@media (max-width: 1180px) {
  .stats-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .stats-analysis {
    padding: var(--space-4);
  }

  .stats-analysis__header {
    display: grid;
  }

  .stats-analysis__actions {
    justify-content: space-between;
  }

  .stats-overview {
    grid-template-columns: 1fr;
  }
}
</style>
