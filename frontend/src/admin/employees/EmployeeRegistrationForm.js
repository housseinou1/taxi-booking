import React, { useEffect, useRef, useState } from "react";

import { AlertBanner, InlineError } from "../components/library";
import { registerEmployee, uploadPhoto } from "./employeesApi";

const PHOTO_ACCEPT = "image/jpeg,image/png";

const INITIAL = {
  full_name: "",
  date_of_birth: "",
  department: "",
  job_title: "",
  employment_start_date: "",
};

export default function EmployeeRegistrationForm({ notify, onRegistered }) {
  const [values, setValues] = useState(INITIAL);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [idPhotoFile, setIdPhotoFile] = useState(null);
  const [idPhotoPreview, setIdPhotoPreview] = useState("");
  const previewRef = useRef(null);

  const setField = (name) => (event) => {
    setValues((prev) => ({ ...prev, [name]: event.target.value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  useEffect(() => {
    if (!idPhotoFile) {
      setIdPhotoPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(idPhotoFile);
    previewRef.current = url;
    setIdPhotoPreview(url);
    return () => {
      URL.revokeObjectURL(url);
      previewRef.current = null;
    };
  }, [idPhotoFile]);

  const onPhotoPick = (event) => {
    const file = event.target.files?.[0];
    setFieldErrors((prev) => {
      if (!prev.id_photo) return prev;
      const next = { ...prev };
      delete next.id_photo;
      return next;
    });
    setIdPhotoFile(file || null);
  };

  const validate = () => {
    const errors = {};
    if (!values.full_name.trim()) {
      errors.full_name = "Full name is required.";
    }
    if (!idPhotoFile) {
      errors.id_photo = "ID photograph is required.";
    } else if (!/^image\/(jpeg|png)$/i.test(idPhotoFile.type)) {
      errors.id_photo = "Use a JPEG or PNG photograph.";
    }
    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    const errors = validate();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      // Only write fields are submitted. employee_number is NEVER sent (it is
      // server-generated), and employment_status is NOT set at create time.
      const response = await registerEmployee({
        full_name: values.full_name.trim(),
        date_of_birth: values.date_of_birth || null,
        department: values.department.trim(),
        job_title: values.job_title.trim(),
        employment_start_date: values.employment_start_date || null,
      });
      const data = response.data || {};
      const employeeNumber = data.employee_number;
      let photoUploaded = false;
      let photoUploadFailed = false;
      if (employeeNumber && idPhotoFile) {
        try {
          await uploadPhoto(employeeNumber, idPhotoFile);
          photoUploaded = true;
        } catch (photoErr) {
          photoUploadFailed = true;
          const detail = photoErr?.response?.data?.detail;
          setFormError(
            detail ||
              "Employee was registered, but the ID photograph could not be uploaded. Upload it from the profile."
          );
          notify?.("warning", detail || "Register succeeded; photograph upload failed — use the profile to retry.");
        }
      }
      if (!photoUploadFailed) {
        notify?.({
          tone: "success",
          title: "Employee registered",
          message: employeeNumber
            ? photoUploaded
              ? `Assigned ${employeeNumber}. ID photograph saved securely.`
              : `Assigned ${employeeNumber}.`
            : "Employee record created.",
        });
        setValues(INITIAL);
        setIdPhotoFile(null);
        setFieldErrors({});
      }
      if (employeeNumber) {
        onRegistered?.(employeeNumber);
      }
    } catch (err) {
      const status = err?.response?.status;
      const payload = err?.response?.data;
      if (status === 403) {
        setFormError("You are not authorized to register employees.");
        notify?.("danger", "You are not authorized to register employees.");
      } else if (status === 400 && payload && typeof payload === "object") {
        const nextErrors = {};
        Object.entries(payload).forEach(([key, value]) => {
          if (key === "detail") return;
          nextErrors[key] = Array.isArray(value) ? value.join(" ") : String(value);
        });
        setFieldErrors(nextErrors);
        if (payload.detail) setFormError(String(payload.detail));
        if (!Object.keys(nextErrors).length && !payload.detail) {
          setFormError("Registration failed. Please check the form and try again.");
        }
      } else {
        setFormError(payload?.detail || err?.message || "Registration failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="emp-form" onSubmit={handleSubmit} noValidate>
      {formError ? (
        <AlertBanner tone="danger" title="Registration error">
          {formError}
        </AlertBanner>
      ) : null}

      <p className="emp-note">Employee number is assigned automatically. ID photograph required.</p>

      <div className="emp-field-grid">
        <div className={`emp-field ${fieldErrors.full_name ? "emp-field--error" : ""}`.trim()}>
          <label htmlFor="emp-full-name">Full name *</label>
          <input
            id="emp-full-name"
            name="full_name"
            type="text"
            value={values.full_name}
            onChange={setField("full_name")}
            aria-required="true"
            aria-invalid={Boolean(fieldErrors.full_name)}
            aria-describedby={fieldErrors.full_name ? "emp-full-name-error" : undefined}
          />
          {fieldErrors.full_name ? (
            <InlineError id="emp-full-name-error" message={fieldErrors.full_name} />
          ) : null}
        </div>

        <div className={`emp-field ${fieldErrors.date_of_birth ? "emp-field--error" : ""}`.trim()}>
          {/* DOB is collected as a write-only field here. It is NEVER displayed
              back in the directory or profile (backend has no field-level DOB
              permission — Phase 5 gap, see report). */}
          <label htmlFor="emp-dob">Date of birth</label>
          <input
            id="emp-dob"
            name="date_of_birth"
            type="date"
            value={values.date_of_birth}
            onChange={setField("date_of_birth")}
            aria-invalid={Boolean(fieldErrors.date_of_birth)}
          />
          {fieldErrors.date_of_birth ? (
            <InlineError message={fieldErrors.date_of_birth} />
          ) : null}
        </div>

        <div className={`emp-field ${fieldErrors.department ? "emp-field--error" : ""}`.trim()}>
          <label htmlFor="emp-department">Department</label>
          <input
            id="emp-department"
            name="department"
            type="text"
            value={values.department}
            onChange={setField("department")}
            aria-invalid={Boolean(fieldErrors.department)}
          />
          {fieldErrors.department ? (
            <InlineError message={fieldErrors.department} />
          ) : null}
        </div>

        <div className={`emp-field ${fieldErrors.job_title ? "emp-field--error" : ""}`.trim()}>
          <label htmlFor="emp-job-title">Job title</label>
          <input
            id="emp-job-title"
            name="job_title"
            type="text"
            value={values.job_title}
            onChange={setField("job_title")}
            aria-invalid={Boolean(fieldErrors.job_title)}
          />
          {fieldErrors.job_title ? (
            <InlineError message={fieldErrors.job_title} />
          ) : null}
        </div>

        <div className={`emp-field ${fieldErrors.employment_start_date ? "emp-field--error" : ""}`.trim()}>
          <label htmlFor="emp-start-date">Employment start date</label>
          <input
            id="emp-start-date"
            name="employment_start_date"
            type="date"
            value={values.employment_start_date}
            onChange={setField("employment_start_date")}
            aria-invalid={Boolean(fieldErrors.employment_start_date)}
          />
          {fieldErrors.employment_start_date ? (
            <InlineError message={fieldErrors.employment_start_date} />
          ) : null}
        </div>

        <div
          className={`emp-field emp-field--photo ${fieldErrors.id_photo ? "emp-field--error" : ""}`.trim()}
        >
          <label htmlFor="emp-id-photo">Employee ID photograph *</label>
          <div className="emp-registration-photo">
            {idPhotoPreview ? (
              <img className="emp-photo" src={idPhotoPreview} alt="ID photo preview" />
            ) : (
              <span className="emp-photo emp-photo__placeholder">No photo selected</span>
            )}
            <input
              id="emp-id-photo"
              name="id_photo"
              type="file"
              accept={PHOTO_ACCEPT}
              onChange={onPhotoPick}
              aria-required="true"
              aria-invalid={Boolean(fieldErrors.id_photo)}
            />
          </div>
          {fieldErrors.id_photo ? <InlineError message={fieldErrors.id_photo} /> : null}
        </div>
      </div>

      <div className="emp-form__actions">
        <button
          type="submit"
          className="admin-lib-btn admin-lib-btn--primary"
          disabled={submitting}
        >
          {submitting ? "Registering…" : "Register employee"}
        </button>
      </div>
    </form>
  );
}
