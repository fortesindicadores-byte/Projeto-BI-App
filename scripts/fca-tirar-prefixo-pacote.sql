-- FCA · tira o prefixo "Pacote " dos fatos de Custos já gravados
-- (o gerador passou a usar o nome puro do pacote: Combustíveis, Manutenções…).
-- Roda uma vez; é idempotente (só toca no que ainda tem o prefixo).
--
-- 1) confere o que vai mudar
select fato, count(*) as linhas
  from fca
 where origem = 'Custos' and fato ilike 'Pacote %'
 group by fato
 order by linhas desc;

-- 2) aplica
update fca
   set fato = btrim(substring(fato from 8))       -- remove "Pacote "
 where origem = 'Custos' and fato ilike 'Pacote %';

-- 3) (opcional) remove os FCAs de Combustível gerados pela RPM — esse desvio
--    passou a ser tratado só no pacote Combustíveis dos Custos.
-- delete from fca
--  where origem = 'RPM' and fato = 'Combustível' and coalesce(causa,'') = '' and coalesce(acao,'') = '';
