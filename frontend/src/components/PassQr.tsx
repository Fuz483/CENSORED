import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import QRCode from "qrcode";
import { useLanguage } from "../lib/i18n";

export function PassQr({
  code,
  large = false,
  showCode = true,
}: {
  code: string;
  large?: boolean;
  showCode?: boolean;
}) {
  const { t } = useLanguage();
  const [result, setResult] = useState<{ code: string; url: string | null }>();
  const qr = result?.code === code ? result : undefined;

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(code, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 512,
      color: { dark: "#102a3f", light: "#ffffff" },
    }).then((url) => {
      if (active) setResult({ code, url });
    }).catch(() => {
      if (active) setResult({ code, url: null });
    });
    return () => { active = false; };
  }, [code]);

  return (
    <div className="flex min-w-0 flex-col items-center gap-3 text-center">
      {qr?.url ? (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-3 py-1.5 text-[13px] font-semibold text-ok">
          <Check className="size-4 shrink-0" aria-hidden="true" />
          {t("Пропуск готов")}
        </p>
      ) : (
        <p role="status" className="text-[13px] text-ink-soft">
          {t(qr ? "Не удалось отобразить QR. Покажите код ниже." : "Создаём QR…")}
        </p>
      )}
      {qr?.url && (
        <img src={qr.url} alt={t("QR-пропуск")} width={512} height={512}
          className={`aspect-square h-auto max-w-full rounded-md border border-line bg-white ${large ? "w-64 sm:w-72" : "w-40"}`} />
      )}
      {(showCode || (qr && !qr.url)) && (
        <p className="max-w-full break-all font-mono text-[11px] leading-relaxed text-ink-mute">{code}</p>
      )}
    </div>
  );
}
