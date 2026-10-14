declare module 'claude-code' {
  interface PluginState {
    oscura: { attivo: boolean; originali: Record<string, string>; contatore: number }
  }
}
