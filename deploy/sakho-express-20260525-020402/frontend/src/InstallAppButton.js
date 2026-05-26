import React, { useEffect, useMemo, useState } from "react";

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const isIos = useMemo(
    () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || ""),
    []
  );

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.navigator.standalone;

    setIsStandalone(Boolean(standalone));

    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  if (isStandalone) return null;

  const installApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      setInstallPrompt(null);
      return;
    }

    if (isIos) {
      setShowIosHelp((current) => !current);
    }
  };

  if (!installPrompt && !isIos) return null;

  return (
    <div style={installWrapStyle}>
      <button onClick={installApp} style={installButtonStyle}>
        Install app
      </button>

      {showIosHelp && (
        <div style={installHelpStyle}>
          On iPhone, tap Share, then Add to Home Screen.
        </div>
      )}
    </div>
  );
}

const installWrapStyle = {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  zIndex: 5000,
  display: "grid",
  gap: "8px",
  justifyItems: "end",
};

const installButtonStyle = {
  border: "none",
  borderRadius: "999px",
  background: "#111827",
  color: "white",
  padding: "13px 18px",
  fontWeight: 950,
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.25)",
  cursor: "pointer",
};

const installHelpStyle = {
  maxWidth: "240px",
  borderRadius: "8px",
  background: "white",
  color: "#111827",
  padding: "12px",
  border: "1px solid #e5e7eb",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.18)",
  fontWeight: 800,
};
