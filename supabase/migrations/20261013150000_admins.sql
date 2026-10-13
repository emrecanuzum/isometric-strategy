-- Admins may delete any lobby (through the `command` function). Who is an admin is set directly in the database,
-- never by the client: players can only update their own settings.
alter table public.profiles add column is_admin boolean not null default false;
