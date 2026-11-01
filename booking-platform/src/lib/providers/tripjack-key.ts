/** Read server configuration only; never return a key in an API response or log. */
export function tripjackApiKey(product: "FLIGHT" | "HOTEL", env: Readonly<Record<string, string | undefined>> = process.env) {
  return env[product === "FLIGHT" ? "TRIPJACK_FLIGHT_API_KEY" : "TRIPJACK_HOTEL_API_KEY"]?.trim() || undefined;
}
