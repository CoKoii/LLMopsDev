import type { ThemeConfig } from 'antdv-next'

function readCssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function createAntdTheme() {
  const lightBg = readCssVar('--light-bg')

  return {
    token: {
      colorPrimary: readCssVar('--primary-color'),
      colorBgLayout: lightBg,
    },
    components: {
      Layout: {
        siderBg: lightBg,
      },
    },
  } satisfies ThemeConfig
}
