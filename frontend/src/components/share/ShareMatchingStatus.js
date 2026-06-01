import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

const MATCHING_DURATION = 120; // seconds

export default function ShareMatchingStatus({
  isMatching,
  matchFound,
  onTimeout,
  otherPassenger,
}) {
  const [timeLeft, setTimeLeft] = useState(MATCHING_DURATION);
  const [showMatch, setShowMatch] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isMatching) {
      setTimeLeft(MATCHING_DURATION);
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          if (onTimeout) onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isMatching, onTimeout]);

  useEffect(() => {
    if (matchFound) {
      setShowMatch(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [matchFound]);

  const progress = useMemo(() => {
    return ((MATCHING_DURATION - timeLeft) / MATCHING_DURATION) * 100;
  }, [timeLeft]);

  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (!isMatching && !showMatch) return null;

  return (
    <div style={styles.overlay} role="dialog" aria-label="Matching status">
      <div style={styles.content}>
        {!showMatch ? (
          <>
            {/* Circular countdown */}
            <div style={styles.timerContainer}>
              <svg width="128" height="128" style={styles.timerSvg}>
                {/* Background circle */}
                <circle
                  cx="64"
                  cy="64"
                  r="54"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="6"
                />
                {/* Progress circle */}
                <circle
                  cx="64"
                  cy="64"
                  r="54"
                  fill="none"
                  stroke="#00A651"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                    transition: "stroke-dashoffset 1s linear",
                  }}
                />
              </svg>
              <div style={styles.timerText}>
                <span style={styles.timerSeconds}>{timeLeft}</span>
                <span style={styles.timerLabel}>sec</span>
              </div>
            </div>

            {/* Pulsing text */}
            <h2 style={styles.matchingTitle}>Finding riders...</h2>
            <p style={styles.matchingSubtitle}>
              Looking for passengers on a similar route
            </p>

            {/* Pulsing dots animation */}
            <div style={styles.dotsContainer}>
              <span style={{ ...styles.dot, animationDelay: "0ms" }} />
              <span style={{ ...styles.dot, animationDelay: "200ms" }} />
              <span style={{ ...styles.dot, animationDelay: "400ms" }} />
            </div>
          </>
        ) : (
          <>
            {/* Match found */}
            <div style={styles.matchIcon}>🎉</div>
            <h2 style={styles.matchTitle}>Matched!</h2>
            <p style={styles.matchSubtitle}>
              {otherPassenger
                ? `Matched with ${otherPassenger}!`
                : "Matched with another passenger!"}
            </p>
            <div style={styles.matchBadge}>
              <span style={styles.matchBadgeText}>Sharing your ride</span>
            </div>
          </>
        )}
      </div>

      <style>{pulseKeyframes}</style>
    </div>
  );
}

const pulseKeyframes = `
@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
`;

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(11,18,32,0.95)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    maxWidth: "320px",
  },
  timerContainer: {
    position: "relative",
    width: "128px",
    height: "128px",
    marginBottom: "32px",
  },
  timerSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  timerText: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  timerSeconds: {
    fontSize: "32px",
    fontWeight: 700,
    color: "#FFFFFF",
  },
  timerLabel: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
  },
  matchingTitle: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#FFFFFF",
    marginBottom: "8px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  matchingSubtitle: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.6)",
    marginBottom: "24px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  dotsContainer: {
    display: "flex",
    gap: "8px",
  },
  dot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    backgroundColor: "#00A651",
    animation: "pulse 1.2s ease-in-out infinite",
  },
  matchIcon: {
    fontSize: "64px",
    marginBottom: "20px",
    animation: "fadeIn 500ms ease",
  },
  matchTitle: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#00A651",
    marginBottom: "8px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  matchSubtitle: {
    fontSize: "15px",
    color: "#FFFFFF",
    marginBottom: "20px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  matchBadge: {
    backgroundColor: "rgba(212,175,55,0.15)",
    border: "1px solid #D4AF37",
    borderRadius: "20px",
    padding: "8px 20px",
  },
  matchBadgeText: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#D4AF37",
  },
};
