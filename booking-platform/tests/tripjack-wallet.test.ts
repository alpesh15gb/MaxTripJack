import test from 'node:test';
import assert from 'node:assert/strict';
import { tripjackAccountBalances, tripjackMoney, tripjackWallet, tripjackWalletCovers } from '../src/lib/providers/tripjack-wallet';

test('wallet reads the observed nested response and documented flat response without using credit or total', () => {
  const nested = { user: { userId: 'synthetic-account', bs: { walletBalance: 2006.2, totalBalance: 999999 } }, status: { success: true } };
  assert.deepEqual(tripjackWallet(nested), { amount: 2006.2, minor: 200620 });
  assert.equal(tripjackWalletCovers(nested, '200620'), true);
  assert.equal(tripjackWalletCovers(nested, 200621), false);
  assert.deepEqual(tripjackWallet({ userId: 'legacy', walletBalance: '2006.20' }), { amount: 2006.2, minor: 200620 });
  const account = tripjackAccountBalances(nested)!;
  assert.equal(account.userId, 'synthetic-account');
  assert.equal(account.totalBalance, 999999);
  assert.equal(account.creditBalance, undefined);
  assert.equal(account.totalOutStanding, undefined);
  assert.doesNotMatch(JSON.stringify(account), /creditBalance|totalOutStanding|"bs"|"user"/);
  assert.equal(tripjackWalletCovers({ user: { userId: 'zero', bs: { walletBalance: 0, totalBalance: 999999, creditBalance: 999999 } } }, 1), false);
  assert.equal(tripjackAccountBalances({ user: { userId: 'zero', bs: { walletBalance: 0, creditBalance: null } } })?.walletBalance, 0);
});

test('malformed nested wallets never fall back to a valid flat, credit or total balance', () => {
  const invalid = [null, undefined, true, false, '', ' ', [], {}, NaN, Infinity, 'Infinity', '1e3', '0x100', '1,000', '90071992547410'];
  for (const value of invalid) {
    const response = { walletBalance: 999999, user: { userId: 'private-account', bs: { walletBalance: value, totalBalance: 999999, creditBalance: 999999 } } };
    assert.equal(tripjackWallet(response), null);
    assert.equal(tripjackWalletCovers(response, 1), false);
    assert.equal(tripjackAccountBalances(response), null);
  }
  for (const user of [null, [], {}, { bs: null }, { bs: [] }, { bs: { totalBalance: 999999 } }]) assert.equal(tripjackWallet({ user, walletBalance: 999999 }), null);
  assert.equal(tripjackWallet({ totalBalance: 999999, creditBalance: 999999 }), null);
});

test('available funds never round up and required supplier money must be a safe nonnegative integer', () => {
  assert.deepEqual(tripjackMoney(' 2006.2099 '), { amount: 2006.2099, minor: 200620 });
  assert.deepEqual(tripjackMoney(1.15), { amount: 1.15, minor: 115 });
  assert.deepEqual(tripjackMoney('-0.001'), { amount: -0.001, minor: -1 });
  assert.deepEqual(tripjackMoney('-1.001'), { amount: -1.001, minor: -101 });
  assert.equal(tripjackWalletCovers({ walletBalance: '2006.2099' }, 200621), false);
  assert.equal(tripjackWalletCovers({ walletBalance: '-0.001' }, 0), false);
  assert.equal(tripjackWalletCovers({ walletBalance: 0 }, '0'), true);
  for (const cost of [null, undefined, false, true, '', ' ', '1.0', [], {}, -1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(tripjackWalletCovers({ walletBalance: 999999 }, cost), false);
  assert.equal(tripjackMoney('90071992547409.92'), null);
});
