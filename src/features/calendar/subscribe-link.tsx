/**
 * The link that puts a fixture list in somebody's own calendar.
 *
 * Two links, not one, because "subscribe" and "download" are different
 * things and only one of them keeps working. A webcal: address is a standing
 * subscription — the phone re-reads it, so a game the league moves moves — and
 * the plain https one is a file, a snapshot of today that will be wrong the
 * first time anything changes.
 *
 * The subscription leads because it is the one worth having. The file stays
 * because a desktop Outlook will not take webcal:, and because somebody just
 * wants to look at it.
 */
export function SubscribeLink({ path, what }: { path: string; what: string }) {
  return (
    <p className="mt-3 text-xs text-muted">
      <a
        href={`webcal://kingjuansoccer.com${path}`}
        className="text-brand-text hover:underline"
      >
        Add {what} to your calendar
      </a>
      <span className="mx-1.5">·</span>
      <a href={path} className="hover:underline" download>
        download instead
      </a>
      <br />
      Subscribing keeps it current; the download is today&rsquo;s copy.
    </p>
  );
}
