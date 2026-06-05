import React, { useMemo, useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { API_URL } from "../apiConfig";
import { getAppType } from "../native/platform";

const copy = {
  en: {
    title: "Yala Support AI",
    subtitle: "Ask about rides, driving, payments, or safety.",
    welcome: "Hello. How can I help you with Yala today?",
    placeholder: "Ask a question",
    send: "Send",
    disclaimer: "Do not share passwords, ID numbers, card numbers, or verification codes.",
    error: "I could not connect right now. Please try again.",
    suggestions: ["How do I book a ride?", "Which driver documents are required?", "I have a payment problem"],
  },
  fr: {
    title: "Assistant Yala",
    subtitle: "Questions sur les courses, chauffeurs, paiements ou sécurité.",
    welcome: "Bonjour. Comment puis-je vous aider avec Yala aujourd'hui ?",
    placeholder: "Posez votre question",
    send: "Envoyer",
    disclaimer: "Ne partagez jamais mots de passe, numéros d'identité, carte ou codes.",
    error: "Connexion impossible pour le moment. Réessayez.",
    suggestions: ["Comment réserver une course ?", "Quels documents chauffeur sont requis ?", "J'ai un problème de paiement"],
  },
  ar: {
    title: "مساعد يالا",
    subtitle: "اسأل عن الرحلات أو القيادة أو الدفع أو الأمان.",
    welcome: "مرحباً. كيف يمكنني مساعدتك مع يالا اليوم؟",
    placeholder: "اكتب سؤالك",
    send: "إرسال",
    disclaimer: "لا تشارك كلمات المرور أو أرقام الهوية أو البطاقة أو رموز التحقق.",
    error: "تعذر الاتصال الآن. حاول مرة أخرى.",
    suggestions: ["كيف أحجز رحلة؟", "ما وثائق السائق المطلوبة؟", "لدي مشكلة في الدفع"],
  },
};

function YalaAIAssistant() {
  const { i18n } = useTranslation();
  const language = i18n.language?.startsWith("ar") ? "ar" : i18n.language?.startsWith("fr") ? "fr" : "en";
  const text = copy[language];
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", content: text.welcome }]);
  const inputRef = useRef(null);
  const context = useMemo(() => `${getAppType()} app, page ${window.location.pathname}`, []);

  const submit = async (value = question) => {
    const clean = value.trim();
    if (!clean || busy) return;

    const nextMessages = [...messages, { role: "user", content: clean }];
    setMessages(nextMessages);
    setQuestion("");
    setBusy(true);

    try {
      const response = await axios.post(`${API_URL}/support/ai/`, {
        message: clean,
        context,
        messages: nextMessages.slice(-6),
      });
      setMessages((current) => [...current, { role: "assistant", content: response.data.answer }]);
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error.response?.data?.detail || text.error }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className={`yala-ai ${open ? "is-open" : ""}`} dir={language === "ar" ? "rtl" : "ltr"}>
      <style>{styles}</style>
      {open && (
        <section className="yala-ai-panel" aria-label={text.title}>
          <header>
            <img src="/yala-logo.png" alt="" />
            <div><strong>{text.title}</strong><span>{text.subtitle}</span></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
          </header>
          <div className="yala-ai-messages" aria-live="polite">
            {messages.map((message, index) => (
              <p key={`${message.role}-${index}`} className={message.role}>{message.content}</p>
            ))}
            {busy && <p className="assistant loading"><i /><i /><i /></p>}
          </div>
          {messages.length === 1 && (
            <div className="yala-ai-suggestions">
              {text.suggestions.map((item) => <button type="button" key={item} onClick={() => submit(item)}>{item}</button>)}
            </div>
          )}
          <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <input ref={inputRef} value={question} maxLength={1500} onChange={(event) => setQuestion(event.target.value)} placeholder={text.placeholder} />
            <button type="submit" disabled={!question.trim() || busy}>{text.send}</button>
          </form>
          <small>{text.disclaimer}</small>
        </section>
      )}
      <button className="yala-ai-launcher" type="button" onClick={() => setOpen((current) => !current)} aria-label={text.title} aria-expanded={open}>
        <img src="/yala-logo.png" alt="" /><span>AI</span>
      </button>
    </div>
  );
}

const styles = `
  .yala-ai { position: fixed; left: 18px; bottom: 18px; z-index: 10000; font-family: Inter, "Segoe UI", sans-serif; }
  .yala-ai * { box-sizing: border-box; letter-spacing: 0; }
  .yala-ai-launcher { width: 58px; height: 58px; padding: 5px; border: 1px solid rgba(255,255,255,.3); border-radius: 50%; background: #07140d; box-shadow: 0 14px 34px rgba(0,0,0,.28); cursor: pointer; position: relative; }
  .yala-ai-launcher img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
  .yala-ai-launcher span { position: absolute; right: -5px; top: -5px; min-width: 24px; height: 24px; display: grid; place-items: center; border-radius: 12px; background: #f5c542; color: #102016; font-size: 11px; font-weight: 900; }
  .yala-ai-panel { position: absolute; left: 0; bottom: 72px; width: min(390px, calc(100vw - 24px)); height: min(610px, calc(100vh - 110px)); display: grid; grid-template-rows: auto 1fr auto auto auto; overflow: hidden; border: 1px solid #dfe7e2; border-radius: 8px; background: #fff; color: #14231a; box-shadow: 0 24px 70px rgba(0,0,0,.3); }
  .yala-ai-panel header { min-height: 72px; display: flex; align-items: center; gap: 10px; padding: 12px; background: #063d25; color: #fff; }
  .yala-ai-panel header img { width: 42px; height: 42px; border-radius: 6px; object-fit: cover; }
  .yala-ai-panel header div { display: grid; gap: 3px; flex: 1; min-width: 0; }
  .yala-ai-panel header strong { font-size: 15px; }
  .yala-ai-panel header span { font-size: 11px; color: rgba(255,255,255,.72); line-height: 1.3; }
  .yala-ai-panel header button { width: 34px; height: 34px; border: 0; background: transparent; color: #fff; font-size: 25px; cursor: pointer; }
  .yala-ai-messages { overflow-y: auto; padding: 14px; background: #f4f7f5; }
  .yala-ai-messages p { width: fit-content; max-width: 88%; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
  .yala-ai-messages .assistant { background: #fff; border: 1px solid #e1e8e3; }
  .yala-ai-messages .user { margin-inline-start: auto; background: #08783f; color: #fff; }
  .yala-ai-suggestions { display: flex; gap: 7px; overflow-x: auto; padding: 8px 12px; border-top: 1px solid #e8ece9; }
  .yala-ai-suggestions button { flex: 0 0 auto; max-width: 210px; padding: 8px 10px; border: 1px solid #cbd8cf; border-radius: 7px; background: #fff; color: #245537; font: inherit; font-size: 11px; cursor: pointer; }
  .yala-ai-panel form { display: flex; gap: 7px; padding: 10px 12px; border-top: 1px solid #e8ece9; }
  .yala-ai-panel form input { min-width: 0; flex: 1; min-height: 42px; border: 1px solid #bfcac2; border-radius: 6px; padding: 0 10px; font: inherit; }
  .yala-ai-panel form button { min-width: 70px; border: 0; border-radius: 6px; background: #08783f; color: #fff; font-weight: 800; cursor: pointer; }
  .yala-ai-panel form button:disabled { opacity: .5; cursor: default; }
  .yala-ai-panel small { padding: 0 12px 10px; color: #66736a; font-size: 9px; line-height: 1.35; }
  .yala-ai-messages .loading { display: flex; gap: 4px; }
  .yala-ai-messages .loading i { width: 5px; height: 5px; border-radius: 50%; background: #08783f; animation: yala-ai-pulse 1s infinite alternate; }
  .yala-ai-messages .loading i:nth-child(2) { animation-delay: .2s; } .yala-ai-messages .loading i:nth-child(3) { animation-delay: .4s; }
  @keyframes yala-ai-pulse { to { opacity: .25; transform: translateY(-2px); } }
  @media (max-width: 540px) { .yala-ai { left: 10px; bottom: 10px; } .yala-ai-panel { bottom: 66px; width: calc(100vw - 20px); height: min(560px, calc(100vh - 88px)); } }
`;

export default YalaAIAssistant;
