"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;

/** Controlled fields can retain browser edits once React has attached its handlers. */
export function useClientReady() {
  return useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
}
