/**
 * RideChat — In-app chat between rider and driver during an active ride.
 * Props:
 *   rideId: number
 *   onClose: function
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../apiConfig";
import { subscribeRideUpdates } from "../socket";

export default function RideChat({ rideId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const token = localStorage.getItem("access");

  const fetchMessages = useCallback(async () => {
    if (!rideId || !token) return;
    try {
      const res = await fetch(`${API_URL}/chat/${rideId}/messages/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) { /* silent */ }
  }, [rideId, token]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    const unsub = subscribeRideUpdates((msg) => {
      if (msg?.type === "chat_message" && msg.ride_id === rideId) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.message_id)) return prev;
          return [...prev, {
            id: msg.message_id,
            sender_id: msg.sender_id,
            sender_name: msg.sender_name,
            is_mine: false,
            text: msg.text,
            created_at: msg.created_at,
            read: false,
          }];
        });
      }
    });
    return () => { clearInterval(interval); unsub(); };
  }, [fetchMessages, rideId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    try {
      setSending(true);
      const res = await fetch(`${API_URL}/chat/${rideId}/send/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setText("");
      }
    } catch (e) { /* silent */ }
    finally { setSending(false); }
  };

  return (
    <div style={S.overlay}>
      <div style={S.container}>
        {/* Header */}
        <div style={S.header}>
          <h3 style={S.title}>Chat</h3>
          <button onClick={onClose} style={S.closeBtn}>✕</button>
        </div>

        {/* Messages */}
        <div style={S.messageList}>
          {messages.length === 0 && (
            <div style={S.empty}>No messages yet. Say hello!</div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} style={{ ...S.bubble, ...(msg.is_mine ? S.mine : S.theirs) }}>
              {!msg.is_mine && <span style={S.senderName}>{msg.sender_name}</span>}
              <p style={S.msgText}>{msg.text}</p>
              <span style={S.time}>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} style={S.inputRow}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            style={S.input}
            maxLength={500}
            autoFocus
          />
          <button type="submit" disabled={!text.trim() || sending} style={S.sendBtn}>
            {sending ? "..." : "➤"}
          </button>
        </form>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", padding: 16 },
  container: { width: "min(420px, 100%)", maxHeight: "80vh", background: "#141414", borderRadius: "20px 20px 12px 12px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #262626" },
  title: { margin: 0, color: "#fff", fontSize: 17, fontWeight: 700 },
  closeBtn: { width: 32, height: 32, border: 0, borderRadius: "50%", background: "#262626", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  messageList: { flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 8, minHeight: 200, maxHeight: "55vh" },
  empty: { textAlign: "center", color: "#737373", padding: "40px 0", fontSize: 14 },
  bubble: { maxWidth: "78%", padding: "10px 14px", borderRadius: 16, fontSize: 14, lineHeight: 1.4 },
  mine: { alignSelf: "flex-end", background: "#00A651", color: "#fff", borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", background: "#262626", color: "#fff", borderBottomLeftRadius: 4 },
  senderName: { display: "block", fontSize: 11, color: "#D4AF37", fontWeight: 700, marginBottom: 2 },
  msgText: { margin: 0 },
  time: { display: "block", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4, textAlign: "right" },
  inputRow: { display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #262626", background: "#1a1a1a" },
  input: { flex: 1, height: 42, border: "1px solid #333", borderRadius: 999, background: "#262626", color: "#fff", padding: "0 16px", fontSize: 14, outline: "none" },
  sendBtn: { width: 42, height: 42, border: 0, borderRadius: "50%", background: "#00A651", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
