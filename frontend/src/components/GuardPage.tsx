import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CameraOff, Check, CircleAlert, ShieldCheck, X } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { durationLabel, intervalHours } from "../lib/format";
import type { GuardScanResult } from "../lib/types";
import { useApp } from "../state/AppState";

type ScanState = "idle" | "starting" | "scanning" | "checking" | "verified" | "rejected" | "unsupported" | "denied" | "error";

const STATE_COPY: Record<ScanState, { title: string; body: string }> = {
  idle: { title: "Камера выключена", body: "Нажмите кнопку, чтобы начать сканирование QR-кода." },
  starting: { title: "Подключаем камеру", body: "Разрешите доступ к камере в запросе браузера." },
  scanning: { title: "Наведите камеру на QR-код", body: "Держите код в рамке — сервер проверит статус и дату бронирования." },
  checking: { title: "Проверяем пропуск", body: "Отправляем код на сервер. Дождитесь результата перед решением о проходе." },
  verified: { title: "Допуск разрешён", body: "Сервер подтвердил бронь на сегодня." },
  rejected: { title: "Допуск запрещён", body: "Сервер не подтвердил право на проход." },
  unsupported: { title: "Сканирование недоступно", body: "Этот браузер не поддерживает чтение QR-кодов. Попробуйте актуальную версию Chrome." },
  denied: { title: "Нет доступа к камере", body: "Разрешите камеру в настройках браузера и откройте страницу по HTTPS." },
  error: { title: "Не удалось включить камеру", body: "Проверьте подключение камеры и разрешение браузера, затем попробуйте снова." },
};

export function GuardPage() {
  const { scanQr } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<GuardScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;
    let processing = false;
    const video = videoRef.current;
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
        if (cancelled) return;
        if (!video) throw new Error("Camera preview is unavailable");
        const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        controls = await reader.decodeFromStream(
          stream,
          video,
          (result, _error, scanControls) => {
            if (!result || cancelled || processing) return;
            processing = true;
            scanControls.stop();
            setScanState("checking");
            setScanResult(null);
            setScanError(null);
            void scanQr(result.getText().trim()).then((response) => {
              if (cancelled) return;
              setScanResult(response);
              setScanState(response.accessGranted ? "verified" : "rejected");
              setScanning(false);
            }).catch((error: unknown) => {
              if (cancelled) return;
              setScanError(error instanceof Error ? error.message : "Не удалось проверить QR-код.");
              setScanState("rejected");
              setScanning(false);
            });
          },
        );
        if (cancelled) controls.stop();
        else if (!processing) setScanState("scanning");
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
      if (video) video.srcObject = null;
    };
  }, [scanQr, scanning]);

  const copy = STATE_COPY[scanState];
  const hasIssue = scanState === "unsupported" || scanState === "denied" || scanState === "error";
  const isAllowed = scanState === "verified";
  const hasDecision = scanState === "verified" || scanState === "rejected";
  const needsAttention = hasIssue || scanState === "rejected";
  const statusTone = needsAttention ? "border-red-300/35 bg-red-400/10 text-red-300"
    : isAllowed ? "border-ok/35 bg-ok/10 text-ok"
    : "border-orange/30 bg-orange/10 text-orange";

  return (
    <main className="guard-page min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center justify-between border-b border-line pb-4">
          <a href="/" className="inline-flex min-h-11 items-center gap-2 text-[15px] text-ink-soft transition-colors hover:text-orange">
            <ArrowLeft className="size-4" /> На сайт
          </a>
          <span className="inline-flex items-center gap-2 font-mono text-[13px] tracking-[0.13em] text-ink-mute uppercase">
            <ShieldCheck className="size-4 text-orange" /> Вход · охрана
          </span>
        </header>

        <section className="flex flex-1 flex-col pt-8 sm:pt-12">
          <p className="font-mono text-[13px] tracking-[0.14em] text-orange uppercase">Проверка бронирования</p>
          <h1 className="mt-3 max-w-[12ch] text-[clamp(2.5rem,12vw,4.5rem)] leading-[0.91] tracking-[-0.055em]">
            Сканер<br /><span className="text-orange italic">на входе.</span>
          </h1>
          <p className="mt-4 max-w-[40ch] text-[14px] leading-relaxed text-ink-soft">
            Отдельный экран для телефона охранника. Сервер проверяет QR-пропуск, дату и данные посетителя.
          </p>

          <div className="mt-8 overflow-hidden rounded-xl border border-line bg-surface">
            <div className="relative aspect-[4/3] min-h-[250px] max-h-[420px] bg-navy">
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
                  <div className={`grid size-28 place-items-center rounded-lg border ${statusTone}`}>
                    {isAllowed ? <Check className="size-9" strokeWidth={1.3} /> : scanState === "rejected" ? <X className="size-9" strokeWidth={1.3} /> : hasIssue ? <CameraOff className="size-9" strokeWidth={1.2} /> : <Camera className="size-9" strokeWidth={1.2} />}
                  </div>
                </div>
              )}
              {scanning && <div className="guard-scan-frame" aria-hidden="true"><span /><span /><span /><span /></div>}
              <span className="absolute bottom-3 left-3 rounded-md bg-navy/90 px-2 py-1 text-sm font-medium text-ink">
                {scanning ? "камера активна" : "камера остановлена"}
              </span>
            </div>

            <div className="border-t border-line p-4 sm:p-5" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border ${statusTone}`}>
                  {needsAttention ? <CircleAlert className="size-4" /> : isAllowed ? <Check className="size-4" /> : <ShieldCheck className="size-4" />}
                </span>
                <div>
                  <h2 className="text-[16px] font-medium">{copy.title}</h2>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{copy.body}</p>
                </div>
              </div>
              {scanError && <p role="alert" className="mt-4 rounded-lg border-l-2 border-red-300 bg-red-400/10 px-3 py-2.5 text-[14px] leading-relaxed text-red-300">{scanError}</p>}
              {scanResult && (
                <div className={`mt-4 rounded-lg border-l-2 px-3 py-3 text-[14px] leading-relaxed ${isAllowed ? "border-ok bg-ok/10 text-ok" : "border-red-300 bg-red-400/10 text-red-300"}`}>
                  <p className="font-semibold">{scanResult.reason}</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-soft">
                    {scanResult.customerName && <><dt>Посетитель</dt><dd className="truncate">{scanResult.customerName}</dd></>}
                    {scanResult.customerPhone && <><dt>Телефон</dt><dd>{scanResult.customerPhone}</dd></>}
                    <dt>Учреждение</dt><dd className="truncate">{scanResult.school}</dd>
                    <dt>Помещение</dt><dd>{scanResult.room}</dd>
                    <dt>Время</dt><dd>{scanResult.startTime}–{scanResult.endTime}</dd>
                    <dt>Бронь</dt><dd>{scanResult.date} · {durationLabel(intervalHours(scanResult.startTime, scanResult.endTime))}</dd>
                  </dl>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setScanResult(null);
              setScanError(null);
              setScanState("idle");
              setScanning(!scanning);
            }}
            disabled={scanState === "starting"}
            className="btn btn-primary mt-4 min-h-12 w-full disabled:opacity-50"
          >
            {scanning ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
            {scanning ? "Остановить камеру" : hasDecision ? "Сканировать следующий код" : "Включить сканер"}
          </button>
          <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
            ПРОХОД РАЗРЕШАЕТСЯ ТОЛЬКО ПРИ ПОЛОЖИТЕЛЬНОМ ОТВЕТЕ СЕРВЕРА
          </p>
        </section>
        <footer className="mt-8 border-t border-line pt-4 font-mono text-[13px] tracking-[0.08em] text-ink-mute uppercase">
          Пляцоўка · Служебный интерфейс
        </footer>
      </div>
    </main>
  );
}
