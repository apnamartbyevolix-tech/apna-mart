export {};
declare global {
  interface Window {
    MartStartup?: { ready: Promise<void>; phase(state: string, message: string): void; complete(): void };
  }
}
