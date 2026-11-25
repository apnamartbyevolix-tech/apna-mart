import type { CapacitorConfig } from "@capacitor/cli";

const preview = process.env.MTM_ANDROID_PREVIEW_URL;
const liveTest = process.env.MTM_ANDROID_LIVE_TEST === "1";
const release = process.env.MTM_ANDROID_RELEASE === "1";
if (liveTest && (preview || release))
  throw new Error("Live Android testing and localhost/release builds must be separate.");
if (
  preview &&
  (!["http://127.0.0.1:5205", "http://127.0.0.1:5206"].includes(preview) ||
    release)
)
  throw new Error(
    "Only the isolated loopback Android debug preview is permitted."
  );

const config: CapacitorConfig = {
  appId: "in.apnamart.app",
  appName: release ? "Apna Mart" : liveTest ? "Apna Mart Test" : "Apna Mart Preview",
  webDir: "dist/public",
  android: { allowMixedContent: false },
  // The existing customer app and HttpOnly login cookies share this owned HTTPS
  // origin. Release mode cannot select an arbitrary host or localhost preview.
  ...(liveTest || release ? { server: { url: "https://apna-mart.in", cleartext: false } } : {}),
  ...(preview ? { server: { url: preview, cleartext: true } } : {}),
};
export default config;
