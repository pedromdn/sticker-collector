-- Coca-Cola block observed in Figuritas QR payloads. The QR reserves bit 980
-- and maps these 13 stickers to bits 981–993. Names/images can be refined
-- later without changing the stable codes or QR positions.

insert into public.stickers (code, name, team, img)
values
	('COC1', 'Coca-Cola 1', 'Coca-Cola', null),
	('COC2', 'Coca-Cola 2', 'Coca-Cola', null),
	('COC3', 'Coca-Cola 3', 'Coca-Cola', null),
	('COC4', 'Coca-Cola 4', 'Coca-Cola', null),
	('COC5', 'Coca-Cola 5', 'Coca-Cola', null),
	('COC6', 'Coca-Cola 6', 'Coca-Cola', null),
	('COC7', 'Coca-Cola 7', 'Coca-Cola', null),
	('COC8', 'Coca-Cola 8', 'Coca-Cola', null),
	('COC9', 'Coca-Cola 9', 'Coca-Cola', null),
	('COC10', 'Coca-Cola 10', 'Coca-Cola', null),
	('COC11', 'Coca-Cola 11', 'Coca-Cola', null),
	('COC12', 'Coca-Cola 12', 'Coca-Cola', null),
	('COC13', 'Coca-Cola 13', 'Coca-Cola', null),
	('COC14', 'Coca-Cola 14', 'Coca-Cola', null)
on conflict (code) do update
set
	name = excluded.name,
	team = excluded.team,
	img = excluded.img;
