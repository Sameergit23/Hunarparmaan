import type { Criterion, Qualification, RoutingPolicy } from '@hunarpramaan/contracts';

const t = (en: string) => ({ en, hi: en });

function pc(id: string, marks: number): Criterion {
  return {
    id,
    text: t(id),
    marks,
    glossary: [],
    rubric: { '0': t('0'), '1': t('1'), '2': t('2') },
    evidence: { type: 'photo' },
    aiChecks: [],
  };
}

/**
 * NOS A (weight 0.5): A.PC1 10 marks, A.PC2 10 marks
 * NOS B (weight 0.3): B.PC1 5 marks,  B.PC2 15 marks
 * NOS C (weight 0.2): C.PC1 10 marks
 */
export function sampleQp(
  passRule: Qualification['passRule'] = { aggregatePercent: 70 },
): Qualification {
  return {
    nqrCode: 'QG-03-CO-03951-2025-V2-CSDCI',
    title: t('Sample QP'),
    nsqfLevel: 3,
    awardingBody: 'CSDCI',
    passRule,
    nos: [
      { code: 'A', title: t('A'), weight: 0.5, criteria: [pc('A.PC1', 10), pc('A.PC2', 10)] },
      { code: 'B', title: t('B'), weight: 0.3, criteria: [pc('B.PC1', 5), pc('B.PC2', 15)] },
      { code: 'C', title: t('C'), weight: 0.2, criteria: [pc('C.PC1', 10)] },
    ],
  };
}

export const policy: RoutingPolicy = {
  routingThreshold: 0.7,
  reviewBand: { low: 0.65, high: 0.75 },
};

export const ALL_CRITERIA = ['A.PC1', 'A.PC2', 'B.PC1', 'B.PC2', 'C.PC1'];
