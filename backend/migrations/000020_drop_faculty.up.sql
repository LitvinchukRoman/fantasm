-- Faculty split people into groups they could invent. The product does not collect it.
ALTER TABLE users DROP CONSTRAINT users_faculty_length;
ALTER TABLE users DROP COLUMN faculty;
