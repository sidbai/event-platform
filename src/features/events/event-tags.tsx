import { eventTags, type EventTag } from "./tags";

const TONE: Record<EventTag["tone"], string> = {
  brand: "bg-brand-soft text-brand-soft-text",
  warn: "bg-amber-50 text-amber-800",
  muted: "bg-elevated text-muted",
};

export function EventTags({
  event,
  className = "",
}: {
  event: Parameters<typeof eventTags>[0];
  className?: string;
}) {
  const tags = eventTags(event);
  return (
    <ul className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {tags.map((t) => (
        <li
          key={t.label}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[t.tone]}`}
        >
          <span aria-hidden>{t.emoji}</span> {t.label}
        </li>
      ))}
    </ul>
  );
}
