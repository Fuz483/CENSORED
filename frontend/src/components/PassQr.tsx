import { useEffect, useState } from "react";
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
        <img src={qr.url} alt={t("QR-пропуск")} width={512} height={512}
          className={`aspect-square h-auto max-w-full rounded-lg border border-line bg-white p-1 ${large ? "w-64 sm:w-72" : "w-40"}`} />
      ) : (
        <p role="status" className="text-[15px] text-ink-soft">
          {t(qr ? "Не удалось отобразить QR. Покажите код ниже." : "Создаём QR…")}
        </p>
      )}
      {(showCode || (qr && !qr.url)) && (
        <p className="max-w-full break-all font-mono text-[14px] leading-relaxed text-ink-mute">{code}</p>
      )}
    </div>
  );
}
