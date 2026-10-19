import { describe, expect, it } from 'vitest';
import { EventPayloads } from '@hunarpramaan/contracts';
import { loadPack } from '@hunarpramaan/trade-packs/node';
import { mappingPayload, matchQualification, suggestMapping } from './match';

const pack = loadPack('electrician');
const [l3, l4] = pack.qualifications;

// What Vosk might write for a worker who answers all five interview questions.
const FULL_ANSWER = [
  'मैं दस साल से बिजली का काम करता हूँ घर की वायरिंग करता हूँ',
  'पाइप में तार खींचना स्विच बोर्ड लगाना सॉकेट होल्डर और एमसीबी लगाता हूँ',
  'हाँ अर्थिंग देता हूँ अर्थ पिट बनाता हूँ अर्थ वायर जोड़ता हूँ',
  'मल्टीमीटर से कंटिन्यूटी देखता हूँ और अर्थ टेस्टर से रीडिंग लेता हूँ',
  'काम से पहले दस्ताने और हेलमेट पहनता हूँ मेन बंद करता हूँ',
].join('\n');

describe('matchQualification', () => {
  it('finds criteria from Devanagari speech and romanised glossary terms', () => {
    const match = matchQualification(l3!, FULL_ANSWER);
    expect(match.coveredCriteria).toEqual([
      'L3-N1.PC1',
      'L3-N1.PC2',
      'L3-N1.PC3',
      'L3-N2.PC1',
      'L3-N2.PC2',
      'L3-N2.PC3',
      'L3-N3.PC1',
      'L3-N3.PC2',
    ]);
    const earthing = match.hits.find((h) => h.criterionId === 'L3-N2.PC1');
    expect(earthing).toMatchObject({ heard: 'अर्थिंग', exact: true });
  });

  it('matches typed Hinglish and English as well', () => {
    const match = matchQualification(l3!, 'MCB lagata hoon, earthing bhi deta hoon');
    expect(match.coveredCriteria).toEqual(['L3-N1.PC3', 'L3-N2.PC1']);
    expect(match.confidence).toBe(1);
  });

  it('finds nothing in an answer about other work', () => {
    expect(
      matchQualification(l3!, 'मैं खाना बनाता हूँ और दुकान चलाता हूँ').coveredCriteria,
    ).toEqual([]);
  });
});

describe('suggestMapping', () => {
  it('suggests a direct test at 70% or more, with the route from packages/scoring', () => {
    const suggestion = suggestMapping(pack, FULL_ANSWER);
    const level3 = suggestion.results.find((r) => r.nqrCode === l3!.nqrCode)!;
    expect(level3.coverage).toBeCloseTo(1, 6);
    expect(level3.route).toBe('direct_assessment');
    expect(suggestion.suggestedNqrCode).toBe(l3!.nqrCode);
    expect(suggestion.suggestedRoute).toBe('direct_assessment');
    expect(suggestion.needsReview).toBe(false);

    // Level 4 needs cable trays, a megger and site boards that the worker never mentioned.
    const level4 = suggestion.results.find((r) => r.nqrCode === l4!.nqrCode)!;
    expect(level4.coverage).toBeLessThan(0.7);
    expect(level4.route).toBe('bridge_module');
    expect(level4.gapNos.length).toBeGreaterThan(0);
  });

  it('suggests a bridge module below 70%', () => {
    const suggestion = suggestMapping(
      pack,
      'मैं बारह साल से घर की वायरिंग करता हूँ पाइप में तार खींचता हूँ और एमसीबी लगाता हूँ',
    );
    expect(suggestion.suggestedNqrCode).toBe(l3!.nqrCode);
    expect(suggestion.suggestedRoute).toBe('bridge_module');
  });

  it('sends a short answer, or one that matches nothing, to the mobiliser', () => {
    expect(suggestMapping(pack, 'अर्थिंग').needsReview).toBe(true);
    const nothing = suggestMapping(pack, 'मैं खाना बनाता हूँ और दुकान चलाता हूँ बहुत साल से');
    expect(nothing).toMatchObject({
      suggestedNqrCode: null,
      suggestedRoute: 'bridge_module',
      needsReview: true,
    });
  });

  it('builds a payload the contract accepts', () => {
    const payload = mappingPayload(
      '0b7e3c1a-8f5d-4e2b-9a6c-1d2e3f4a5b6c',
      suggestMapping(pack, FULL_ANSWER),
    );
    expect(EventPayloads['mapping.suggested'].parse(payload)).toEqual(payload);
  });
});
