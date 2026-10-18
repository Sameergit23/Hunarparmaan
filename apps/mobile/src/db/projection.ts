/**
 * Local read models: each event written on the phone also lands in its own
 * table, so screens never parse the outbox. Mirrors the server's projection
 * (services/api/src/domain/projection.ts) for the events the app makes today.
 */
import type { SyncEvent } from '@hunarpramaan/contracts';
import type { LocalTx } from './outbox';
import { consents, declarations, mappingSuggestions, workers } from './schema';

export function projectLocally(tx: LocalTx, event: SyncEvent): void {
  switch (event.type) {
    case 'worker.registered': {
      const p = event.payload;
      tx.insert(workers)
        .values({
          id: p.workerId,
          name: p.name,
          phone: p.phone,
          language: p.language,
          eventId: event.id,
          registeredAt: event.occurredAt,
        })
        .run();
      return;
    }
    case 'consent.given': {
      const p = event.payload;
      tx.insert(consents)
        .values({
          id: p.consentId,
          workerId: p.workerId,
          noticeVersion: p.noticeVersion,
          language: p.language,
          readAloud: p.readAloud,
          eventId: event.id,
          givenAt: event.occurredAt,
        })
        .run();
      return;
    }
    case 'declaration.recorded': {
      const p = event.payload;
      tx.insert(declarations)
        .values({
          id: p.declarationId,
          workerId: p.workerId,
          language: p.language,
          source: p.source,
          asrTranscript: p.asrTranscript,
          transcript: p.transcript,
          eventId: event.id,
          recordedAt: event.occurredAt,
        })
        .run();
      return;
    }
    case 'mapping.suggested': {
      const p = event.payload;
      tx.insert(mappingSuggestions)
        .values({
          id: event.id,
          declarationId: p.declarationId,
          packVersion: p.packVersion,
          suggestedNqrCode: p.suggestedNqrCode,
          suggestedRoute: p.suggestedRoute,
          needsReview: p.needsReview,
          results: p.results,
          createdAt: event.occurredAt,
        })
        .run();
      return;
    }
    default:
      // The assessor's events get their tables with their screens; until then
      // they live in the outbox only.
      return;
  }
}
