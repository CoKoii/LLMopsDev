/// <reference types="vite/client" />

declare namespace chrome {
  namespace runtime {
    const lastError: { message?: string } | undefined
    function sendMessage(message: unknown): void
    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void,
      ): void
    }
  }

  namespace tabs {
    interface Tab {
      id?: number
      url?: string
    }

    function query(queryInfo: { active: boolean; currentWindow: boolean }, callback: (tabs: Tab[]) => void): void
    function sendMessage(tabId: number, message: unknown, callback?: (response?: unknown) => void): void
  }

  namespace storage {
    interface StorageArea {
      get<T extends Record<string, unknown>>(keys: string[] | string | T, callback: (items: T) => void): void
      set(items: Record<string, unknown>, callback?: () => void): void
      remove(keys: string[] | string, callback?: () => void): void
    }

    const local: StorageArea
  }

  namespace scripting {
    function executeScript(
      injection: {
        target: { tabId: number }
        files: string[]
      },
      callback?: () => void,
    ): void
  }
}
