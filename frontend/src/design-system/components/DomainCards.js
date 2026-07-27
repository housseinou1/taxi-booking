import React from "react";
import { cx } from "../utils/cx";
import Card from "./Card";
import StatusChip from "./StatusChip";

export function EarningsCard({
  title = "Earnings",
  amount,
  period,
  trend,
  className,
  ...rest
}) {
  return (
    <Card className={cx("yds-earnings-card", className)} title={title} {...rest}>
      <div className="yds-type-headline" style={{ margin: 0 }}>{amount}</div>
      {period ? <p className="yds-type-caption">{period}</p> : null}
      {trend ? <StatusChip intent={trend.intent || "success"}>{trend.label}</StatusChip> : null}
    </Card>
  );
}

export function WalletCard({
  title = "Wallet",
  balance,
  subtitle,
  action,
  className,
  ...rest
}) {
  return (
    <Card className={cx("yds-wallet-card", className)} title={title} action={action} {...rest}>
      <div className="yds-type-headline" style={{ margin: 0 }}>{balance}</div>
      {subtitle ? <p className="yds-type-caption">{subtitle}</p> : null}
    </Card>
  );
}

export function SupportCard({
  title,
  description,
  icon,
  onClick,
  className,
  ...rest
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={cx("yds-card", "yds-support-card", className)}
      onClick={onClick}
      {...rest}
    >
      {icon ? <span className="yds-support-card__icon" aria-hidden="true">{icon}</span> : null}
      <strong className="yds-type-subtitle" style={{ margin: 0 }}>{title}</strong>
      {description ? <p className="yds-type-caption">{description}</p> : null}
    </Tag>
  );
}

export function DriverCard(props) {
  return <Card className={cx("yds-driver-card", props.className)} {...props} />;
}

export default {
  EarningsCard,
  WalletCard,
  SupportCard,
  DriverCard,
};
