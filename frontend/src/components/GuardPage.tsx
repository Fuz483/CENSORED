import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CameraOff, Check, CircleAlert, ShieldCheck } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";

type ScanState = "idle" | "starting" | "scanning" | "unsupported" | "denied" | "error" | "detected";

const STATE_COPY: Record<ScanState, { title: string; body: string }> = {
  idle: { title: "Камера выключена", body: "Нажмите кнопку, чтобы начать сканирование QR-кода." },
  starting: { title: "Подключаем камеру", body: "Разрешите доступ к камере в запросе браузера." },
  scanning: { title: "Наведите камеру на QR-код", body: "Держите код в рамке. Сканирование не подтверждает проход." },
  unsupported: { title: "Сканирование недоступно", body: "Этот браузер не поддерживает чтение QR-кодов. Попробуйте актуальную версию Chrome." },
  denied: { title: "Нет доступа к камере", body: "Разрешите камеру в настройках браузера и откройте страницу по HTTPS." },
  error: { title: "Не удалось включить камеру", body: "Проверьте подключение камеры и разрешение браузера, затем попробуйте снова." },
  detected: { title: "QR-код считан, но не проверен", body: "Подключения к серверу проверки пока нет. Не разрешайте проход на основании этого экрана." },
};

export function GuardPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanning, setScanning] = useState(false);

  const stopCamera = useCallback(() => setScanning(false), []);

  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setScanState("denied");
        setScanning(false);
        return;
      }

      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const video = videoRef.current;
        if (!video) throw new Error("Camera preview is unavailable");
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 });
        controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video,
          (result) => {
            if (!result || cancelled) return;
            setScanState("detected");
            setScanning(false);
          },
        );
        if (cancelled) controls.stop();
        else {
          stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
          setScanState("scanning");
        }
      } catch (error) {
        if (cancelled) return;
        const name = error instanceof DOMException ? error.name : "";
        setScanState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
        setScanning(false);
      }
    };

    setScanState("starting");
    void start();
    return () => {
      cancelled = true;
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scanning]);

  const copy = STATE_COPY[scanState];
  const hasIssue = scanState === "unsupported" || scanState === "denied" || scanState === "error";

  return (
    <main className="guard-page min-h-dvh bg-navy text-paper">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between border-b border-paper/15 pb-4">
          <a href="/" className="inline-flex min-h-11 items-center gap-2 text-[13px] text-paper/75 transition-colors hover:text-paper">
            <ArrowLeft className="size-4" /> На сайт
          </a>
          <span className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.13em] text-paper/65 uppercase">
            <ShieldCheck className="size-4 text-sky" /> Вход · охрана
          </span>
        </header>

        <section className="flex flex-1 flex-col pt-8 sm:pt-12">
          <p className="font-mono text-[10px] tracking-[0.14em] text-sky uppercase">Проверка бронирования</p>
          <h1 className="mt-3 max-w-[12ch] text-[clamp(2.5rem,12vw,4.5rem)] leading-[0.91] tracking-[-0.055em]">
            Сканер<br /><span className="text-sky italic">на входе.</span>
          </h1>
          <p className="mt-4 max-w-[40ch] text-[14px] leading-relaxed text-paper/65">
            Отдельный экран для телефона охранника. Камера считывает QR, но действительность брони пока не проверяется.
          </p>

          <div className="mt-8 overflow-hidden border border-paper/15 bg-[#091d2d]">
            <div className="relative aspect-[4/3] min-h-[250px] max-h-[420px] bg-[#071724]">
              <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full object-cover ${scanning ? "" : "hidden"}`}
                autoPlay
                muted
                playsInline
                aria-label="Изображение с камеры для сканирования QR-кода"
              />
              {!scanning && (
                <div className="absolute inset-0 grid place-items-center">
                  <div className="grid size-28 place-items-center border border-paper/15 text-sky/80">
                    {scanState === "detected" ? <Check className="size-9" strokeWidth={1.3} /> : hasIssue ? <CameraOff className="size-9" strokeWidth={1.2} /> : <Camera className="size-9" strokeWidth={1.2} />}
                  </div>
                </div>
              )}
              {scanning && <div className="guard-scan-frame" aria-hidden="true"><span /><span /><span /><span /></div>}
              <span className="absolute bottom-3 left-3 bg-navy/80 px-2 py-1 font-mono text-[9px] tracking-[0.1em] text-paper/65 uppercase">
                {scanning ? "камера активна" : "камера остановлена"}
              </span>
            </div>

            <div className="border-t border-paper/15 p-4 sm:p-5" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center border ${scanState === "detected" ? "border-orange/60 text-orange-soft" : hasIssue ? "border-orange/60 text-orange-soft" : "border-sky/30 text-sky"}`}>
                  {hasIssue || scanState === "detected" ? <CircleAlert className="size-4" /> : <ShieldCheck className="size-4" />}
                </span>
                <div>
                  <h2 className="text-[16px] font-medium">{copy.title}</h2>
                  <p className="mt-1 text-[12px] leading-relaxed text-paper/60">{copy.body}</p>
                </div>
              </div>
              {scanState === "detected" && (
                <p className="mt-4 border-l-2 border-orange bg-orange/10 px-3 py-2.5 text-[12px] leading-relaxed text-orange-soft">
                  Данные брони, имя посетителя и кабинет появятся после подключения серверной проверки QR.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (scanning) stopCamera();
              else { setScanState("idle"); setScanning(true); }
            }}
            disabled={scanState === "starting"}
            className="btn mt-4 min-h-12 w-full bg-sky text-navy hover:bg-[#a8d5f1] disabled:opacity-50"
          >
            {scanning ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
            {scanning ? "Остановить камеру" : scanState === "detected" ? "Сканировать следующий код" : "Включить сканер"}
          </button>
          <p className="mt-4 text-center font-mono text-[10px] leading-relaxed tracking-[0.05em] text-paper/40">
            ДО ПОЯВЛЕНИЯ СЕРВЕРНОЙ ПРОВЕРКИ QR НЕ ЯВЛЯЕТСЯ ПРОПУСКОМ
          </p>
        </section>
        <footer className="mt-8 border-t border-paper/10 pt-4 font-mono text-[9px] tracking-[0.12em] text-paper/35 uppercase">
          Пляцоўка · Служебный интерфейс
        </footer>
      </div>
    </main>
  );
}
