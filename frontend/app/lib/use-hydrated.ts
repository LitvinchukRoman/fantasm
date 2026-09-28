import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false під час SSR/пререндеру і першої гідрації, true після неї.
 * На клієнтських переходах одразу true, тож без зайвого перемальовування.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
