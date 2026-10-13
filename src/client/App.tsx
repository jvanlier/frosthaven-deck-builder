import { useEffect, useState } from "react";

const healthMessages = {
  loading: "Checking server…",
  healthy: "Server healthy",
  unavailable: "Server unavailable",
} as const;

type HealthState = keyof typeof healthMessages;

export default function App() {
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
        if (mounted && isHealthyResponse(body)) {
          setHealth("healthy");
        } else if (mounted) {
          setHealth("unavailable");
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

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Snowdancer · Frosthaven</p>
        <h1>Frosthaven Deck Builder</h1>
        <p className="intro">
          Plan your character&apos;s deck across every level.
        </p>
      </header>
      <section aria-labelledby="status-heading" className="status-card">
        <h2 id="status-heading">Ready for your next scenario?</h2>
        <p>
          Your local deck workspace is ready. More planning tools will appear
          here as you build your character.
        </p>
        <p aria-live="polite" className="health" role="status">
          {healthMessages[health]}
        </p>
      </section>
    </main>
  );
}

function isHealthyResponse(body: unknown): body is { status: "ok" } {
  return (
    typeof body === "object" &&
    body !== null &&
    "status" in body &&
    body.status === "ok"
  );
}
