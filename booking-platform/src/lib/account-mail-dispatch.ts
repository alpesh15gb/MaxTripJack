/** Initiation is not delivery. The scheduler must retain work through response completion.
 * Only account email is deferred: password/token mutations must still be awaited.
 */
export type AccountMailKind = "reset" | "verification";
export type AccountMailOutcome = "attempt-started" | "smtp-accepted" | "delivery-unconfirmed";
export function createAccountMailDispatcher(dependencies: {
  schedule: (work: () => Promise<void>) => void;
  send: (to: string, subject: string, url: string) => Promise<void>;
  report: (kind: AccountMailKind, outcome: AccountMailOutcome) => void;
}) {
  return (kind: AccountMailKind, to: string, url: string): void => {
    // Do not start SMTP before scheduling: even a synchronously failing transport
    // must not affect the response or its latency for a known account.
    dependencies.schedule(async () => {
      dependencies.report(kind, "attempt-started");
      try {
        await dependencies.send(to, kind === "reset" ? "Reset your Max Travel password" : "Verify your Max Travel email", url);
      } catch {
        // SMTP errors may include recipients, credentials or token-bearing content.
        // A timeout can also mean accepted mail with a missing acknowledgement.
        dependencies.report(kind, "delivery-unconfirmed");
        return;
      }
      dependencies.report(kind, "smtp-accepted");
    });
  };
}
