import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function PassQr({
  code,
  label = "QR-пропуск",
  large = false,
  showCode = true,
}: {
  code: string;
  label?: string;
  large?: boolean;
  showCode?: boolean;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const size = large ? 512 : 240;

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(code, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: size,
      color: { dark: "#102a3f", light: "#ffffff" },
    }).then((url) => {
      if (active) setDataUrl(url);
    }).catch(() => {
      if (active) setDataUrl(null);
    });
    return () => { active = false; };
  }, [code, size]);

  return (
    <div className={large ? "flex flex-col items-center" : "inline-flex items-center gap-3 border border-line bg-white p-2.5"}>
      {dataUrl ? (
        <img src={dataUrl} alt={label} className={large ? "size-64 max-w-full object-contain sm:size-80" : "size-24"} />
      ) : (
        <span className={`grid place-items-center bg-paper text-[11px] text-ink-mute ${large ? "size-64 max-w-full sm:size-80" : "size-24"}`}>
          Создаём QR…
        </span>
      )}
      {!large && showCode && (
        <div className="max-w-[17ch]">
          <p className="text-[12px] font-semibold">{label}</p>
          <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-ink-mute">{code}</p>
        </div>
      )}
    </div>
  );
}
