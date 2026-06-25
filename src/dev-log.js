const loggedKeys = new Set();

export function isDevelopmentMode() {
  const lifecycleEvent = process.env.npm_lifecycle_event ?? "";
  return (
    process.env.NODE_ENV === "development" ||
    lifecycleEvent === "dev" ||
    lifecycleEvent.startsWith("debug")
  );
}

export function devLog(message, details) {
  if (!isDevelopmentMode()) {
    return;
  }

  if (details === undefined) {
    console.log(`[dev] ${message}`);
    return;
  }

  console.log(`[dev] ${message}`, details);
}

export function devLogOnce(key, message, details) {
  if (!isDevelopmentMode() || loggedKeys.has(key)) {
    return;
  }

  loggedKeys.add(key);

  if (details === undefined) {
    console.log(`[dev] ${message}`);
    return;
  }

  console.log(`[dev] ${message}`, details);
}
