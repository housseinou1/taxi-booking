import React, { useEffect } from "react";

function NotificationBox({
  message,
  type = "info",
}) {

  useEffect(() => {

    if (message) {

      const audio = new Audio(
        "/sounds/notification.mp3"
      );

      audio.play().catch((error) => {

        console.log(
          "Audio blocked:",
          error
        );

      });
    }

  }, [message]);

  if (!message) return null;

  const getBackground = () => {

    if (type === "success") {
      return "#dcfce7";
    }

    if (type === "error") {
      return "#fee2e2";
    }

    if (type === "warning") {
      return "#fef9c3";
    }

    return "#dbeafe";
  };

  const getColor = () => {

    if (type === "success") {
      return "green";
    }

    if (type === "error") {
      return "red";
    }

    if (type === "warning") {
      return "#854d0e";
    }

    return "#1d4ed8";
  };

  return (
    <div
      style={{
        background: getBackground(),
        color: getColor(),
        padding: "15px",
        borderRadius: "12px",
        marginBottom: "20px",
        fontWeight: "bold",
      }}
    >
      🔔 {message}
    </div>
  );
}

export default NotificationBox;