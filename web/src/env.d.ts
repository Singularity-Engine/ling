interface Window {
  api?: {
    setIgnoreMouseEvents: (ignore: boolean) => void
    setMode: (mode: string) => void
    showContextMenu?: () => void
    onModeChanged: (callback: (mode: string) => void) => void
  }
}
