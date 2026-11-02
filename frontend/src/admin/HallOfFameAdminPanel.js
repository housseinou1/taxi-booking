import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  Pager,
  Panel,
  SectionHead,
  SortHeader,
  UnavailableKpi,
  formatCount,
  initials,
} from "./fleet/fleetUi";
// Shared enterprise kit (the same primitives the Fleet, Vehicle and Academy pages
// use) so the Hall of Fame matches the rest of the Admin Dashboard.
import "./fleet/fleetUi.css";
import { fetchCityOptions, fetchRecognitions } from "./hallOfFameApi";
import {
  DASH,
  MONTHS,
  RECOGNITION_CATEGORIES,
  badgeMeta,
  categoryLabel,
  categoryMeta,
  formatAwardDate,
  formatScore,
  groupByCategory,
  groupByPeriod,
  isRankedCategory,
  milestoneRequirement,
  monthlyStats,
  periodLabel,
  recognitionStats,
  selectedPeriodLabel,
} from "./hallOfFameUi";
import "./HallOfFameAdminPanel.css";
import { AdminPageTitle } from "./layouts/AdminPageHeading";

/**
 * YALA Hall of Fame - admin oversight of the driver recognition programme.
 *
 * READ-ONLY BY DESIGN: this panel renders recognitions the backend has already
 * computed (GET /drivers/hall-of-fame/admin/ -> AdminHallOfFameView, IsAdminUser).
 * It never creates, edits or fabricates a ranking, and it adds no endpoint of its
 * own - the existing one is reused as-is.
 *
 * SCOPE OF THE OVERVIEW TOTALS: the endpoint applies `year` always and `month` /
 * `city` optionally, so the four overview cards describe the SERVER-SCOPED set.
 * The Award Category filter is a view filter over that set, so it narrows the
 * sections and the history table without changing the totals. The panel states
 * this explicitly rather than leaving the user to guess.
 *
 * PERIODS ARE NEVER MIXED: monthly rankings are grouped by reporting period before
 * being ranked, because the engine stores one set of placings per month. Lifetime
 * milestones are all-time and are labelled as such.
 */

const HISTORY_PAGE_SIZE = 12;
const FIRST_YEAR = 2020;

/** Stable empty array so `useMemo` dependencies never change identity. */
const EMPTY = [];

/** The current year first, then back to FIRST_YEAR - the engine has no year list. */
function yearOptions(currentYear) {
  const years = [];
  for (let year = currentYear; year >= FIRST_YEAR; year -= 1) years.push(year);
  return years;
}

/* -- Presentational helpers -------------------------------------------------- */

/** Award tier pill. The tier comes straight from the engine's `badge` field. */
function TierBadge({ badge }) {
  const meta = badgeMeta(badge);
  return (
    <span
      className={`hof-award__tier hof-award__tier--${meta.tone}`}
      title={`Award tier: ${meta.label}`}
    >
      {meta.label}
    </span>
  );
}

/** Driver identity with a photo when the engine supplied one, else initials. */
function DriverIdentity({ member }) {
  const name = member.driver_name || "Unknown driver";
  return (
    <div className="hof-award__driver">
      <span className="hof-award__avatar" aria-hidden="true">
        {member.driver_photo ? (
          <img src={member.driver_photo} alt="" />
        ) : (
          initials(name)
        )}
      </span>
      <span>
        <span className="hof-award__name" title={name}>
          {name}
        </span>
        <span className="hof-award__category">
          {categoryLabel(member.category)}
          {member.city ? ` \u00B7 ${member.city}` : ""}
        </span>
      </span>
    </div>
  );
}

/**
 * Recognition showcase card.
 *
 * "Rank #N" is only rendered for the categories whose `rank` is a real competition
 * placing. The engine stores a default rank of 1 on lifetime milestones, which is
 * not a placing and must never be shown as "#1".
 */
function AwardCard({ member, onView }) {
  const tier = badgeMeta(member.badge);
  const stats = monthlyStats(member);
  const requirement = milestoneRequirement(member);

  return (
    <article className={`hof-award hof-award--${tier.tone}`}>
      <div className="hof-award__head">
        <TierBadge badge={member.badge} />
        {isRankedCategory(member.category) && member.rank ? (
          <span className="hof-award__rank">Rank #{member.rank}</span>
        ) : null}
      </div>

      <h4 className="hof-award__title" title={member.title}>
        {member.title || categoryLabel(member.category)}
      </h4>

      <DriverIdentity member={member} />

      <dl className="hof-award__facts">
        <div>
          <dt>Period</dt>
          <dd>{periodLabel(member)}</dd>
        </div>
        <div>
          <dt>Performance score</dt>
          <dd className="hof-award__score">{formatScore(member.performance_score)}/100</dd>
        </div>
        <div>
          <dt>Lifetime rides</dt>
          <dd>{formatCount(member.lifetime_completed_rides)}</dd>
        </div>
        <div>
          <dt>Years with YALA</dt>
          <dd>{formatCount(member.years_with_yala)}</dd>
        </div>
        {stats.rides !== null ? (
          <div>
            <dt>Rides in period</dt>
            <dd>{formatCount(stats.rides)}</dd>
          </div>
        ) : null}
        {stats.rating !== null ? (
          <div>
            <dt>Period rating</dt>
            <dd>{stats.rating}/5</dd>
          </div>
        ) : null}
        {requirement ? (
          <div>
            <dt>Milestone</dt>
            <dd>{requirement}</dd>
          </div>
        ) : null}
        <div>
          <dt>Award date</dt>
          <dd>{formatAwardDate(member.awarded_at)}</dd>
        </div>
      </dl>

      <footer className="hof-award__actions">
        <button type="button" className="fleet-btn fleet-btn--sm" onClick={() => onView(member)}>
          View details
        </button>
      </footer>
    </article>
  );
}

/** Compact milestone strip entry. */
function MilestoneCard({ member, onView }) {
  const meta = categoryMeta(member.category);
  const requirement = milestoneRequirement(member);
  return (
    <article className="hof-milestone">
      <span className="hof-milestone__icon" aria-hidden="true">
        {meta?.icon || "\uD83C\uDF96\uFE0F"}
      </span>
      <span className="hof-milestone__text">
        <span className="hof-milestone__title" title={member.title}>
          {member.title || "Lifetime milestone"}
        </span>
        <span className="hof-milestone__meta">
          {member.driver_name || "Unknown driver"}
          {member.city ? ` \u00B7 ${member.city}` : ""}
          {` \u00B7 ${periodLabel(member)}`}
        </span>
        <span className="hof-milestone__meta">
          {requirement ? `${requirement} \u00B7 ` : ""}
          {`${formatCount(member.lifetime_completed_rides)} lifetime rides`}
        </span>
      </span>
      <span className="hof-milestone__tier">
        <TierBadge badge={member.badge} />
      </span>
      <button
        type="button"
        className="fleet-btn fleet-btn--sm"
        onClick={() => onView(member)}
        aria-label={`View details for ${member.driver_name || "driver"}`}
      >
        Details
      </button>
    </article>
  );
}


/**
 * Ranked leaderboard for a single reporting period.
 *
 * `showCity` is off for the national board (every row is Mauritania-wide) and on
 * for the city boards, where the city is the point of the table.
 */
function LeaderboardTable({ rows, showCity, onView, ariaLabel }) {
  return (
    <div className="fleet-table-wrap">
      <table className="fleet-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            <th scope="col" className="hof-table__rank">
              Rank
            </th>
            <th scope="col">Driver</th>
            {showCity ? <th scope="col">City</th> : null}
            <th scope="col">Recognition</th>
            <th scope="col" className="fleet-table__num">
              Performance score
            </th>
            <th scope="col">Period</th>
            <th scope="col">
              <span className="hof-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((member) => (
            <tr key={member.id}>
              <td className="hof-table__rank">
                {isRankedCategory(member.category) && member.rank ? `#${member.rank}` : DASH}
              </td>
              <td>
                <DriverIdentity member={member} />
              </td>
              {showCity ? <td>{member.city || "Mauritania"}</td> : null}
              <td>
                <span className="hof-strong" title={member.title}>
                  {member.title}
                </span>
                <span className="hof-sub">{categoryLabel(member.category)}</span>
              </td>
              <td className="fleet-table__num hof-table__score">
                {formatScore(member.performance_score)}/100
              </td>
              <td className="hof-table__period">{periodLabel(member)}</td>
              <td>
                <button
                  type="button"
                  className="fleet-btn fleet-btn--sm"
                  onClick={() => onView(member)}
                  aria-label={`View details for ${member.driver_name || "driver"}`}
                >
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Full recognition record, shown when a row or card asks for details. */
function RecognitionDetail({ member, onClose }) {
  const stats = monthlyStats(member);
  const requirement = milestoneRequirement(member);
  const meta = categoryMeta(member.category);

  return (
    <section className="fleet-section" aria-label="Recognition details">
      <SectionHead
        title={member.title || "Recognition"}
        hint={`${categoryLabel(member.category)} \u00B7 ${periodLabel(member)}`}
        actions={
          <button type="button" className="fleet-btn fleet-btn--sm" onClick={onClose}>
            Close
          </button>
        }
      />
      <Panel>
        <div className="hof-detail">
          <div>
            <dt>Driver</dt>
            <dd>{member.driver_name || "Unknown driver"}</dd>
          </div>
          <div>
            <dt>Award tier</dt>
            <dd>
              <TierBadge badge={member.badge} />
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>
              {meta?.icon ? `${meta.icon} ` : ""}
              {categoryLabel(member.category)}
            </dd>
          </div>
          {isRankedCategory(member.category) && member.rank ? (
            <div>
              <dt>Placing</dt>
              <dd>Rank #{member.rank}</dd>
            </div>
          ) : null}
          <div>
            <dt>City</dt>
            <dd>{member.city || "Mauritania"}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>{periodLabel(member)}</dd>
          </div>
          <div>
            <dt>Performance score</dt>
            <dd>{formatScore(member.performance_score)}/100</dd>
          </div>
          <div>
            <dt>Lifetime rides</dt>
            <dd>{formatCount(member.lifetime_completed_rides)}</dd>
          </div>
          <div>
            <dt>Years with YALA</dt>
            <dd>{formatCount(member.years_with_yala)}</dd>
          </div>
          {stats.rides !== null ? (
            <div>
              <dt>Rides in period</dt>
              <dd>{formatCount(stats.rides)}</dd>
            </div>
          ) : null}
          {stats.rating !== null ? (
            <div>
              <dt>Period rating</dt>
              <dd>{stats.rating}/5</dd>
            </div>
          ) : null}
          {requirement ? (
            <div>
              <dt>Milestone threshold</dt>
              <dd>{requirement}</dd>
            </div>
          ) : null}
          <div>
            <dt>Award date</dt>
            <dd>{formatAwardDate(member.awarded_at)}</dd>
          </div>
        </div>
      </Panel>
    </section>
  );
}


/* -- Main component ---------------------------------------------------------- */

export default function HallOfFameAdminPanel({ cities = [] }) {
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");

  const [cityOptions, setCityOptions] = useState(Array.isArray(cities) ? cities : []);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  /**
   * Whether the first request has settled. The overview cards are withheld until
   * then so the page never paints "0 awards" before the data has actually arrived.
   * Later refetches keep the previous real figures on screen instead of blanking.
   */
  const [loaded, setLoaded] = useState(false);

  const [selected, setSelected] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySort, setHistorySort] = useState({ key: "date", dir: "desc" });

  // City options: prefer the prop (legacy monolith), otherwise load the shared list.
  //
  // The dependency is the SUPPLIED COUNT, not the `cities` array itself. The prop
  // defaults to a fresh `[]` on every render, so depending on `cities` directly made
  // this effect re-run forever and re-fetch /locations/cities/ on every render. A
  // count only changes when the parent genuinely supplies a new list.
  const suppliedCityCount = Array.isArray(cities) ? cities.length : 0;

  useEffect(() => {
    if (suppliedCityCount > 0) {
      setCityOptions(cities);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const options = await fetchCityOptions().catch(() => []);
      if (!cancelled) setCityOptions(options);
    })();
    return () => {
      cancelled = true;
    };
    // `cities` is intentionally omitted: it is read only when suppliedCityCount > 0,
    // and the count changing is precisely what signals a new list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliedCityCount]);

  /**
   * Load recognitions for the selected reporting period.
   *
   * On failure `members` is emptied and the error is surfaced - the overview cards
   * then render "Not available" rather than a row of zeros, so a failed request can
   * never look like a genuine "no recognitions" result.
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchRecognitions({ year, month, city });
      setMembers(data.members);
    } catch (err) {
      setMembers([]);
      setError(err?.message || "Unable to load Hall of Fame recognitions.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [city, month, year]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reset paging whenever the result set changes so a stale page can never hide rows.
  useEffect(() => {
    setHistoryPage(1);
  }, [category, city, month, year]);

  /* -- Derived data --------------------------------------------------------- */

  /** Category filter is a view filter over the server-scoped set. */
  const visible = useMemo(
    () => (category ? members.filter((item) => item.category === category) : members),
    [category, members]
  );

  /** Overview totals describe the SERVER-SCOPED set (year + city + month). */
  const stats = useMemo(() => recognitionStats(members), [members]);

  const grouped = useMemo(() => groupByCategory(visible), [visible]);

  // Stable identities so the period-grouping memos below never re-run needlessly.
  const monthlyWinners = useMemo(() => grouped.driver_of_month || EMPTY, [grouped]);
  const nationalWinners = useMemo(() => grouped.top_national || EMPTY, [grouped]);
  const cityWinners = useMemo(() => grouped.top_city || EMPTY, [grouped]);
  const milestones = useMemo(() => grouped.lifetime_milestone || EMPTY, [grouped]);

  const nationalByPeriod = useMemo(() => groupByPeriod(nationalWinners), [nationalWinners]);
  const cityByPeriod = useMemo(() => groupByPeriod(cityWinners), [cityWinners]);

  /** History: sortable over the category-filtered set, newest period first. */
  const historyRows = useMemo(() => {
    const rows = [...visible];
    const dir = historySort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (historySort.key === "date") {
        const av = new Date(a.awarded_at || 0).getTime();
        const bv = new Date(b.awarded_at || 0).getTime();
        return (av - bv) * dir;
      }
      if (historySort.key === "score") {
        return ((Number(a.performance_score) || 0) - (Number(b.performance_score) || 0)) * dir;
      }
      const map = {
        driver: "driver_name",
        category: "category",
        city: "city",
        title: "title",
      };
      const field = map[historySort.key] || "driver_name";
      return String(a[field] || "").localeCompare(String(b[field] || "")) * dir;
    });
    return rows;
  }, [visible, historySort]);

  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE));
  const pagedHistory = historyRows.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );

  const filtersActive = Boolean(city || month || category);
  const years = useMemo(() => yearOptions(currentYear), [currentYear]);

  const handleReset = () => {
    setYear(currentYear);
    setMonth("");
    setCity("");
    setCategory("");
  };

  const handleSort = (key) =>
    setHistorySort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );


  /* -- Render --------------------------------------------------------------- */

  const period = selectedPeriodLabel({ month, year });
  const cityLabel = city
    ? cityOptions.find((item) => String(item.id) === String(city))?.name || "Selected city"
    : "all cities";

  /**
   * Overview cards.
   *
   * On a failed request the cards render "Not available" instead of zeros, so an
   * API failure can never be mistaken for a genuine "no recognitions" result. They
   * are also withheld during the very first load, for the same reason.
   */
  const renderOverview = () => {
    if (loading && !loaded) {
      return null;
    }

    return (
    <section className="fleet-section">
      <SectionHead
        title="Hall of Fame overview"
        hint="Recognition activity produced by the YALA recognition engine."
      />
      <p className="hof__scope">
        <span aria-hidden="true">{"\u2139\uFE0F"}</span>
        <span>
          These four figures cover <strong>{period}</strong> across <strong>{cityLabel}</strong>.
          They change with the Reporting period, Year and City filters. The{" "}
          <strong>Award Category</strong> filter narrows the sections and the recognition
          history below <em>without</em> changing these totals, because the engine computes
          recognitions per period and city.
        </span>
      </p>

      <div className="fleet-kpis fleet-kpis--four">
        {error ? (
          <>
            <UnavailableKpi label="Total Recognitions" reason="Recognition data could not be loaded" />
            <UnavailableKpi label="Recognized Drivers" reason="Recognition data could not be loaded" />
            <UnavailableKpi label="Award Categories" reason="Recognition data could not be loaded" />
            <UnavailableKpi
              label="Best Performance Score"
              reason="Recognition data could not be loaded"
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Total Recognitions"
              value={formatCount(stats.recognitions)}
              unit="awards"
              sub={`Awards recorded in ${period}`}
              icon={"\uD83C\uDFC6"}
              tone={stats.recognitions ? "info" : "idle"}
            />
            <KpiCard
              label="Recognized Drivers"
              value={formatCount(stats.drivers)}
              unit="drivers"
              sub="Unique drivers holding at least one award"
              icon={"\uD83D\uDC65"}
              tone={stats.drivers ? "ok" : "idle"}
            />
            <KpiCard
              label="Award Categories"
              value={formatCount(stats.categories)}
              unit="categories"
              sub="Distinct award categories represented"
              icon={"\uD83C\uDFC5"}
              tone={stats.categories ? "info" : "idle"}
            />
            <KpiCard
              label="Best Performance Score"
              value={formatScore(stats.bestScore)}
              unit={stats.bestScore === null ? undefined : "/100"}
              sub={
                stats.bestScore === null
                  ? "No recognitions in this period"
                  : "Highest score among recognised drivers"
              }
              icon={"\u2B50"}
              tone={stats.bestScore === null ? "idle" : "ok"}
            />
          </>
        )}
      </div>
    </section>
    );
  };

  /** One responsive toolbar holding every filter the endpoint supports. */
  const renderFilters = () => (
    <section className="fleet-section">
      <SectionHead
        title="Reporting filters"
        hint="The recognition engine supports a reporting year plus an optional month and city."
      />
      <Panel note={filtersActive ? "Filters active" : "No filters applied"}>
        <div className="fleet-toolbar">
          <label className="fleet-field">
            <span className="fleet-field__label">Reporting period</span>
            <select
              className="fleet-select"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value="">Full year {year}</option>
              {MONTHS.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name} {year}
                </option>
              ))}
            </select>
          </label>

          <label className="fleet-field">
            <span className="fleet-field__label">Year</span>
            <select
              className="fleet-select"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="fleet-field">
            <span className="fleet-field__label">City</span>
            <select
              className="fleet-select"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            >
              <option value="">All cities</option>
              {cityOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="fleet-field">
            <span className="fleet-field__label">Category</span>
            <select
              className="fleet-select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">All categories</option>
              {RECOGNITION_CATEGORIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="fleet-btn fleet-btn--sm"
            disabled={!filtersActive}
            onClick={handleReset}
          >
            Reset Filters
          </button>
        </div>
      </Panel>
    </section>
  );


  /**
   * The four distinct non-result states.
   *
   *  - loading                 : skeleton, never zeros
   *  - error                   : retryable failure, never zeros
   *  - nothing recorded at all : no filters applied and the period is genuinely empty
   *  - nothing matches filters : records exist elsewhere, the current filters exclude them
   */
  const renderStates = () => {
    if (loading) {
      return <LoadingSkeleton />;
    }

    if (error) {
      return <ErrorState message={error} onRetry={refresh} />;
    }

    if (visible.length > 0) {
      return null;
    }

    if (members.length === 0 && !filtersActive) {
      return (
        <section className="fleet-section">
          <SectionHead title="Recognition results" hint={period} />
          <Panel>
            <EmptyState
              icon={"\uD83C\uDFC6"}
              title="No Recognitions Found"
              hint={`The recognition engine has produced no Hall of Fame awards for ${period}. Awards appear once drivers complete qualifying activity in a period.`}
            />
            {Number(year) !== currentYear ? (
              <div className="hof-empty__action">
                <button type="button" className="fleet-btn fleet-btn--sm" onClick={handleReset}>
                  Show {currentYear}
                </button>
              </div>
            ) : null}
          </Panel>
        </section>
      );
    }

    return (
      <section className="fleet-section">
        <SectionHead title="Recognition results" hint={period} />
        <Panel>
          <EmptyState
            icon={"\uD83D\uDD0D"}
            title="No Recognitions Found"
            hint="There are no Hall of Fame recognitions matching the selected reporting period, city, and category. Try adjusting your filters to view other recognition records."
          />
          <div className="hof-empty__action">
            <button type="button" className="fleet-btn fleet-btn--sm" onClick={handleReset}>
              Reset Filters
            </button>
          </div>
        </Panel>
      </section>
    );
  };

  /**
   * Monthly Excellence Awards.
   *
   * The engine's only monthly individual title is `driver_of_month` (exactly one
   * winner per month). The other categories the task proposes - Highest Performance
   * Score, Outstanding Customer Service, Most Completed Trips, Best Acceptance
   * Performance, Lowest Cancellation Performance - are NOT produced by the engine and
   * are therefore not shown; see the delivery report for the backend work they need.
   */
  const renderMonthly = () =>
    monthlyWinners.length ? (
      <section className="fleet-section">
        <SectionHead
          title="Monthly Excellence Awards"
          hint="Driver of the Month - the single highest-ranked driver in each reporting period."
        />
        <div className="hof-awards">
          {monthlyWinners.map((member) => (
            <AwardCard key={member.id} member={member} onView={setSelected} />
          ))}
        </div>
      </section>
    ) : null;

  /** National recognition, one leaderboard per reporting period. */
  const renderNational = () =>
    nationalWinners.length ? (
      <section className="fleet-section">
        <SectionHead
          title="YALA National Excellence"
          hint="The engine's official national placings (#1-#3 in Mauritania), grouped by reporting period."
        />
        {nationalByPeriod.map((group) => (
          <Panel key={group.key} title={group.label} note={`${group.rows.length} national placing(s)`}>
            <LeaderboardTable
              rows={group.rows}
              showCity
              onView={setSelected}
              ariaLabel={`National placings for ${group.label}`}
            />
          </Panel>
        ))}
      </section>
    ) : null;

  /** City leaderboards, one leaderboard per reporting period. */
  const renderCity = () =>
    cityWinners.length ? (
      <section className="fleet-section">
        <SectionHead
          title="City Leaderboards"
          hint="The engine's official city placings, grouped by reporting period so rankings from different months are never mixed."
        />
        {cityByPeriod.map((group) => (
          <Panel key={group.key} title={group.label} note={`${group.rows.length} city placing(s)`}>
            <LeaderboardTable
              rows={group.rows}
              showCity
              onView={setSelected}
              ariaLabel={`City placings for ${group.label}`}
            />
          </Panel>
        ))}
      </section>
    ) : null;

  /** Lifetime loyalty milestones, using the engine's own thresholds. */
  const renderMilestones = () =>
    milestones.length ? (
      <section className="fleet-section">
        <SectionHead
          title="Driver Loyalty & Milestones"
          hint="All-time loyalty awards from the engine's milestone thresholds (1,000 / 5,000 / 10,000 rides and 5 years of service)."
        />
        <div className="hof-milestones">
          {milestones.map((member) => (
            <MilestoneCard key={member.id} member={member} onView={setSelected} />
          ))}
        </div>
      </section>
    ) : null;


  /** Recognition history: every matching record, sortable and paginated. */
  const renderHistory = () => (
    <section className="fleet-section">
      <SectionHead
        title="Recognition History"
        hint="Every recognition matching the current filters, newest first by default."
      />
      <Panel
        title="All recognitions"
        note={`${historyRows.length} of ${members.length} recognitions`}
      >
        {pagedHistory.length ? (
          <>
            <div className="fleet-table-wrap">
              <table className="fleet-table" aria-label="Recognition history">
                <thead>
                  <tr>
                    <SortHeader
                      label="Date"
                      sortKey="date"
                      sort={historySort}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="Driver"
                      sortKey="driver"
                      sort={historySort}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="Category"
                      sortKey="category"
                      sort={historySort}
                      onSort={handleSort}
                    />
                    <SortHeader label="City" sortKey="city" sort={historySort} onSort={handleSort} />
                    <SortHeader
                      label="Award"
                      sortKey="title"
                      sort={historySort}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="Score"
                      sortKey="score"
                      sort={historySort}
                      onSort={handleSort}
                      className="fleet-table__num"
                    />
                    <th scope="col">
                      <span className="hof-sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map((member) => (
                    <tr key={member.id}>
                      <td className="hof-table__period">{formatAwardDate(member.awarded_at)}</td>
                      <td>
                        <span className="hof-strong" title={member.driver_name}>
                          {member.driver_name || "Unknown driver"}
                        </span>
                      </td>
                      <td>{categoryLabel(member.category)}</td>
                      <td>{member.city || "Mauritania"}</td>
                      <td>
                        <span className="hof-strong" title={member.title}>
                          {member.title}
                        </span>
                        <span className="hof-sub">{periodLabel(member)}</span>
                      </td>
                      <td className="fleet-table__num hof-table__score">
                        {formatScore(member.performance_score)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="fleet-btn fleet-btn--sm"
                          onClick={() => setSelected(member)}
                          aria-label={`View details for ${member.driver_name || "driver"}`}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={historyPage}
              pageCount={historyPageCount}
              total={historyRows.length}
              pageSize={HISTORY_PAGE_SIZE}
              onPage={setHistoryPage}
            />
          </>
        ) : (
          <EmptyState
            icon={"\uD83D\uDCC4"}
            title="No recognitions to list"
            hint="Adjust the filters above to widen the recognition history."
          />
        )}
      </Panel>
    </section>
  );

  return (
    <div className="fleet-center hof">
      <header className="fleet-center__header">
        <div className="fleet-center__heading">
          <h1 className="fleet-center__title"><AdminPageTitle>YALA Hall of Fame</AdminPageTitle></h1>
          <p className="fleet-center__subtitle">
            Recognizing excellence, outstanding performance, and driver loyalty.
          </p>
          <p className="hof__period">
            <span aria-hidden="true">{"\uD83D\uDCC5"}</span>
            Reporting period: <strong>{period}</strong>
            <span aria-hidden="true">{"\u00B7"}</span>
            <strong>{cityLabel}</strong>
          </p>
        </div>
        <div className="fleet-center__actions">
          <button type="button" className="fleet-btn" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {renderOverview()}
      {renderFilters()}
      {renderStates()}

      {!loading && !error && visible.length > 0 ? (
        <div className="hof__content">
          {renderMonthly()}
          {renderNational()}
          {renderCity()}
          {renderMilestones()}
          {renderHistory()}
          {selected ? (
            <RecognitionDetail member={selected} onClose={() => setSelected(null)} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

