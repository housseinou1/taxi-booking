import React, { useCallback, useEffect, useRef, useState } from "react";

import { playChatMessageSound } from "../native/sound";
import { pickFromGallery, takePhoto } from "../native/camera";
import {
  joinDeliveryChat,
  leaveDeliveryChat,
  sendDeliveryChatTyping,
  subscribeDeliveryUpdates,
} from "./deliverySocket";
import { dataUrlToFile } from "./DeliveryShared";
import { sendDeliveryChatMessage } from "./deliveryChatApi";
import DeliveryChatReportMenu from "./components/DeliveryChatReportMenu";
import { API_URL } from "../apiConfig";
import { apiRequest } from "./DeliveryShared";
import { formatChatTime, isDeliveryChatAvailable, quickRepliesForRole } from "./deliveryChatUtils";
import "./delivery-chat.css";

const TYPING_DEBOUNCE_MS = 1200;

function ChatImageBubble({ msg, onExpand }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!msg.image_url) return null;

  return (
    <button
      type="button"
      className="dcc-bubble__image-btn"
      onClick={() => onExpand(msg.image_url)}
      aria-label="View shared photo"
    >
      {!loaded && !failed ? <span className="dcc-bubble__image-placeholder" aria-hidden /> : null}
      {failed ? <span className="dcc-bubble__image-failed">Could not load image</span> : null}
      <img
        src={msg.image_url}
        alt={msg.message || "Shared photo"}
        loading="lazy"
        className={loaded ? "is-loaded" : ""}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </button>
  );
}

export default function DeliveryChatSheet({
  deliveryId,
  deliveryStatus = "",
  role = "customer",
  contactName = "Contact",
  onClose,
  onUnreadChange,
}) {
  const [messages, setMessages] = useState([]);
  const [quickReplies, setQuickReplies] = useState(() => quickRepliesForRole(role));
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [chatAvailable, setChatAvailable] = useState(isDeliveryChatAvailable(deliveryStatus));
  const [typingUserId, setTypingUserId] = useState(null);
  const [expandedImage, setExpandedImage] = useState(null);
  const [pendingPreview, setPendingPreview] = useState(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [retryPayload, setRetryPayload] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const bottomRef = useRef(null);
  const typingTimerRef = useRef(null);
  const typingHideRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentUserId = useRef(null);

  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    currentUserId.current = user?.id || null;
  } catch (_) {
    currentUserId.current = null;
  }

  const markRead = useCallback(async () => {
    if (!deliveryId) return;
    try {
      await apiRequest(`${API_URL}/deliveries/${deliveryId}/messages/read/`, { method: "POST" });
      onUnreadChange?.(0);
    } catch (_) {
      // ignore
    }
  }, [deliveryId, onUnreadChange]);

  const appendIncomingMessage = useCallback(
    (incoming) => {
      const normalized = {
        ...incoming,
        is_mine: incoming.sender_id === currentUserId.current,
      };
      setMessages((prev) => {
        if (prev.some((item) => item.id === normalized.id)) return prev;
        return [...prev, normalized];
      });
      if (!normalized.is_mine) {
        playChatMessageSound();
        markRead();
      }
    },
    [markRead]
  );

  const load = useCallback(async () => {
    if (!deliveryId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(`${API_URL}/deliveries/${deliveryId}/messages/`);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setQuickReplies(
        Array.isArray(data?.quick_replies) && data.quick_replies.length
          ? data.quick_replies
          : quickRepliesForRole(role)
      );
      setChatAvailable(Boolean(data?.chat_available ?? isDeliveryChatAvailable(deliveryStatus)));
      onUnreadChange?.(Number(data?.unread_count || 0));
      await markRead();
      setMessages((prev) =>
        prev.map((msg) => (msg.is_mine ? msg : { ...msg, is_read: true }))
      );
    } catch (err) {
      setError(err.message || "Could not load chat.");
    } finally {
      setLoading(false);
    }
  }, [deliveryId, deliveryStatus, markRead, onUnreadChange, role]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setChatAvailable(isDeliveryChatAvailable(deliveryStatus));
  }, [deliveryStatus]);

  useEffect(() => {
    if (!deliveryId) return undefined;
    joinDeliveryChat(deliveryId);
    const unsub = subscribeDeliveryUpdates((event) => {
      if (!event || Number(event.delivery_id) !== Number(deliveryId)) return;

      if ((event.type === "message_sent" || event.type === "chat_image_sent") && event.message) {
        appendIncomingMessage(event.message);
        return;
      }

      if (event.type === "message_read") {
        setMessages((prev) => prev.map((msg) => (msg.is_mine ? { ...msg, is_read: true } : msg)));
        return;
      }

      if (event.type === "typing") {
        if (event.user_id === currentUserId.current) return;
        setTypingUserId(event.is_typing ? event.user_id : null);
        if (typingHideRef.current) window.clearTimeout(typingHideRef.current);
        if (event.is_typing) {
          typingHideRef.current = window.setTimeout(() => setTypingUserId(null), 3000);
        }
        return;
      }

      if (event.type === "chat_closed") {
        setChatAvailable(false);
        setError("Chat is closed for this delivery.");
      }
    });

    return () => {
      unsub();
      leaveDeliveryChat(deliveryId);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (typingHideRef.current) window.clearTimeout(typingHideRef.current);
    };
  }, [appendIncomingMessage, deliveryId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUserId, pendingPreview, uploadProgress]);

  const notifyTyping = useCallback(
    (isTyping) => {
      if (!deliveryId || !chatAvailable) return;
      sendDeliveryChatTyping(deliveryId, isTyping);
    },
    [chatAvailable, deliveryId]
  );

  const handleTextChange = (event) => {
    const value = event.target.value.slice(0, 500);
    setText(value);
    notifyTyping(true);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => notifyTyping(false), TYPING_DEBOUNCE_MS);
  };

  const setPreviewFromShot = async (shot) => {
    if (!shot?.dataUrl) return;
    const file = dataUrlToFile(shot.dataUrl, `chat-${Date.now()}.jpg`);
    if (file.size > 5 * 1024 * 1024) {
      setError("Image is too large (max 5 MB).");
      return;
    }
    setError("");
    setPendingPreview({ dataUrl: shot.dataUrl, file });
    setShowAttachMenu(false);
  };

  const handleTakePhoto = async () => {
    const shot = await takePhoto();
    await setPreviewFromShot(shot);
  };

  const handlePickGallery = async () => {
    const shot = await pickFromGallery();
    await setPreviewFromShot(shot);
  };

  const handleFileInput = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type)) {
      setError("Unsupported image type. Use JPG, PNG, or WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image is too large (max 5 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingPreview({ dataUrl: reader.result, file });
      setShowAttachMenu(false);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const clearPendingPreview = () => {
    setPendingPreview(null);
    setUploadProgress(0);
  };

  const sendPayload = async ({ messageText, imageFile }) => {
    if (!deliveryId || sending || !chatAvailable) return;
    const body = (messageText ?? text).trim();
    if (!body && !imageFile) return;

    setSending(true);
    setError("");
    setUploadProgress(imageFile ? 8 : 0);
    notifyTyping(false);

    try {
      const created = await sendDeliveryChatMessage(deliveryId, {
        message: body,
        imageFile,
        onProgress: imageFile ? setUploadProgress : undefined,
      });
      setMessages((prev) => {
        if (prev.some((item) => item.id === created.id)) return prev;
        return [...prev, created];
      });
      setText("");
      clearPendingPreview();
      setRetryPayload(null);
    } catch (err) {
      setError(err.message || "Could not send message.");
      setRetryPayload({ messageText: body, imageFile });
    } finally {
      setSending(false);
      setUploadProgress(0);
    }
  };

  const sendMessage = async (rawText) => {
    const body = (rawText ?? text).trim();
    if (!body && !pendingPreview?.file) return;
    await sendPayload({ messageText: body, imageFile: pendingPreview?.file || null });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  const handleRetry = () => {
    if (!retryPayload) return;
    if (retryPayload.imageFile) {
      setPendingPreview({ dataUrl: null, file: retryPayload.imageFile });
    }
    if (retryPayload.messageText) {
      setText(retryPayload.messageText);
    }
    sendPayload(retryPayload);
  };

  return (
    <div className="dcc-overlay" role="presentation" onClick={onClose}>
      <div
        className="dcc-sheet"
        role="dialog"
        aria-label={`Chat with ${contactName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dcc-sheet__handle" aria-hidden />

        <header className="dcc-sheet__head">
          <div>
            <strong>{contactName}</strong>
            <span>{chatAvailable ? "Active delivery chat" : "Chat closed"}</span>
          </div>
          <div className="dcc-sheet__head-actions">
            <button
              type="button"
              className="dcc-sheet__report-chat"
              onClick={() => setReportTarget({ messageId: null })}
              aria-label="Report chat"
            >
              ⚠
            </button>
            <button type="button" className="dcc-sheet__close" onClick={onClose} aria-label="Close chat">
              ×
            </button>
          </div>
        </header>

        {error ? (
          <div className="dcc-sheet__error">
            <span>{error}</span>
            {retryPayload ? (
              <button type="button" className="dcc-sheet__retry" onClick={handleRetry}>
                Retry
              </button>
            ) : null}
          </div>
        ) : null}

        {uploadProgress > 0 && uploadProgress < 100 ? (
          <div className="dcc-sheet__progress" aria-live="polite">
            <span>Uploading photo… {uploadProgress}%</span>
            <div className="dcc-sheet__progress-bar">
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        ) : null}

        <div className="dcc-sheet__messages">
          {loading && messages.length === 0 ? (
            <p className="dcc-sheet__empty">Loading messages…</p>
          ) : null}
          {!loading && messages.length === 0 ? (
            <p className="dcc-sheet__empty">
              No messages yet. Share a photo of the gate, building, or entrance to help your courier find you.
            </p>
          ) : null}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`dcc-bubble ${msg.is_mine ? "dcc-bubble--mine" : "dcc-bubble--theirs"} ${
                msg.image_url ? "dcc-bubble--image" : ""
              }`}
            >
              {!msg.is_mine ? (
                <div className="dcc-bubble__name">
                  <span>{msg.sender_name}</span>
                  {!msg.is_hidden ? (
                    <button
                      type="button"
                      className="dcc-bubble__report"
                      onClick={() => setReportTarget({ messageId: msg.id })}
                      aria-label="Report message"
                    >
                      Report
                    </button>
                  ) : null}
                </div>
              ) : null}
              <ChatImageBubble msg={msg} onExpand={setExpandedImage} />
              {msg.message ? <p>{msg.message}</p> : null}
              <div className="dcc-bubble__meta">
                <span>{formatChatTime(msg.created_at)}</span>
                {msg.is_mine ? (
                  <span className="dcc-bubble__seen">{msg.is_read ? "Seen" : "Sent"}</span>
                ) : null}
              </div>
            </div>
          ))}

          {typingUserId ? <p className="dcc-sheet__typing">{contactName} is typing…</p> : null}
          <div ref={bottomRef} />
        </div>

        {pendingPreview ? (
          <div className="dcc-sheet__preview">
            <img src={pendingPreview.dataUrl} alt="Photo preview" />
            <div className="dcc-sheet__preview-actions">
              <button type="button" onClick={clearPendingPreview} disabled={sending}>
                Remove
              </button>
              <button type="button" onClick={() => sendMessage()} disabled={sending}>
                Send photo
              </button>
            </div>
          </div>
        ) : null}

        <div className="dcc-sheet__quick">
          {quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              className="dcc-sheet__quick-btn"
              disabled={!chatAvailable || sending}
              onClick={() => sendMessage(reply)}
            >
              {reply}
            </button>
          ))}
        </div>

        <form className="dcc-sheet__composer" onSubmit={handleSubmit}>
          <div className="dcc-sheet__attach-wrap">
            <button
              type="button"
              className="dcc-sheet__attach"
              disabled={!chatAvailable || sending}
              onClick={() => setShowAttachMenu((open) => !open)}
              aria-label="Add photo"
            >
              📷
            </button>
            {showAttachMenu ? (
              <div className="dcc-sheet__attach-menu">
                <button type="button" onClick={handleTakePhoto}>
                  Take photo
                </button>
                <button type="button" onClick={handlePickGallery}>
                  Choose from gallery
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  Upload file
                </button>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="dcc-sheet__file-input"
              onChange={handleFileInput}
            />
          </div>
          <input
            type="text"
            value={text}
            maxLength={500}
            placeholder={chatAvailable ? "Type a message…" : "Chat closed"}
            disabled={!chatAvailable || sending}
            onChange={handleTextChange}
            aria-label="Message"
          />
          <button
            type="submit"
            disabled={!chatAvailable || sending || (!text.trim() && !pendingPreview?.file)}
          >
            {sending ? "…" : "Send"}
          </button>
        </form>
      </div>

      {expandedImage ? (
        <div
          className="dcc-lightbox"
          role="dialog"
          aria-label="Photo preview"
          onClick={() => setExpandedImage(null)}
        >
          <button type="button" className="dcc-lightbox__close" aria-label="Close photo">
            ×
          </button>
          <img src={expandedImage} alt="Shared delivery photo" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}

      {reportTarget ? (
        <DeliveryChatReportMenu
          deliveryId={deliveryId}
          messageId={reportTarget.messageId}
          onClose={() => setReportTarget(null)}
          onReported={() => {
            setError("");
            setReportTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
