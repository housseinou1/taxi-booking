import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  lightGray: "rgba(255, 255, 255, 0.6)",
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardBorder: "rgba(255, 255, 255, 0.1)",
  errorRed: "#EF4444",
  emergencyRed: "#DC2626",
  chatBlue: "#3B82F6",
  successGreen: "#10B981",
};

const SUPPORT_TABS = [
  { key: "help", label: "Help Center", icon: "📚" },
  { key: "contact", label: "Contact", icon: "✉️" },
  { key: "chat", label: "Live Chat", icon: "💬" },
  { key: "safety", label: "Safety", icon: "🛡️" },
  { key: "faq", label: "FAQ", icon: "❓" },
];

const HELP_CATEGORIES = [
  { key: "getting_started", label: "Getting Started", icon: "🚀" },
  { key: "rides", label: "Rides & Navigation", icon: "🗺️" },
  { key: "earnings", label: "Earnings & Payments", icon: "💰" },
  { key: "account", label: "Account & Profile", icon: "👤" },
  { key: "vehicle", label: "Vehicle & Documents", icon: "🚗" },
  { key: "lost_found", label: "Lost and Found", icon: "🧳" },
  { key: "safety", label: "Safety & Security", icon: "🛡️" },
];

const HELP_ARTICLES = {
  getting_started: [
    { id: 1, title: "How to go online and start receiving rides", summary: "Learn how to toggle your availability status." },
    { id: 2, title: "Understanding the ride request process", summary: "How ride requests work and the 30-second countdown." },
    { id: 3, title: "Setting up your driver profile", summary: "Complete your profile for better rider trust." },
  ],
  rides: [
    { id: 4, title: "Navigating to pickup locations", summary: "Using in-app navigation for pickups." },
    { id: 5, title: "Managing multi-stop rides", summary: "How to handle rides with multiple destinations." },
    { id: 6, title: "Cancellation policy and impact", summary: "Understanding cancellation rates." },
  ],
  earnings: [
    { id: 7, title: "Understanding your earnings breakdown", summary: "Daily, weekly, and monthly earnings explained." },
    { id: 8, title: "Bonus and incentive programs", summary: "How to earn extra through bonuses." },
    { id: 9, title: "Payment schedule and methods", summary: "When and how you get paid." },
  ],
  account: [
    { id: 10, title: "Updating your profile information", summary: "Change your name, photo, and details." },
    { id: 11, title: "Driver level system explained", summary: "Bronze to Elite progression guide." },
    { id: 12, title: "Privacy and security settings", summary: "Control what riders can see." },
  ],
  vehicle: [
    { id: 13, title: "Required documents and uploads", summary: "What documents you need to drive." },
    { id: 14, title: "Document expiration and renewal", summary: "Keep your documents up to date." },
    { id: 15, title: "Vehicle inspection requirements", summary: "Maintaining vehicle standards." },
  ],
  lost_found: [
    { id: 19, title: "Report an item left in your vehicle", summary: "Tell Yala support what was found, the ride details, and how we can reach you." },
    { id: 20, title: "Return a rider's belongings safely", summary: "Use support or live chat so the return is documented and coordinated by Yala." },
    { id: 21, title: "Protect rider privacy", summary: "Do not open bags, wallets, or phones. Keep the item secure until support gives instructions." },
  ],
  safety: [
    { id: 16, title: "Emergency support features", summary: "How to use the emergency button." },
    { id: 17, title: "Reporting safety concerns", summary: "Report incidents and unsafe riders." },
    { id: 18, title: "Safe driving best practices", summary: "Tips for a safe driving experience." },
  ],
};

const SAFETY_RESOURCES = [
  {
    id: "emergency_button",
    title: "Emergency Support Button",
    description: "Tap the red 🆘 button (bottom-right corner) to instantly alert our support team with your GPS location. Available on every screen.",
    icon: "🆘",
  },
  {
    id: "report_incident",
    title: "Report a Safety Incident",
    description: "If you experience unsafe behavior from a rider, report it immediately through the Contact Support form. Include ride details for faster resolution.",
    icon: "⚠️",
  },
  {
    id: "share_trip",
    title: "Share Your Trip",
    description: "Your live location is shared with our support team during active rides. In an emergency, your GPS is shared automatically.",
    icon: "📍",
  },
  {
    id: "safe_driving",
    title: "Safe Driving Guidelines",
    description: "Follow speed limits, avoid distractions, and take breaks when tired. Your safety rating affects your driver level.",
    icon: "🚗",
  },
  {
    id: "emergency_contacts",
    title: "Emergency Contacts",
    description: "Police: 117 | Fire: 118 | Ambulance: 101 | Yala Emergency Line: Available 24/7 through the emergency button.",
    icon: "📞",
  },
  {
    id: "vehicle_safety",
    title: "Vehicle Safety Checklist",
    description: "Ensure your vehicle is roadworthy: check brakes, tires, lights, and seatbelts before going online each day.",
    icon: "✅",
  },
];

// ─── Emergency Support Button (Persistent, exported for use on all screens) ─

/**
 * Persistent Emergency Support button that should be rendered on every screen.
 * Visible without scrolling (fixed position).
 * Shares GPS within 5 seconds; falls back to last known location with warning.
 */
export function EmergencySupportButton() {
  const [isActivating, setIsActivating] = useState(false);
  const [emergencyStatus, setEmergencyStatus] = useState(null); // 'success' | 'fallback' | 'error'
  const [statusMessage, setStatusMessage] = useState("");
  const locationRef = useRef(null);
  const lastKnownLocationRef = useRef(null);

  // Track location passively for emergency use
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        locationRef.current = loc;
        lastKnownLocationRef.current = loc;
      },
      () => {
        // GPS error - keep last known location
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const handleEmergency = useCallback(async () => {
    if (isActivating) return;
    setIsActivating(true);
    setEmergencyStatus(null);
    setStatusMessage("");

    const token = localStorage.getItem("access");
    let locationToSend = null;
    let usedFallback = false;

    // Try to get current GPS within 5 seconds
    try {
      const currentLocation = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("GPS unavailable"));
          return;
        }
        const timeout = setTimeout(() => reject(new Error("GPS timeout")), 5000);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            clearTimeout(timeout);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          () => {
            clearTimeout(timeout);
            reject(new Error("GPS unavailable"));
          },
          { enableHighAccuracy: true, timeout: 4500 }
        );
      });
      locationToSend = currentLocation;
    } catch {
      // Fallback to last known location
      locationToSend = lastKnownLocationRef.current || locationRef.current;
      usedFallback = true;
    }

    try {
      await axios.post(
        `${API_URL}/drivers/me/support/emergency/`,
        {
          latitude: locationToSend?.lat || null,
          longitude: locationToSend?.lng || null,
          location_fallback: usedFallback,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (usedFallback) {
        setEmergencyStatus("fallback");
        setStatusMessage(
          "Emergency alert sent. Note: Location shared may not be current (GPS unavailable)."
        );
      } else {
        setEmergencyStatus("success");
        setStatusMessage("Emergency alert sent. Support team has your location.");
      }
    } catch {
      setEmergencyStatus("error");
      setStatusMessage("Failed to send emergency alert. Please call emergency services directly.");
    } finally {
      setIsActivating(false);
      // Auto-dismiss status after 8 seconds
      setTimeout(() => {
        setEmergencyStatus(null);
        setStatusMessage("");
      }, 8000);
    }
  }, [isActivating]);

  return (
    <>
      <button
        style={emergencyButtonStyle}
        onClick={handleEmergency}
        disabled={isActivating}
        aria-label="Emergency Support"
        title="Emergency Support - Tap to alert support team with your location"
      >
        {isActivating ? "..." : "🆘"}
      </button>

      {emergencyStatus && (
        <div
          style={{
            ...emergencyStatusStyle,
            borderColor:
              emergencyStatus === "error"
                ? COLORS.errorRed
                : emergencyStatus === "fallback"
                ? COLORS.goldAccent
                : COLORS.successGreen,
            backgroundColor:
              emergencyStatus === "error"
                ? "rgba(239, 68, 68, 0.15)"
                : emergencyStatus === "fallback"
                ? "rgba(212, 175, 55, 0.15)"
                : "rgba(16, 185, 129, 0.15)",
          }}
          role="alert"
          aria-live="assertive"
        >
          <span style={emergencyStatusTextStyle}>{statusMessage}</span>
        </div>
      )}
    </>
  );
}

// ─── Main Support Center Component ──────────────────────────────────────────

export default function DriverSupport() {
  const token = localStorage.getItem("access");
  const [activeTab, setActiveTab] = useState("help");
  const [selectedCategory, setSelectedCategory] = useState(null);

  // FAQ state
  const [faqArticles, setFaqArticles] = useState([]);
  const [faqSearch, setFaqSearch] = useState("");
  const [faqLoading, setFaqLoading] = useState(false);
  const [faqError, setFaqError] = useState(null);

  // Contact form state
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactStatus, setContactStatus] = useState(null);

  // Live chat state
  const [chatStatus, setChatStatus] = useState("idle"); // idle | queued | error
  const [chatMessage, setChatMessage] = useState("");

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    const topic = new URLSearchParams(window.location.search || "").get("topic");
    if (topic !== "lost-found") return;

    setActiveTab("contact");
    setSelectedCategory(null);
    setContactSubject("Lost and Found Item");
    setContactMessage(
      "I found an item after a ride.\n\nRide details:\nItem description:\nWhere the item is now:\nBest contact time:"
    );
    setChatMessage("Lost and found item report");
  }, []);

  // ─── FAQ Search ───────────────────────────────────────────────────────────

  const fetchFaq = useCallback(
    async (searchQuery = "") => {
      if (!token) return;
      setFaqLoading(true);
      setFaqError(null);

      try {
        const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
        const response = await axios.get(
          `${API_URL}/drivers/me/support/faq/${params}`,
          authHeaders
        );
        setFaqArticles(response.data.results || response.data || []);
      } catch {
        setFaqError("Failed to load FAQ articles. Please try again.");
      } finally {
        setFaqLoading(false);
      }
    },
    [authHeaders, token]
  );

  // Load FAQ when tab is selected
  useEffect(() => {
    if (activeTab === "faq") {
      fetchFaq(faqSearch);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced FAQ search
  const handleFaqSearch = useCallback(
    (value) => {
      setFaqSearch(value);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        fetchFaq(value);
      }, 300);
    },
    [fetchFaq]
  );

  // ─── Contact Support Form ─────────────────────────────────────────────────

  const handleContactSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!contactSubject.trim() || !contactMessage.trim()) return;
      setContactSubmitting(true);
      setContactStatus(null);

      try {
        await axios.post(
          `${API_URL}/drivers/me/support/chat/`,
          {
            subject: contactSubject.trim(),
            message: contactMessage.trim(),
            ticket_type: "contact_form",
          },
          authHeaders
        );
        setContactStatus("success");
        setContactSubject("");
        setContactMessage("");
      } catch {
        setContactStatus("error");
      } finally {
        setContactSubmitting(false);
      }
    },
    [contactSubject, contactMessage, authHeaders]
  );

  // ─── Live Chat ────────────────────────────────────────────────────────────

  const handleInitiateChat = useCallback(async () => {
    setChatStatus("idle");

    try {
      await axios.post(
        `${API_URL}/drivers/me/support/chat/`,
        { ticket_type: "live_chat", message: chatMessage.trim() || "Live chat request" },
        authHeaders
      );
      setChatStatus("queued");
      setChatMessage("");
    } catch {
      setChatStatus("error");
    }
  }, [authHeaders, chatMessage]);

  // ─── Render Tabs ──────────────────────────────────────────────────────────

  const renderHelpCenter = () => (
    <div style={tabContentStyle}>
      {!selectedCategory ? (
        <>
          <p style={sectionDescStyle}>Browse help articles by category</p>
          <div style={categoryGridStyle}>
            {HELP_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                style={categoryCardStyle}
                onClick={() => setSelectedCategory(cat.key)}
                aria-label={`View ${cat.label} articles`}
              >
                <span style={categoryIconStyle}>{cat.icon}</span>
                <span style={categoryLabelStyle}>{cat.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            style={backButtonStyle}
            onClick={() => setSelectedCategory(null)}
            aria-label="Back to categories"
          >
            ← Back to Categories
          </button>
          <h3 style={categoryTitleStyle}>
            {HELP_CATEGORIES.find((c) => c.key === selectedCategory)?.icon}{" "}
            {HELP_CATEGORIES.find((c) => c.key === selectedCategory)?.label}
          </h3>
          <div style={articleListStyle}>
            {(HELP_ARTICLES[selectedCategory] || []).map((article) => (
              <div key={article.id} style={articleCardStyle}>
                <h4 style={articleTitleStyle}>{article.title}</h4>
                <p style={articleSummaryStyle}>{article.summary}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderContactForm = () => (
    <div style={tabContentStyle}>
      <p style={sectionDescStyle}>Send a message to our support team</p>

      {contactSubject === "Lost and Found Item" && (
        <div style={lostFoundNoticeStyle}>
          Lost and Found reports go to Yala support. Include the ride, item
          description, and where the item is secured so support can coordinate
          with the rider.
        </div>
      )}

      {contactStatus === "success" && (
        <div style={successMessageStyle} role="status">
          ✅ Your message has been sent. We'll get back to you soon.
        </div>
      )}
      {contactStatus === "error" && (
        <div style={errorMessageStyle} role="alert">
          ❌ Failed to send message. Please try again.
        </div>
      )}

      <form onSubmit={handleContactSubmit} style={formStyle}>
        <div style={formGroupStyle}>
          <label style={formLabelStyle} htmlFor="contact-subject">
            Subject
          </label>
          <input
            id="contact-subject"
            type="text"
            style={formInputStyle}
            value={contactSubject}
            onChange={(e) => setContactSubject(e.target.value)}
            placeholder="Brief description of your issue"
            maxLength={200}
            required
          />
        </div>

        <div style={formGroupStyle}>
          <label style={formLabelStyle} htmlFor="contact-message">
            Message
          </label>
          <textarea
            id="contact-message"
            style={formTextareaStyle}
            value={contactMessage}
            onChange={(e) => setContactMessage(e.target.value)}
            placeholder="Describe your issue in detail..."
            maxLength={1000}
            rows={5}
            required
          />
        </div>

        <button
          type="submit"
          style={{
            ...submitButtonStyle,
            opacity: contactSubmitting ? 0.6 : 1,
            cursor: contactSubmitting ? "not-allowed" : "pointer",
          }}
          disabled={contactSubmitting}
        >
          {contactSubmitting ? "Sending..." : "Send Message"}
        </button>
      </form>
    </div>
  );

  const renderLiveChat = () => (
    <div style={tabContentStyle}>
      <p style={sectionDescStyle}>
        Connect with a support agent in real time
      </p>

      {chatStatus === "queued" && (
        <div style={queueConfirmationStyle} role="status" aria-live="polite">
          <span style={queueIconStyle}>✅</span>
          <div>
            <strong style={queueTitleStyle}>Request Queued</strong>
            <p style={queueMessageStyle}>
              Your chat request has been queued. A support agent will connect with you shortly.
            </p>
          </div>
        </div>
      )}

      {chatStatus === "error" && (
        <div style={errorMessageStyle} role="alert">
          ❌ Failed to initiate chat. Please try again.
        </div>
      )}

      {chatStatus !== "queued" && (
        <div style={chatInitiateStyle}>
          <div style={formGroupStyle}>
            <label style={formLabelStyle} htmlFor="chat-message">
              Describe your issue (optional)
            </label>
            <textarea
              id="chat-message"
              style={formTextareaStyle}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Briefly describe what you need help with..."
              maxLength={500}
              rows={3}
            />
          </div>

          <button
            style={chatStartButtonStyle}
            onClick={handleInitiateChat}
            aria-label="Start live chat with support agent"
          >
            💬 Start Live Chat
          </button>
        </div>
      )}
    </div>
  );

  const renderFaq = () => (
    <div style={tabContentStyle}>
      <p style={sectionDescStyle}>
        Find answers to common questions
      </p>

      {/* Search Input */}
      <div style={searchContainerStyle}>
        <input
          type="text"
          style={searchInputStyle}
          value={faqSearch}
          onChange={(e) => handleFaqSearch(e.target.value)}
          placeholder="Search FAQ by keyword..."
          aria-label="Search FAQ articles"
        />
        {faqSearch && (
          <button
            style={searchClearStyle}
            onClick={() => handleFaqSearch("")}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* FAQ Results */}
      {faqLoading && (
        <div style={faqLoadingStyle}>
          <span>⏳</span> Searching...
        </div>
      )}

      {faqError && (
        <div style={errorMessageStyle} role="alert">
          {faqError}
        </div>
      )}

      {!faqLoading && !faqError && faqArticles.length === 0 && faqSearch && (
        <div style={emptyStateStyle}>
          <p style={emptyTextStyle}>No results found for "{faqSearch}"</p>
          <p style={emptyHintStyle}>Try different keywords or browse the Help Center</p>
        </div>
      )}

      {!faqLoading && faqArticles.length > 0 && (
        <div style={faqListStyle}>
          {faqArticles.map((article, index) => (
            <FaqItem key={article.id || index} article={article} />
          ))}
        </div>
      )}

      {/* Category-organized FAQ when no search */}
      {!faqLoading && !faqSearch && faqArticles.length === 0 && !faqError && (
        <div style={faqCategoriesStyle}>
          {HELP_CATEGORIES.map((cat) => (
            <div key={cat.key} style={faqCategoryGroupStyle}>
              <h4 style={faqCategoryTitleStyle}>
                {cat.icon} {cat.label}
              </h4>
              {(HELP_ARTICLES[cat.key] || []).map((article) => (
                <FaqItem key={article.id} article={article} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderSafetyCenter = () => (
    <div style={tabContentStyle}>
      <p style={sectionDescStyle}>
        Your safety is our priority. Access emergency tools and safety resources.
      </p>

      {/* Emergency Quick Action */}
      <div style={safetyEmergencyBannerStyle}>
        <div style={safetyEmergencyIconStyle}>🆘</div>
        <div style={safetyEmergencyContentStyle}>
          <strong style={safetyEmergencyTitleStyle}>Need Immediate Help?</strong>
          <p style={safetyEmergencyDescStyle}>
            Tap the red emergency button (bottom-right) to instantly share your location with our support team.
          </p>
        </div>
      </div>

      {/* Safety Resources */}
      <h3 style={safetySectionTitleStyle}>Safety Resources</h3>
      <div style={safetyResourcesListStyle}>
        {SAFETY_RESOURCES.map((resource) => (
          <div key={resource.id} style={safetyResourceCardStyle}>
            <span style={safetyResourceIconStyle}>{resource.icon}</span>
            <div style={safetyResourceContentStyle}>
              <h4 style={safetyResourceTitleStyle}>{resource.title}</h4>
              <p style={safetyResourceDescStyle}>{resource.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── Main Render ──────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      {/* Mauritania accent bar */}
      <div style={mauritaniaAccentBarStyle} aria-hidden="true" />

      {/* Page Header */}
      <div style={headerStyle}>
        <h1 style={pageTitleStyle}>🛟 Support Center</h1>
        <p style={pageSubtitleStyle}>Get help, chat with support, or report an emergency</p>
      </div>

      {/* Tab Navigation */}
      <div style={tabNavStyle} role="tablist" aria-label="Support sections">
        {SUPPORT_TABS.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...tabButtonStyle,
              ...(activeTab === tab.key ? activeTabStyle : {}),
            }}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`panel-${tab.key}`}
          >
            <span style={tabIconStyle}>{tab.icon}</span>
            <span style={tabLabelStyle}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div role="tabpanel" id={`panel-${activeTab}`}>
        {activeTab === "help" && renderHelpCenter()}
        {activeTab === "contact" && renderContactForm()}
        {activeTab === "chat" && renderLiveChat()}
        {activeTab === "safety" && renderSafetyCenter()}
        {activeTab === "faq" && renderFaq()}
      </div>

      {/* Persistent Emergency Support Button */}
      <EmergencySupportButton />
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function FaqItem({ article }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={faqItemStyle}>
      <button
        style={faqQuestionStyle}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span style={faqQuestionTextStyle}>
          {article.title || article.question}
        </span>
        <span style={faqExpandIconStyle}>{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div style={faqAnswerStyle}>
          <p style={faqAnswerTextStyle}>
            {article.summary || article.answer || "No additional details available."}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  position: "relative",
  minHeight: "100vh",
  backgroundColor: COLORS.darkNavy,
  padding: "24px 16px 80px",
  overflowY: "auto",
  fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const mauritaniaAccentBarStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
  background: `linear-gradient(90deg, ${COLORS.primaryGreen} 0%, ${COLORS.goldAccent} 50%, ${COLORS.primaryGreen} 100%)`,
};

const headerStyle = {
  marginBottom: "20px",
  paddingTop: "12px",
};

const pageTitleStyle = {
  color: COLORS.white,
  fontSize: "24px",
  fontWeight: 800,
  margin: "0 0 4px 0",
};

const pageSubtitleStyle = {
  color: COLORS.lightGray,
  fontSize: "14px",
  margin: 0,
};

// ─── Emergency Button Styles ────────────────────────────────────────────────

const emergencyButtonStyle = {
  position: "fixed",
  bottom: "90px",
  right: "16px",
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  backgroundColor: COLORS.emergencyRed,
  border: `3px solid ${COLORS.white}`,
  boxShadow: "0 4px 16px rgba(220, 38, 38, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "24px",
  cursor: "pointer",
  zIndex: 9999,
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
};

const emergencyStatusStyle = {
  position: "fixed",
  bottom: "155px",
  right: "16px",
  left: "16px",
  padding: "12px 16px",
  borderRadius: "14px",
  borderWidth: "1px",
  borderStyle: "solid",
  zIndex: 9998,
  backdropFilter: "blur(8px)",
};

const emergencyStatusTextStyle = {
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 600,
  lineHeight: 1.4,
};

// ─── Tab Navigation Styles ──────────────────────────────────────────────────

const tabNavStyle = {
  display: "flex",
  gap: "4px",
  marginBottom: "20px",
  overflowX: "auto",
  paddingBottom: "4px",
};

const tabButtonStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
  padding: "10px 8px",
  borderRadius: "14px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: COLORS.cardBorder,
  backgroundColor: COLORS.cardBg,
  color: COLORS.lightGray,
  fontSize: "11px",
  fontWeight: 700,
  cursor: "pointer",
  transition: "all 0.2s ease",
  minWidth: "70px",
};

const activeTabStyle = {
  backgroundColor: "rgba(0, 166, 81, 0.15)",
  borderColor: COLORS.primaryGreen,
  color: COLORS.primaryGreen,
};

const tabIconStyle = {
  fontSize: "18px",
};

const tabLabelStyle = {
  whiteSpace: "nowrap",
};

// ─── Tab Content Styles ─────────────────────────────────────────────────────

const tabContentStyle = {
  marginTop: "4px",
};

const sectionDescStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  marginBottom: "16px",
};

// ─── Help Center Styles ─────────────────────────────────────────────────────

const categoryGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
};

const categoryCardStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "8px",
  padding: "20px 12px",
  borderRadius: "14px",
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
  cursor: "pointer",
  transition: "border-color 0.2s ease",
};

const categoryIconStyle = {
  fontSize: "28px",
};

const categoryLabelStyle = {
  color: COLORS.white,
  fontSize: "12px",
  fontWeight: 700,
  textAlign: "center",
};

const backButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "8px 12px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  color: COLORS.primaryGreen,
  fontSize: "13px",
  fontWeight: 700,
  cursor: "pointer",
  marginBottom: "12px",
};

const categoryTitleStyle = {
  color: COLORS.white,
  fontSize: "16px",
  fontWeight: 800,
  marginBottom: "12px",
};

const articleListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const articleCardStyle = {
  padding: "14px 16px",
  borderRadius: "12px",
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
};

const articleTitleStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 700,
  margin: "0 0 4px 0",
};

const articleSummaryStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  margin: 0,
  lineHeight: 1.4,
};

// ─── Contact Form Styles ────────────────────────────────────────────────────

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const formGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const formLabelStyle = {
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 700,
};

const formInputStyle = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1px solid ${COLORS.cardBorder}`,
  backgroundColor: COLORS.cardBg,
  color: COLORS.white,
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.2s ease",
};

const formTextareaStyle = {
  padding: "12px 14px",
  borderRadius: "12px",
  border: `1px solid ${COLORS.cardBorder}`,
  backgroundColor: COLORS.cardBg,
  color: COLORS.white,
  fontSize: "14px",
  outline: "none",
  resize: "vertical",
  minHeight: "100px",
  fontFamily: "inherit",
  transition: "border-color 0.2s ease",
};

const submitButtonStyle = {
  padding: "14px 24px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
  transition: "opacity 0.2s ease",
};

const successMessageStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 14px",
  backgroundColor: "rgba(16, 185, 129, 0.12)",
  border: `1px solid ${COLORS.successGreen}`,
  borderRadius: "10px",
  color: COLORS.successGreen,
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "16px",
};

const errorMessageStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 14px",
  backgroundColor: "rgba(239, 68, 68, 0.12)",
  border: `1px solid ${COLORS.errorRed}`,
  borderRadius: "10px",
  color: COLORS.errorRed,
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "16px",
};

const lostFoundNoticeStyle = {
  padding: "12px 14px",
  backgroundColor: "rgba(59, 130, 246, 0.12)",
  border: `1px solid ${COLORS.chatBlue}`,
  borderRadius: "12px",
  color: COLORS.white,
  fontSize: "13px",
  lineHeight: 1.5,
  marginBottom: "16px",
};

// ─── Live Chat Styles ───────────────────────────────────────────────────────

const chatInitiateStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const chatStartButtonStyle = {
  padding: "14px 24px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: COLORS.chatBlue,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
  textAlign: "center",
  transition: "opacity 0.2s ease",
};

const queueConfirmationStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  padding: "16px",
  backgroundColor: "rgba(16, 185, 129, 0.1)",
  border: `1px solid ${COLORS.successGreen}`,
  borderRadius: "14px",
  marginBottom: "16px",
};

const queueIconStyle = {
  fontSize: "20px",
  flexShrink: 0,
  marginTop: "2px",
};

const queueTitleStyle = {
  color: COLORS.successGreen,
  fontSize: "14px",
  fontWeight: 800,
  display: "block",
  marginBottom: "4px",
};

const queueMessageStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  margin: 0,
  lineHeight: 1.5,
};

// ─── FAQ Styles ─────────────────────────────────────────────────────────────

const searchContainerStyle = {
  position: "relative",
  marginBottom: "16px",
};

const searchInputStyle = {
  width: "100%",
  padding: "12px 40px 12px 14px",
  borderRadius: "12px",
  border: `1px solid ${COLORS.cardBorder}`,
  backgroundColor: COLORS.cardBg,
  color: COLORS.white,
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s ease",
};

const searchClearStyle = {
  position: "absolute",
  right: "12px",
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  color: COLORS.lightGray,
  fontSize: "16px",
  cursor: "pointer",
  padding: "4px",
};

const faqLoadingStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  textAlign: "center",
  padding: "20px 0",
};

const emptyStateStyle = {
  textAlign: "center",
  padding: "32px 16px",
};

const emptyTextStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "4px",
};

const emptyHintStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
};

const faqListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const faqCategoriesStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "20px",
};

const faqCategoryGroupStyle = {
  marginBottom: "4px",
};

const faqCategoryTitleStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 800,
  marginBottom: "8px",
};

const faqItemStyle = {
  borderRadius: "10px",
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
  overflow: "hidden",
  marginBottom: "6px",
};

const faqQuestionStyle = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 14px",
  border: "none",
  backgroundColor: "transparent",
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "left",
};

const faqQuestionTextStyle = {
  flex: 1,
  paddingRight: "8px",
};

const faqExpandIconStyle = {
  color: COLORS.primaryGreen,
  fontSize: "18px",
  fontWeight: 700,
  flexShrink: 0,
};

const faqAnswerStyle = {
  padding: "0 14px 12px",
};

const faqAnswerTextStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  lineHeight: 1.5,
  margin: 0,
};

// ─── Safety Center Styles ───────────────────────────────────────────────────

const safetyEmergencyBannerStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  padding: "16px",
  backgroundColor: "rgba(220, 38, 38, 0.1)",
  border: `1px solid ${COLORS.emergencyRed}`,
  borderRadius: "14px",
  marginBottom: "20px",
};

const safetyEmergencyIconStyle = {
  fontSize: "28px",
  flexShrink: 0,
};

const safetyEmergencyContentStyle = {
  flex: 1,
};

const safetyEmergencyTitleStyle = {
  color: COLORS.emergencyRed,
  fontSize: "14px",
  fontWeight: 800,
  display: "block",
  marginBottom: "4px",
};

const safetyEmergencyDescStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  margin: 0,
  lineHeight: 1.5,
};

const safetySectionTitleStyle = {
  color: COLORS.white,
  fontSize: "15px",
  fontWeight: 800,
  marginBottom: "12px",
};

const safetyResourcesListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const safetyResourceCardStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  padding: "14px 16px",
  borderRadius: "12px",
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
};

const safetyResourceIconStyle = {
  fontSize: "22px",
  flexShrink: 0,
  marginTop: "2px",
};

const safetyResourceContentStyle = {
  flex: 1,
};

const safetyResourceTitleStyle = {
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 700,
  margin: "0 0 4px 0",
};

const safetyResourceDescStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  margin: 0,
  lineHeight: 1.4,
};
