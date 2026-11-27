/** Bound API waits and preserve cancellation; mutations are never queued offline. */
export const boundedFetch: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController(), upstream = init.signal || (input instanceof Request ? input.signal : undefined);
  const cancel = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) cancel(); else upstream?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 15000);
  try { return await globalThis.fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); upstream?.removeEventListener("abort", cancel); }
};
