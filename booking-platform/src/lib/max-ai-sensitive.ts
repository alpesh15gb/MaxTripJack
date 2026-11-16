/**
 * Block obvious credentials before model transport. This deliberately does not
 * classify all personal information or guarantee detection of arbitrary secrets.
 */
export function maxAiSensitiveMessage(input: string): boolean {
  const text = input.normalize('NFKC').replace(/[’‘]/g, "'");
  const separator = String.raw`\s*(?:(?:is|equals)\b\s*|[:=]\s*)?`;
  const codeLabels = String.raw`(?:otp|one[ -]?time(?:\s+(?:password|code))?|verification\s+code|authenticator(?:\s+code)?|2fa\s+code|cvv|cvc|card\s+pin|upi\s+pin)`;
  if (new RegExp(String.raw`\b${codeLabels}\b${separator}\d(?:[ -]?\d){2,9}(?!\d)`, 'i').test(text)) return true;

  const credentials = /\b(?:password|passphrase|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|client[ _-]?secret|secret[ _-]?key)\b\s*(?:(?:is|equals)\b\s*|[:=]\s*)?([^\s,;]{3,256})/gi;
  // Ordinary account-help sentences often put these words after a credential
  // label. Do not suppress "password reset", "API key required", etc.
  const helpWords = new Set(['help','please','reset','resetting','recovery','recover','recovered','forgot','forgotten','missing','lost','expired','expiring','invalid','incorrect','wrong','not','never','is','isnt','isn\'t','does','doesnt','doesn\'t','did','didnt','didn\'t','has','have','had','been','was','wasnt','wasn\'t','will','wont','won\'t','can','cant','can\'t','cannot','could','couldnt','couldn\'t','should','shouldnt','shouldn\'t','must','needs','needed','required','requirements','rules','policy','policies','strength','secure','security','safety','manager','managers','field','fields','screen','page','settings','setup','option','button','link','email','emails','message','authentication','verification','support','for','from','with','without','into','where','when','what','which','why','how','change','changes','changed','update','updated','rotation','rotate','works','working','work','available','unavailable','issue','issues','problem','problems','error','errors','stopped','failed','failing','accepted','rejected','disabled','enabled','stored','located','hidden','shown','visible','masked','saved','deleted','revoked','configured','configuring','generated','generating','created','creating','obtain','get','too','very','weak','strong','short','shorter','long','longer']);
  for (const match of text.matchAll(credentials)) {
    const candidate = match[1].replace(/^["'`]+|["'`.!?]+$/g, '');
    if (candidate.length >= 3 && !helpWords.has(candidate.toLowerCase())) return true;
  }

  if (/\bBearer\s+[A-Za-z0-9._~+/-]{16,}={0,2}\b/i.test(text)
    || /\bsk-[A-Za-z0-9_-]{16,}\b/.test(text)
    || /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/.test(text)) return true;

  // Luhn avoids treating common dates, booking references, budgets and ordinary
  // phone numbers as payment-card credentials. Masked last-four digits pass.
  for (const match of text.matchAll(/(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g)) {
    const digits = match[0].replace(/[ -]/g, '');
    if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) continue;
    let sum = 0, double = false;
    for (let index = digits.length - 1; index >= 0; index--) {
      let digit = Number(digits[index]);
      if (double) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit; double = !double;
    }
    if (sum % 10 === 0) return true;
  }
  return false;
}
