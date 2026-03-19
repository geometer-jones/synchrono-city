import { useEffect, useState, type PropsWithChildren } from "react";

type Toast = {
  id: number;
  message: string;
  type: "error" | "info";
};

type ToastListener = (toasts: Toast[]) => void;

let toastId = 0;
let toasts: Toast[] = [];
let listeners: ToastListener[] = [];

function notifyListeners() {
  listeners.forEach((listener) => listener([...toasts]));
}

export function showToast(message: string, type: "error" | "info" = "info") {
  const id = ++toastId;
  toasts = [...toasts, { id, message, type }];
  notifyListeners();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 4000);
}

export function ToastContainer() {
  const [currentToasts, setCurrentToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.push(setCurrentToasts);
    return () => {
      listeners = listeners.filter((l) => l !== setCurrentToasts);
    };
  }, []);

  if (currentToasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-container">
      {currentToasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: PropsWithChildren) {
  return (
    <>
      {children}
      <ToastContainer />
    </>
  );
}
