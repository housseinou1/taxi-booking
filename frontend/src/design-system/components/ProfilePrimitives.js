import React from "react";
import { cx } from "../utils/cx";
import Avatar from "./Avatar";
import ListRow from "./ListRow";
import SettingsRow from "./SettingsRow";

export function ProfileHeader({
  name,
  subtitle,
  photoUrl,
  badge,
  className,
  ...rest
}) {
  const initials = String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className={cx("yds-profile-header", className)} {...rest}>
      <Avatar src={photoUrl} alt={name || "Profile"} initials={initials || "?"} size="lg" />
      <div className="yds-profile-header__copy">
        <h2 className="yds-type-title" style={{ margin: 0 }}>{name}</h2>
        {subtitle ? <p className="yds-type-caption">{subtitle}</p> : null}
        {badge || null}
      </div>
    </header>
  );
}

export function InfoRow({ label, value, className, ...rest }) {
  return (
    <div className={cx("yds-info-row", className)} {...rest}>
      <span className="yds-type-caption">{label}</span>
      <strong className="yds-type-body">{value}</strong>
    </div>
  );
}

export function SectionHeader({ title, description, action, className, ...rest }) {
  return (
    <div className={cx("yds-section-header", className)} {...rest}>
      <div>
        <h3 className="yds-section-title">{title}</h3>
        {description ? <p className="yds-type-caption">{description}</p> : null}
      </div>
      {action || null}
    </div>
  );
}

export function ActionRow(props) {
  return <ListRow className={cx("yds-action-row", props.className)} {...props} />;
}

export function QuickActionTile({
  title,
  description,
  icon,
  onClick,
  className,
  ...rest
}) {
  return (
    <button
      type="button"
      className={cx("yds-quick-tile", className)}
      onClick={onClick}
      {...rest}
    >
      {icon ? <span className="yds-quick-tile__icon" aria-hidden="true">{icon}</span> : null}
      <strong>{title}</strong>
      {description ? <span className="yds-type-caption">{description}</span> : null}
    </button>
  );
}

export { SettingsRow };

export default {
  ProfileHeader,
  InfoRow,
  SectionHeader,
  ActionRow,
  QuickActionTile,
  SettingsRow,
};
