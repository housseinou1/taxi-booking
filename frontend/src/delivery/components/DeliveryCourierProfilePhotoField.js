import React, { useEffect, useRef, useState } from "react";

export default function DeliveryCourierProfilePhotoField({
  existingPhotoUrl,
  selectedFile,
  onChange,
  required = false,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");

  useEffect(() => {
    if (!selectedFile) {
      setLocalPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const previewUrl = localPreviewUrl || existingPhotoUrl || "";

  return (
    <div className="delivery-courier-photo">
      <span className="delivery-courier-photo__label">
        Profile photo{required ? " (required)" : ""}
      </span>
      <div className="delivery-courier-photo__row">
        <div className={`delivery-courier-photo__preview ${previewUrl ? "has-photo" : ""}`}>
          {previewUrl ? (
            <img src={previewUrl} alt="Profile preview" />
          ) : (
            <span aria-hidden="true">📷</span>
          )}
        </div>
        <div className="delivery-courier-photo__actions">
          <button
            type="button"
            className="delivery-uber__btn delivery-uber__btn--sm"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {previewUrl ? "Change photo" : "Add photo"}
          </button>
          <p className="delivery-courier-photo__hint">JPEG or PNG</p>
          {selectedFile ? <p className="delivery-courier-photo__filename">{selectedFile.name}</p> : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
    </div>
  );
}
