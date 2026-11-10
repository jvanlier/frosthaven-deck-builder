import { useEffect, useState } from "react";

const healthMessages = {
  loading: "Checking server…",
  healthy: "Server healthy",
  unavailable: "Server unavailable",
} as const;

export type HealthState = keyof typeof healthMessages;

export function HealthIndicator({ state }: { state: HealthState }) {
  return (
    <p
      className={`health health-${state}`}
      role="status"
      aria-live="polite"
      title={healthMessages[state]}
    >
      {healthMessages[state]}
    </p>
  );
}

export function useHealth(): HealthState {
  const [health, setHealth] = useState<HealthState>("loading");

  useEffect(() => {
    let mounted = true;
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Health check failed");
        }
        return response.json();
      })
      .then((body: unknown) => {
        if (mounted) {
          setHealth(isHealthyResponse(body) ? "healthy" : "unavailable");
        }
      })
      .catch(() => {
        if (mounted) {
          setHealth("unavailable");
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return health;
}

function isHealthyResponse(body: unknown): body is { status: "ok" } {
  return (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    body.status === "ok"
  );
}
