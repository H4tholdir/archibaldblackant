import type { ToastType, ToastMessage } from "../components/Toast";

type ToastListener = (toasts: ToastMessage[]) => void;

class ToastService {
  private toasts: ToastMessage[] = [];
  private listeners: ToastListener[] = [];
  private idCounter = 0;

  subscribe(listener: ToastListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  show(type: ToastType, message: string, duration?: number) {
    const id = `toast-${++this.idCounter}`;
    const toast: ToastMessage = { id, type, message, duration };
    this.toasts.push(toast);
    this.notify();
  }

  success(message: string, duration?: number) {
    this.show("success", message, duration);
  }

  error(message: string, duration?: number) {
    this.show("error", message, duration);
  }

  info(message: string, duration?: number) {
    this.show("info", message, duration);
  }

  warning(message: string, duration?: number) {
    this.show("warning", message, duration);
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

export const toastService = new ToastService();
