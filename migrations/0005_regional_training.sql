CREATE TABLE locations(id TEXT PRIMARY KEY,name TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT (datetime('now')));
INSERT INTO locations(id,name) VALUES('00000000-0000-4000-8000-000000000001','Standort noch nicht zugeordnet');
ALTER TABLE groups ADD COLUMN location_id TEXT REFERENCES locations(id);
UPDATE groups SET location_id='00000000-0000-4000-8000-000000000001' WHERE location_id IS NULL;
CREATE TRIGGER default_group_location AFTER INSERT ON groups WHEN NEW.location_id IS NULL
BEGIN
 UPDATE groups SET location_id='00000000-0000-4000-8000-000000000001' WHERE id=NEW.id;
END;
CREATE INDEX idx_groups_location ON groups(location_id,id);
CREATE TABLE platform_admins(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE location_managers(location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(location_id,user_id));
CREATE INDEX idx_location_managers_user ON location_managers(user_id,location_id);
CREATE TABLE project_access(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE training_series(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT (datetime('now')));
ALTER TABLE training_events ADD COLUMN capacity INTEGER CHECK(capacity IS NULL OR (capacity>=1 AND capacity<=1000));
ALTER TABLE training_events ADD COLUMN series_id TEXT REFERENCES training_series(id) ON DELETE SET NULL;
ALTER TABLE responses ADD COLUMN booking_state TEXT CHECK(booking_state IN ('confirmed','waitlisted'));
ALTER TABLE responses ADD COLUMN queued_at TEXT;
UPDATE responses SET booking_state='confirmed' WHERE status='yes';
CREATE INDEX idx_responses_event_status ON responses(event_id,status);
CREATE INDEX idx_responses_queue ON responses(event_id,booking_state,queued_at,user_id);
CREATE INDEX idx_memberships_user ON memberships(user_id,group_id);
CREATE INDEX idx_events_series ON training_events(series_id,start_at);
CREATE TRIGGER capacity_guard BEFORE UPDATE OF capacity ON training_events
WHEN NEW.capacity IS NOT NULL AND (SELECT COUNT(*) FROM responses WHERE event_id=NEW.id AND booking_state='confirmed')>NEW.capacity
BEGIN
 SELECT RAISE(ABORT,'Capacity below confirmed bookings');
END;
CREATE TRIGGER protect_last_platform_admin BEFORE DELETE ON platform_admins
WHEN (SELECT COUNT(*) FROM platform_admins)<=1
BEGIN
 SELECT RAISE(ABORT,'The last platform administrator cannot be removed');
END;
ALTER TABLE users ADD COLUMN training_notifications INTEGER NOT NULL DEFAULT 0 CHECK(training_notifications IN (0,1));
CREATE TABLE notification_outbox(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,event_id TEXT,kind TEXT NOT NULL,title TEXT NOT NULL,start_at TEXT NOT NULL,venue TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_outbox_due ON notification_outbox(status,next_at);
CREATE TRIGGER notify_waitlist_promotion AFTER UPDATE OF booking_state ON responses
WHEN OLD.booking_state='waitlisted' AND NEW.booking_state='confirmed'
BEGIN
 INSERT INTO notification_outbox(id,user_id,event_id,kind,title,start_at,venue) SELECT lower(hex(randomblob(16))),NEW.user_id,e.id,'promoted',e.title,e.start_at,e.location FROM training_events e JOIN users u ON u.id=NEW.user_id WHERE e.id=NEW.event_id AND u.training_notifications=1;
END;
CREATE TRIGGER refill_deleted_booking AFTER DELETE ON responses
WHEN OLD.booking_state='confirmed'
BEGIN
 UPDATE responses SET booking_state='confirmed' WHERE event_id=OLD.event_id AND booking_state='waitlisted' AND user_id IN (SELECT user_id FROM responses WHERE event_id=OLD.event_id AND booking_state='waitlisted' ORDER BY queued_at,user_id LIMIT MAX(0,COALESCE((SELECT capacity FROM training_events WHERE id=OLD.event_id),100000)-(SELECT COUNT(*) FROM responses WHERE event_id=OLD.event_id AND booking_state='confirmed')));
END;
CREATE TRIGGER refill_cancelled_booking AFTER UPDATE OF booking_state ON responses
WHEN OLD.booking_state='confirmed' AND NEW.booking_state IS NOT 'confirmed'
BEGIN
 UPDATE responses SET booking_state='confirmed' WHERE event_id=OLD.event_id AND booking_state='waitlisted' AND user_id IN (SELECT user_id FROM responses WHERE event_id=OLD.event_id AND booking_state='waitlisted' ORDER BY queued_at,user_id LIMIT MAX(0,COALESCE((SELECT capacity FROM training_events WHERE id=OLD.event_id),100000)-(SELECT COUNT(*) FROM responses WHERE event_id=OLD.event_id AND booking_state='confirmed')));
END;
