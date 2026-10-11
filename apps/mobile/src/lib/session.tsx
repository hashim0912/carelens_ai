import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import { clearTokens, getAccessToken } from "./store";

type Status = "loading" | "authed" | "guest";

interface SessionValue {
  status: Status;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let active = true;
    getAccessToken().then((token) => {
      if (active) setStatus(token ? "authed" : "guest");
    });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      async signIn(email, password) {
        await api.login(email, password);
        setStatus("authed");
      },
      async signOut() {
        await clearTokens();
        setStatus("guest");
      },
    }),
    [status],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
