<script setup lang="ts">
import {
  BadgeDollarSign,
  BotMessageSquare,
  Calculator,
  CircleEqual,
  CircleHelp,
  Hourglass,
  UsersRound,
} from '@lucide/vue'
import type { Component } from 'vue'

type OverviewMetric = {
  key: string
  label: string
  value: string
  unit: string
  change: string
  icon: Component
}

const chartRange = '过去7天'
const chartDescription = '展示最近7天的会话数'
const overviewMetrics: OverviewMetric[] = [
  {
    key: 'sessions',
    label: '全部会话数',
    value: '1,354',
    unit: '次',
    change: '0%',
    icon: BotMessageSquare,
  },
  {
    key: 'active-users',
    label: '活跃用户数',
    value: '1,012',
    unit: '人',
    change: '17.5%',
    icon: UsersRound,
  },
  {
    key: 'interactions',
    label: '平均会话互动数',
    value: '12',
    unit: '次',
    change: '34.1%',
    icon: Hourglass,
  },
  {
    key: 'token-speed',
    label: 'Token输出速度',
    value: '14.7',
    unit: '次',
    change: '34.1%',
    icon: Calculator,
  },
  {
    key: 'cost',
    label: '费用消耗',
    value: '14.78',
    unit: '元',
    change: '34.1%',
    icon: BadgeDollarSign,
  },
]
const detailMetrics = [
  { key: 'sessions', title: '全部会话数' },
  { key: 'active-users', title: '活跃用户数' },
  { key: 'interactions', title: '平均会话互动数' },
  { key: 'cost', title: '费用消耗' },
]
</script>

<template>
  <main class="stats-analysis">
    <section class="stats-analysis__section">
      <h2>概览指标 <span>(过去7天)</span></h2>

      <div class="stats-overview">
        <article v-for="metric in overviewMetrics" :key="metric.key" class="stats-card">
          <div class="stats-card__title">
            <span class="stats-card__icon">
              <component :is="metric.icon" :size="16" />
            </span>
            <span>{{ metric.label }}</span>
            <CircleHelp :size="14" />
          </div>

          <div class="stats-card__value">
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.unit }}</span>
            <em>环比</em>
            <span class="stats-card__change">
              <CircleEqual :size="13" />
              {{ metric.change }}
            </span>
          </div>
        </article>
      </div>
    </section>

    <section class="stats-analysis__section">
      <h2>详细指标</h2>

      <div class="stats-detail">
        <article v-for="metric in detailMetrics" :key="metric.key" class="stats-chart">
          <header>
            <h3>
              {{ metric.title }}
              <CircleHelp :size="14" />
            </h3>
            <span>{{ chartRange }}</span>
          </header>

          <div class="stats-chart__placeholder">
            <span>折线图图表</span>
            <span>{{ chartDescription }}</span>
          </div>
        </article>
      </div>
    </section>
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
  background: var(--color-white);
}

.stats-analysis__section + .stats-analysis__section {
  margin-top: 2.4rem;
}

.stats-analysis__section h2 {
  margin: 0 0 2rem;
  color: var(--color-text-strong);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 2.2rem;
}

.stats-analysis__section h2 span {
  color: var(--color-text);
  font-weight: 400;
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1.6rem;
}

.stats-card,
.stats-chart {
  background: var(--color-white);
  border: 0.1rem solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.stats-card {
  min-width: 0;
  min-height: 12.4rem;
  padding: 2.2rem 2.4rem;
}

.stats-card__title {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-2);
  color: var(--color-text);
  font-size: 1.4rem;
  line-height: 2rem;
}

.stats-card__title > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-card__title > :last-child {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.stats-card__icon {
  display: grid;
  width: 3.2rem;
  height: 3.2rem;
  flex: 0 0 auto;
  place-items: center;
  color: var(--color-text);
  background: var(--color-primary-tint);
  border-radius: 50%;
}

.stats-card__value {
  display: flex;
  align-items: baseline;
  min-width: 0;
  margin-top: 2.2rem;
  gap: var(--space-2);
  color: var(--color-text);
  line-height: 1;
}

.stats-card__value strong {
  color: var(--color-text);
  font-size: 2.6rem;
  font-weight: 600;
  letter-spacing: 0;
}

.stats-card__value span,
.stats-card__value em {
  font-size: 1.4rem;
  font-style: normal;
  line-height: 1.6rem;
}

.stats-card__value em {
  margin-left: var(--space-2);
  color: var(--color-text-muted);
}

.stats-card__change {
  display: inline-flex;
  align-items: center;
  color: var(--color-primary);
  gap: 0.3rem;
}

.stats-detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.6rem;
}

.stats-chart {
  min-width: 0;
  padding: 2.4rem;
}

.stats-chart header {
  display: grid;
  gap: 0.6rem;
  margin-bottom: 1.6rem;
}

.stats-chart h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-strong);
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 2rem;
}

.stats-chart h3 :last-child {
  color: var(--color-text-muted);
}

.stats-chart header > span {
  color: var(--color-text-muted);
  font-size: 1.4rem;
  line-height: 1.8rem;
}

.stats-chart__placeholder {
  display: grid;
  height: 20.8rem;
  place-content: center;
  color: var(--color-text-strong);
  font-size: 1.4rem;
  line-height: 2.2rem;
  text-align: center;
  background: var(--color-bg-soft);
}

@media (max-width: 1180px) {
  .stats-overview {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .stats-overview,
  .stats-detail {
    grid-template-columns: 1fr;
  }
}
</style>
