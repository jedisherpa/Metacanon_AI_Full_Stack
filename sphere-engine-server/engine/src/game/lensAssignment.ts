import type { LensPack } from '../config/lensPack.js';
import { slugify } from '../config/lensPack.js';

export type Lens = LensPack['lenses'][number] & { id: string };

export function withLensIds(pack: LensPack): Lens[] {
  return pack.lenses.map((lens) => ({
    ...lens,
    id: slugify(lens.avatar_name)
  }));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function assignLenses(
  pack: LensPack,
  count: number,
  familyBalanced: boolean
): Lens[] {
  const lenses = withLensIds(pack);
  if (!familyBalanced || count < 4) {
    return shuffle(lenses).slice(0, count);
  }

  const byFamily = lenses.reduce<Record<string, Lens[]>>((acc, lens) => {
    acc[lens.family] = acc[lens.family] ?? [];
    acc[lens.family].push(lens);
    return acc;
  }, {});

  Object.keys(byFamily).forEach((family) => {
    byFamily[family] = shuffle(byFamily[family]);
  });

  const families = shuffle(Object.keys(byFamily));
  const result: Lens[] = [];
  let index = 0;

  while (result.length < count) {
    const family = families[index % families.length];
    const list = byFamily[family];
    if (list && list.length > 0) {
      result.push(list.pop() as Lens);
    }
    index += 1;
    if (index > 1000) {
      break;
    }
  }

  if (result.length < count) {
    const remaining = shuffle(
      Object.values(byFamily).flat()
    ).slice(0, count - result.length);
    result.push(...remaining);
  }

  return result;
}

export function availableLenses(pack: LensPack, assignedIds: string[]): Lens[] {
  const ids = new Set(assignedIds);
  return withLensIds(pack).filter((lens) => !ids.has(lens.id));
}

export function pickLensForJoin(
  pack: LensPack,
  assignedIds: string[],
  familyBalanced: boolean,
  totalSeats: number
): Lens {
  const available = availableLenses(pack, assignedIds);
  if (available.length === 0) {
    throw new Error('No lenses available');
  }

  if (!familyBalanced || totalSeats < 4) {
    return shuffle(available)[0];
  }

  const assigned = withLensIds(pack).filter((lens) => assignedIds.includes(lens.id));
  const familyCounts = assigned.reduce<Record<string, number>>((acc, lens) => {
    acc[lens.family] = (acc[lens.family] ?? 0) + 1;
    return acc;
  }, {});

  const families = Object.keys(
    available.reduce<Record<string, true>>((acc, lens) => {
      acc[lens.family] = true;
      return acc;
    }, {})
  );

  const familiesMissing = families.filter((family) => !familyCounts[family]);
  if (familiesMissing.length > 0) {
    const preferred = available.filter((lens) => familiesMissing.includes(lens.family));
    if (preferred.length > 0) {
      return shuffle(preferred)[0];
    }
  }

  return shuffle(available)[0];
}
