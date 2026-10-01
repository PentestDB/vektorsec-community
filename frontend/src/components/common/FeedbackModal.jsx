"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "@/styles/components/FeedbackModal.module.scss";
import {
  FiX,
  FiCheck,
  FiAlertOctagon,
  FiZap,
  FiMessageSquare,
  FiStar,
} from "react-icons/fi";
import { useTranslation } from "@/i18n/I18nProvider";

const FEEDBACK_TYPES = [
  { key: "bug", labelKey: "feedback.typeBug", icon: FiAlertOctagon },
  { key: "feature", labelKey: "feedback.typeFeature", icon: FiZap },
  { key: "general", labelKey: "feedback.typeGeneral", icon: FiMessageSquare },
];

const FeedbackModal = ({ open, onClose }) => {
  const { t } = useTranslation();
  const [type, setType] = useState("bug");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleClose = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [submitting, onClose]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleClose]);

  // Reset form whenever the modal opens
  useEffect(() => {
    if (open) {
      setType("bug");
      setMessage("");
      setRating(0);
      setHoverRating(0);
      setSubmitting(false);
      setSuccess(false);
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!message.trim()) {
      setError(t("feedback.emptyMessage"));
      return;
    }
    setSubmitting(true);
    setError("");

    // No backend endpoint yet — simulate a successful submission.
    setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    }, 500);
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{t("feedback.title")}</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label={t("feedback.closeAria")}
          >
            <FiX />
          </button>
        </div>

        <div className={styles.modalBody}>
          {success ? (
            <div className={styles.successBox}>
              <FiCheck className={styles.successIcon} size={26} />
              <p className={styles.successText}>{t("feedback.thanks")}</p>
            </div>
          ) : (
            <>
              <div className={styles.fieldLabel}>{t("feedback.typeLabel")}</div>
              <div className={styles.typePills}>
                {FEEDBACK_TYPES.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`${styles.typePill} ${
                        type === option.key ? styles.typePillActive : ""
                      }`}
                      onClick={() => setType(option.key)}
                    >
                      <Icon size={14} />
                      {t(option.labelKey)}
                    </button>
                  );
                })}
              </div>

              <div className={styles.fieldLabel}>{t("feedback.messageLabel")}</div>
              <textarea
                className={styles.textarea}
                placeholder={t("feedback.messagePlaceholder")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
              />

              <div className={styles.fieldLabel}>
                {t("feedback.ratingLabel")}{" "}
                <span className={styles.optionalLabel}>
                  {t("feedback.optional")}
                </span>
              </div>
              <div className={styles.starRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.starBtn} ${
                      (hoverRating || rating) >= n ? styles.starActive : ""
                    }`}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(n)}
                    aria-label={t("feedback.starAria", { count: n })}
                  >
                    <FiStar size={22} />
                  </button>
                ))}
                {rating > 0 && <span className={styles.ratingText}>{rating}/5</span>}
              </div>

              {error && <div className={styles.errorText}>{error}</div>}
            </>
          )}
        </div>

        {!success && (
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? t("feedback.sending") : t("feedback.submit")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
