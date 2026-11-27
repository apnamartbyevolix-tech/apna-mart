export function loginReturnPath(search: string): string {
  const value = new URLSearchParams(search).get("returnTo") || "";
  if (
    !/^\/(?:checkout|cart|orders(?:\/\d+)?|account|favorites|support)(?:\?[^#]*)?$/.test(
      value
    ) ||
    /[\\\r\n]/.test(value)
  )
    return "/account";
  return value;
}
