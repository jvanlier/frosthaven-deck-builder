import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createAppDataController,
  type AppDataController,
  type AppDataSnapshot,
} from "./controller";

const AppDataContext = createContext<AppDataController | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const controllerRef = useRef<AppDataController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createAppDataController();
  }
  const controller = controllerRef.current;

  useEffect(() => {
    void controller.load().catch(() => undefined);
  }, [controller]);

  return (
    <AppDataContext.Provider value={controller}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataController & AppDataSnapshot {
  const controller = useContext(AppDataContext);
  if (controller === null) {
    throw new Error("useAppData must be used inside AppDataProvider");
  }
  const current = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return { ...controller, ...current };
}

export function preventUnloadIfPending(
  event: BeforeUnloadEvent,
  hasPendingChanges: boolean,
): void {
  if (!hasPendingChanges) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
}
