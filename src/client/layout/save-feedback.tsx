import { useAppData } from "../app-data";

export function SaveFeedback() {
  const appData = useAppData();
  if (appData.status === "saving") {
    return (
      <div className="save-feedback saving" role="status" aria-live="polite">
        Saving…
      </div>
    );
  }
  if (appData.status === "conflict") {
    return (
      <section
        className="save-feedback conflict"
        role="alert"
        aria-labelledby="conflict-heading"
      >
        <strong id="conflict-heading">
          Changed on another device — reload
        </strong>
        <p>Download your pending data before choosing whether to discard it.</p>
        <div className="feedback-actions">
          <button type="button" onClick={appData.downloadPendingData}>
            Download pending JSON
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Discard pending changes and reload?")) {
                void appData
                  .reload({ discardPending: true })
                  .catch(() => undefined);
              }
            }}
          >
            Reload
          </button>
        </div>
      </section>
    );
  }
  if (appData.status === "error") {
    return (
      <section
        className="save-feedback error"
        role="alert"
        aria-labelledby="save-error-heading"
      >
        <strong id="save-error-heading">
          Error saving — editing is paused
        </strong>
        <button
          type="button"
          onClick={() => void appData.retry().catch(() => undefined)}
        >
          Retry
        </button>
      </section>
    );
  }
  return null;
}
