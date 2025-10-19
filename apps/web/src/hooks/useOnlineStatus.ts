import { useEffect, useState } from "react";

function readNavigatorOnline(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }

  return navigator.onLine;
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() => readNavigatorOnline());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateStatus = (): void => {
      setIsOnline(readNavigatorOnline());
    };

    updateStatus();

    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);

    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  return isOnline;
}
