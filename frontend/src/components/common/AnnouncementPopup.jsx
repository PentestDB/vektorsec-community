"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { getActiveAnnouncements } from "@/services/announcement.service";

// Announcements already shown in this browser session — a given announcement
// pops up once per session so it does not nag on every page navigation.
const shownThisSession = new Set();

/**
 * Global announcement popup. Mounted in the root layout so it appears on
 * every frontend page. Fetches active announcements from the backend and
 * shows the newest one the user has not seen yet this session.
 */
export default function AnnouncementPopup() {
  const [announcement, setAnnouncement] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getActiveAnnouncements()
      .then((data) => {
        if (cancelled) return;
        const list = data?.announcements || [];
        const next = list.find((a) => !shownThisSession.has(String(a._id)));
        if (next) {
          shownThisSession.add(String(next._id));
          setAnnouncement(next);
          setOpen(true);
        }
      })
      .catch(() => {
        // Not configured / offline — popup stays hidden.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const close = () => setOpen(false);

  if (!announcement) return null;

  return (
    <Modal
      open={open}
      title={announcement.title || "Announcement"}
      onOk={close}
      onCancel={announcement.dismissible !== false ? close : undefined}
      closable={announcement.dismissible !== false}
      maskClosable={announcement.dismissible !== false}
      footer={[
        <Button key="ok" type="primary" onClick={close}>
          OK
        </Button>,
      ]}
      centered
    >
      {announcement.message ? (
        <div
          dangerouslySetInnerHTML={{ __html: announcement.message }}
          style={{ wordBreak: "break-word" }}
        />
      ) : (
        <div>—</div>
      )}
    </Modal>
  );
}
