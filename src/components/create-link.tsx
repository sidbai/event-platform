import Link from "next/link";

/**
 * The one way to offer "make a new one of these".
 *
 * Every list page had grown its own: a solid brand button on Reviews, News and
 * Teams, an outlined pill on Events and Community, a plain underlined link on
 * a club's coach section. Same action, five weights of emphasis, so the button
 * told you nothing about what kind of thing you were about to create.
 *
 * The pill won because these pages already have a primary action — reading the
 * list — and a filled button beside the title competes with it. The plus does
 * the explaining, which is also why the label stays a verb phrase: "+ Add a
 * club", not "+ Club".
 *
 * Sits next to the heading rather than opposite it, so it reads as part of the
 * title rather than as a toolbar that happens to float on the right.
 */
export function CreateLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  /** Only for spacing at the call site; the button's own look is fixed. */
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1 text-sm font-medium text-brand-text hover:bg-elevated ${className}`}
    >
      <span aria-hidden className="text-base leading-none">
        +
      </span>
      {children}
    </Link>
  );
}
