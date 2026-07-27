import React from "react";

import { formatMoney } from "../../marketConfig";
import { toAmount } from "./earningsNormalize";

export default function DriverIncentivesEarningsPanel({ incentives }) {
  const campaigns = incentives?.campaigns || [];
  const completed = incentives?.completed || [];
  const bonusHistory = incentives?.bonusHistory || [];
  const totalBonus = toAmount(incentives?.totalBonusEarned);

  if (!campaigns.length && totalBonus <= 0 && !completed.length && !bonusHistory.length) {
    return (
      <section className="earnings-hub__section" aria-label="Incentives">
        <h3 className="earnings-hub__section-title">Incentives</h3>
        <div className="earnings-hub__empty">No active incentive campaigns right now.</div>
      </section>
    );
  }

  return (
    <section className="earnings-hub__section" aria-label="Incentives">
      <h3 className="earnings-hub__section-title">Incentives</h3>
      {totalBonus > 0 ? (
        <div className="earnings-hub__row">
          <span>Total bonus earned</span>
          <strong>{formatMoney(totalBonus)}</strong>
        </div>
      ) : null}
      {campaigns.map((campaign) => {
        const progress = Math.min(
          100,
          Math.max(0, Number(campaign.progress_percent ?? campaign.progress ?? 0)),
        );
        const bonus = campaign.estimated_bonus ?? campaign.bonus_amount ?? campaign.bonus;
        return (
          <article key={campaign.id || campaign.title || campaign.name} className="earnings-hub__incentive">
            <strong>{campaign.title || campaign.name || "Active incentive"}</strong>
            <div
              className="earnings-hub__progress"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <div className="earnings-hub__row" style={{ border: 0, paddingBottom: 0 }}>
              <span>
                {campaign.trips_remaining != null
                  ? `${campaign.trips_remaining} trips remaining`
                  : `${Math.round(progress)}% complete`}
              </span>
              {bonus != null ? <strong>+{formatMoney(bonus)}</strong> : null}
            </div>
          </article>
        );
      })}
      {completed.length > 0 ? (
        <div className="earnings-hub__sublist">
          <h4 className="earnings-hub__sublist-title">Recently completed</h4>
          {completed.slice(0, 3).map((item) => (
            <div key={item.id || item.title} className="earnings-hub__row">
              <span>{item.title || item.name || "Incentive"}</span>
              <strong>{formatMoney(item.bonus_amount ?? item.amount ?? 0)}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {bonusHistory.length > 0 ? (
        <div className="earnings-hub__sublist">
          <h4 className="earnings-hub__sublist-title">Bonus history</h4>
          {bonusHistory.slice(0, 5).map((item, index) => (
            <div key={item.id || `${item.title}-${index}`} className="earnings-hub__row">
              <span>{item.title || item.campaign_name || item.description || "Bonus"}</span>
              <strong>{formatMoney(item.amount ?? item.bonus_amount ?? 0)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
