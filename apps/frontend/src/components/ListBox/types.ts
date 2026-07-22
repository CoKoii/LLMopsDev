export interface ListBoxItem {
  id: string | number
  title: string
  description: string
  content: string
  image?: string
  authorImage?: string
  footer?: string
  raw?: unknown
}

export interface ListBoxAction {
  key: string
  label: string
  danger?: boolean
  disabled?: boolean
}

export type ListBoxActions = false | ListBoxAction[] | ((item: ListBoxItem) => ListBoxAction[])
