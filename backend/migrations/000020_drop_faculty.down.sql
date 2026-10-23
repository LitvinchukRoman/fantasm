ALTER TABLE users ADD COLUMN faculty text NOT NULL DEFAULT '';
ALTER TABLE users ADD CONSTRAINT users_faculty_length CHECK (char_length(faculty) <= 100);
