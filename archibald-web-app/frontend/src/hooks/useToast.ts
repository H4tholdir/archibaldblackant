import { useState, useEffect } from "react";
import { toastService } from "../services/toast.service";
import type { ToastMessage } from "../components/Toast";

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = toastService.subscribe(setToasts);
    return unsubscribe;
  }, []);

  return toasts;
}
