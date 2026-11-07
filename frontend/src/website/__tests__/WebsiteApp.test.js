import React from "react";
import { render, screen } from "@testing-library/react";

import WebsiteApp, { WEBSITE_ROUTES } from "../WebsiteApp";
import HomePage from "../HomePage";
import FounderCard, { CEO_CONTACT } from "../FounderCard";
import { WEBSITE_I18N, normalizeWebsiteLang } from "../websiteI18n";

/* The website reads the app's i18n language. Stub it so tests are deterministic. */
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: global.__ysLang || "en", changeLanguage: () => {} } }),
}));

const tFor = (lang) => (key) => WEBSITE_I18N[lang][key] ?? key;

describe("website translations", () => {
  test("all three languages exist", () => {
    expect(Object.keys(WEBSITE_I18N).sort()).toEqual(["ar", "en", "fr"]);
  });

  test("EN/FR/AR have identical key sets", () => {
    const en = Object.keys(WEBSITE_I18N.en).sort();
    expect(Object.keys(WEBSITE_I18N.fr).sort()).toEqual(en);
    expect(Object.keys(WEBSITE_I18N.ar).sort()).toEqual(en);
    expect(en.length).toBeGreaterThan(80);
  });

  test("normalizeWebsiteLang maps variants", () => {
    expect(normalizeWebsiteLang("fr-FR")).toBe("fr");
    expect(normalizeWebsiteLang("ar")).toBe("ar");
    expect(normalizeWebsiteLang("en-GB")).toBe("en");
    expect(normalizeWebsiteLang(undefined)).toBe("en");
    expect(normalizeWebsiteLang("de")).toBe("en");
  });
});

describe("WebsiteApp shell", () => {
  beforeEach(() => { global.__ysLang = "en"; });

  test("renders header, main and footer", () => {
    render(<WebsiteApp route="home" />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  test("exposes marketing navigation (home, services, cities, partners, about, support)", () => {
    render(<WebsiteApp route="home" />);
    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    expect(nav.textContent).toMatch(/Home/);
    expect(nav.textContent).toMatch(/Services/);
    expect(nav.textContent).toMatch(/Cities/);
    expect(nav.textContent).toMatch(/Partners/);
    expect(nav.textContent).toMatch(/About Us/);
    expect(nav.textContent).toMatch(/Support/);
    expect(WEBSITE_ROUTES).toHaveLength(8);
  });

  test("marks the active route with aria-current", () => {
    render(<WebsiteApp route="home" />);
    const nav = screen.getByRole("navigation", { name: /main navigation/i });
    expect(nav.querySelector('[aria-current="page"]').getAttribute("data-route")).toBe("home");
  });

  test("language selector offers EN, FR, and AR", () => {
    render(<WebsiteApp route="home" />);
    const select = screen.getByLabelText(/language/i);
    const options = [...select.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["EN", "FR", "AR"]);
    expect(select.value).toBe("en");
  });

  test("no Admin console reference anywhere in the public site", () => {
    const { container } = render(<WebsiteApp route="home" />);
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") || "");
    expect(links.some((h) => /admin/i.test(h))).toBe(false);
    expect(/admin/i.test(container.textContent)).toBe(false);
  });

  test("home highlights nationwide coverage without invented ops statistics", () => {
    const { container } = render(<WebsiteApp route="home" />);
    const text = container.textContent;
    expect(text).toMatch(/13 major cities/i);
    expect(text).not.toContain("148");
  });
});

describe("customer support contact", () => {
  test("footer carries phone, WhatsApp and support email", () => {
    const { container } = render(<WebsiteApp route="home" />);
    expect(container.querySelector('a[href="tel:+22222114373"]')).toBeTruthy();
    expect(container.querySelector('a[href="https://wa.me/19293036846"]')).toBeTruthy();
    expect(container.querySelector('a[href="mailto:support@yalataxi.live"]')).toBeTruthy();
    expect(container.innerHTML).not.toContain("tel:+22114373");
  });

  test("WhatsApp link opens safely", () => {
    const { container } = render(<WebsiteApp route="home" />);
    const wa = container.querySelector('a[href="https://wa.me/19293036846"]');
    expect(wa.getAttribute("rel")).toContain("noopener");
    expect(wa.getAttribute("target")).toBe("_blank");
  });
});

describe("founder / CEO card", () => {
  test("shows name, role, company and tagline", () => {
    render(<FounderCard t={tFor("en")} />);
    expect(screen.getByText("Housseinou Sakho")).toBeInTheDocument();
    expect(screen.getByText("Chief Executive Officer (CEO)")).toBeInTheDocument();
    expect(screen.getByText("YALA Technologies")).toBeInTheDocument();
    // tagline shares its element with the company name, so match loosely
    expect(screen.getByText(/Moving Mauritania Forward/)).toBeInTheDocument();
  });

  test("email and website are clickable", () => {
    const { container } = render(<FounderCard t={tFor("en")} />);
    expect(container.querySelector('a[href="mailto:sakho@yalataxi.live"]')).toBeTruthy();
    expect(container.querySelector('a[href="https://www.yalataxi.live"]')).toBeTruthy();
  });

  test("CEO email is separate from the support email", () => {
    expect(CEO_CONTACT.email).toBe("sakho@yalataxi.live");
    expect(CEO_CONTACT.email).not.toBe("support@yalataxi.live");
  });

  test("is not required on the marketing hero (lives on About when needed)", () => {
    const { container } = render(<HomePage t={tFor("en")} />);
    expect(container.querySelector(".ys-founder")).toBeNull();
    expect(screen.getByText("YALA Technologies")).toBeInTheDocument();
  });

  test("renders in French and Arabic", () => {
    const fr = render(<FounderCard t={tFor("fr")} />);
    expect(fr.getByText("Directeur Général (CEO)")).toBeInTheDocument();
    fr.unmount();
    const ar = render(<FounderCard t={tFor("ar")} />);
    expect(ar.getByText("الرئيس التنفيذي (CEO)")).toBeInTheDocument();
  });
});

describe("Home page", () => {
  test("renders hero, three app cards, and four why-yala pillars", () => {
    const { container } = render(<HomePage t={tFor("en")} />);
    expect(container.querySelector(".ys-hero-mr")).toBeTruthy();
    expect(container.querySelectorAll(".ys-app-card")).toHaveLength(3);
    expect(container.querySelectorAll(".ys-why__item")).toHaveLength(4);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  test("renders French and Arabic copy", () => {
    const fr = render(<HomePage t={tFor("fr")} />);
    expect(fr.getByText(/Pourquoi choisir YALA Technologies/)).toBeInTheDocument();
    fr.unmount();
    const ar = render(<HomePage t={tFor("ar")} />);
    expect(ar.getByText(/لماذا تختار YALA Technologies/)).toBeInTheDocument();
  });
});

describe("RTL", () => {
  test("Arabic sets dir=rtl on the site root", () => {
    global.__ysLang = "ar";
    const { container } = render(<WebsiteApp route="home" />);
    expect(container.querySelector(".yala-site").getAttribute("dir")).toBe("rtl");
    global.__ysLang = "en";
  });

  test("English sets dir=ltr", () => {
    global.__ysLang = "en";
    const { container } = render(<WebsiteApp route="home" />);
    expect(container.querySelector(".yala-site").getAttribute("dir")).toBe("ltr");
  });
});

