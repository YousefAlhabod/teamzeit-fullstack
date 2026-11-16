-- A group must retain a trainer. Cascading deletion of the whole group remains allowed.
CREATE TRIGGER protect_last_trainer_delete BEFORE DELETE ON memberships
WHEN OLD.role='trainer' AND EXISTS(SELECT 1 FROM groups WHERE id=OLD.group_id)
AND (SELECT COUNT(*) FROM memberships WHERE group_id=OLD.group_id AND role='trainer')<=1
BEGIN
 SELECT RAISE(ABORT,'The last trainer cannot be removed');
END;
CREATE TRIGGER protect_last_trainer_update BEFORE UPDATE OF role ON memberships
WHEN OLD.role='trainer' AND NEW.role<>'trainer'
AND (SELECT COUNT(*) FROM memberships WHERE group_id=OLD.group_id AND role='trainer')<=1
BEGIN
 SELECT RAISE(ABORT,'The last trainer cannot be demoted');
END;
