import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../api/hooks";
import type { AppNotification } from "../api/types";
import { useI18n } from "../i18n/LocaleProvider";

/**
 * What happened while you were not looking.
 *
 * Until this existed, a worker found out their leave was approved by opening
 * the app and going to look — which in practice meant finding out by asking
 * their manager. The bell is deliberately in the header rather than on a page
 * of its own: news you have to navigate to is news you do not get.
 */
export function NotificationBell() {
  const { t, shamsi } = useI18n();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Clicking anywhere else closes it. Without this the panel sits over the
  // page and the next click goes to it instead of to what was aimed at.
  useEffect(() => {
    if (!open) return;
    function onDocumentClick(e: MouseEvent): void {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, [open]);

  const items = notifications.data?.items ?? [];
  const unread = notifications.data?.unread ?? 0;

  async function onOpenItem(item: AppNotification): Promise<void> {
    setOpen(false);
    // Marked read first, then navigated. If the navigation is what fails, the
    // person has still seen it; the reverse would leave a permanent badge on
    // something they read.
    if (!item.read) await markRead.mutateAsync(item.id).catch(() => undefined);
    if (item.link) navigate(item.link);
  }

  return (
    <div className="bell-wrap" ref={wrap}>
      <button
        className="bell"
        aria-label={t("notif_title")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon />
        {unread > 0 && (
          <span className="bell-badge" aria-label={t("notif_unread", String(unread))}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label={t("notif_title")}>
          <div className="bell-head">
            <strong>{t("notif_title")}</strong>
            {unread > 0 && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => void markAll.mutateAsync().catch(() => undefined)}
                disabled={markAll.isPending}
              >
                {t("notif_mark_all")}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="bell-empty">{t("notif_empty")}</p>
          ) : (
            <ul className="bell-list">
              {items.map((item) => (
                <li key={item.id} className={item.read ? "" : "unread"}>
                  <button onClick={() => void onOpenItem(item)}>
                    <span className="bell-item-title">{item.title}</span>
                    {item.body && <span className="bell-item-body">{item.body}</span>}
                    {item.createdAt && (
                      <span className="bell-item-when">
                        {shamsi(item.createdAt.slice(0, 10), { withYear: true })}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
