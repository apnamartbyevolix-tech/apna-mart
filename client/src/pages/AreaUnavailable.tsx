import { MapPin, Store } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function AreaUnavailable() {
  const { t } = useLanguage();
  const entered = new URLSearchParams(window.location.search).get("pincode") || "";
  const pincode = /^[0-9]{6}$/.test(entered) ? entered : "";
  return <section className="mart-unserved">
    <div className="mart-unserved-art" aria-hidden="true">
      <span className="mart-unserved-road" /><Store size={72} strokeWidth={1.5} /><MapPin size={36} />
    </div>
    <span className="mart-eyebrow">{t("Your neighbourhood, your market")}</span>
    <h1>{t("We don’t serve this area yet")}</h1>
    <p>{pincode && <strong>{pincode} · </strong>}{t("There are no active service areas for this pincode right now. Choose another area to explore its local shops.")}</p>
    <button className="mart-primary" onClick={() => window.dispatchEvent(new Event("mart-choose-area"))}>
      <MapPin size={18} />{t("Choose another area")}
    </button>
    <small>{t("Shop availability is checked when you place an order.")}</small>
  </section>;
}
