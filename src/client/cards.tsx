import { useEffect, useId, useRef, useState } from "react";
import type { Card } from "../shared/character.js";

const CARD_BACK = "/cards/SD/fh-sd-back.jpeg";

export interface CardTileProps {
  card: Card;
  actionLabel?: string;
  stateLabel?: string;
  disabled?: boolean;
  onAction?: () => void;
}

export function CardTile({
  card,
  actionLabel = `Open ${card.name}`,
  stateLabel,
  disabled = false,
  onAction,
}: CardTileProps) {
  const [enlarged, setEnlarged] = useState(false);
  const enlargeButtonRef = useRef<HTMLButtonElement>(null);
  const level = formatCardLevel(card);
  const alt = `${card.name}, level ${level}`;
  const closeDialog = () => {
    setEnlarged(false);
    requestAnimationFrame(() => enlargeButtonRef.current?.focus());
  };

  return (
    <article
      className="card-tile"
      data-card-id={card.id}
      data-state={stateLabel}
    >
      <button
        className="card-action"
        type="button"
        onClick={onAction}
        disabled={disabled}
        aria-label={actionLabel}
        data-card-id={card.id}
      >
        <CardImage card={card} alt={alt} />
        <span className="card-name visually-hidden">{card.name}</span>
        <span className="visually-hidden">Level {level}</span>
        {stateLabel ? (
          <span className="card-state" role="status" title={stateLabel}>
            {stateLabel.startsWith("NEW") ? (
              <>
                NEW
                <span className="visually-hidden">{stateLabel.slice(3)}</span>
              </>
            ) : (
              stateLabel
            )}
          </span>
        ) : null}
      </button>
      <button
        ref={enlargeButtonRef}
        className="enlarge-button"
        type="button"
        onClick={() => setEnlarged(true)}
        aria-label={`Enlarge ${card.name}`}
        title={`Enlarge ${card.name}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
        </svg>
      </button>
      <CardDialog
        card={card}
        open={enlarged}
        actionLabel={actionLabel}
        onAction={() => {
          closeDialog();
          onAction?.();
        }}
        onClose={closeDialog}
        disabled={disabled}
      />
    </article>
  );
}

export function CardGrid({
  cards,
  actionLabel,
  stateLabel,
  disabled,
  onAction,
}: {
  cards: Card[];
  actionLabel?: (card: Card) => string;
  stateLabel?: (card: Card) => string | undefined;
  disabled?: boolean | ((card: Card) => boolean);
  onAction?: (card: Card) => void;
}) {
  return (
    <div className="card-grid" role="list">
      {cards.map((card) => (
        <div role="listitem" key={card.id}>
          <CardTile
            card={card}
            actionLabel={actionLabel?.(card)}
            stateLabel={stateLabel?.(card)}
            disabled={
              typeof disabled === "function" ? disabled(card) : disabled
            }
            onAction={() => onAction?.(card)}
          />
        </div>
      ))}
    </div>
  );
}

export function CardDialog({
  card,
  open,
  actionLabel,
  onAction,
  onClose,
  disabled = false,
}: {
  card: Card;
  open: boolean;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="card-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="dialog-content">
        <div className="dialog-header">
          <h2 id={titleId}>{card.name}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <CardImage
          className="enlarged-card"
          card={card}
          alt={`${card.name}, level ${formatCardLevel(card)}`}
        />
        <button
          className="dialog-action"
          type="button"
          onClick={onAction}
          disabled={disabled}
        >
          {actionLabel}
        </button>
      </div>
    </dialog>
  );
}

export function CardImage({
  card,
  alt,
  className,
}: {
  card: Card;
  alt: string;
  className?: string;
}) {
  const [useFallback, setUseFallback] = useState(false);
  const source = useFallback ? CARD_BACK : `/cards/${card.image}`;

  return (
    <img
      className={className}
      src={source}
      alt={alt}
      loading="lazy"
      onError={() => setUseFallback(true)}
    />
  );
}

export function formatCardLevel(card: Card): string {
  return String(card.level);
}
