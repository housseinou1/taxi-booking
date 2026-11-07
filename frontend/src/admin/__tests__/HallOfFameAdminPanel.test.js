/*
 * Two Testing Library lint rules are relaxed for this file, deliberately:
 *
 *  - `prefer-screen-queries`: the Hall of Fame renders the same strings in several
 *    places (a recognition title appears on its award card, in the milestone strip
 *    and in the history table), so assertions MUST be scoped with `within(section)`
 *    to stay unambiguous. That is not the `render()`-destructuring anti-pattern the
 *    rule targets.
 *  - `no-node-access`: resolving "the KPI card containing this label" and "the
 *    section containing this heading" needs `closest()`.
 *
 * Both are already present in the existing fleet/academy test files.
 */
/* eslint-disable testing-library/prefer-screen-queries, testing-library/no-node-access */

import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import HallOfFameAdminPanel from "../HallOfFameAdminPanel";

/**
 * Fixture recognitions in the exact shape `serialize_recognition()` returns.
 *
 * Spans TWO reporting periods (September and October 2026) so the "never mix
 * rankings from different periods" behaviour is genuinely exercised, plus an
 * all-time milestone (month = null).
 */
const RECOGNITIONS = [
  {
    id: 1,
    driver_id: 11,
    driver_name: "Aicha Mint Ahmed",
    driver_photo: "",
    category: "driver_of_month",
    badge: "gold",
    title: "Driver of the Month",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: 9,
    rank: 1,
    lifetime_completed_rides: 812,
    years_with_yala: 3,
    performance_score: 96.5,
    metadata: { monthly_completed_rides: 210, monthly_rating: 4.9 },
    awarded_at: "2026-09-30T18:00:00Z",
  },
  {
    id: 2,
    driver_id: 12,
    driver_name: "Mohamed Ould Sidi",
    driver_photo: "",
    category: "lifetime_milestone",
    badge: "silver",
    title: "1,000 rides",
    city_id: null,
    city: "",
    year: 2026,
    month: null,
    rank: 1,
    lifetime_completed_rides: 1000,
    years_with_yala: 5,
    performance_score: 88,
    metadata: { rides_required: 1000 },
    awarded_at: "2026-08-02T09:30:00Z",
  },
  {
    id: 3,
    driver_id: 13,
    driver_name: "Fatima Sow",
    driver_photo: "",
    category: "top_national",
    badge: "gold",
    title: "#1 Driver in Mauritania",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: 9,
    rank: 1,
    lifetime_completed_rides: 1500,
    years_with_yala: 4,
    performance_score: 94,
    metadata: { monthly_completed_rides: 260, monthly_rating: 4.8 },
    awarded_at: "2026-09-30T18:05:00Z",
  },
  {
    id: 4,
    driver_id: 14,
    driver_name: "Moussa Ba",
    driver_photo: "",
    category: "top_national",
    badge: "silver",
    title: "#2 Driver in Mauritania",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: 9,
    rank: 2,
    lifetime_completed_rides: 640,
    years_with_yala: 2,
    performance_score: 91,
    metadata: { monthly_completed_rides: 240, monthly_rating: 4.7 },
    awarded_at: "2026-09-30T18:06:00Z",
  },
  {
    id: 5,
    driver_id: 15,
    driver_name: "Khadija Ould",
    driver_photo: "",
    category: "top_national",
    badge: "bronze",
    title: "#1 Driver in Mauritania",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: 10,
    rank: 1,
    lifetime_completed_rides: 990,
    years_with_yala: 3,
    performance_score: 90,
    metadata: { monthly_completed_rides: 300, monthly_rating: 4.6 },
    awarded_at: "2026-10-31T18:00:00Z",
  },
  {
    id: 6,
    driver_id: 16,
    driver_name: "Amadou Diallo",
    driver_photo: "",
    category: "top_city",
    badge: "gold",
    title: "#1 Driver in Nouakchott",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: 9,
    rank: 1,
    lifetime_completed_rides: 700,
    years_with_yala: 2,
    performance_score: 89,
    metadata: { monthly_completed_rides: 205, monthly_rating: 4.5 },
    awarded_at: "2026-09-30T18:10:00Z",
  },
  {
    id: 7,
    driver_id: 17,
    driver_name: "Zeinab Mint Ely",
    driver_photo: "",
    category: "top_city",
    badge: "silver",
    title: "#2 Driver in Nouakchott",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: 9,
    rank: 2,
    lifetime_completed_rides: 520,
    years_with_yala: 1,
    performance_score: 86,
    metadata: { monthly_completed_rides: 180, monthly_rating: 4.4 },
    awarded_at: "2026-09-30T18:11:00Z",
  },
  {
    id: 8,
    driver_id: 18,
    driver_name: "Ibrahim Ould Baba",
    driver_photo: "",
    category: "top_city",
    badge: "gold",
    title: "#1 Driver in Nouakchott",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: 10,
    rank: 1,
    lifetime_completed_rides: 810,
    years_with_yala: 4,
    performance_score: 93,
    metadata: { monthly_completed_rides: 285, monthly_rating: 4.9 },
    awarded_at: "2026-10-31T18:00:00Z",
  },
  {
    id: 9,
    driver_id: 19,
    driver_name: "Sidi Ould Cheikh",
    driver_photo: "",
    category: "lifetime_milestone",
    badge: "gold",
    title: "5 Years with Yala",
    city_id: 1,
    city: "Nouakchott",
    year: 2026,
    month: null,
    rank: 1,
    lifetime_completed_rides: 2400,
    years_with_yala: 5,
    performance_score: 87,
    metadata: { years_required: 5 },
    awarded_at: "2026-07-15T09:00:00Z",
  },
];

/** The two recognitions the ORIGINAL suite asserted against, kept intact. */
const LEGACY_FIXTURE = [RECOGNITIONS[0], RECOGNITIONS[1]];

function mockFetch({ members = RECOGNITIONS, ok = true, detail = "", cities = true } = {}) {
  const calls = [];
  global.fetch = jest.fn((url, options) => {
    calls.push({ url: String(url), options });
    if (
      String(url).includes("/locations/operating-cities/") ||
      String(url).includes("/locations/cities/")
    ) {
      return Promise.resolve({
        ok: cities,
        json: () =>
          Promise.resolve(
            cities ? { cities: [{ id: "c1", name: "Nouakchott", region: "Nouakchott" }] } : { cities: [] }
          ),
      });
    }
    return Promise.resolve({
      ok,
      status: ok ? 200 : 403,
      json: () => Promise.resolve(ok ? { year: 2026, city: "", members } : { detail }),
    });
  });
  return calls;
}

afterEach(() => {
  jest.resetAllMocks();
});

/** The KPI card containing the given label - keeps value assertions unambiguous. */
function kpi(label) {
  const [node] = screen.getAllByText(label, { selector: ".fleet-kpi__label" });
  const card = node?.closest(".fleet-kpi");
  if (!card) throw new Error(`No KPI card found for "${label}"`);
  return within(card);
}

/** The section whose SectionHead title matches - scopes repeated award titles. */
function section(title) {
  const heading = screen.getByRole("heading", { level: 2, name: title });
  const node = heading.closest("section");
  if (!node) throw new Error(`No <section> found for "${title}"`);
  return within(node);
}

/* -- Tests preserved from the original suite --------------------------------- */

test("reuses the existing admin endpoint and renders real recognitions", async () => {
  const calls = mockFetch({ members: LEGACY_FIXTURE });
  render(<HallOfFameAdminPanel />);

  await screen.findByRole("table", { name: "Recognition history" });
  expect(section("Monthly Excellence Awards").getByText("Aicha Mint Ahmed")).toBeInTheDocument();
  expect(section("Driver Loyalty & Milestones").getByText("1,000 rides")).toBeInTheDocument();
  // Category label is rendered on the recognition card.
  expect(screen.getAllByText("Driver of the Month").length).toBeGreaterThan(0);
  expect(calls.some((call) => call.url.includes("/drivers/hall-of-fame/admin/"))).toBe(true);
});

test("reports only figures derived from the API response", async () => {
  mockFetch({ members: LEGACY_FIXTURE });
  render(<HallOfFameAdminPanel />);

  await screen.findByRole("table", { name: "Recognition history" });

  // Two recognitions, two distinct drivers, two distinct categories, best score 96.5.
  expect(kpi("Total Recognitions").getByText("2")).toBeInTheDocument();
  expect(kpi("Recognized Drivers").getByText("2")).toBeInTheDocument();
  expect(kpi("Award Categories").getByText("2")).toBeInTheDocument();
  expect(kpi("Best Performance Score").getByText("96.5")).toBeInTheDocument();
});

test("reporting period and city filters are sent to the existing endpoint", async () => {
  const calls = mockFetch({ members: LEGACY_FIXTURE });
  render(<HallOfFameAdminPanel />);

  await screen.findByRole("table", { name: "Recognition history" });
  await screen.findByRole("option", { name: "Nouakchott" });

  fireEvent.change(screen.getByLabelText("Reporting period"), { target: { value: "9" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "c1" } });

  await waitFor(() => expect(calls[calls.length - 1].url).toContain("city=c1"));
  const last = calls[calls.length - 1].url;
  expect(last).toContain("/drivers/hall-of-fame/admin/");
  expect(last).toContain("month=9");
});

test("a category filter narrows the rendered recognitions", async () => {
  mockFetch({ members: LEGACY_FIXTURE });
  render(<HallOfFameAdminPanel />);

  await screen.findByRole("table", { name: "Recognition history" });
  expect(section("Driver Loyalty & Milestones").getByText("1,000 rides")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "lifetime_milestone" },
  });

  await waitFor(() => expect(screen.queryByText("Aicha Mint Ahmed")).toBeNull());
  expect(section("Driver Loyalty & Milestones").getByText("1,000 rides")).toBeInTheDocument();
});

test("an API failure is surfaced without crashing or fabricating data", async () => {
  mockFetch({ ok: false, detail: "Authentication credentials were not provided." });
  render(<HallOfFameAdminPanel />);

  expect(
    await screen.findByText("Authentication credentials were not provided.")
  ).toBeInTheDocument();
  expect(screen.queryByText("Aicha Mint Ahmed")).toBeNull();
});

test("never issues a write request - the module is read-only", async () => {
  const calls = mockFetch({ members: LEGACY_FIXTURE });
  render(<HallOfFameAdminPanel />);

  await screen.findByRole("table", { name: "Recognition history" });

  calls.forEach((call) => {
    const method = (call.options?.method || "GET").toUpperCase();
    expect(["GET", "HEAD", "OPTIONS"]).toContain(method);
  });
});


/* -- Redesign: header, overview and filters ---------------------------------- */

test("renders one page title, the subtitle and the reporting period", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  // Exactly one <h1>: App.js passes title="" so the shell adds no second one.
  const headings = screen.getAllByRole("heading", { level: 1 });
  expect(headings).toHaveLength(1);
  expect(headings[0]).toHaveTextContent("YALA Hall of Fame");
  expect(
    screen.getByText("Recognizing excellence, outstanding performance, and driver loyalty.")
  ).toBeInTheDocument();
  // Reporting-period indicator (scoped to the chip - the select also says "Full year").
  const period = screen.getByText(/Reporting period:/i);
  expect(within(period).getByText(/Full year \d{4}/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
});

test("renders the four required overview metrics with their units", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  expect(kpi("Total Recognitions").getByText("9")).toBeInTheDocument();
  // 9 recognitions across 9 distinct drivers in this fixture.
  expect(kpi("Recognized Drivers").getByText("9")).toBeInTheDocument();
  // driver_of_month, lifetime_milestone, top_national, top_city
  expect(kpi("Award Categories").getByText("4")).toBeInTheDocument();
  expect(kpi("Best Performance Score").getByText("96.5")).toBeInTheDocument();

  expect(kpi("Total Recognitions").getByText("awards")).toBeInTheDocument();
  expect(kpi("Recognized Drivers").getByText("drivers")).toBeInTheDocument();
  expect(kpi("Award Categories").getByText("categories")).toBeInTheDocument();
  expect(kpi("Best Performance Score").getByText("/100")).toBeInTheDocument();
});

test("states the scope the overview totals were computed over", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  // The scope note must say the totals follow the period/city, and that the
  // category filter does not change them.
  expect(screen.getByText(/They change with the Reporting period, Year and City/i)).toBeInTheDocument();
  expect(screen.getByText(/without/i)).toBeInTheDocument();
});

test("offers only the filter choices the recognition engine supports", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  expect(screen.getByLabelText("Reporting period")).toBeInTheDocument();
  expect(screen.getByLabelText("Year")).toBeInTheDocument();
  expect(screen.getByLabelText("City")).toBeInTheDocument();
  const category = screen.getByLabelText("Category");

  // Exactly the four categories in HallOfFameRecognition.CATEGORY_CHOICES.
  const options = within(category)
    .getAllByRole("option")
    .map((option) => option.textContent.trim());
  expect(options).toEqual([
    "All categories",
    "Driver of the Month",
    "Top Driver in Mauritania",
    "Top Driver by City",
    "Lifetime Milestone",
  ]);
});

test("the year filter is sent to the endpoint and reset restores defaults", async () => {
  const calls = mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  fireEvent.change(screen.getByLabelText("Year"), { target: { value: "2025" } });
  await waitFor(() => expect(calls[calls.length - 1].url).toContain("year=2025"));

  fireEvent.change(screen.getByLabelText("City"), { target: { value: "c1" } });
  await waitFor(() => expect(calls[calls.length - 1].url).toContain("city=c1"));

  fireEvent.click(screen.getByRole("button", { name: "Reset Filters" }));

  await waitFor(() =>
    expect(calls[calls.length - 1].url).toContain(`year=${new Date().getFullYear()}`)
  );
  const last = calls[calls.length - 1].url;
  expect(last).not.toContain("city=");
  expect(last).not.toContain("month=");
});


/* -- Redesign: recognition showcase ------------------------------------------ */

test("presents the monthly winner in the Monthly Excellence Awards showcase", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const monthly = section("Monthly Excellence Awards");
  expect(monthly.getByText("Driver of the Month")).toBeInTheDocument();
  expect(monthly.getByText("Aicha Mint Ahmed")).toBeInTheDocument();
  // Achievement statistics from the recognition record itself.
  expect(monthly.getByText("210")).toBeInTheDocument(); // rides in period
  expect(monthly.getByText("4.9/5")).toBeInTheDocument(); // period rating
  expect(monthly.getByText("96.5/100")).toBeInTheDocument(); // performance score
  expect(monthly.getByText("September 2026")).toBeInTheDocument();
  expect(monthly.getByText(/Nouakchott/)).toBeInTheDocument();
});

test("shows the award tier supplied by the engine, never a derived one", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const monthly = section("Monthly Excellence Awards");
  expect(monthly.getByText("Gold", { selector: ".hof-award__tier" })).toBeInTheDocument();

  const milestones = section("Driver Loyalty & Milestones");
  // The engine stores silver on the 1,000-ride milestone and gold on 5 years.
  expect(milestones.getByText("Silver", { selector: ".hof-award__tier" })).toBeInTheDocument();
  expect(milestones.getByText("Gold", { selector: ".hof-award__tier" })).toBeInTheDocument();
});

test("never shows a placing on a category the engine does not rank", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  // Lifetime milestones store a default rank of 1, which is not a competition
  // placing, so the milestone section must not render "#1".
  const milestones = section("Driver Loyalty & Milestones");
  expect(milestones.queryByText(/#1\b/)).toBeNull();
  expect(milestones.queryByText(/Rank #1/)).toBeNull();

  // The ranked category does show it.
  expect(section("Monthly Excellence Awards").queryByText("Rank #1")).toBeNull();
  expect(
    section("YALA National Excellence").getAllByText("#1").length
  ).toBeGreaterThan(0);
});

test("keeps national placings from different reporting periods separate", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const national = section("YALA National Excellence");
  // One panel per reporting period - the panel titles carry the period label.
  expect(national.getByRole("heading", { level: 3, name: "September 2026" })).toBeInTheDocument();
  expect(national.getByRole("heading", { level: 3, name: "October 2026" })).toBeInTheDocument();

  const tables = national.getAllByRole("table", { name: /National placings/ });
  expect(tables).toHaveLength(2);

  // Newest period first: October holds one placing, September holds two.
  expect(within(tables[0]).getAllByRole("row")).toHaveLength(2);
  expect(within(tables[1]).getAllByRole("row")).toHaveLength(3);

  // September's board must not contain October's winner, and vice versa.
  expect(within(tables[1]).queryByText("Khadija Ould")).toBeNull();
  expect(within(tables[0]).queryByText("Fatima Sow")).toBeNull();
  expect(within(tables[0]).getByText("Khadija Ould")).toBeInTheDocument();
});

test("groups the city leaderboard by period and keeps the city column", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const city = section("City Leaderboards");
  const tables = city.getAllByRole("table", { name: /City placings/ });
  expect(tables).toHaveLength(2);

  const headers = within(tables[0])
    .getAllByRole("columnheader")
    .map((header) => header.textContent.trim());
  ["Rank", "Driver", "City", "Recognition", "Performance score", "Period"].forEach((column) => {
    expect(headers.some((header) => header.startsWith(column))).toBe(true);
  });

  // October first (1 placing), then September (2 placings).
  expect(within(tables[0]).getAllByRole("row")).toHaveLength(2);
  expect(within(tables[1]).getAllByRole("row")).toHaveLength(3);
  expect(within(tables[1]).getByText("Amadou Diallo")).toBeInTheDocument();
});

test("lists loyalty milestones with their engine threshold", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const milestones = section("Driver Loyalty & Milestones");
  expect(milestones.getByText("1,000 rides")).toBeInTheDocument();
  expect(milestones.getByText("5 Years with Yala")).toBeInTheDocument();
  // All-time records are labelled as such rather than folded into a month.
  expect(milestones.getAllByText(/all-time/).length).toBe(2);
});


/* -- Redesign: recognition history ------------------------------------------- */

/** Generate N recognitions so pagination is genuinely exercised. */
function manyRecognitions(count) {
  return Array.from({ length: count }, (_, index) => ({
    ...RECOGNITIONS[5],
    id: 100 + index,
    driver_id: 200 + index,
    driver_name: `Driver Number ${index + 1}`,
    title: `#1 Driver in Nouakchott`,
    performance_score: 70 + (index % 30),
    awarded_at: `2026-09-${String((index % 28) + 1).padStart(2, "0")}T10:00:00Z`,
  }));
}

test("renders the recognition history with every required column", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const history = within(screen.getByRole("table", { name: "Recognition history" }));
  ["Date", "Driver", "Category", "City", "Award", "Score"].forEach((column) => {
    expect(history.getByRole("columnheader", { name: new RegExp(column, "i") })).toBeInTheDocument();
  });
  expect(history.getAllByRole("row")).toHaveLength(RECOGNITIONS.length + 1);
  expect(history.getByText("Mohamed Ould Sidi")).toBeInTheDocument();
});

test("sorts the recognition history by driver", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const table = screen.getByRole("table", { name: "Recognition history" });
  fireEvent.click(within(table).getByRole("button", { name: /^Driver/ }));

  await waitFor(() => {
    const first = within(table).getAllByRole("row")[1];
    expect(within(first).getByText("Aicha Mint Ahmed")).toBeInTheDocument();
  });
});

test("paginates the recognition history", async () => {
  mockFetch({ members: manyRecognitions(30) });
  render(<HallOfFameAdminPanel />);
  await screen.findByText("Driver Number 1");

  const history = within(screen.getByRole("table", { name: "Recognition history" }));
  expect(history.getAllByRole("row")).toHaveLength(13); // header + 12
  expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText(/Page 2 of 3/);
  expect(
    within(screen.getByRole("table", { name: "Recognition history" })).getAllByRole("row")
  ).toHaveLength(13);
});

test("opens a full recognition record from the history", async () => {
  mockFetch();
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  const table = screen.getByRole("table", { name: "Recognition history" });
  // The 1,000-ride milestone carries a milestone threshold and is not a placing.
  const row = within(table)
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByText("1,000 rides"));
  fireEvent.click(within(row).getByRole("button", { name: /View details for/ }));

  const detail = await screen.findByLabelText("Recognition details");
  expect(within(detail).getByText("Award tier")).toBeInTheDocument();
  expect(within(detail).getByText("Milestone threshold")).toBeInTheDocument();
  expect(within(detail).getAllByText("1,000 rides").length).toBeGreaterThan(0);
  // A lifetime milestone is not a competition placing, so no "Placing" row appears.
  expect(within(detail).queryByText("Placing")).toBeNull();

  fireEvent.click(within(detail).getByRole("button", { name: "Close" }));
  await waitFor(() =>
    expect(screen.queryByLabelText("Recognition details")).not.toBeInTheDocument()
  );
});


/* -- Redesign: the four distinct states -------------------------------------- */

test("shows a loading skeleton while recognitions are being fetched", async () => {
  // A request that never settles keeps the component in its loading state.
  global.fetch = jest.fn(() => new Promise(() => {}));
  render(<HallOfFameAdminPanel />);

  await waitFor(() =>
    expect(document.querySelector(".fleet-skeleton")).toBeInTheDocument()
  );
  // No zero-filled cards while loading.
  expect(document.querySelectorAll(".fleet-kpi")).toHaveLength(0);
  expect(screen.getByRole("button", { name: /refreshing/i })).toBeDisabled();
});

test("distinguishes 'no records exist' from 'no records match the filters'", async () => {
  mockFetch({ members: [] });
  render(<HallOfFameAdminPanel />);

  const empty = await screen.findByText("No Recognitions Found");
  expect(empty).toBeInTheDocument();
  // No filters are applied, so this is genuinely an empty period.
  expect(screen.getByText(/has produced no Hall of Fame awards for/i)).toBeInTheDocument();
  expect(screen.queryByText(/Try adjusting your filters/i)).toBeNull();
  // The best-score card must not claim 0.
  expect(kpi("Best Performance Score").getByText("\u2014")).toBeInTheDocument();
  expect(kpi("Best Performance Score").getByText(/No recognitions in this period/i)).toBeInTheDocument();
});

test("offers a working Reset Filters action when filters exclude every record", async () => {
  mockFetch({ members: LEGACY_FIXTURE });
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "top_national" },
  });

  await screen.findByText("No Recognitions Found");
  expect(
    screen.getByText(/no Hall of Fame recognitions matching the selected reporting period, city, and category/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/Try adjusting your filters to view other recognition records/i)).toBeInTheDocument();

  // The empty-state action restores the records.
  fireEvent.click(
    section("Recognition results").getByRole("button", { name: "Reset Filters" })
  );
  await screen.findByRole("table", { name: "Recognition history" });
});

test("never shows zero statistics when the request fails", async () => {
  mockFetch({ ok: false, detail: "Unable to reach the Hall of Fame service." });
  render(<HallOfFameAdminPanel />);

  await screen.findByRole("alert");

  // Every overview card reports the gap instead of a fabricated zero.
  ["Total Recognitions", "Recognized Drivers", "Award Categories", "Best Performance Score"].forEach(
    (label) => {
      const card = kpi(label);
      expect(card.getByText("Not available")).toBeInTheDocument();
      expect(card.queryByText("0")).toBeNull();
    }
  );

  // The error is retryable and no recognition content is rendered.
  expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  expect(screen.queryByText("Aicha Mint Ahmed")).toBeNull();
  expect(screen.queryByRole("table", { name: "Recognition history" })).toBeNull();
});

test("hides a section that has no recognitions instead of leaving a blank panel", async () => {
  mockFetch({ members: [RECOGNITIONS[0]] }); // only a driver_of_month record
  render(<HallOfFameAdminPanel />);
  await screen.findByRole("table", { name: "Recognition history" });

  expect(
    screen.getByRole("heading", { level: 2, name: "Monthly Excellence Awards" })
  ).toBeInTheDocument();
  ["YALA National Excellence", "City Leaderboards", "Driver Loyalty & Milestones"].forEach((title) => {
    expect(screen.queryByRole("heading", { level: 2, name: title })).toBeNull();
  });
  // The history still lists the single record.
  expect(
    within(screen.getByRole("table", { name: "Recognition history" })).getAllByRole("row")
  ).toHaveLength(2);
});

