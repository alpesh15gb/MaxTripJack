import assert from 'node:assert/strict';
import test from 'node:test';
import {tripjackApiKey} from '../src/lib/providers/tripjack-key';
import {tripjackFailureMetadata} from '../src/lib/providers/tripjack-diagnostics';

test('pasted supplier keys ignore surrounding whitespace and preserve separate product credentials', () => {
  const env = {TRIPJACK_FLIGHT_API_KEY: ' flight-test-key\r\n', TRIPJACK_HOTEL_API_KEY: '\thotel-test-key '};
  assert.equal(tripjackApiKey('FLIGHT', env), 'flight-test-key');
  assert.equal(tripjackApiKey('HOTEL', env), 'hotel-test-key');
  assert.deepEqual(env, {TRIPJACK_FLIGHT_API_KEY: ' flight-test-key\r\n', TRIPJACK_HOTEL_API_KEY: '\thotel-test-key '});
});

test('missing and whitespace-only product credentials fail closed without borrowing another key', () => {
  assert.equal(tripjackApiKey('HOTEL', {TRIPJACK_FLIGHT_API_KEY: 'flight-only'}), undefined);
  assert.equal(tripjackApiKey('FLIGHT', {TRIPJACK_FLIGHT_API_KEY: ' \r\n'}), undefined);
});

test('supplier diagnostics retain bounded numeric codes and omit all response and credential text', () => {
  const metadata = tripjackFailureMetadata('HOTEL', 403, {
    errors: [{errCode: 1004, message: 'sensitive supplier body'}, {errCode: '1004'}, {errCode: '2001'}, {errCode: 'secret-key'}, {errCode: '1234567'}],
    apikey: 'private-credential', headers: {authorization: 'private-token'}, bookingId: 'private-booking', travellers: ['private-name'],
  });
  assert.deepEqual(metadata, {product: 'HOTEL', httpStatus: 403, supplierErrorCodes: ['1004', '2001']});
  assert(!/private|sensitive|secret/.test(JSON.stringify(metadata)));
});

test('malformed supplier errors and transport failures cannot inject arbitrary diagnostics', () => {
  for (const payload of [null, 'private-error-text', {errors: 'private-error-text'}, {errors: [null, {errCode: {}}, {errCode: '123\n456'}, {errCode: -1}, {errCode: 1.5}]}]) {
    assert.deepEqual(tripjackFailureMetadata('FLIGHT', null, payload), {product: 'FLIGHT', httpStatus: null, supplierErrorCodes: []});
  }
  assert.equal(tripjackFailureMetadata('FLIGHT', 400, {errors: Array.from({length: 100}, (_,i)=>({errCode: i}))}).supplierErrorCodes.length, 8);
});
