import assert from 'node:assert/strict';
import test from 'node:test';
import { parseListingRailPreference, parseListingViewMode, stepShowcaseIndex, swipeShowcaseStep } from '../src/client/listingView.js';

test('restores only supported listing view modes', () => {
  assert.equal(parseListingViewMode('showcase'), 'showcase');
  assert.equal(parseListingViewMode('grid'), 'grid');
  assert.equal(parseListingViewMode('unexpected'), 'grid');
  assert.equal(parseListingViewMode(null), 'grid');
});

test('opens the independent listing rail only for an explicit preference', () => {
  assert.equal(parseListingRailPreference('open'), true);
  assert.equal(parseListingRailPreference('closed'), false);
  assert.equal(parseListingRailPreference('showcase'), false);
  assert.equal(parseListingRailPreference(null), false);
});

test('moves showcase indexes without wrapping past an edge', () => {
  assert.equal(stepShowcaseIndex(0, -1, 4), 0);
  assert.equal(stepShowcaseIndex(0, 1, 4), 1);
  assert.equal(stepShowcaseIndex(2, -1, 4), 1);
  assert.equal(stepShowcaseIndex(3, 1, 4), 3);
  assert.equal(stepShowcaseIndex(3, 1, 0), 0);
});

test('recognizes intentional horizontal showcase swipes', () => {
  assert.equal(swipeShowcaseStep(-90, 12), 1);
  assert.equal(swipeShowcaseStep(90, -12), -1);
  assert.equal(swipeShowcaseStep(30, 2), 0);
  assert.equal(swipeShowcaseStep(80, 100), 0);
  assert.equal(swipeShowcaseStep(-48, 0), 1);
});
