import React, { useEffect, useRef, useState } from "react";

export default function SignaturePad({ onChange, height = 160, disabled = false }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }, [height]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (event) => {
    if (disabled) return;
    event.preventDefault();
    drawingRef.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const move = (event) => {
    if (disabled || !drawingRef.current) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const point = getPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setEmpty(false);
    onChange?.(canvasRef.current.toDataURL("image/png"));
  };

  const end = () => {
    drawingRef.current = false;
    if (!empty) onChange?.(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const width = canvas.offsetWidth;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    setEmpty(true);
    onChange?.("");
  };

  return (
    <div className={`yala-signpad${disabled ? " is-disabled" : ""}`}>
      <canvas
        ref={canvasRef}
        className="yala-signpad__canvas"
        aria-disabled={disabled}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button type="button" className="yala-signpad__clear" onClick={clear}>
        Clear signature
      </button>
    </div>
  );
}

export function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(data);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}
