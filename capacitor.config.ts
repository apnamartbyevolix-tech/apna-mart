import type { CapacitorConfig } from "@capacitor/cli";

const preview = process.env.MTM_ANDROID_PREVIEW_URL;
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
  appName: "Apna Mart Preview",
  webDir: "dist/public",
  ...(preview ? { server: { url: preview, cleartext: true } } : {}),
};
export default config;
