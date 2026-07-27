import React from "react";
import ListRow from "./ListRow";

export default function SettingsRow({ icon, title, subtitle, onClick, action, ...rest }) {
  return (
    <ListRow icon={icon} title={title} subtitle={subtitle} onClick={onClick} {...rest}>
      {action}
    </ListRow>
  );
}
