// Chronic conditions shown on the consultation and prescription pages. They used to come only from
// the "Medical history" doctors add during visits, so conditions captured at registration (the
// patient's chronic_conditions field, free text such as "Type 2 diabetes, Hypertension") never
// appeared — a returning diabetic showed "None recorded". Both sources are merged, without
// repeating a condition that is written the same way in both.
const safeParse = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

export const mergeChronicConditions = (registered: string | null | undefined, visitHistories: (string | null)[]): string[] => {
  const fromRegistration = (registered ?? '')
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const condition of [...fromRegistration, ...visitHistories.flatMap(safeParse)]) {
    const key = condition.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(condition.trim());
  }
  return out;
};
