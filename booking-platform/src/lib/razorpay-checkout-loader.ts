export const RAZORPAY_CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";
export const RAZORPAY_CHECKOUT_LOAD_TIMEOUT = 15000;

type CheckoutResult = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
export type RazorpayMethod = 'upi' | 'card' | 'netbanking' | 'emi' | 'wallet';
type CheckoutOptions = {
  key: string; amount: number; currency: string; order_id: string; name: string;
  theme?: { color: string };
  prefill?: { method?: RazorpayMethod; email: string; contact: string };
  handler: (result: CheckoutResult) => void;
  modal: { ondismiss: () => void };
};
export type RazorpayCheckout = new (options: CheckoutOptions) => { open: () => void; on: (event: string, callback: () => void) => void };
declare global { interface Window { Razorpay?: RazorpayCheckout } }

export class RazorpayCheckoutLoadError extends Error {
  constructor(public reason: "failed" | "timeout" | "missing-api") {
    super(reason === "timeout" ? "Secure checkout took too long to load." : "Secure checkout could not load.");
    this.name = "RazorpayCheckoutLoadError";
  }
}

let pending: Promise<RazorpayCheckout> | null = null;

/** Only an explicit checkout action calls this loader. A failure never retries itself. */
export function loadRazorpayCheckout(): Promise<RazorpayCheckout> {
  if (typeof window.Razorpay === "function") return Promise.resolve(window.Razorpay);
  if (pending) return pending;
  const attempt = new Promise<RazorpayCheckout>((resolve, reject) => {
    // Adopt a pending script from another travel screen without relying on
    // next/script's src cache, which also retains failed script promises.
    const existing = Array.from(document.scripts).find(script => script.src === RAZORPAY_CHECKOUT_SCRIPT);
    const script = existing || document.createElement("script");
    let settled = false;
    const timer = setTimeout(() => finish("timeout"), RAZORPAY_CHECKOUT_LOAD_TIMEOUT);
    function cleanup() {
      clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    }
    function finish(failure?: "failed" | "timeout" | "missing-api") {
      if (settled) return;
      settled = true; cleanup();
      if (failure) {
        // A later explicit resume can create a fresh element. Removing this
        // node never starts a new order and late load events have no listener.
        script.remove();
        reject(new RazorpayCheckoutLoadError(failure));
      } else resolve(window.Razorpay!);
    }
    function onLoad() { finish(typeof window.Razorpay === "function" ? undefined : "missing-api"); }
    function onError() { finish("failed"); }
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = RAZORPAY_CHECKOUT_SCRIPT;
      script.async = true;
      script.dataset.maxtravelCheckout = "razorpay";
      const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
      if (nonce) script.nonce = nonce;
      try { document.head.appendChild(script); } catch { finish("failed"); }
    }
  });
  pending = attempt;
  void attempt.then(() => { if (pending === attempt) pending = null; }, () => { if (pending === attempt) pending = null; });
  return attempt;
}
