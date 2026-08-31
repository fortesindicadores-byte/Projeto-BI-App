-- ============================================================
-- Preventivas Seara — carga inicial a partir da planilha da unidade
-- (Controle_Preventiva_2_2.xlsx, abas PREVENTIVA - FROTA e - FRIO)
--
-- 49 lançamentos de montadora e 5 de frio — só as linhas que têm DATA
-- da última realização. Placa convertida para o padrão Mercosul, a mesma
-- chave que o hodômetro usa.
--
-- REEXECUTÁVEL: apaga só o que veio desta carga (obs = 'carga planilha da unidade')
-- antes de inserir, então rodar de novo não duplica e não toca no que a
-- unidade lançar pela tela.
-- ============================================================

delete from public.preventiva_lanc where obs = 'carga planilha da unidade';

insert into public.preventiva_lanc (unidade, placa, escopo, tipo, data, km, obs) values
  ('ANG','EWZ4I53','frio','M1','2026-06-19',null,'carga planilha da unidade'),
  ('ANG','EYY0A65','frio','M1','2026-07-08',null,'carga planilha da unidade'),
  ('ANG','FWB6D72','frio','M1','2026-07-07',null,'carga planilha da unidade'),
  ('ANG','GDP6H93','frio','M1','2026-07-07',null,'carga planilha da unidade'),
  ('ANG','SWF3D53','frio','M1','2026-05-07',null,'carga planilha da unidade'),
  ('ANG','BKG6B91','montadora','M1','2026-03-11',137846,'carga planilha da unidade'),
  ('ANG','CKU7C15','montadora',null,'2025-02-25',81981,'carga planilha da unidade'),
  ('ANG','CNT2D51','montadora',null,'2025-06-11',88564,'carga planilha da unidade'),
  ('ANG','DNR4C84','montadora',null,'2025-04-22',88568,'carga planilha da unidade'),
  ('ANG','DOE2J14','montadora',null,'2025-04-22',101732,'carga planilha da unidade'),
  ('ANG','DWQ6D45','montadora',null,'2026-06-01',130872,'carga planilha da unidade'),
  ('ANG','DWY7A25','montadora',null,'2025-05-07',100777,'carga planilha da unidade'),
  ('ANG','EVV2A72','montadora',null,'2025-04-11',81906,'carga planilha da unidade'),
  ('ANG','EWY0J65','montadora','M1','2026-05-30',90456,'carga planilha da unidade'),
  ('ANG','EWZ4I53','montadora',null,'2025-05-07',80413,'carga planilha da unidade'),
  ('ANG','EXY4G82','montadora',null,'2024-10-03',91382,'carga planilha da unidade'),
  ('ANG','EYY0A65','montadora',null,'2025-05-07',80966,'carga planilha da unidade'),
  ('ANG','FCC9A15','montadora','M1','2026-04-22',106114,'carga planilha da unidade'),
  ('ANG','FEJ3G82','montadora','M1','2026-06-02',116328,'carga planilha da unidade'),
  ('ANG','FIN6I77','montadora',null,'2025-05-07',101646,'carga planilha da unidade'),
  ('ANG','FIW2B57','montadora','M1','2026-02-02',99309,'carga planilha da unidade'),
  ('ANG','FJN3B97','montadora','M1','2026-02-03',129885,'carga planilha da unidade'),
  ('ANG','FJT7H24','montadora',null,'2025-05-14',79492,'carga planilha da unidade'),
  ('ANG','FLR5C32','montadora','M1','2026-03-20',94788,'carga planilha da unidade'),
  ('ANG','FNV7E52','montadora',null,'2025-11-18',100120,'carga planilha da unidade'),
  ('ANG','FNW7H25','montadora',null,'2025-03-20',100680,'carga planilha da unidade'),
  ('ANG','FNW7H25','montadora',null,'2024-09-12',91361,'carga planilha da unidade'),
  ('ANG','FOF9E14','montadora','M1','2026-05-07',119822,'carga planilha da unidade'),
  ('ANG','FPK4F12','montadora',null,'2025-04-11',91952,'carga planilha da unidade'),
  ('ANG','FQI9C63','montadora','M1','2026-05-07',88984,'carga planilha da unidade'),
  ('ANG','FQT4E96','montadora',null,'2025-05-07',78371,'carga planilha da unidade'),
  ('ANG','FQU2E57','montadora',null,'2024-09-09',81290,'carga planilha da unidade'),
  ('ANG','FSE7B13','montadora',null,'2024-10-04',88650,'carga planilha da unidade'),
  ('ANG','FWB6D72','montadora',null,'2025-04-04',81117,'carga planilha da unidade'),
  ('ANG','FXL7F42','montadora',null,'2025-07-08',101436,'carga planilha da unidade'),
  ('ANG','FXS4I52','montadora',null,'2025-04-04',81918,'carga planilha da unidade'),
  ('ANG','FYF6D94','montadora','M1','2026-05-07',115980,'carga planilha da unidade'),
  ('ANG','GBE1D74','montadora','M1','2026-05-07',119974,'carga planilha da unidade'),
  ('ANG','GBU8J26','montadora','M1','2026-02-18',112295,'carga planilha da unidade'),
  ('ANG','GDC4I84','montadora',null,'2025-05-22',58075,'carga planilha da unidade'),
  ('ANG','GDD3C43','montadora',null,'2025-05-14',118705,'carga planilha da unidade'),
  ('ANG','GDP6H93','montadora','M1','2026-05-30',123456,'carga planilha da unidade'),
  ('ANG','GET3F84','montadora',null,'2025-05-14',88382,'carga planilha da unidade'),
  ('ANG','GEU7H35','montadora','M1','2026-03-18',114496,'carga planilha da unidade'),
  ('ANG','GFO1E81','montadora',null,'2025-05-22',88023,'carga planilha da unidade'),
  ('ANG','GFQ4B35','montadora',null,'2025-05-22',98169,'carga planilha da unidade'),
  ('ANG','GFY1H73','montadora',null,'2025-04-04',81649,'carga planilha da unidade'),
  ('ANG','GGA6G16','montadora','M1','2026-05-07',90098,'carga planilha da unidade'),
  ('ANG','GHY9C71','montadora',null,'2025-01-02',81983,'carga planilha da unidade'),
  ('ANG','GJF2F55','montadora',null,'2024-11-08',91860,'carga planilha da unidade'),
  ('ANG','GJG9B11','montadora','M1','2026-02-20',113825,'carga planilha da unidade'),
  ('ANG','STR4G70','montadora',null,'2024-04-17',2450,'carga planilha da unidade'),
  ('ANG','SVT4D79','montadora',null,'2025-01-16',30180,'carga planilha da unidade'),
  ('ANG','SWF3D53','montadora','M1','2026-05-07',46342,'carga planilha da unidade');

-- ---------- Conferência ----------------------------------------------------
-- select escopo, count(*), min(data), max(data)
--   from public.preventiva_lanc group by 1 order by 1;
