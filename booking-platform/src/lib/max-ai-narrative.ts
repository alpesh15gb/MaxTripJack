import type {MaxAiAction, MaxAiCard} from './max-ai-contract';

const continuation = 'I can help you find options and open the right step. Complete bookings, payments and changes in the app, where you can review the details and confirm.';
const unverifiedPrice = 'I do not have a verified fare or room rate to quote in this reply. Search with your route or destination and dates to see current prices.';

function clauses(text: string) {
  // Do not split decimal prices. Separate contrasting clauses so an unrelated
  // negation cannot excuse a later assertion ("not refunded, but payment succeeded").
  return text.replace(/[’‘]/g, "'").split(/(?<=[.!?])\s+(?=[A-Z])|[;\n]+|\b(?:but|however|although|yet)\b/gi).map(value => value.trim()).filter(Boolean);
}

function isQuestionOrExplanation(clause: string) {
  if (/^(?:can|could|would|should|may|do|does|did|is|are|has|have|how|what|when|where|why|who)\b/i.test(clause) && clause.endsWith('?')) return true;
  if (/^(?:if|unless)\b/i.test(clause)) return true;
  return /\b(?:does not|doesn't|doesn’t|do not|don't|cannot|can't)\s+(?:necessarily\s+)?(?:mean|prove|guarantee|confirm)\b/i.test(clause);
}

function claimsCompletedAction(clause: string) {
  if (isQuestionOrExplanation(clause)) return false;
  const personal = /\b(?:i(?:'ve| have)?|we(?:'ve| have)?)\s+(?:successfully\s+|already\s+|just\s+)?(?:booked|paid|cancelled|canceled|refunded|reserved|sent|updated your|changed your|confirmed your)\b/i;
  const status = /\b(?:(?:your|the)\s+)?(?:booking|reservation|ticket|flight|hotel|stay|payment|refund|cancellation|booking change|booking modification)\s+(?:(?:has|have)\s+been\s+|(?:is|are|was|were|has|have)\s+)?(?:now\s+|already\s+|successfully\s+)?(?:confirmed|successful|successfully completed|completed|received|processed|issued|paid|booked|reserved|cancelled|canceled|refunded|updated|changed|succeeded)\b/i;
  const completed = /\b(?:successfully\s+)?(?:confirmed|booked|reserved|cancelled|canceled|refunded|updated|changed|processed)\s+(?:your|the)\s+(?:booking|reservation|ticket|payment|refund|flight|hotel|stay)\b/i;
  return [personal, status, completed].some(pattern => {
    const match = pattern.exec(clause);
    if (!match) return false;
    const before = clause.slice(0, match.index);
    return !/\b(?:not|never|haven't|hasn't|didn't|wasn't|weren't|cannot|can't|don't|doesn't)\s+(?:\w+\s+){0,2}$/i.test(before);
  });
}

function claimsCompletedNavigation(clause: string) {
  if (isQuestionOrExplanation(clause)) return false;
  return /\b(?:i(?:'ve| have)?|we(?:'ve| have)?)\s+(?:(?:successfully|already|just|now)\s+)*(?:opened|navigated|redirected|taken you|brought you|switched|launched)\b/i.test(clause)
    || /\byou(?:'ve| have)\s+been\s+(?:(?:successfully|already|just|now)\s+)*(?:redirected|taken|brought|navigated)\b/i.test(clause)
    || /\b(?:page|screen|section|tab|window)\s+(?:has been|is|was)\s+(?:(?:successfully|already|just|now)\s+)*(?:opened|open|loaded)\b/i.test(clause)
    || /^(?:(?:successfully|already|just|now)\s+)*(?:opened|navigated|redirected|taken you|brought you|switched)\b/i.test(clause);
}

function navigationInstruction(actions: readonly MaxAiAction[]) {
  if (!actions.length) return 'Tell me which page you want to visit so I can provide the right navigation option.';
  if (actions.length === 1) return `Choose “${actions[0].label}” below to continue.`;
  return 'Choose one of the options below to continue.';
}

function amounts(text: string) {
  return [...text.matchAll(/(?:₹|\$|€|£|\b(?:INR|USD|EUR|GBP|Rs\.?))\s*(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:rupees?|INR|USD|EUR|GBP)\b/gi)]
    .map(match => Number((match[1] || match[2]).replaceAll(',', '')));
}

function claimsUnverifiedPrice(text: string, userMessage: string) {
  const userAmounts = new Set([...userMessage.matchAll(/\b\d[\d,]*(?:\.\d{1,2})?\b/g)].map(match => Number(match[0].replaceAll(',', ''))));
  for (const clause of clauses(text)) {
    const prices = amounts(clause);
    if (!prices.length) continue;
    // Acknowledging a budget supplied by this visitor is not a supplier quote.
    const budgetAcknowledgment = /\b(?:budget|spend(?:ing)?|up to|under|below|within|maximum|at most|around)\b/i.test(clause)
      && !/\b(?:found|available|fare|rate|price|costs?|total|starts?\s+at)\b/i.test(clause)
      && prices.every(amount => userAmounts.has(amount));
    if (!budgetAcknowledgment) return true;
  }
  return false;
}

/** Keep only short planning questions alongside trusted results. A question mark
 * must not smuggle a price, policy, completed action or request for private data. */
export function maxAiClarificationQuestions(text: string, userMessage: string): string[] {
  const questions = text.trim().slice(0, 4000).split(/(?<=[.!?])\s+|[\r\n]+/).map(value => value.trim());
  return [...new Set(questions.filter(question => {
    if (question.length > 280 || !question.endsWith('?')) return false;
    if (!/^(?:for [^,?!]{1,80},\s*)?(?:which|what|when|where|how many|how old|do you (?:mean|prefer|want|need)|would you (?:prefer|like)|is (?:your|the) budget)\b/i.test(question)) return false;
    if (!/\b(?:airport|route|journey|trip|date|dates|month|year|city|country|destination|departure|depart|return|adult|adults|child|children|age|ages|traveller|travellers|guest|guests|room|rooms|night|nights|duration|nationality|purpose|cabin|budget|person|people|timing|flexib\w*|BOM|NMI)\b/i.test(question)) return false;
    if (/\b(?:fare|fares|price|prices|rate|rates|cost|costs|available|availability|refundable|refund|free|included|guarantee\w*|booked|reserved|confirmed|approved|accepted|activated|successful|successfully|received|processed|issued|paid|cancelled|canceled|refunded|updated|changed|succeeded|submitted|saved|sent|opened|redirected|launched|book|pay|cancel|submit|password|otp|authenticator|payment|card|upi|phone|email|contact|aadhaar|pan|api\s+key|passport\s+(?:number|no|details|copy|photo))\b/i.test(question)) return false;
    if (/https?:|www\.|@|[<>]|\+[1-9][\d ()-]{7,}\d/i.test(question) || amounts(question).length || claimsUnverifiedPrice(question, userMessage)) return false;
    return !claimsCompletedAction(question) && !claimsCompletedNavigation(question);
  }))].slice(0, 2);
}

/**
 * Result summaries derive from server cards, never free-form model claims. The
 * no-result checks are conservative presentation safeguards, not a proof that
 * arbitrary natural-language output is accurate. Ownership and permissions
 * remain enforced by the tools, independently of this helper.
 */
export function finalizeMaxAiNarrative(text: string, cards: readonly MaxAiCard[], actions: readonly MaxAiAction[], userMessage: string): string {
  if (cards.length) {
    const types = new Set(cards.map(card => card.type));
    const summaries: string[] = [];
    if (types.has('flight')) summaries.push('Here are flight options returned by the app. Check each card\'s price basis, then open a result to review the current fare and conditions.');
    if (types.has('hotel')) summaries.push('Here are hotel options returned by the app. Open a stay to choose a room and check its current price, inclusions and cancellation conditions.');
    if (types.has('package')) summaries.push('Here are published holiday packages. Prices are indicative; open a package to check its details and request current availability and a final quote.');
    if (types.has('trip')) summaries.push('Your booking records are shown below. Open a trip to check its current booking, payment and refund status.');
    return [...summaries, ...maxAiClarificationQuestions(text, userMessage)].join('\n\n');
  }
  const trimmed = text.trim().slice(0, 4000);
  if (clauses(trimmed).some(claimsCompletedAction)) {
    return actions.some(action => action.href === '/my-trips')
      ? 'Open My trips to check the current booking, payment or refund status. Complete any new booking or change in the app, where you can review and confirm it.'
      : continuation;
  }
  if (claimsUnverifiedPrice(trimmed, userMessage)) return unverifiedPrice;
  const sentences = clauses(trimmed);
  if (sentences.some(claimsCompletedNavigation)) {
    // Keep accurate guidance that accompanies the false navigation sentence.
    const guidance = sentences.filter(sentence => !claimsCompletedNavigation(sentence)).join(' ').replace(/[,;]\s*$/, '.');
    return [guidance, navigationInstruction(actions)].filter(Boolean).join('\n\n').slice(0, 4000);
  }
  return trimmed || 'Tell me the journey or task you would like help with.';
}
