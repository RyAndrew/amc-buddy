BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "camera" (
	"name"	TEXT,
	"ip"	TEXT
);
CREATE TABLE IF NOT EXISTS "eventattachment" (
	"attachmentid"	INTEGER,
	"eventid"	INTEGER,
	"filename"	TEXT,
	"resized"	INTEGER DEFAULT 0,
	PRIMARY KEY("attachmentid")
);
CREATE TABLE IF NOT EXISTS "event" (
	"eventid"	INTEGER,
	"datetime"	INTEGER,
	"camera"	TEXT,
	"type"	TEXT,
	"ip"	TEXT,
	"messageid"	TEXT,
	"text"	TEXT,
	PRIMARY KEY("eventid" AUTOINCREMENT)
);
COMMIT;
