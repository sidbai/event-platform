import { initBotId } from "botid/client/core";

/**
 * The client half of BotID.
 *
 * Only these paths are classified, and only these may call checkBotId on the
 * server — the client is what attaches the headers the check reads, so a
 * server check on an unlisted path fails rather than passing.
 *
 * Both are the review forms, posted to as server actions. Nothing else here
 * takes writes from people without accounts, and protecting pages that do not
 * need it would run the classifier over ordinary reading.
 */
initBotId({
  protect: [
    { path: "/clubs/*/review", method: "POST" },
    { path: "/coaches/*/review", method: "POST" },
  ],
});
