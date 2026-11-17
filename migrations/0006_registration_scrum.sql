ALTER TABLE users ADD COLUMN email_verified_at TEXT;
ALTER TABLE users ADD COLUMN verification_required INTEGER NOT NULL DEFAULT 0 CHECK(verification_required IN (0,1));
CREATE TABLE email_verifications(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX idx_email_verifications_expiry ON email_verifications(expires_at);
CREATE TABLE scrum_projects(id TEXT PRIMARY KEY,name TEXT NOT NULL);
INSERT INTO scrum_projects(id,name) VALUES('00000000-0000-4000-8000-000000000002','TeamZeit Projekt');
CREATE TABLE scrum_members(project_id TEXT NOT NULL REFERENCES scrum_projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('project_admin','product_owner','scrum_master','developer','stakeholder')),PRIMARY KEY(project_id,user_id));
CREATE INDEX idx_scrum_members_user ON scrum_members(user_id,project_id);
INSERT INTO scrum_members(project_id,user_id,role) SELECT '00000000-0000-4000-8000-000000000002',user_id,'project_admin' FROM platform_admins;
CREATE TABLE scrum_tasks(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES scrum_projects(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','review','done')),assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,created_by TEXT REFERENCES users(id) ON DELETE SET NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX idx_scrum_tasks_project ON scrum_tasks(project_id,updated_at,id);
CREATE TRIGGER protect_last_project_admin_delete BEFORE DELETE ON scrum_members
WHEN OLD.role='project_admin' AND EXISTS(SELECT 1 FROM scrum_projects WHERE id=OLD.project_id) AND (SELECT COUNT(*) FROM scrum_members WHERE project_id=OLD.project_id AND role='project_admin')<=1
BEGIN
 SELECT RAISE(ABORT,'Last project administrator');
END;
CREATE TRIGGER protect_last_project_admin_update BEFORE UPDATE OF role ON scrum_members
WHEN OLD.role='project_admin' AND NEW.role<>'project_admin' AND (SELECT COUNT(*) FROM scrum_members WHERE project_id=OLD.project_id AND role='project_admin')<=1
BEGIN
 SELECT RAISE(ABORT,'Last project administrator');
END;
