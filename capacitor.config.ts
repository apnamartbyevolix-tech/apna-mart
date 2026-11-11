import type { CapacitorConfig } from "@capacitor/cli";

const preview = process.env.MTM_ANDROID_PREVIEW_URL;
const liveTest = process.env.MTM_ANDROID_LIVE_TEST === "1";
if (liveTest && (preview || process.env.MTM_ANDROID_RELEASE === "1"))
  throw new Error("Live Android testing and localhost/release builds must be separate.");
if (
  preview &&
  (!["http://127.0.0.1:5205", "http://127.0.0.1:5206"].includes(preview) ||
    process.env.MTM_ANDROID_RELEASE === "1")
)
  throw new Error(
    "Only the isolated loopback Android debug preview is permitted."
  );

const config: CapacitorConfig = {
  appId: "in.mytownmarket.customer.preview",
  appName: liveTest ? "Apna Mart Test" : "Apna Mart Preview",
  webDir: "dist/public",
  android: { allowMixedContent: false },
  ...(liveTest ? { server: { url: "https://apna-mart.in", cleartext: false } } : {}),
  ...(preview ? { server: { url: preview, cleartext: true } } : {}),
};
export default config;
