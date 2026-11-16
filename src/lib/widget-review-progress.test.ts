import { describe, expect, it } from 'vitest';
import { getWidgetReviewProgress } from './widget-review-progress';

describe('review widget progress', () => {
  it('uses current-case catalog counts and includes clarification in decisions', () => {
    const detail = '2 of 3 differences have a review decision, including clarification requests.';
    expect(getWidgetReviewProgress('Decisions recorded', 2, detail)).toEqual({ decided: 2, total: 3 });
    expect(getWidgetReviewProgress('Review worklist', 2, detail)).toEqual({ decided: 2, total: 3 });
  });
  it('uses the snapshot decision ratio', () => {
    expect(getWidgetReviewProgress('Review completion', '1 / 4', undefined)).toEqual({ decided: 1, total: 4 });
    expect(getWidgetReviewProgress('Recorded decisions', '0 / 2', '')).toEqual({ decided: 0, total: 2 });
  });
  it('omits unknown, stale, invalid, contradictory and zero-denominator values', () => {
    expect(getWidgetReviewProgress('Decisions recorded', 'Unavailable', 'Run comparison')).toBeNull();
    expect(getWidgetReviewProgress('Decisions recorded', 1, '2 of 3 differences have a review decision, including clarification requests.')).toBeNull();
    expect(getWidgetReviewProgress('Review completion', '0 / 0', '')).toBeNull();
    expect(getWidgetReviewProgress('Review completion', '4 / 3', '')).toBeNull();
    expect(getWidgetReviewProgress('Notes entered', '1 / 2', '')).toBeNull();
  });
});
