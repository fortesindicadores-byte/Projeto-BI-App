// ============================================================
// Shim de Supabase para o Planner de TESTE (/planner-teste/).
//
// Substitui window.supabase ANTES do app rodar, então o planner roda
// exatamente como o original — sem uma linha de diferença no código dele —
// mas falando com o localStorage em vez do Supabase de produção.
//
// Consequências, de propósito:
//   · não pede login e não exige perfil de admin;
//   · nada do que for criado, movido ou apagado sai do navegador;
//   · a base real (tabela `planner`) não é lida nem escrita.
//
// Para zerar e voltar aos dados de exemplo: apague a chave
// `planner_teste_rows` no localStorage (ou use o botão "Resetar" do painel).
// ============================================================
(function (global) {
  'use strict';

  const KEY = 'planner_teste_rows';
  const UID = '00000000-0000-4000-8000-000000000001';

  const ADMINS = [
    { user_id: UID,   nome: 'Renan Fortes' },
    { user_id: 'u-2', nome: 'Katiuce Cordeiro' },
    { user_id: 'u-3', nome: 'Pedro Pieroni' },
    { user_id: 'u-4', nome: 'Felipe Monsores' },
    { user_id: 'u-5', nome: 'Emili Ariza' },
    { user_id: 'u-6', nome: 'Marina Siqueira' },
  ];

  // datas relativas a hoje, para o Kanban nascer com vencida / no prazo / futura
  const hoje = new Date();
  const dia = n => {
    const d = new Date(hoje); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const criado = n => {
    const d = new Date(hoje); d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  const SEED = [
    ['Projetos',        'Estudar integração do Prolog com o Benner',                 'Renan Fortes',     '',       'Backlog',      44],
    ['Custos',          'Levantar base de custos de pneus por unidade',              'Pedro Pieroni',    dia(46),  'Backlog',      38],
    ['Processos',       'Mapear fluxo de devolução de peças',                        'Emili Ariza',      '',       'Backlog',      24],
    ['Capacitação Técnica','Montar trilha de treinamento dos mecânicos',             'Felipe Monsores',  dia(74),  'Backlog',      17],
    ['Governança',      'Criar envio de faróis automáticos via e-mail',              'Renan Fortes',     dia(-1),  'Não iniciada', 30],
    ['DPO/VPO',         'Validar cronograma viagens e apoio em auditorias',          'Katiuce Cordeiro', dia(-8),  'Não iniciada', 25],
    ['Combustível',     'Verificar baixas faltantes do tanque interno de MCC',       'Emili Ariza',      dia(-1),  'Não iniciada', 20],
    ['Governança',      'Marcar Reuniões de Custos e Indicadores',                   'Renan Fortes',     dia(2),   'Não iniciada', 12],
    ['Conformidade da Frota', 'Validar conformidade com o Ginfo',                    'Pedro Pieroni',    dia(3),   'Não iniciada', 10],
    ['Viagens',         'Revisar roteirização das viagens de apoio',                 'Felipe Monsores',  dia(9),   'Não iniciada', 6],
    ['Manutenção',      'Recalcular R$/km Manutenção da Seara',                      'Pedro Pieroni',    dia(-8),  'Em andamento', 28],
    ['Combustível',     'Corrigir erro de abastecimentos duplicados',                'Pedro Pieroni',    dia(-8),  'Em andamento', 26],
    ['Contratos de Manutenção', 'Implementar módulo contratos no Benner',            'Emili Ariza',      dia(-1),  'Em andamento', 18],
    ['Xadrez de Frota', 'Desmobilizar placas de GRL e PIR',                          'Pedro Pieroni',    dia(13),  'Em andamento', 15],
    ['Processos',       'Padronizar abertura de OS na ponta',                        'Felipe Monsores',  dia(20),  'Em andamento', 9],
    ['Projetos',        'Desdobrar Projeto Integração Prolog/Ginfo - Benner',        'Katiuce Cordeiro', dia(114), 'Em andamento', 40],
    ['Governança',      'Montar material reunião PMO na sexta',                      'Pedro Pieroni',    dia(-9),  'Concluída',    35],
    ['Custos',          'Criar Carta de Custos centralizada no ecossistema de frota','Renan Fortes',     dia(-7),  'Concluída',    32],
    ['Governança',      'Divulgar Programa de Reconhecimento Frota de Elite',        'Renan Fortes',     dia(-7),  'Concluída',    31],
    ['Pneus',           'Fechar rotina de aferição com as unidades',                 'Pedro Pieroni',    dia(-5),  'Concluída',    22],
    ['Contratos de Locação', 'Levantar vigências dos contratos ativos',              'Katiuce Cordeiro', dia(-3),  'Cancelada',    14],
  ];

  function semear() {
    return SEED.map((s, i) => ({
      id: 'seed-' + (i + 1),
      assunto: s[0], acao: s[1], responsavel: s[2],
      prazo: s[3], status: s[4], created_at: criado(s[5]),
      acompanhamento: '',
    }));
  }

  const ler = () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const s = semear();
    gravar(s);
    return s;
  };
  const gravar = rows => { try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch (e) {} };

  let SEQ = 0;
  const novoId = () => 'teste-' + (++SEQ) + '-' + Math.random().toString(36).slice(2, 8);

  // ── consulta encadeável, no formato que o painel usa ───────────────────────
  // .select().order() · .update().eq() · .insert().select().single() · .delete().eq()
  function query(tabela, op, payload) {
    const q = {
      _filtros: [],
      select() { return q; },
      single() { return q._exec(true); },
      maybeSingle() { return q._exec(true); },
      eq(col, val) { q._filtros.push(r => String(r[col]) === String(val)); return q; },
      in(col, vals) { q._filtros.push(r => vals.map(String).includes(String(r[col]))); return q; },
      order() { return q; },
      then(res, rej) { return q._exec(false).then(res, rej); },
      _exec(umSo) {
        return new Promise(resolve => {
          // tabelas de apoio: perfis e nomes dos responsáveis
          if (tabela === 'fca_profiles') {
            const linhas = ADMINS.filter(a => q._filtros.every(f => f({ ...a, is_admin: true })));
            return resolve({ data: umSo ? { is_admin: true } : linhas, error: null });
          }
          if (tabela === 'user_approvals') {
            const linhas = ADMINS.map(a => ({ user_id: a.user_id, name: a.nome, email: '' }))
              .filter(r => q._filtros.every(f => f(r)));
            return resolve({ data: umSo ? linhas[0] || null : linhas, error: null });
          }
          // a tabela do planner, em localStorage
          let rows = ler();
          if (op === 'insert') {
            const novo = { id: novoId(), created_at: new Date().toISOString(), ...payload };
            rows.push(novo); gravar(rows);
            return resolve({ data: umSo ? novo : [novo], error: null });
          }
          if (op === 'update') {
            const alvos = rows.filter(r => q._filtros.every(f => f(r)));
            alvos.forEach(r => Object.assign(r, payload));
            gravar(rows);
            return resolve({ data: umSo ? alvos[0] || null : alvos, error: null });
          }
          if (op === 'delete') {
            const fica = rows.filter(r => !q._filtros.every(f => f(r)));
            gravar(fica);
            return resolve({ data: null, error: null });
          }
          const linhas = rows.filter(r => q._filtros.every(f => f(r)))
            .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
          return resolve({ data: umSo ? linhas[0] || null : linhas, error: null });
        });
      },
    };
    return q;
  }

  global.supabase = {
    createClient() {
      return {
        auth: {
          getSession: async () => ({
            data: { session: { user: { id: UID, email: 'teste@local', user_metadata: { name: 'Renan Fortes' } } } },
          }),
          signOut: async () => ({ error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        from(tabela) {
          return {
            select: () => query(tabela, 'select'),
            insert: p => query(tabela, 'insert', p),
            update: p => query(tabela, 'update', p),
            delete: () => query(tabela, 'delete'),
          };
        },
      };
    },
  };

  // botão de reset — devolve os dados de exemplo
  global.plannerTesteResetar = function () {
    if (!confirm('Zerar o planner de teste e voltar aos dados de exemplo?')) return;
    try { localStorage.removeItem(KEY); localStorage.removeItem('planner_cache_v1'); } catch (e) {}
    location.reload();
  };
})(window);
