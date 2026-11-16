import {createCipheriv, createDecipheriv, createHmac, randomBytes} from 'node:crypto';
import {z} from 'zod';

/** Server-only crypto. The browser receives an opaque token, never trusted roles or tool history. */
export type MaxAiToolCall = {
  id: string;
  type: 'function';
  function: {name: string; arguments: string};
};
export type MaxAiMessage =
  | {role: 'user'; content: string}
  | {role: 'assistant'; content: string | null; tool_calls?: MaxAiToolCall[]}
  | {role: 'tool'; content: string; tool_call_id: string};
export type MaxAiActorBinding = {userId: string; companyId: string | null};
type Environment = Record<string, string | undefined>;
type Options = {secret?: string; now?: number; env?: Environment};

export const MAX_AI_CONVERSATION_TTL_MS = 30 * 60 * 1000;
export const MAX_AI_HISTORY_MESSAGES = 24;
export const MAX_AI_HISTORY_BYTES = 24 * 1024;
export const MAX_AI_TOKEN_BYTES = 50 * 1024;

const purpose = 'maxtravel:max-ai:conversation:v1';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const toolCall = z.object({
  id,
  type: z.literal('function'),
  function: z.object({name: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), arguments: z.string().max(8192)}).strict(),
}).strict();
const text = z.string().max(16 * 1024);
const messageSchema = z.discriminatedUnion('role', [
  z.object({role: z.literal('user'), content: text.refine(value => Boolean(value.trim()))}).strict(),
  z.object({role: z.literal('assistant'), content: text.nullable(), tool_calls: z.array(toolCall).min(1).max(8).optional()}).strict(),
  z.object({role: z.literal('tool'), content: text, tool_call_id: id}).strict(),
]);
const historySchema = z.array(messageSchema).max(128);
const actorSchema = z.object({userId: z.string().min(1).max(200), companyId: z.string().min(1).max(200).nullable()});

export class MaxAiConversationError extends Error {
  constructor(public code: 'CONFIGURATION' | 'INVALID' | 'TOO_LARGE') {
    super(code === 'CONFIGURATION' ? 'Max AI conversation encryption is not configured.' : 'Max AI conversation could not be retained. Start a new chat.');
    this.name = 'MaxAiConversationError';
  }
}

function configuredSecret(env: Environment) {
  return (env.MAX_AI_CONVERSATION_SECRET?.trim() || env.BETTER_AUTH_SECRET?.trim() || '');
}
function validSecret(value: string) { return value.length >= 32 && value.length <= 4096; }
export function conversationConfigured(env: Environment = process.env) { return validSecret(configuredSecret(env)); }
function encryptionKey(options: Options) {
  const secret = options.secret === undefined ? configuredSecret(options.env ?? process.env) : options.secret;
  if (!validSecret(secret)) throw new MaxAiConversationError('CONFIGURATION');
  return createHmac('sha256', secret).update(`${purpose}:encryption-key`).digest();
}
function actorData(actor: MaxAiActorBinding) {
  const parsed = actorSchema.safeParse(actor);
  if (!parsed.success) throw new MaxAiConversationError('INVALID');
  // JSON tuples avoid ambiguous concatenation and bind corporate context as well as user identity.
  return Buffer.from(`${purpose}\0${JSON.stringify([parsed.data.userId, parsed.data.companyId])}`, 'utf8');
}
function checkedNow(options: Options) {
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + MAX_AI_CONVERSATION_TTL_MS)) throw new MaxAiConversationError('INVALID');
  return now;
}

/** Reject forged roles and incomplete tool rounds even when called by a server integration. */
function completeTurns(value: unknown): MaxAiMessage[][] {
  const parsed = historySchema.safeParse(value);
  if (!parsed.success) throw new MaxAiConversationError('INVALID');
  const turns: MaxAiMessage[][] = [];
  let current: MaxAiMessage[] | null = null;
  let complete = true;
  let pending = new Set<string>();
  for (const message of parsed.data) {
    if (message.role === 'user') {
      if (!complete || pending.size) throw new MaxAiConversationError('INVALID');
      current = [message]; turns.push(current); complete = false;
    } else if (message.role === 'assistant') {
      if (!current || complete || pending.size) throw new MaxAiConversationError('INVALID');
      if (message.tool_calls) {
        pending = new Set(message.tool_calls.map(call => call.id));
        if (pending.size !== message.tool_calls.length) throw new MaxAiConversationError('INVALID');
      } else {
        if (!message.content?.trim()) throw new MaxAiConversationError('INVALID');
        complete = true;
      }
      current.push(message);
    } else {
      if (!current || !pending.delete(message.tool_call_id)) throw new MaxAiConversationError('INVALID');
      current.push(message);
    }
  }
  if (!complete || pending.size) throw new MaxAiConversationError('INVALID');
  return turns;
}

export function trimMaxAiConversation(messages: readonly MaxAiMessage[]): MaxAiMessage[] {
  const turns = completeTurns(messages);
  let retained = turns.flat();
  while (retained.length > MAX_AI_HISTORY_MESSAGES || Buffer.byteLength(JSON.stringify(retained), 'utf8') > MAX_AI_HISTORY_BYTES) {
    if (turns.length <= 1) throw new MaxAiConversationError('TOO_LARGE');
    turns.shift(); retained = turns.flat();
  }
  return retained;
}

export function sealMaxAiConversation(messages: readonly MaxAiMessage[], actor: MaxAiActorBinding, options: Options = {}): string {
  const key = encryptionKey(options), now = checkedNow(options);
  const retained = trimMaxAiConversation(messages);
  const payload = Buffer.from(JSON.stringify({v: 1, iat: now, exp: now + MAX_AI_CONVERSATION_TTL_MS, messages: retained}), 'utf8');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(actorData(actor));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const token = `mai1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
  if (Buffer.byteLength(token, 'utf8') > MAX_AI_TOKEN_BYTES) throw new MaxAiConversationError('TOO_LARGE');
  return token;
}

const payloadSchema = z.object({
  v: z.literal(1), iat: z.number().int().nonnegative(), exp: z.number().int().nonnegative(),
  messages: z.array(messageSchema).max(MAX_AI_HISTORY_MESSAGES),
}).strict();
function decodeCanonical(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new MaxAiConversationError('INVALID');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new MaxAiConversationError('INVALID');
  return decoded;
}

/** Invalid, expired, tampered or differently owned state is uniformly unavailable. */
export function openMaxAiConversation(token: unknown, actor: MaxAiActorBinding, options: Options = {}): MaxAiMessage[] | null {
  try {
    if (typeof token !== 'string' || token.length > MAX_AI_TOKEN_BYTES) return null;
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'mai1') return null;
    const iv = decodeCanonical(parts[1]), encrypted = decodeCanonical(parts[2]), tag = decodeCanonical(parts[3]);
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length > MAX_AI_HISTORY_BYTES + 256) return null;
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(options), iv);
    decipher.setAAD(actorData(actor)); decipher.setAuthTag(tag);
    const payload = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const parsed = payloadSchema.safeParse(JSON.parse(payload.toString('utf8')));
    if (!parsed.success) return null;
    const value = parsed.data, now = checkedNow(options);
    if (!Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp) || value.iat > now || value.exp !== value.iat + MAX_AI_CONVERSATION_TTL_MS || value.exp <= now) return null;
    if (Buffer.byteLength(JSON.stringify(value.messages), 'utf8') > MAX_AI_HISTORY_BYTES) return null;
    // Validation must not silently trim state supplied by the browser, even if it is authenticated.
    completeTurns(value.messages);
    return value.messages;
  } catch { return null; }
}
