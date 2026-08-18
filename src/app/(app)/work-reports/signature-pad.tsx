'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

const CANVAS_W = 600;
const CANVAS_H = 200;

/**
 * Unterschriftfeld. Zeichnet auf ein Canvas und legt das Ergebnis als
 * PNG-Data-URL in ein verstecktes Formularfeld (`name`) — so reist die
 * Unterschrift ohne Extra-Upload mit dem normalen Form-Submit.
 */
export function SignaturePad({
  name,
  initialDataUrl,
  label = 'Unterschrift',
}: {
  name: string;
  initialDataUrl?: string | null;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState<boolean>(Boolean(initialDataUrl));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';

    // Vorhandene Unterschrift (Bearbeiten) einzeichnen.
    if (initialDataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
      img.src = initialDataUrl;
      if (hiddenRef.current) hiddenRef.current.value = initialDataUrl;
    }
  }, [initialDataUrl]);

  function pointFromEvent(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  }

  function start(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointFromEvent(e);
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !last.current) return;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && hiddenRef.current) {
      hiddenRef.current.value = canvas.toDataURL('image/png');
      setHasInk(true);
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (hiddenRef.current) hiddenRef.current.value = '';
    setHasInk(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-foreground)]">{label}</span>
        {hasInk && (
          <button
            type="button"
            onClick={clear}
            className="text-xs font-medium text-[var(--color-muted-foreground)] underline hover:text-[var(--color-destructive)]"
          >
            Löschen
          </button>
        )}
      </div>
      <input type="hidden" name={name} ref={hiddenRef} />
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none rounded-md border border-dashed border-[var(--color-border)] bg-white"
        style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
      />
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Mit Maus oder Finger im Feld unterschreiben.
      </p>
    </div>
  );
}
