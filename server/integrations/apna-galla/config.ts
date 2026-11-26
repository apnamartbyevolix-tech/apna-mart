import { isReviewDemo } from "../../auth/review-demo-context";
import { validateLinkAuth } from "./link-auth";

export const sandboxEnabled = () =>
  !isReviewDemo() && (process.env.MTM_APNA_SANDBOX_ENABLED === "1" || process.env.MTM_APNA_CONNECTOR_MODE === "production");
export const productionConnector = () => process.env.MTM_APNA_CONNECTOR_MODE === "production";
export const protocolRevision = () => productionConnector() ? "1.2" : "1.2-sandbox";
export function assertSandbox() {
  validateLinkAuth();
  const u = new URL(process.env.DATABASE_URL || "");
  const peer = new URL(process.env.APNA_SANDBOX_URL || "");
  if (productionConnector()) {
    if (process.env.NODE_ENV !== "production" || process.env.MTM_APNA_SANDBOX_ENABLED === "1" ||
        !["postgres:","postgresql:"].includes(u.protocol) || ["localhost","127.0.0.1","[::1]"].includes(u.hostname) ||
        peer.href !== "https://api.apnagalla.in/" || process.env.MYTOWN_LINK_AUTH !== "ed25519-v1" || process.env.MYTOWN_LINK_SELF !== "mytown" ||
        (process.env.APNA_SANDBOX_KEY||"").length<32 || (process.env.APNA_SANDBOX_SECRET||"").length<32)
      throw Error("Explicit production Apna Galla connection with pinned server identities is required");
    return;
  }
  if (
    !sandboxEnabled() ||
    process.env.NODE_ENV === "production" ||
    !["127.0.0.1", "localhost", "::1"].includes(process.env.HOST || "") ||
    !["localhost", "127.0.0.1"].includes(u.hostname) ||
    !u.pathname.endsWith("_test") ||
    peer.protocol !== "https:" ||
    peer.hostname !== "localhost" ||
    peer.pathname !== "/" ||
    peer.search ||
    peer.hash ||
    peer.username ||
    peer.password ||
    (process.env.APNA_SANDBOX_KEY || "").length < 32 ||
    (process.env.APNA_SANDBOX_SECRET || "").length < 32
  )
    throw Error("Isolated localhost Apna sandbox required");
}
