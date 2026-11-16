/** Parse only the existing decision widgets; never infer progress from another metric. */
export function getWidgetReviewProgress(title: string, value: unknown, detail: unknown): { decided: number; total: number } | null {
  if (!['Decisions recorded', 'Review worklist', 'Recorded decisions', 'Review completion'].includes(title)) return null;
  let match: RegExpMatchArray | null = null;
  if (typeof value === 'string') match = value.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (typeof value === 'number' && Number.isSafeInteger(value) && typeof detail === 'string') {
    const fromDetail = detail.match(/^(\d+) of (\d+) differences have a review decision, including clarification requests\.$/);
    if (fromDetail && Number(fromDetail[1]) === value) match = fromDetail;
  }
  if (!match) return null;
  const decided = Number(match[1]);
  const total = Number(match[2]);
  return Number.isSafeInteger(decided) && Number.isSafeInteger(total) && total > 0 && decided >= 0 && decided <= total
    ? { decided, total } : null;
}
