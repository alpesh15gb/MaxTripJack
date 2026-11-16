import test from 'node:test';
import assert from 'node:assert/strict';
import {maxAiSensitiveMessage} from '../src/lib/max-ai-sensitive';

test('blocks labeled credentials without requiring punctuation or assignment words', () => {
  for (const value of [
    'OTP 123456', 'My OTP is 123456', 'verification code: 123456', 'authenticator code 123 456',
    'one-time password 123456', 'My password hunter2', 'password: hunter2', 'my password is "hunter2"',
    'api key api-private-key-here', 'access_token my-private-access-token', 'client secret private-client-secret',
    'cvv 123', 'CVC = 1234', 'UPI PIN 123456', 'card PIN 4321',
  ]) assert.equal(maxAiSensitiveMessage(value), true, value);
});

test('preserves ordinary password, OTP and API troubleshooting requests', () => {
  for (const value of [
    'OTP did not arrive', 'My OTP is not working', 'My password is incorrect', 'My password isn’t working',
    'How do I reset my password?', 'My password reset email is missing', 'I forgot my password',
    'Please change my password', 'The password field is confusing', 'Password requirements?',
    'Is an API key required?', 'My access token expired', 'I need help with my authenticator',
    'How can I get a verification code?', 'Never share your password with anyone.',
    'My password has expired', 'My password stopped working', 'Where is the API key stored?',
    'It says my password is too short',
  ]) assert.equal(maxAiSensitiveMessage(value), false, value);
});

test('blocks recognizable pasted payment cards while allowing masked cards and travel details', () => {
  for (const value of ['4111111111111111', 'My card is 4111 1111 1111 1111', '5555-5555-5555-4444', '378282246310005']) {
    assert.equal(maxAiSensitiveMessage(value), true, value);
  }
  for (const value of ['Card ending 1111', 'xxxx xxxx xxxx 1111', '4111111111111112', 'My budget is ₹50000', 'Call 919866848786', 'Travel on 2026-11-23', 'Reference MT-43B3E5CE']) {
    assert.equal(maxAiSensitiveMessage(value), false, value);
  }
});

test('blocks common bearer and secret-key shapes without treating general API help as a secret', () => {
  for (const value of ['Bearer synthetic-token-that-is-private', 'sk-syntheticSecretKeyForThisTestOnly', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGljc2lnbmF0dXJl']) {
    assert.equal(maxAiSensitiveMessage(value), true, value);
  }
  assert.equal(maxAiSensitiveMessage('How do bearer tokens work?'), false);
  assert.equal(maxAiSensitiveMessage('I want a flight ticket'), false);
});

test('normalizes simple Unicode credential pastes and does not silently remove the surrounding request', () => {
  assert.equal(maxAiSensitiveMessage('OTP １２３４５６'), true);
  assert.equal(maxAiSensitiveMessage('Book BOM to DEL. My password is hunter2'), true);
  assert.equal(maxAiSensitiveMessage('Book BOM to DEL. My password reset is not working.'), false);
});
