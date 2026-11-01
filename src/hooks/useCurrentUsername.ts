import { useEffect, useState } from "react";
import { useDidShow } from "@tarojs/taro";
import { getCachedUsername, resolveCurrentUsername } from "../utils/currentUser";

export function useCurrentUsername(active = true) {
  const [username, setUsername] = useState(getCachedUsername);
  const [loading, setLoading] = useState(!username);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useDidShow(() => setAttempt((value) => value + 1));

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    resolveCurrentUsername().then((value) => {
      if (!cancelled) setUsername(value);
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active, attempt]);

  return { username, loading, error, retry: () => setAttempt((value) => value + 1) };
}
