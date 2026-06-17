import React from "react";

export default function PersonalInfoTab({ profile, onEdit }) {
  if (!profile) {
    return <div style={styles.loading}>Loading profile...</div>;
  }

  const fields = [
    { label: "First Name", value: profile.first_name || profile.user_first_name || "" },
    { label: "Last Name", value: profile.last_name || profile.user_last_name || "" },
    { label: "Email", value: profile.email || profile.user_email || "" },
    { label: "Phone Number", value: profile.phone_number || "" },
    { label: "National ID", value: profile.national_id_number || "" },
    { label: "Driver Code", value: profile.driver_code || "Not assigned" },
    { label: "City", value: profile.city_name || profile.city || "" },
  ];

  return (
    <div style={styles.container}>
      {/* Profile photo */}
      <div style={styles.photoSection}>
        <div style={styles.photo}>
          {profile.driver_photo ? (
            <img src={profile.driver_photo} alt="Profile" style={styles.photoImg} />
          ) : (
            <span style={styles.photoFallback}>
              {(profile.first_name || "D").charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <strong style={styles.profileName}>
          {[profile.first_name || profile.user_first_name, profile.last_name || profile.user_last_name].filter(Boolean).join(" ") || "Driver"}
        </strong>
      </div>

      {/* Info fields */}
      <div style={styles.fields}>
        {fields.map((field) => (
          <div key={field.label} style={styles.fieldRow}>
            <span style={styles.fieldLabel}>{field.label}</span>
            <span style={styles.fieldValue}>{field.value || "—"}</span>
          </div>
        ))}
      </div>

      <button type="button" onClick={onEdit} style={styles.editBtn}>
        Edit Profile
      </button>
    </div>
  );
}

const styles = {
  container: {
    padding: "16px 0",
  },
  loading: {
    padding: 24,
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
  },
  photoSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "rgba(0,166,81,0.15)",
    border: "3px solid #00A651",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  photoFallback: {
    fontSize: 28,
    fontWeight: 800,
    color: "#00A651",
  },
  profileName: {
    fontSize: 18,
    fontWeight: 700,
    color: "#fff",
  },
  fields: {
    display: "flex",
    flexDirection: "column",
    gap: 0,
  },
  fieldRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  fieldLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.5)",
    fontWeight: 500,
  },
  fieldValue: {
    fontSize: 14,
    color: "#fff",
    fontWeight: 600,
    textAlign: "right",
    maxWidth: "60%",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  editBtn: {
    marginTop: 20,
    width: "100%",
    padding: "12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
};
