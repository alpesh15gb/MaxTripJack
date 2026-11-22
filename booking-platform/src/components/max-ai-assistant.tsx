'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useCallback, useEffect, useId, useRef, useState, type MutableRefObject} from 'react';
import {authClient} from '@/lib/auth-client';
import {displayMoney} from '@/lib/display-money';
import {isMaxAiActionHref, type MaxAiAction, type MaxAiCard, type MaxAiResponse} from '@/lib/max-ai-contract';
import {enquiryDraftSchema, type EnquiryDraft} from '@/lib/travel-enquiry-contract';
import MaxAiEnquiry from './max-ai-enquiry';
import {observeLauncherPlacement} from './max-ai-launcher-placement';
import '@/app/max-ai.css';

const REQUEST_TIMEOUT_MS = 90_000;
const MAX_MESSAGE_LENGTH = 2_000;
const starters = [
  {icon: 'flight', label: 'Find a flight', message: 'I want to book a flight ticket.'},
  {icon: 'hotel', label: 'Find a hotel', message: 'Help me find a hotel.'},
  {icon: 'spark', label: 'Holiday packages', message: 'Help me plan a holiday package.'},
  {icon: 'cruise', label: 'Cruise holidays', message: 'Help me plan a cruise holiday.'},
  {icon: 'passport', label: 'Visa assistance', message: 'I want a visa.'},
  {icon: 'shield', label: 'Travel insurance', message: 'Help me find travel insurance.'},
  {icon: 'trip', label: 'My bookings', message: 'Show me my bookings and their current status.'},
  {icon: 'spark', label: 'Plan a trip', message: 'Help me plan my next trip.'},
] as const;
type IconName = 'spark' | 'flight' | 'hotel' | 'trip' | 'passport' | 'shield' | 'cruise' | 'send' | 'close' | 'plus' | 'arrow' | 'stop';
type ChatMessage = {id: number; role: 'user' | 'assistant'; text: string; cards?: MaxAiCard[]; actions?: MaxAiAction[]; notice?: string; enquiryDraft?: EnquiryDraft};
type FailedRequest = {message: string; token?: string};
type DraftRequest = {text:string} | null;
type CancelRef = MutableRefObject<(() => void) | null>;

function AiIcon({name, size = 20}: {name: IconName; size?: number}) {
  const paths: Record<IconName, string> = {
    spark: 'm12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 2Z',
    flight: 'm22 2-7 20-4-9-9-4L22 2ZM11 13l6-6',
    hotel: 'M4 21V3h12v18M16 10h4v11M8 7h4M8 11h4M8 15h4M8 21v-3h4v3',
    trip: 'M4 7h16v14H4V7Zm4 0V3h8v4M8 11v5m8-5v5',
    passport: 'M5 2h14v20H5V2Zm3 16h8M8 9a4 4 0 1 0 8 0 4 4 0 0 0-8 0Zm4-4v8M8 9h8',
    shield: 'm12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 9 3 3 5-6',
    cruise: 'M3 12 12 8l9 4-3 7H6l-3-7Zm4-2V5h10v5M10 5V2h4v3M2 22c2 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2',
    send: 'M12 20V4M5 11l7-7 7 7',
    close: 'm6 6 12 12M6 18 18 6',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M5 12h14m-6-6 6 6-6 6',
    stop: 'M6 6h12v12H6V6Z',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}

function action(value: unknown): value is MaxAiAction {
  if (!value || typeof value !== 'object') return false;
  const item = value as MaxAiAction;
  return typeof item.label === 'string' && item.label.length > 0 && item.label.length <= 120 && isMaxAiActionHref(item.href);
}

/** The model's prose never becomes HTML, an action, or a URL. */
function responsePayload(value: unknown): MaxAiResponse | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Partial<MaxAiResponse>;
  if (typeof payload.reply !== 'string' || payload.reply.length > 16_000 || !Array.isArray(payload.cards) || !Array.isArray(payload.actions)) return null;
  const cards = payload.cards.slice(0, 12).filter((card): card is MaxAiCard => {
    return Boolean(card && typeof card === 'object' && typeof card.id === 'string' && card.id.length <= 200 &&
      ['flight', 'hotel', 'package', 'trip'].includes(card.type) && typeof card.title === 'string' && card.title.length <= 500 &&
      typeof card.subtitle === 'string' && card.subtitle.length <= 800 && Array.isArray(card.details) && card.details.length <= 12 &&
      card.details.every(detail => typeof detail === 'string' && detail.length <= 800) && action(card.action) &&
      (card.priceMinor === undefined || (Number.isSafeInteger(card.priceMinor) && card.priceMinor >= 0)) &&
      (card.currency === undefined || typeof card.currency === 'string') && (card.basis === undefined || typeof card.basis === 'string'));
  });
  const enquiry = enquiryDraftSchema.safeParse(payload.enquiryDraft);
  return {
    reply: payload.reply, cards, actions: payload.actions.slice(0, 8).filter(action),
    conversationToken: typeof payload.conversationToken === 'string' && payload.conversationToken.length <= 50 * 1024 ? payload.conversationToken : undefined,
    notice: typeof payload.notice === 'string' ? payload.notice.slice(0, 1_000) : undefined,
    ...(enquiry.success ? {enquiryDraft: enquiry.data} : {}),
  };
}

function ResultCard({card, onNavigate}: {card: MaxAiCard; onNavigate: () => void}) {
  const label = {flight: 'Flight option', hotel: 'Hotel option', package: 'Holiday package', trip: 'Your booking'}[card.type];
  return <article className={`max-ai-result max-ai-result--${card.type}`} aria-label={card.title}>
    <div className="max-ai-result-kind"><AiIcon name={card.type === 'package' ? 'spark' : card.type} size={15}/>{label}</div>
    <h3>{card.title}</h3>
    {card.subtitle && <p className="max-ai-result-subtitle">{card.subtitle}</p>}
    {card.details.length > 0 && <ul>{card.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>}
    <div className="max-ai-result-bottom">
      <div>{card.priceMinor !== undefined && card.currency === 'INR' && <strong>{displayMoney(card.priceMinor)}</strong>}{card.basis && <small>{card.basis}</small>}</div>
      <Link href={card.action.href} prefetch={false} onClick={onNavigate}>{card.action.label}<AiIcon name="arrow" size={16}/></Link>
    </div>
  </article>;
}

function Conversation({open, pathname, cancelRef, nextDraft, onNavigate}: {nextDraft: DraftRequest; open: boolean; pathname: string; cancelRef: CancelRef; onNavigate: () => void}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState(nextDraft?.text ?? '');
  const [appliedDraft, setAppliedDraft] = useState(nextDraft);
  if (nextDraft !== appliedDraft) {
    setAppliedDraft(nextDraft);
    if (nextDraft) setDraft(nextDraft.text);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stopped, setStopped] = useState(false);
  const [failed, setFailed] = useState<FailedRequest | null>(null);
  const token = useRef<string | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const activePrompt = useRef('');
  const generation = useRef(0);
  const sequence = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const id = useId();

  const stop = useCallback(() => {
    if (!request.current) return;
    generation.current += 1;
    request.current.abort();
    request.current = null;
    setBusy(false);
    setStopped(true);
    setDraft(activePrompt.current);
  }, []);

  useEffect(() => {
    cancelRef.current = stop;
    return () => {cancelRef.current = null; generation.current += 1; request.current?.abort();};
  }, [cancelRef, stop]);
  useEffect(() => {if (open) input.current?.focus({preventScroll:true});}, [open]);
  useEffect(() => {
    if (!open || !messages.length) return;
    latest.current?.scrollIntoView({block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }, [messages, open]);

  function newChat() {
    generation.current += 1;
    request.current?.abort(); request.current = null; token.current = undefined;
    activePrompt.current = '';
    setMessages([]); setDraft(''); setBusy(false); setError(''); setStopped(false); setFailed(null);
    requestAnimationFrame(() => input.current?.focus({preventScroll: true}));
  }

  async function send(message: string, retry?: FailedRequest) {
    const text = message.trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    activePrompt.current = text;
    const current = ++generation.current;
    const previousToken = retry ? retry.token : token.current;
    setBusy(true); setError(''); setStopped(false); setFailed(null); setDraft('');
    if (!retry) setMessages(previous => [...previous.slice(-23), {id: ++sequence.current, role: 'user', text}]);
    let timedOut = false;
    const timeout = window.setTimeout(() => {timedOut = true; controller.abort();}, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('/api/travel/max-ai', {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message: text, ...(previousToken ? {conversationToken: previousToken} : {}), pageContext: {pathname}}),
        signal: controller.signal,
      });
      const body = await response.text();
      if (body.length > 120_000) throw new Error('Max AI returned an incomplete response. Please try again.');
      let value: unknown;
      try {value = JSON.parse(body);} catch {throw new Error('Max AI could not complete this request. Please try again.');}
      if (generation.current !== current || controller.signal.aborted) return;
      if (response.status === 409) {
        token.current = undefined;
        setMessages([]);
        setDraft(text);
        setFailed(null);
        setError('This conversation has expired or your account changed. Your message is ready to send in a new chat.');
        return;
      }
      if (!response.ok) {
        const message = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error.slice(0, 500) : 'Max AI is unavailable right now. Please try again shortly.';
        throw new Error(message);
      }
      const result = responsePayload(value);
      if (!result) throw new Error('Max AI returned an incomplete response. Please try again.');
      if (generation.current !== current || controller.signal.aborted) return;
      token.current = result.conversationToken;
      setMessages(previous => [...previous.slice(-23), {id: ++sequence.current, role: 'assistant', text: result.reply, cards: result.cards, actions: result.actions, notice: result.notice, enquiryDraft: result.enquiryDraft}]);
    } catch (cause) {
      if (generation.current !== current) return;
      setError(timedOut ? 'Max AI is taking longer than expected. You can retry or use the booking screens below.' : cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'The response was stopped. Please try again when you are ready.');
      setDraft(text);
      setFailed({message: text, token: previousToken});
    } finally {
      window.clearTimeout(timeout);
      if (generation.current === current) {request.current = null; setBusy(false);}
    }
  }

  return <>
    <div className="max-ai-conversation-tools"><span>Ask. Explore. Travel.</span><button type="button" onClick={newChat}><AiIcon name="plus" size={15}/>New chat</button></div>
    <div className="max-ai-messages" aria-label="Conversation with Max AI" role="log" aria-live="polite" aria-relevant="additions">
      {!messages.length && <section className="max-ai-welcome" aria-labelledby={`${id}-welcome`}>
        <div className="max-ai-welcome-mark"><AiIcon name="spark" size={31}/></div>
        <p className="max-ai-eyebrow">YOUR NEXT JOURNEY STARTS HERE</p>
        <h3 id={`${id}-welcome`}>Where to next?</h3>
        <p>Find flights and stays, explore holidays and cruises, or ask our team about visas and travel insurance. I can also help with your existing bookings.</p>
        <div className="max-ai-starters">{starters.map(starter => <button key={starter.label} type="button" onClick={() => void send(starter.message)}><AiIcon name={starter.icon}/><span>{starter.label}</span><AiIcon name="arrow" size={15}/></button>)}</div>
        <p className="max-ai-privacy">Your travel request is processed by Max AI. Enter passwords, verification codes and payment details only in the secure account or checkout screens.</p>
      </section>}
      {messages.map((message, index) => <div ref={index === messages.length - 1 ? latest : undefined} className={`max-ai-message max-ai-message--${message.role}`} key={message.id}>
        <div className="max-ai-message-label">{message.role === 'assistant' && <AiIcon name="spark" size={14}/>}<span>{message.role === 'assistant' ? 'Max AI' : 'You'}</span></div>
        {message.text && <p className="max-ai-message-text">{message.text}</p>}
        {Boolean(message.cards?.length) && <div className="max-ai-results">{message.cards?.map((card, cardIndex) => <ResultCard key={`${card.id}-${cardIndex}`} card={card} onNavigate={onNavigate}/>)}</div>}
        {message.enquiryDraft && <MaxAiEnquiry draft={message.enquiryDraft} superseded={messages.slice(index + 1).some(later => later.enquiryDraft?.service === message.enquiryDraft?.service)}/>}
        {Boolean(message.actions?.length) && <div className="max-ai-actions">{message.actions?.map((item, actionIndex) => <Link href={item.href} prefetch={false} onClick={onNavigate} key={`${item.href}-${actionIndex}`}>{item.label}<AiIcon name="arrow" size={15}/></Link>)}</div>}
        {message.notice && <p className="max-ai-result-notice">{message.notice}</p>}
      </div>)}
      {busy && <div className="max-ai-working" role="status"><span aria-hidden="true"><i/><i/><i/></span>Max AI is working on your request…</div>}
      {stopped && <p className="max-ai-stopped" role="status">Response stopped. You can send another message whenever you are ready.</p>}
      {error && <div className="max-ai-error"><p role="alert">{error}</p>{failed && <button type="button" onClick={() => void send(failed.message, failed)}>Retry request</button>}<div className="max-ai-error-links"><Link href="/book?product=FLIGHT" prefetch={false} onClick={onNavigate}>Search flights</Link><Link href="/book?product=HOTEL" prefetch={false} onClick={onNavigate}>Search hotels</Link><Link href="/customer-support" prefetch={false} onClick={onNavigate}>Contact support</Link></div></div>}
    </div>
    <form className="max-ai-composer" onSubmit={event => {event.preventDefault(); void send(draft);}} aria-label="Message Max AI">
      <label className="max-ai-sr-only" htmlFor={`${id}-message`}>Your message to Max AI</label>
      <div className="max-ai-input-row"><textarea ref={input} id={`${id}-message`} value={draft} disabled={busy} rows={2} maxLength={MAX_MESSAGE_LENGTH} placeholder="Where would you like to go?" onChange={event => {setDraft(event.target.value); setError(''); setFailed(null);}} onKeyDown={event => {if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {event.preventDefault(); void send(draft);}}}/>{busy ? <button type="button" className="max-ai-send max-ai-stop" onClick={() => {stop(); requestAnimationFrame(() => input.current?.focus());}} aria-label="Stop Max AI response"><AiIcon name="stop" size={17}/><span>Stop</span></button> : <button type="submit" className="max-ai-send" disabled={!draft.trim()} aria-label="Send message to Max AI"><AiIcon name="send" size={19}/><span>Send</span></button>}</div>
      <p>AI assistant · Check current prices and policies before booking.</p>
    </form>
  </>;
}

function AssistantDialog({open, onClosed, launcher, nextDraft}: {nextDraft: DraftRequest; open: boolean; onClosed: () => void; launcher: MutableRefObject<HTMLButtonElement | null>}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const pathname = usePathname();
  const priorPath = useRef(pathname);
  const title = useId();
  const {data: session, isPending} = authClient.useSession();

  function close() {
    cancelRef.current?.();
    dialog.current?.close();
    onClosed();
    requestAnimationFrame(() => {
      if (!dialog.current?.open && !launcher.current?.hidden) launcher.current?.focus({preventScroll: true});
    });
  }

  useEffect(() => {
    const modal = dialog.current;
    if (!open || !modal) return;
    if (!modal.open) modal.showModal();
    modal.querySelector('textarea')?.focus({preventScroll: true});
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {if (modal.open) modal.close(); document.body.style.overflow = overflow;};
  }, [open]);
  useEffect(() => {
    if (priorPath.current !== pathname) {priorPath.current = pathname; dialog.current?.close();}
  }, [pathname]);

  return <dialog ref={dialog} className="max-ai-dialog" aria-labelledby={title} onCancel={event => {event.preventDefault(); close();}} onClose={() => {if (!dialog.current?.open) close();}} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  }}>
    <header className="max-ai-header"><div className="max-ai-avatar"><AiIcon name="spark" size={24}/></div><div><h2 id={title}>Max AI</h2><p>Your AI travel assistant</p></div><button className="max-ai-close" type="button" onClick={close} aria-label="Close Max AI"><AiIcon name="close"/></button></header>
    {isPending ? <div className="max-ai-initializing" role="status">Getting your travel assistant ready…</div> : <Conversation key={session?.user.id ?? 'guest'} open={open} pathname={pathname} cancelRef={cancelRef} nextDraft={nextDraft} onNavigate={close}/>}
  </dialog>;
}

function MaxAiWidget() {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const pathname = usePathname();
  const desktopScope = pathname === '/' ? '.trip-home' : pathname === '/book' ? '.booking-workflow' : 'body';
  const launcher = useRef<HTMLButtonElement>(null);
  const [nextDraft,setNextDraft] = useState<DraftRequest>(null);
  const onClosed = useCallback(() => {setOpen(false); setNextDraft(null);}, []);
  useEffect(() => { if (launcher.current) return observeLauncherPlacement(launcher.current, desktopScope); }, [desktopScope]);
  useEffect(() => {
    const request = (event: Event) => {
      const text = (event as CustomEvent<unknown>).detail;
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_MESSAGE_LENGTH) return;
      setNextDraft({text});
      setHasOpened(true);
      setOpen(true);
    };
    window.addEventListener('maxtravel:compose-message',request);
    return () => window.removeEventListener('maxtravel:compose-message',request);
  }, []);
  return <>
    <button ref={launcher} className={`max-ai-launcher${pathname === '/' ? ' home-max-ai-launcher' : ''}`} type="button" aria-label="Open Max AI travel assistant" aria-haspopup="dialog" aria-expanded={open} hidden={open} onClick={() => {setHasOpened(true); setOpen(true);}}>
      {pathname === '/' ? <><span className="max-ai-launcher-icon"><AiIcon name="spark" size={20}/></span><strong>Ask Max AI</strong></> :
        <><span className="max-ai-launcher-icon"><AiIcon name="spark" size={22}/></span><span><strong>Max AI</strong><small>Ask your travel assistant</small></span></>}
    </button>
    {hasOpened && <AssistantDialog open={open} onClosed={onClosed} launcher={launcher} nextDraft={nextDraft}/>}
    <div className="max-ai-mobile-clearance" aria-hidden="true"/>
  </>;
}

export default function MaxAiAssistant({enabled}: {enabled: boolean}) {
  const pathname = usePathname();
  const inStaffWorkspace = pathname === '/operations' || pathname.startsWith('/operations/');
  return enabled && !inStaffWorkspace ? <MaxAiWidget/> : null;
}
