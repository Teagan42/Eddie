import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AuthContextValue {
  apiKey: string | null;
  setApiKey: (key: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "eddie.apiKey";

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKeyState(stored);
    }
  }, []);

  const setApiKey = useCallback((key: string | null) => {
    setApiKeyState(key);
    if (key) {
      window.localStorage.setItem(STORAGE_KEY, key);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = useMemo(() => ({ apiKey, setApiKey }), [apiKey, setApiKey]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
