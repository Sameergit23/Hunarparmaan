-- Rule 4 in CLAUDE.md, on the phone too: these tables accept INSERT only.
-- Delivery is an outbox_acks row, and a correction is a new event.
CREATE TRIGGER device_no_update BEFORE UPDATE ON `device` BEGIN SELECT RAISE(ABORT, 'device is append-only: UPDATE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER device_no_delete BEFORE DELETE ON `device` BEGIN SELECT RAISE(ABORT, 'device is append-only: DELETE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER outbox_no_update BEFORE UPDATE ON `outbox` BEGIN SELECT RAISE(ABORT, 'outbox is append-only: UPDATE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER outbox_no_delete BEFORE DELETE ON `outbox` BEGIN SELECT RAISE(ABORT, 'outbox is append-only: DELETE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER outbox_acks_no_update BEFORE UPDATE ON `outbox_acks` BEGIN SELECT RAISE(ABORT, 'outbox_acks is append-only: UPDATE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER outbox_acks_no_delete BEFORE DELETE ON `outbox_acks` BEGIN SELECT RAISE(ABORT, 'outbox_acks is append-only: DELETE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER workers_no_update BEFORE UPDATE ON `workers` BEGIN SELECT RAISE(ABORT, 'workers is append-only: UPDATE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER workers_no_delete BEFORE DELETE ON `workers` BEGIN SELECT RAISE(ABORT, 'workers is append-only: DELETE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER consents_no_update BEFORE UPDATE ON `consents` BEGIN SELECT RAISE(ABORT, 'consents is append-only: UPDATE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER consents_no_delete BEFORE DELETE ON `consents` BEGIN SELECT RAISE(ABORT, 'consents is append-only: DELETE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER declarations_no_update BEFORE UPDATE ON `declarations` BEGIN SELECT RAISE(ABORT, 'declarations is append-only: UPDATE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER declarations_no_delete BEFORE DELETE ON `declarations` BEGIN SELECT RAISE(ABORT, 'declarations is append-only: DELETE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER mapping_suggestions_no_update BEFORE UPDATE ON `mapping_suggestions` BEGIN SELECT RAISE(ABORT, 'mapping_suggestions is append-only: UPDATE is not allowed'); END;
--> statement-breakpoint
CREATE TRIGGER mapping_suggestions_no_delete BEFORE DELETE ON `mapping_suggestions` BEGIN SELECT RAISE(ABORT, 'mapping_suggestions is append-only: DELETE is not allowed'); END;
