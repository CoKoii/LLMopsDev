import type { ListPageProps, ListPageTab } from '@/components/ListPage/types'
import { User } from '@lucide/vue'

export const personalSpaceTabs: ListPageTab[] = [
  { key: 'apps', title: 'AI应用', to: { name: 'personal-space-apps' } },
  { key: 'plugins', title: '插件', to: { name: 'personal-space-plugins' } },
  { key: 'knowledge', title: '知识库', to: { name: 'personal-space-knowledge' } },
]

export const personalSpaceListPage: ListPageProps = {
  title: '个人空间',
  icon: User,
  tabs: personalSpaceTabs,
}
