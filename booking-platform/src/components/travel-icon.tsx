type IconName = "phone" | "plane" | "airplane" | "hotel" | "bed" | "bus" | "holiday" | "passport" | "arrow" | "arrow-up-right" | "shield" | "bag" | "user" | "search" | "pin" | "check" | "swap" | "clock" | "receipt" | "chevron" | "refresh" | "globe" | "menu" | "close" | "departure" | "arrival" | "bell";

export function TravelIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    phone: "M6 3h3l1.5 5-2.2 1.8a16 16 0 0 0 5.9 5.9L16 13.5l5 1.5v3c0 1.6-1.3 3-3 3C10 20 4 14 3 6c0-1.7 1.3-3 3-3Z",
    airplane: "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z",
    plane: "m22 2-7 20-4-9-9-4L22 2ZM11 13l6-6",
    bed: "M3 18v3m18-3v3M3 18h18V9H3v9Zm0-9V5h18v4M7 9V7h3v2m4 0V7h3v2",
    bus: "M5 17v3m14-3v3M5 3h14l1 3v11H4V6l1-3Zm-1 8h16M8 14h.01M16 14h.01M8 6h8",
    holiday: "M3 10c2-7 16-7 18 0H3Zm9 0v10m-5 0h10M4 22h16M7 10l-2 4m12-4 2 4",
    passport: "M5 3h14v18H5V3Zm4 14h6M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-3-3v6M9 10h6",
    hotel: "M3 21V3h12v18M15 9h6v12M7 7h4M7 11h4M7 15h4M7 21v-3h4v3M19 13v2M19 17v2",
    arrow: "M5 12h14m-6-6 6 6-6 6",
    "arrow-up-right": "M7 17 17 7M7 7h10v10",
    shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6",
    bag: "M4 7h16v14H4V7Zm4 0V3h8v4M8 11v5m8-5v5",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
    search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 4 7 7",
    pin: "M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 1 1 14 0ZM12 8v2",
    check: "m5 12 4 4L19 6",
    swap: "M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4",
    clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
    receipt: "M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm4 4h6M9 11h6M9 15h3",
    chevron: "m9 5 7 7-7 7",
    refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M18 18A8 8 0 0 1 5 16",
    globe: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c5 6 5 14 0 20-5-6-5-14 0-20Z",
    menu: "M3 8h18M3 16h13",
    close: "m5 5 14 14m0-14L5 19",
    bell: "M18 8a6 6 0 0 0-12 0v5c0 2-1 3-2 4h16c-1-1-2-2-2-4V8Zm-8 12a2 2 0 0 0 4 0",
    departure: "M2 20h20m-5-8-4 3-7 2-3-3 2-1 2 1 3-1-3-5 2-1 5 4 4-2c2-1 4 1 2 3l-3 2",
    arrival: "M2 20h20M20 16l-7-3-4-8-2 1 2 6-3-1-2-3-2 1 2 5 13 4c4 1 5-1 3-2Z",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
