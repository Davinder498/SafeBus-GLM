import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  AnnouncementAudience,
  AnnouncementRecipientCount,
  AuthorityAnnouncement,
} from '@safebus/types';
import { Link } from 'react-router';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useAuth } from '@/contexts/useAuth';
import {
  announcementAudienceLabels,
  fetchAnnouncementAudience,
  fetchAnnouncements,
  sendAnnouncement,
} from '@/services/announcementService';

export function AdminAnnouncementsPage() {
  const { profile } = useAuth();
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [count, setCount] = useState<AnnouncementRecipientCount | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [history, setHistory] = useState<AuthorityAnnouncement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [preview, setPreview] = useState<{
    id: string;
    audience: AnnouncementAudience;
    title: string;
    body: string;
    recipientCount: number;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const sendAttempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const sendLock = useRef(false);
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const rows = await fetchAnnouncements();
      setHistory(rows);
      setHasMore(rows.length === 30);
    } catch (reason) {
      setHistoryError(
        reason instanceof Error ? reason.message : 'Unable to load sent announcements.',
      );
    } finally {
      setLoadingHistory(false);
    }
  }, []);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  useEffect(() => {
    let active = true;
    setCount(null);
    setCountsError(null);
    void fetchAnnouncementAudience(audience)
      .then((value) => {
        if (active) setCount(value);
      })
      .catch((reason) => {
        if (active)
          setCountsError(reason instanceof Error ? reason.message : 'Unable to check recipients.');
      });
    return () => {
      active = false;
    };
  }, [audience]);
  async function review(event: FormEvent) {
    event.preventDefault();
    setReviewing(true);
    setError(null);
    setStatus(null);
    try {
      const recipients = await fetchAnnouncementAudience(audience);
      setCount(recipients);
      setCountsError(null);
      if (recipients.total === 0)
        throw new Error('There are no active recipients for this audience.');
      const value = {
        audience,
        title: title.trim(),
        body: body.trim(),
        recipientCount: recipients.total,
      };
      const fingerprint = JSON.stringify({
        audience: value.audience,
        title: value.title,
        body: value.body,
      });
      if (sendAttempt.current?.fingerprint !== fingerprint)
        sendAttempt.current = { fingerprint, id: crypto.randomUUID() };
      setPreview({ ...value, id: sendAttempt.current.id });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to prepare this announcement.');
    } finally {
      setReviewing(false);
    }
  }
  async function send() {
    if (!preview || sendLock.current) return;
    sendLock.current = true;
    setSending(true);
    setError(null);
    try {
      const sent = await sendAnnouncement(preview);
      setHistory((rows) => [sent, ...rows.filter((row) => row.id !== sent.id)]);
      setTitle('');
      setBody('');
      setPreview(null);
      sendAttempt.current = null;
      setStatus(`Announcement sent to ${sent.recipientCount} recipients.`);
    } catch (reason) {
      setPreview(null);
      setError(reason instanceof Error ? reason.message : 'Unable to send the announcement.');
    } finally {
      setSending(false);
      sendLock.current = false;
    }
  }
  async function loadMore() {
    if (loadingMore || !history.length) return;
    setLoadingMore(true);
    setHistoryError(null);
    try {
      const rows = await fetchAnnouncements(history.at(-1));
      setHistory((current) => [
        ...current,
        ...rows.filter((row) => !current.some((item) => item.id === row.id)),
      ]);
      setHasMore(rows.length === 30);
    } catch (reason) {
      setHistoryError(
        reason instanceof Error ? reason.message : 'Unable to load more announcements.',
      );
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <DashboardLayout title="Announcements" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          title="Announcements"
          action={
            <Link to="/notifications" className={buttonClass({ variant: 'ghost' })}>
              Notification inbox
            </Link>
          }
        />
        <Card className="p-5 sm:p-6">
          <form onSubmit={(event) => void review(event)} className="space-y-5">
            <h2 className="text-lg font-bold text-navy-900">New announcement</h2>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-600">Notification type</span>
              <span className="font-semibold text-navy-900">Operational alerts</span>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="announcement-audience"
                className="block text-sm font-semibold text-navy-900"
              >
                Audience
              </label>
              <Select
                id="announcement-audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}
                disabled={sending || reviewing}
              >
                {Object.entries(announcementAudienceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <p className="text-sm text-slate-600" role="status">
                {countsError ??
                  (count
                    ? `${count.total} recipients · ${count.guardians} guardians · ${count.drivers} drivers${profile?.role === 'school_admin' ? ' · Your school only' : ''}`
                    : 'Checking recipients…')}
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="announcement-title"
                className="block text-sm font-semibold text-navy-900"
              >
                Title
              </label>
              <Input
                id="announcement-title"
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={sending || reviewing}
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="announcement-body"
                className="block text-sm font-semibold text-navy-900"
              >
                Message
              </label>
              <textarea
                id="announcement-body"
                required
                maxLength={4000}
                rows={6}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={sending || reviewing}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger-700">
                {error}
              </p>
            )}
            {status && (
              <p role="status" className="text-sm font-semibold text-success-700">
                {status}
              </p>
            )}
            <Button
              type="submit"
              loading={reviewing}
              disabled={reviewing || sending || !title.trim() || !body.trim()}
            >
              Review announcement
            </Button>
          </form>
        </Card>
        <section aria-labelledby="sent-announcements-heading" className="space-y-3">
          <h2 id="sent-announcements-heading" className="text-lg font-bold text-navy-900">
            Sent announcements
          </h2>
          {loadingHistory ? (
            <DataState title="Loading announcements" message="Checking sent history." />
          ) : null}
          {historyError && (
            <div>
              <p role="alert" className="text-sm text-danger-700">
                {historyError}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void (history.length ? loadMore() : loadHistory())}
              >
                Try again
              </Button>
            </div>
          )}
          {!loadingHistory && !historyError && history.length === 0 && (
            <Card className="p-5">
              <p className="text-sm text-slate-600">No announcements sent yet.</p>
            </Card>
          )}
          {history.map((item) => (
            <Card key={item.id} className="p-5">
              <h3 className="font-bold text-navy-900">{item.title}</h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">
                {item.body}
              </p>
              <dl className="mt-4 space-y-2 text-sm">
                {[
                  ['Audience', announcementAudienceLabels[item.audience]],
                  ['Recipients', String(item.recipientCount)],
                  ['Sent by', item.senderName],
                  [
                    'Sent',
                    new Intl.DateTimeFormat('en-CA', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'America/Edmonton',
                    }).format(new Date(item.createdAt)) + ' · Alberta time',
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right font-medium text-navy-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
          {hasMore && (
            <Button
              type="button"
              variant="secondary"
              loading={loadingMore}
              onClick={() => void loadMore()}
            >
              Load more
            </Button>
          )}
        </section>
        <ConfirmDialog
          open={Boolean(preview)}
          title="Send announcement?"
          confirmLabel="Send announcement"
          cancelLabel="Back to edit"
          busy={sending}
          onConfirm={() => void send()}
          onCancel={() => setPreview(null)}
          description={
            preview && (
              <div className="space-y-3">
                <p>
                  {announcementAudienceLabels[preview.audience]} · {preview.recipientCount}{' '}
                  recipients
                </p>
                <p className="font-semibold text-navy-900">{preview.title}</p>
                <p className="whitespace-pre-wrap break-words">{preview.body}</p>
                <p>Delivery follows each recipient’s notification preferences.</p>
              </div>
            )
          }
        />
      </div>
    </DashboardLayout>
  );
}
