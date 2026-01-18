// Global toast service - singleton pattern for app-wide notifications
// Position: ~64px from top, centered horizontally
// Only 1 toast at a time, no transitions, minimal language

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
  id: number;
}

type ToastListener = (toast: ToastState | null) => void;

class ToastService {
  private static instance: ToastService;
  private listeners: Set<ToastListener> = new Set();
  private currentToast: ToastState | null = null;
  private timeoutId: number | null = null;
  private toastId = 0;

  private constructor() {}

  static getInstance(): ToastService {
    if (!ToastService.instance) {
      ToastService.instance = new ToastService();
    }
    return ToastService.instance;
  }

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    // Immediately notify of current state
    listener(this.currentToast);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener(this.currentToast));
  }

  private show(message: string, type: ToastType, duration = 2000) {
    // Clear existing timeout
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
    }

    // Set new toast (replaces any existing)
    this.toastId++;
    this.currentToast = { message, type, id: this.toastId };
    this.notify();

    // Auto-dismiss
    this.timeoutId = window.setTimeout(() => {
      this.currentToast = null;
      this.timeoutId = null;
      this.notify();
    }, duration);
  }

  // Positive feedback (green) - success, enabled, saved, etc.
  success(message: string, duration?: number) {
    this.show(message, 'success', duration);
  }

  // Negative feedback (red) - errors, disabled, failed, etc.
  error(message: string, duration?: number) {
    this.show(message, 'error', duration);
  }

  // Neutral feedback (accent color) - info, status updates
  info(message: string, duration?: number) {
    this.show(message, 'info', duration);
  }

  dismiss() {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.currentToast = null;
    this.notify();
  }
}

export const toastService = ToastService.getInstance();
