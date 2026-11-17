import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileLauncherLift } from '../src/components/max-ai-launcher-placement';

const resting = { left: 324, right: 376, top: 778, bottom: 830 };
test('mobile launcher clears an in-flow hotel availability action with a visible gap', () => {
  const action = { left: 18, right: 372, top: 764, bottom: 810 };
  const lift = mobileLauncherLift(resting, [action]);
  assert.equal(lift, 76);
  assert.equal(resting.bottom - lift, action.top - 10);
  assert.equal(mobileLauncherLift(resting, [action]), lift, 'Placement is derived from the resting rectangle, not the moved one');
});
test('mobile launcher clears sticky payment controls and a second action above them', () => {
  const bar = { left: 0, right: 390, top: 748, bottom: 844 };
  const action = { left: 224, right: 372, top: 680, bottom: 730 };
  const lift = mobileLauncherLift(resting, [bar, action]);
  assert.equal(resting.bottom - lift, action.top - 10);
});
test('non-overlapping controls do not displace the launcher and cleared areas restore its baseline', () => {
  assert.equal(mobileLauncherLift(resting, [{ left: 18, right: 250, top: 770, bottom: 820 }]), 0);
  assert.equal(mobileLauncherLift(resting, [{ left: 18, right: 372, top: 640, bottom: 686 }]), 0);
  assert.equal(mobileLauncherLift(resting, []), 0);
});
test('placement retains an already applied safe-area baseline', () => {
  const safeAreaResting = { ...resting, top: resting.top - 34, bottom: resting.bottom - 34 };
  const bar = { left: 0, right: 390, top: 748, bottom: 844 };
  const lift = mobileLauncherLift(safeAreaResting, [bar]);
  assert.equal(safeAreaResting.bottom - lift, bar.top - 10);
});
