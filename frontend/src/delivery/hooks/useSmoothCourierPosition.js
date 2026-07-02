import { useEffect, useRef, useState } from "react";

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

export default function useSmoothCourierPosition(targetPosition, enabled = true) {
  const [position, setPosition] = useState(targetPosition);
  const frameRef = useRef(null);
  const currentRef = useRef(targetPosition);

  useEffect(() => {
    if (!enabled || !targetPosition?.lat || !targetPosition?.lng) {
      setPosition(targetPosition);
      currentRef.current = targetPosition;
      return undefined;
    }

    const start = currentRef.current || targetPosition;
    const startTime = performance.now();
    const duration = 900;

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = {
        lat: lerp(start.lat, targetPosition.lat, eased),
        lng: lerp(start.lng, targetPosition.lng, eased),
      };
      currentRef.current = next;
      setPosition(next);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetPosition?.lat, targetPosition?.lng, enabled]);

  return position;
}
