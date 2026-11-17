'use client';

import Link from 'next/link';
import OperationsPageNavigation from './operations-page-navigation';
import {useCallback, useEffect, useRef, useState} from 'react';
import {authClient} from '@/lib/auth-client';
import {enquiryContactSchema, enquiryDraftSchema, enquiryServiceLabels, enquiryServices, type EnquiryContact, type EnquiryDraft, type EnquiryReceipt, type EnquiryStatus} from '@/lib/travel-enquiry-contract';
import '@/app/enquiry-experience.css';
import '@/app/operations-utility-pages.css';

type Row = EnquiryReceipt & {version: number; updatedAt: string; draft: EnquiryDraft; contact: EnquiryContact; contactVerified: boolean; internalNote: string};
type Filters = {q: string; service: string; status: string};
const emptyFilters: Filters = {q: '', service: '', status: ''};
const statuses: EnquiryStatus[] = ['NEW', 'CONTACTED', 'QUOTED', 'CLOSED'];
const statusLabels: Record<EnquiryStatus, string> = {NEW: 'New', CONTACTED: 'Contacted', QUOTED: 'Quoted', CLOSED: 'Closed'};
const crmLabels = {PENDING: 'Safar delivery pending', DELIVERED: 'Saved in Safar', ACTION_REQUIRED: 'Safar delivery needs attention', NOT_CONFIGURED: 'Safar not configured', LEGACY_DELIVERY: 'Delivered to previous CRM', DESTINATION_REVIEW: 'Review previous CRM destination'};
const legacyDelivery = (row: Row) => row.crmStatus === 'LEGACY_DELIVERY' || row.crmStatus === 'DESTINATION_REVIEW';
const retryEligible = (row: Row) => ['ACTION_REQUIRED', 'NOT_CONFIGURED'].includes(row.crmStatus) && (row.crmEnvironment === 'test' || row.crmEnvironment === 'live');

function isRow(value: unknown): value is Row {
  if (!value || typeof value !== 'object') return false;
  const item = value as Row;
  return typeof item.id === 'string' && typeof item.reference === 'string' && item.reference.length <= 60 &&
    statuses.includes(item.status) && Object.hasOwn(crmLabels, item.crmStatus) && Number.isSafeInteger(item.version) &&
    (item.crmEnvironment === undefined || item.crmEnvironment === 'test' || item.crmEnvironment === 'live') &&
    typeof item.createdAt === 'string' && typeof item.updatedAt === 'string' && typeof item.internalNote === 'string' &&
    enquiryDraftSchema.safeParse(item.draft).success && item.service === item.draft.service && enquiryContactSchema.safeParse(item.contact).success;
}
function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-IN', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata'}).format(date);
}
function details(draft: EnquiryDraft): [string, string][] {
  return [
    ['Destination', draft.destination], ['Travel window', draft.travelWindow], ['Adults', String(draft.adults)], ['Children', draft.childAges.length ? draft.childAges.join(', ') + ' years' : 'None'],
    ['Departure city', draft.departureCity], ['Start date', draft.travelStart], ['End date', draft.travelEnd], ['Nights', draft.durationNights ? String(draft.durationNights) : undefined],
    ['Passport nationality', draft.nationality], ['Country of residence', draft.countryOfResidence], ['Purpose', draft.purpose], ['Traveller ages', draft.travellerAges?.join(', ')],
    ['Budget', draft.budgetRupees ? `₹${draft.budgetRupees.toLocaleString('en-IN')} · ${draft.budgetBasis === 'PER_PERSON' ? 'per person' : 'all travellers'}` : undefined],
    ['Cabin preference', draft.cabinPreference], ['Preferences', draft.notes],
  ].filter((pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1].length > 0);
}

async function read(response: Response) {
  const text = await response.text();
  if (text.length > 500_000) throw Error('The enquiry list is too large to display. Narrow your search.');
  let data: Record<string, unknown>;
  try {data = JSON.parse(text);} catch {throw Error('The server response could not be checked. Try refreshing the list.');}
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('The server response could not be checked.');
  if (!response.ok) throw Error(typeof data.error === 'string' ? data.error.slice(0, 500) : 'This action could not be completed.');
  return data;
}

function EnquiryWorkspace() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canRetryCrm, setCanRetryCrm] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const fetchController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mutating = useRef(false);

  const load = useCallback(async (nextFilters: Filters, nextPage: number) => {
    const current = ++generation.current;
    fetchController.current?.abort();
    const controller = new AbortController(); fetchController.current = controller;
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({page: String(nextPage)});
      for (const [name, value] of Object.entries(nextFilters)) if (value) query.set(name, value);
      const response = await fetch('/api/admin/enquiries?' + query, {cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)])});
      const data = await read(response);
      if (controller.signal.aborted || current !== generation.current) return;
      if (!Array.isArray(data.rows) || !data.rows.every(isRow) || !Number.isSafeInteger(data.page) || !Number.isSafeInteger(data.total)) throw Error('The enquiry list could not be checked. Please refresh.');
      setRows(data.rows); setPage(Number(data.page)); setTotal(Number(data.total)); setHasMore(data.hasMore === true);
      setCanManage(data.canManage === true); setCanRetryCrm(data.canRetryCrm === true); setFilters(nextFilters); setReady(true); setNeedsRefresh(false);
    } catch (cause) {
      if (!controller.signal.aborted && current === generation.current) {
        setRows([]); setCanManage(false); setCanRetryCrm(false); setReady(false);
        setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'The enquiry list took too long to load. Please try again.');
      }
    } finally {if (!controller.signal.aborted && current === generation.current) setLoading(false);}
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(emptyFilters, 1), 0);
    return () => {clearTimeout(timer); generation.current += 1; fetchController.current?.abort(); mutationController.current?.abort();};
  }, [load]);

  async function update(row: Row, values: {status: string; internalNote: string} | {action: 'retry_crm'}) {
    if (mutating.current || loading || needsRefresh) return;
    if ('action' in values && (!canRetryCrm || !retryEligible(row))) return;
    mutating.current = true; setBusyId(row.id); setError(''); setMessage('');
    const controller = new AbortController(); mutationController.current = controller;
    try {
      const retry = 'action' in values;
      const response = await fetch('/api/admin/enquiries', {method: retry ? 'POST' : 'PATCH', credentials: 'same-origin', redirect: 'error', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id: row.id, version: row.version, ...values}), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])});
      const data = await read(response);
      if (controller.signal.aborted) return;
      if (retry ? data.ok !== true : !isRow(data.enquiry)) throw Error('The update result could not be verified.');
      setMessage(retry ? 'Safar delivery queued for retry in the recorded mode. Refresh to check its outcome.' : `${row.reference} updated.`);
      await load(filters, page);
    } catch (cause) {
      if (!controller.signal.aborted) {setNeedsRefresh(true); setError((cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'The update took too long to confirm.') + ' Refresh the list before making another change.');}
    } finally {mutating.current = false; if (!controller.signal.aborted) setBusyId('');}
  }

  return <main className="enquiry-admin" id="main-content">
    <OperationsPageNavigation active="enquiries"/>
    <header className="enquiry-admin-top"><div><p className="ops-utility-eyebrow">CUSTOMER REQUESTS</p><h1>Travel enquiries</h1><p>Visa, insurance, holiday and cruise requests saved by customers. An enquiry is not a booking.</p></div><button type="button" disabled={loading || Boolean(busyId)} onClick={() => void load(filters, page)}>Refresh enquiries</button></header>
    {error && <p className="enquiry-admin-message" role="alert">{error}</p>}
    {message && <p className="enquiry-admin-message" role="status">{message}</p>}
    {!ready ? <section><p role="status">{loading ? 'Checking access and loading enquiries…' : 'Enquiries are unavailable until access and the latest records can be checked.'}</p><Link href="/account">Account &amp; security</Link></section> : <>
      <form className="enquiry-admin-filters" aria-label="Filter enquiries" onSubmit={event => {event.preventDefault(); const data = new FormData(event.currentTarget); void load({q: String(data.get('q') ?? '').trim(), service: String(data.get('service') ?? ''), status: String(data.get('status') ?? '')}, 1);}}>
        <label>Search enquiries<input name="q" maxLength={100} defaultValue={filters.q} placeholder="Reference, destination or contact" disabled={Boolean(busyId)}/></label>
        <label>Service<select name="service" aria-label="Service" defaultValue={filters.service} disabled={Boolean(busyId)}><option value="">All services</option>{enquiryServices.map(service => <option value={service} key={service}>{enquiryServiceLabels[service]}</option>)}</select></label>
        <label>Status<select name="status" aria-label="Status" defaultValue={filters.status} disabled={Boolean(busyId)}><option value="">All statuses</option>{statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
        <button type="submit" disabled={loading || Boolean(busyId)}>Apply filters</button>
      </form>
      <p role="status">{loading ? 'Updating enquiries…' : `${total} enquir${total === 1 ? 'y' : 'ies'} · Page ${page}`}{!canManage ? ' · Read-only access' : ''}</p>
      {!rows.length && !loading && <section className="enquiry-admin-card"><h2>No enquiries match</h2><p>Try another service or status, or clear your search.</p></section>}
      <div className="enquiry-admin-list">{rows.map(row => <article key={`${row.id}:${row.version}`} className="enquiry-admin-card" aria-label={row.reference}>
        <header><div><h2>{row.reference}</h2><p>{enquiryServiceLabels[row.service]} · {row.draft.destination}</p></div><div className="enquiry-admin-tags"><span className="enquiry-admin-tag">{statusLabels[row.status]}</span><span className="enquiry-admin-tag">{crmLabels[row.crmStatus]}</span>{!legacyDelivery(row) && <span className="enquiry-admin-tag">{row.crmEnvironment === 'test' ? 'Safar · Test enquiries' : row.crmEnvironment === 'live' ? 'Safar · Live enquiries' : 'Safar mode unavailable'}</span>}</div></header>
        {row.crmStatus === 'DESTINATION_REVIEW' ? <p>This enquiry predates the Safar destination. Automatic delivery is held. Check its previous CRM destination before arranging any separate transfer; retry is disabled here.</p>
          : row.crmStatus === 'LEGACY_DELIVERY' ? <p>This receipt records delivery to the previous CRM, not confirmation in Safar. It will not be automatically resent to Safar.</p>
          : row.crmEnvironment === 'test' ? <p>This request belongs in Safar’s Test enquiries view, separate from live customer enquiries.</p>
          : !row.crmEnvironment ? <p>The Safar delivery mode is not recorded. Check the destination configuration before arranging delivery; retry is disabled here.</p> : null}
        <p>{row.draft.travelWindow} · {row.draft.adults} adult{row.draft.adults === 1 ? '' : 's'}{row.draft.childAges.length ? ` · ${row.draft.childAges.length} ${row.draft.childAges.length === 1 ? 'child' : 'children'}` : ''}</p>
        <div className="enquiry-admin-contact"><strong>{row.contact.name}</strong>{row.contact.email && <a href={`mailto:${row.contact.email}`}>{row.contact.email}</a>}{row.contact.phone && <a href={`tel:${row.contact.phone}`}>{row.contact.phone}</a>}<small>Preferred reply: {row.contact.preferredChannel === 'EMAIL' ? 'Email' : row.contact.preferredChannel === 'PHONE' ? 'Phone call' : 'WhatsApp'} · {row.contactVerified ? 'Verified contact' : 'Customer-provided contact; not verified'}</small></div>
        <details className="enquiry-admin-details"><summary>Travel details &amp; follow-up</summary><dl>{details(row.draft).map(([label, value]) => <div className="enquiry-admin-detail-pair" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}{row.crmReference && <div className="enquiry-admin-detail-pair"><dt>{legacyDelivery(row) ? 'Previous CRM reference' : 'Safar reference'}</dt><dd>{row.crmReference}</dd></div>}</dl>
          {canManage ? <form className="enquiry-admin-edit" aria-label={`Update ${row.reference}`} onSubmit={event => {event.preventDefault(); const data = new FormData(event.currentTarget); void update(row, {status: String(data.get('status')), internalNote: String(data.get('internalNote') ?? '')});}}>
            <label>Enquiry status<select name="status" aria-label="Enquiry status" defaultValue={row.status} disabled={loading || Boolean(busyId) || needsRefresh}>{statuses.map(status => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
            <label>Internal follow-up note<textarea name="internalNote" aria-label="Internal follow-up note" aria-describedby={`enquiry-note-help-${row.id}`} rows={3} maxLength={2000} defaultValue={row.internalNote} disabled={loading || Boolean(busyId) || needsRefresh}/><small id={`enquiry-note-help-${row.id}`}>For staff only. This note is not sent to the customer or Max AI.</small></label>
            <button type="submit" className="enquiry-admin-save" disabled={loading || Boolean(busyId) || needsRefresh}>{busyId === row.id ? 'Saving…' : 'Save follow-up'}</button>
          </form> : row.internalNote && <p><strong>Internal note:</strong> {row.internalNote}</p>}
          {canRetryCrm && retryEligible(row) && <p><button type="button" disabled={loading || Boolean(busyId) || needsRefresh} onClick={() => void update(row, {action: 'retry_crm'})}>Retry Safar delivery</button></p>}
        </details>
        <p className="enquiry-admin-meta">Received {when(row.createdAt)} · Updated {when(row.updatedAt)} · India time</p>
      </article>)}</div>
      <nav className="enquiry-admin-pages" aria-label="Enquiry pages"><button type="button" disabled={page <= 1 || loading || Boolean(busyId)} onClick={() => void load(filters, page - 1)}>Previous page</button><span>Page {page}</span><button type="button" disabled={!hasMore || loading || Boolean(busyId)} onClick={() => void load(filters, page + 1)}>Next page</button></nav>
    </>}
  </main>;
}

export default function EnquiryAdmin() {
  const {data: session, isPending} = authClient.useSession();
  if (isPending) return <main id="main-content" className="enquiry-admin"><OperationsPageNavigation active="enquiries"/><h1>Travel enquiries</h1><p role="status">Checking your session…</p></main>;
  return <EnquiryWorkspace key={session?.user.id ?? 'guest'}/>;
}
