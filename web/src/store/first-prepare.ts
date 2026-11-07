import { createContext, useContext } from 'react';

/**
 * The first attempt to prepare today's habits for one signed-in owner. History reads (the Status heatmap and the
 * monthly History) wait for it, because preparing the day creates today's rows, and a read that starts before it
 * shows today as "0 of 0". The promise only ever resolves: a failed or skipped preparation must never block reading.
 */
export interface FirstPrepare {
  owner: string | undefined;
  promise: Promise<void>;
  settle: () => void;
}

export function createFirstPrepare(owner: string | undefined): FirstPrepare {
  let settle: () => void = () => undefined;
  const promise = new Promise<void>(resolve => { settle = resolve; });
  // Nobody signed in means nothing will be prepared, so nothing may wait.
  if (!owner) settle();
  return { owner, promise, settle };
}

export const FirstPrepareContext = createContext<FirstPrepare | null>(null);

/** A function that resolves once the first preparation has settled; with no store around it, it resolves at once. */
export function useAfterFirstPrepare(): () => Promise<void> {
  const first = useContext(FirstPrepareContext);
  return () => (first ? first.promise : Promise.resolve());
}
