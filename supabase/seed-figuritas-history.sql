-- Adds the 11 historical stickers used by Figuritas in QR positions 9–19.
-- Safe to run on an existing production database: current catalog entries
-- keep their data, while any missing entry is inserted.

insert into public.stickers (code, name, team, img)
values
	('FWC9', 'Italy 1934', 'FIFA World Cup History', null),
	('FWC10', 'Uruguay 1950', 'FIFA World Cup History', null),
	('FWC11', 'West Germany 1954', 'FIFA World Cup History', null),
	('FWC12', 'Brazil 1962', 'FIFA World Cup History', '0147.png'),
	('FWC13', 'West Germany 1974', 'FIFA World Cup History', null),
	('FWC14', 'Argentina 1986', 'FIFA World Cup History', '0069.png'),
	('FWC15', 'Brazil 1994', 'FIFA World Cup History', '0148.png'),
	('FWC16', 'Brazil 2002', 'FIFA World Cup History', '0149.png'),
	('FWC17', 'Italy 2006', 'FIFA World Cup History', '0797.png'),
	('FWC18', 'Germany 2014', 'FIFA World Cup History', null),
	('FWC19', 'Argentina 2022', 'FIFA World Cup History', null)
on conflict (code) do update
set
	name = excluded.name,
	team = excluded.team,
	img = excluded.img;
