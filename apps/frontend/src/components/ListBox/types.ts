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
