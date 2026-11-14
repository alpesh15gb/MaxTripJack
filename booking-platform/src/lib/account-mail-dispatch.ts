/** Initiation is not delivery. The scheduler must retain work through response completion.
 * Only account email is deferred: password/token mutations must still be awaited.
 */
export type AccountMailKind = "reset" | "verification" | "signin-code";
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
        const subject = kind === "reset" ? "Reset your Max Travel password" : kind === "signin-code" ? "Your MaxTravel sign-in code" : "Verify your Max Travel email";
        const content = kind === "signin-code" ? `Your verification code: ${url}\n\nThis code expires in 5 minutes and can be used once. Enter it on the MaxTravel page where you requested it. Never share this code.` : url;
        await dependencies.send(to, subject, content);
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
