import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, onValue, get, push, remove, update, set, onChildAdded } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ═══════════════════════════════════════════════════════════
// CICLO MENSAL BASEADO NA DATA DE APROVAÇÃO
// Retorna a chave "YYYY-MM-DD" do início do ciclo atual.
// ═══════════════════════════════════════════════════════════
function calcularPeriodoAtual(dataAprovacao) {
    const agora = new Date();
    const aprovacao = new Date(dataAprovacao);
    const diaRenovacao = aprovacao.getDate();

    let inicioCiclo = new Date(agora.getFullYear(), agora.getMonth(), diaRenovacao);

    if (agora < inicioCiclo) {
        inicioCiclo = new Date(agora.getFullYear(), agora.getMonth() - 1, diaRenovacao);
    }

    const y = inicioCiclo.getFullYear();
    const m = String(inicioCiclo.getMonth() + 1).padStart(2, '0');
    const d = String(inicioCiclo.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const firebaseConfig = {
  apiKey: "AIzaSyC1mkw9lTCa1khBcTNBHf4nC_MkC9lECIk",
  authDomain: "barbearia-sf1-0.firebaseapp.com",
  databaseURL: "https://barbearia-sf1-0-default-rtdb.firebaseio.com",
  projectId: "barbearia-sf1-0",
  storageBucket: "barbearia-sf1-0.firebasestorage.app",
  messagingSenderId: "638200163686",
  appId: "1:638200163686:web:d6e615289d181b9da62ca7"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- PROTEÇÃO DE ROTA E INICIALIZAÇÃO ---
onAuthStateChanged(auth, (user) => {
  if (!user) {
    if (!window.location.pathname.includes("login.html")) {
      window.location.href = "login.html";
    }
  } else {
    const body = document.getElementById('admin-body');
    const section = document.getElementById('admin-section');
    if (body) body.style.display = 'flex';
    if (section) section.style.display = 'block';
    console.log("Acesso autorizado:", user.email);
    carregarAgendamentos();
    carregarServicos();
  }
});

// --- LOGOUT ---
const logoutBtn = document.getElementById("logout");
if (logoutBtn) {
  logoutBtn.onclick = () => {
    signOut(auth).then(() => { window.location.href = "login.html"; })
      .catch((error) => { console.error("Erro ao sair:", error); });
  };
}

let servicosDisponiveis = {};

// --- SELETORES GERAIS ---
const listaAgendamentos = document.getElementById("lista-agendamentos");
const filtroData        = document.getElementById("filtro-data");
const buscaCliente      = document.getElementById("pesquisa-cliente");
const togglePassados    = document.getElementById("toggle-passados");
const listaServicos     = document.getElementById("lista-servicos");
const btnTabManual      = document.getElementById('btn-agendar-manual');
const formServico       = document.getElementById('form-servico');
const gradeBloqueio     = document.getElementById('grade-bloqueio');

// --- ÁUDIO ---
const somNotificacao = new Audio('notificacao.mp3');
function liberarAudio() {
  somNotificacao.play().then(() => {
    somNotificacao.pause();
    somNotificacao.currentTime = 0;
    document.removeEventListener('click', liberarAudio);
  }).catch(() => {});
}
document.addEventListener('click', liberarAudio);

const hojeISO = new Date().toLocaleDateString('pt-BR').split('/').reverse().join('-');
if (filtroData) filtroData.value = hojeISO;

// --- 1️⃣ NOTIFICAÇÕES EM TEMPO REAL ---
let primeiraCarga = true;
const agendamentosRef = ref(db, "agendamentos");

onChildAdded(agendamentosRef, (snapshot) => {
  if (!primeiraCarga) {
    const novoAg = snapshot.val();
    exibirModalNovoAgendamento(novoAg);
  }
});
onValue(agendamentosRef, () => { primeiraCarga = false; }, { onlyOnce: true });

function exibirModalNovoAgendamento(ag) {
  const modal = document.getElementById('modal-notificacao');
  if (!modal) return;
  const dataBR = ag.data ? ag.data.split("-").reverse().join("/") : "---";
  const valor = ag.valorFinal ?? ag.valor ?? null;
  document.getElementById('notif-cliente').innerText = ag.cliente || "---";
  document.getElementById('notif-servico').innerText =
    ag.servicoNome && ag.servicoNome.trim() !== "" ? ag.servicoNome : "Não informado";
  document.getElementById('notif-data').innerText = dataBR;
  document.getElementById('notif-hora').innerText = ag.hora || "---";
  const elValor = document.getElementById('notif-valor');
  if (elValor && valor !== null) elValor.innerText = `R$ ${valor.toFixed(2).replace('.', ',')}`;
  modal.style.display = 'flex';
  somNotificacao.play().catch(() => {});
  setTimeout(() => { modal.style.display = 'none'; }, 60000);
}

// --- 2️⃣ AGENDAMENTOS ---
function carregarAgendamentos() {
  onValue(agendamentosRef, (snapshot) => {
    if (!listaAgendamentos) return;
    listaAgendamentos.innerHTML = "";
    const data = snapshot.val();
    if (!data) return;

    const dataSelecionada = filtroData.value;
    const termoBusca = buscaCliente.value.toLowerCase();
    const agora = new Date();
    const minutosAtuais = (agora.getHours() * 60) + agora.getMinutes();

    const itens = Object.entries(data)
      .filter(([id, ag]) => {
        if (!ag || !ag.hora || !ag.data) return false;
        if (ag.servicoId === "bloqueio") return false;
        const [hAg, mAg] = ag.hora.split(":").map(Number);
        const minutosAg = (hAg * 60) + mAg;
        const nomeAg = (ag.cliente || "").toLowerCase();
        const foneAg = (ag.whatsapp || "");
        const matchesData = ag.data === dataSelecionada;
        const matchesBusca = nomeAg.includes(termoBusca) || foneAg.includes(termoBusca);
        let matchesHorario = true;
        if (togglePassados && togglePassados.checked && ag.data === hojeISO) {
          matchesHorario = minutosAg >= minutosAtuais;
        }
        return matchesData && matchesBusca && matchesHorario;
      })
      .sort(([, a], [, b]) => a.hora.localeCompare(b.hora));

    if (itens.length === 0) {
      listaAgendamentos.innerHTML = "<p style='text-align:center;padding:20px;opacity:0.6;'>Nenhum agendamento para este filtro.</p>";
      return;
    }

    itens.forEach(([id, ag]) => {
      const dataBR = ag.data.split("-").reverse().join("/");
      const nomeServico = ag.servicoNome || ag.servico || "Bloqueio Manual";
      const urlWhats = `https://wa.me/55${ag.whatsapp}?text=Olá! Confirmamos seu agendamento do serviço de _*${nomeServico}*_ aqui na *Barberia SF* em _${dataBR}_ às _${ag.hora}_.`;
      const card = document.createElement("div");
      card.className = `admin-card ${ag.cliente === "BLOQUEADO" ? "bloqueado" : ""}`;
      const pagamentoAtual = ag.formaPagamento || "digital";
      const nomesPagamento = { digital:"Pagamento Digital", dinheiro:"Pagamento em Dinheiro", pendente:"Pagamento Pendente" };
      const textoExibido = nomesPagamento[pagamentoAtual] || pagamentoAtual;
      const statusPendente = pagamentoAtual.toLowerCase() === "pendente";
      const botaoConfirmar = statusPendente
        ? `<button onclick="window.confirmarPagamento('${id}','${ag.cliente}')" style="background:#2ecc71;border:none;color:white;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin-top:8px;font-weight:bold;display:block;">✔️ Confirmar Recebimento</button>`
        : '';

      // Badge de plano
      const badgePlano = ag.ehPlano
        ? `<span style="font-size:10px;background:#d4af37;color:#000;padding:2px 7px;border-radius:10px;margin-left:6px;font-weight:bold;">PLANO</span>`
        : '';

      card.innerHTML = `
        <div>
          <strong>${ag.hora} — ${ag.cliente}</strong>${badgePlano}<br>
          <small>${nomeServico}</small><br>
          <div class="dropdown-servico">
            <button class="dropdown-btn-servico">${nomeServico}</button>
            <div class="dropdown-menu-servico"></div>
          </div>
          <button class="btn-editar-valor" data-id="${id}">✏️ Editar Valor</button>
          <button class="btn-nao-compareceu" data-id="${id}" data-whats="${ag.whatsapp}">NÃO COMPARECEU</button>
        </div>
        <div class="btns-card">
          <div class="custom-select" data-id="${id}" data-valor="${pagamentoAtual}">
            <div class="custom-select-trigger">💳 ${textoExibido}<span class="arrow">▾</span></div>
            <div class="custom-options">
              <div class="custom-option" data-value="digital">Pagamento Digital</div>
              <div class="custom-option" data-value="dinheiro">Pagamento em Dinheiro</div>
              <div class="custom-option" data-value="pendente">Pendente</div>
            </div>
          </div>
          ${ag.cliente !== "BLOQUEADO" ? `<a href="${urlWhats}" target="_blank" class="btn-whatsapp">WhatsApp</a>` : ''}
          <button class="btn-delete">Excluir</button>
        </div>`;

      card.querySelector(".btn-delete").onclick = () => {
        if (confirm(`Excluir agendamento de ${ag.cliente}?`)) remove(ref(db, `agendamentos/${id}`));
      };
      listaAgendamentos.appendChild(card);
      const dropdownContainer = card.querySelector('.dropdown-servico');
      if (dropdownContainer) criarDropdownServico(dropdownContainer, nomeServico, id);
    });
  });
}

function criarDropdownServico(container, servicoAtual, agendamentoId) {
  const btn  = container.querySelector(".dropdown-btn-servico");
  const menu = container.querySelector(".dropdown-menu-servico");
  btn.textContent = servicoAtual;
  btn.onclick = () => menu.classList.toggle("ativo");
  onValue(ref(db, "servicos"), (snap) => {
    menu.innerHTML = "";
    snap.forEach(serv => {
      const dados = serv.val();
      const item = document.createElement("div");
      item.textContent = `${dados.nome} - R$ ${dados.preco}`;
      item.onclick = async () => {
        btn.textContent = dados.nome;
        menu.classList.remove("ativo");
        const agRef = ref(db, `agendamentos/${agendamentoId}`);
        const snapshot = await get(agRef);
        const ag = snapshot.val();
        if (!ag) return;
        const valorBase = Number(dados.preco);
        await update(agRef, { servicoId: serv.key, servicoNome: dados.nome, duracao: Number(dados.duracao), valor: valorBase, valorFinal: valorBase, valorExtra: 0 });
      };
      menu.appendChild(item);
    });
  });
}

document.addEventListener("click", (e) => {
  document.querySelectorAll(".dropdown-menu-servico").forEach(menu => {
    if (!menu.parentElement.contains(e.target)) menu.classList.remove("ativo");
  });
});

// --- 3️⃣ MODAL DE CONFIRMAÇÃO ---
function mostrarConfirmacao(titulo, mensagem, data, servico, acaoSim) {
  const overlay = document.getElementById('custom-confirm');
  if (!overlay) return;
  document.getElementById('confirm-title').innerText = titulo;
  document.getElementById('confirm-msg').innerText = mensagem;
  document.getElementById('confirm-date').innerText = data || "---";
  document.getElementById('confirm-service').innerText = servico || "---";
  overlay.style.display = 'flex';
  const btnSim = document.getElementById('confirm-yes');
  const novoBtnSim = btnSim.cloneNode(true);
  btnSim.parentNode.replaceChild(novoBtnSim, btnSim);
  novoBtnSim.onclick = () => { acaoSim(); overlay.style.display = 'none'; };
  document.getElementById('confirm-no').onclick = () => { overlay.style.display = 'none'; };
}

// --- 4️⃣ GRADE DE BLOQUEIO ---
function gerarGradeBloqueio() {
  const dataSelecionada = filtroData.value;
  if (!dataSelecionada) return;
  const diasSemana = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
  const diaNome = diasSemana[new Date(dataSelecionada + 'T00:00:00').getDay()];
  onValue(ref(db, `horarios_funcionamento/${diaNome}`), (funcSnapshot) => {
    const config = funcSnapshot.val();
    if (!config || config.fechado) {
      gradeBloqueio.innerHTML = `<p style='grid-column:1/-1;text-align:center;padding:20px;color:var(--vermelho);'>Barbearia fechada (${diaNome}).</p>`;
      return;
    }
    onValue(agendamentosRef, (snapshot) => {
      const agendados = snapshot.val() || {};
      gradeBloqueio.innerHTML = "";
      const dataBR = dataSelecionada.split('-').reverse().join('/');
      for (let h = parseInt(config.inicio); h <= parseInt(config.fim); h++) {
        for (let m = 0; m < 60; m += 20) {
          if (h === parseInt(config.fim) && m > 0) break;
          const horaFormatada = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
          const agId = Object.keys(agendados).find(id => agendados[id].data === dataSelecionada && agendados[id].hora === horaFormatada);
          const ocupado = !!agId;
          const ehBloqueio = ocupado && agendados[agId].cliente === "BLOQUEADO";
          const btn = document.createElement("button");
          btn.innerText = horaFormatada;
          btn.className = ehBloqueio ? "btn-hora bloqueado-red" : (ocupado ? "btn-hora ocupado" : "btn-hora livre");
          btn.onclick = () => {
            if (!ocupado) {
              mostrarConfirmacao("Bloquear Horário", `Bloquear ${horaFormatada}?`, dataBR, "Bloqueio Manual", () => {
                push(agendamentosRef, { cliente:"BLOQUEADO", data:dataSelecionada, hora:horaFormatada, whatsapp:"00000000000", servicoId:"bloqueio", servicoNome:"Bloqueio Manual", duracao:20, valor:0, valorFinal:0, valorExtra:0, formaPagamento:"bloqueio" });
              });
            } else if (ehBloqueio) {
              mostrarConfirmacao("Liberar Horário", `Liberar ${horaFormatada}?`, dataBR, "Bloqueio Manual", () => { remove(ref(db, `agendamentos/${agId}`)); });
            } else {
              alert("Horário ocupado por um cliente.");
            }
          };
          gradeBloqueio.appendChild(btn);
        }
      }
    });
  }, { onlyOnce: true });
}

// --- 5️⃣ SERVIÇOS ---
function carregarServicos() {
  onValue(ref(db, "servicos"), (snapshot) => {
    if (!listaServicos) return;
    listaServicos.innerHTML = "";
    const data = snapshot.val();
    servicosDisponiveis = data;
    if (data) {
      const ordenados = Object.entries(data).sort(([,a],[,b]) => (a.ordem||99)-(b.ordem||99));
      ordenados.forEach(([id, s]) => {
        const card = document.createElement('div');
        card.className = 'servico-card';
        card.innerHTML = `
          <div><strong>${s.ordem||'?'}. ${s.nome}</strong><br><small>R$ ${s.preco} | ${s.duracao}min</small></div>
          <div class="btns-card">
            <button class="btn-edit-ordem" title="Mudar Posição">🔢</button>
            <button class="btn-edit-serv" title="Editar Preço">💰</button>
            <button class="btn-del-serv" title="Excluir">🗑️</button>
          </div>`;
        card.querySelector('.btn-del-serv').onclick = () => { if (confirm(`Excluir serviço ${s.nome}?`)) remove(ref(db, `servicos/${id}`)); };
        card.querySelector('.btn-edit-serv').onclick = () => { const novoPreco = prompt(`Novo preço para ${s.nome}:`, s.preco); if (novoPreco) update(ref(db, `servicos/${id}`), { preco: Number(novoPreco) }); };
        card.querySelector('.btn-edit-ordem').onclick = () => { const novaOrdem = prompt(`Nova posição para ${s.nome}:`, s.ordem||""); if (novaOrdem) update(ref(db, `servicos/${id}`), { ordem: Number(novaOrdem) }); };
        listaServicos.appendChild(card);
      });
    }
  });
}

// --- 6️⃣ NAVEGAÇÃO ENTRE ABAS ---
const btnTabAg          = document.getElementById('btn-agendamentos');
const btnTabServ        = document.getElementById('btn-servicos');
const btnTabBloq        = document.getElementById('btn-bloqueio');
const btnTabRecesso     = document.getElementById('btn-recesso');
const btnTabClientesBloq= document.getElementById('btn-clientes-bloq');
const btnTabAssinaturas = document.getElementById('btn-assinaturas');
const btnTabGerPlanos   = document.getElementById('btn-ger-planos');

function gerenciarAbas(abaAtiva) {
  const secoes = {
    ag:          'sec-agendamentos',
    serv:        'sec-servicos',
    bloq:        'sec-bloqueio',
    recesso:     'sec-recesso',
    manual:      'sec-agendar-manual',
    clientes:    'sec-clientes-bloqueados',
    assinaturas: 'sec-assinaturas',
    gerplanos:   'sec-ger-planos'
  };
  Object.entries(secoes).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = k === abaAtiva ? 'block' : 'none';
  });
  const btns = {
    ag: btnTabAg, serv: btnTabServ, bloq: btnTabBloq,
    recesso: btnTabRecesso, manual: btnTabManual,
    clientes: btnTabClientesBloq, assinaturas: btnTabAssinaturas,
    gerplanos: btnTabGerPlanos
  };
  Object.entries(btns).forEach(([k, btn]) => {
    if (btn) btn.classList.toggle('active', k === abaAtiva);
  });
  if (abaAtiva === 'bloq')        gerarGradeBloqueio();
  if (abaAtiva === 'clientes')    carregarClientesBloqueados();
  if (abaAtiva === 'assinaturas') carregarAssinaturasPendentes();
  if (abaAtiva === 'gerplanos')   carregarGerenciarPlanos();
}

if (btnTabAg)           btnTabAg.onclick           = () => gerenciarAbas('ag');
if (btnTabServ)         btnTabServ.onclick         = () => gerenciarAbas('serv');
if (btnTabBloq)         btnTabBloq.onclick         = () => gerenciarAbas('bloq');
if (btnTabRecesso)      btnTabRecesso.onclick      = () => gerenciarAbas('recesso');
if (btnTabManual)       btnTabManual.onclick       = () => { gerenciarAbas('manual'); carregarFormularioManual(); };
if (btnTabClientesBloq) btnTabClientesBloq.onclick = () => gerenciarAbas('clientes');
if (btnTabAssinaturas)  btnTabAssinaturas.onclick  = () => gerenciarAbas('assinaturas');
if (btnTabGerPlanos)    btnTabGerPlanos.onclick    = () => gerenciarAbas('gerplanos');

// --- 7️⃣ RECESSO ---
const btnSalvarRecesso  = document.getElementById('btn-salvar-recesso');
const btnRemoverRecesso = document.getElementById('btn-remover-recesso');
const boxStatusRecesso  = document.getElementById('status-recesso-box');
const textoStatusRecesso= document.getElementById('texto-status-recesso');

if (btnSalvarRecesso) {
  btnSalvarRecesso.onclick = () => {
    const inicio = document.getElementById('recesso-inicio').value;
    const fim = document.getElementById('recesso-fim').value;
    if (!inicio || !fim) return alert("Selecione o período completo!");
    update(ref(db, 'configuracoes/recesso'), { inicio, fim, ativo: true }).then(() => alert("Recesso ativado!"));
  };
}
if (btnRemoverRecesso) {
  btnRemoverRecesso.onclick = () => {
    update(ref(db, 'configuracoes/recesso'), { ativo: false }).then(() => alert("Recesso removido! Agenda aberta."));
  };
}
onValue(ref(db, 'configuracoes/recesso'), (snapshot) => {
  const data = snapshot.val();
  if (data && data.ativo) {
    boxStatusRecesso.style.display = 'block';
    const dataIni = data.inicio.split('-').reverse().join('/');
    const dataFim = data.fim.split('-').reverse().join('/');
    textoStatusRecesso.innerHTML = `Barbearia FECHADA de <strong>${dataIni}</strong> até <strong>${dataFim}</strong>.`;
  } else {
    boxStatusRecesso.style.display = 'none';
  }
});

// --- 8️⃣ FORM SERVIÇOS E FILTROS ---
if (formServico) formServico.onsubmit = (e) => {
  e.preventDefault();
  push(ref(db, 'servicos'), {
    nome: document.getElementById('serv-nome').value,
    preco: Number(document.getElementById('serv-preco').value),
    duracao: Number(document.getElementById('serv-duracao').value),
    ordem: Number(document.getElementById('serv-ordem').value)
  }).then(() => { formServico.reset(); alert("Serviço cadastrado!"); });
};
if (filtroData) filtroData.onchange = () => { carregarAgendamentos(); if (document.getElementById('sec-bloqueio').style.display === 'block') gerarGradeBloqueio(); };
if (buscaCliente) buscaCliente.oninput = carregarAgendamentos;
if (togglePassados) togglePassados.onchange = carregarAgendamentos;

// --- 8.1 AGENDAMENTO MANUAL ---
const manualNome           = document.getElementById('manual-nome');
const manualWhats          = document.getElementById('manual-whatsapp');
const manualServicoSelect  = document.getElementById('manual-servico-select');
const manualServicoOptions = document.getElementById('manual-servico-options');
let manualServicoSelecionado = null;
const manualData            = document.getElementById('manual-data');
const manualPagamentoSelect = document.getElementById('manual-pagamento-select');
let manualPagamentoValor    = 'digital';
const manualGrid            = document.getElementById('manual-grid-horarios');
const btnSalvarManual       = document.getElementById('btn-salvar-agendamento-manual');
let horarioManualSelecionado = null;

function carregarFormularioManual() {
  if (!manualServicoOptions) return;
  manualServicoOptions.innerHTML = "";
  manualServicoSelecionado = null;
  if (!servicosDisponiveis || Object.keys(servicosDisponiveis).length === 0) {
    manualServicoOptions.innerHTML = `<div class="custom-option" data-value="">Nenhum serviço cadastrado</div>`;
    return;
  }
  Object.entries(servicosDisponiveis).forEach(([id, s]) => {
    const opt = document.createElement('div');
    opt.className = 'custom-option';
    opt.dataset.value = id;
    opt.innerText = `${s.nome} — R$ ${s.preco}`;
    manualServicoOptions.appendChild(opt);
  });
  manualServicoSelect.querySelector('.custom-select-trigger').innerHTML = `✂️ Selecione o serviço <span class="arrow">▾</span>`;
}

function paraMinutos(hora) {
  if (!hora || !hora.includes(":")) return 0;
  const [h, m] = hora.split(":").map(Number);
  return (h * 60) + m;
}

manualData.onchange = gerarHorariosManuais;

function gerarHorariosManuais() {
  if (!manualData.value || !manualServicoSelecionado) return;
  manualGrid.innerHTML = "Carregando...";
  horarioManualSelecionado = null;
  onValue(ref(db, 'agendamentos'), (snapshot) => {
    const ags = Object.values(snapshot.val() || {}).filter(a => a.data === manualData.value);
    manualGrid.innerHTML = "";
    for (let t = 0; t < 24 * 60; t += 20) {
      const h = String(Math.floor(t / 60)).padStart(2, '0');
      const m = String(t % 60).padStart(2, '0');
      const horaStr = `${h}:${m}`;
      const conflito = ags.some(a => {
        const ini = paraMinutos(a.hora);
        const dur = Number(a.duracao) || 20;
        return t < (ini + dur) && (t + 20) > ini;
      });
      const div = document.createElement('button');
      div.className = conflito ? 'btn-hora ocupado' : 'btn-hora livre';
      div.innerText = horaStr;
      if (!conflito) {
        div.onclick = () => {
          document.querySelectorAll('#manual-grid-horarios .btn-hora').forEach(b => b.classList.remove('selected'));
          div.classList.add('selected');
          horarioManualSelecionado = horaStr;
        };
      }
      manualGrid.appendChild(div);
    }
  }, { onlyOnce: true });
}

async function enviarParaWebhook(dados) {
  const WEBHOOK_URL = 'https://n8n.oreonsolucoes.dpdns.org/webhook/barbearia';
  try {
    await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
  } catch (erro) { console.error("Erro webhook:", erro); }
}

btnSalvarManual.onclick = async () => {
  if (!manualNome.value || !manualWhats.value || !manualServicoSelecionado || !manualData.value || !horarioManualSelecionado) {
    return alert("Preencha todos os campos e selecione o horário.");
  }
  const serv = servicosDisponiveis[manualServicoSelecionado];
  if (!serv) return alert("Serviço inválido.");
  const valorBase = Number(serv.preco);
  const novoAgendamento = {
    cliente: manualNome.value, whatsapp: manualWhats.value.replace(/\D/g, ''),
    servicoId: manualServicoSelecionado, servicoNome: serv.nome,
    valor: valorBase, valorFinal: valorBase, valorExtra: 0,
    data: manualData.value, hora: horarioManualSelecionado, duracao: Number(serv.duracao),
    formaPagamento: manualPagamentoValor, criadoPor: "barbeiro", agendamentoExtra: true, timestamp: Date.now()
  };
  await push(ref(db, 'agendamentos'), novoAgendamento);
  await enviarParaWebhook(novoAgendamento);
  alert("Agendamento criado com sucesso!");
  manualNome.value = ""; manualWhats.value = ""; manualServicoSelecionado = null;
  manualServicoSelect.querySelector('.custom-select-trigger').innerHTML = `✂️ Selecione o serviço <span class="arrow">▾</span>`;
  manualData.value = ""; manualGrid.innerHTML = "";
};

// --- 8.2 SELECTS CUSTOMIZADOS ---
document.addEventListener('click', (e) => {
  document.querySelectorAll('.custom-select').forEach(sel => { if (!sel.contains(e.target)) sel.classList.remove('open'); });
  const trigger = e.target.closest('.custom-select-trigger');
  if (!trigger) return;
  trigger.parentElement.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  const option = e.target.closest('.custom-option');
  if (!option) return;
  const select = option.closest('.custom-select');
  if (!select) return;
  if (select.id === 'manual-pagamento-select') return;
  if (!select.dataset.id) return;
  const agendamentoId = select.dataset.id;
  const valor = option.dataset.value;
  select.querySelector('.custom-select-trigger').innerHTML = `💳 ${option.innerText} <span class="arrow">▾</span>`;
  select.classList.remove('open');
  update(ref(db, `agendamentos/${agendamentoId}`), { formaPagamento: valor });
});

document.addEventListener('click', (e) => {
  const option = e.target.closest('#manual-servico-options .custom-option');
  if (!option) return;
  manualServicoSelecionado = option.dataset.value;
  const serv = servicosDisponiveis[manualServicoSelecionado];
  manualServicoSelect.querySelector('.custom-select-trigger').innerHTML = `✂️ ${serv.nome} <span class="arrow">▾</span>`;
  manualServicoSelect.classList.remove('open');
  gerarHorariosManuais();
});

document.addEventListener('click', (e) => {
  const option = e.target.closest('#manual-pagamento-select .custom-option');
  if (!option) return;
  manualPagamentoValor = option.dataset.value;
  manualPagamentoSelect.querySelector('.custom-select-trigger').innerHTML = `💳 ${option.innerText} <span class="arrow">▾</span>`;
  manualPagamentoSelect.classList.remove('open');
});

// --- CONFIRMAR PAGAMENTO ---
window.confirmarPagamento = function(idAgendamento, nomeCliente) {
  const modal     = document.getElementById('modal-confirmar-pagamento');
  const txtNome   = document.getElementById('nome-cliente-confirm');
  const btnDigital= document.getElementById('btn-pago-digital');
  const btnDinheiro=document.getElementById('btn-pago-dinheiro');
  const btnCancelar=document.getElementById('btn-cancelar-pagamento');
  if (!modal) return;
  txtNome.innerText = nomeCliente;
  modal.style.display = 'flex';
  const atualizarStatus = (novoStatus) => {
    update(ref(db, `agendamentos/${idAgendamento}`), { formaPagamento: novoStatus }).then(() => { modal.style.display = 'none'; });
  };
  btnDigital.onclick  = () => atualizarStatus('digital');
  btnDinheiro.onclick = () => atualizarStatus('dinheiro');
  btnCancelar.onclick = () => modal.style.display = 'none';
};

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-editar-valor');
  if (!btn) return;
  const agendamentoId = btn.dataset.id;
  if (!agendamentoId) return;
  const agRef = ref(db, `agendamentos/${agendamentoId}`);
  const snapshot = await get(agRef);
  const ag = snapshot.val();
  if (!ag) return;
  const valorAtual = ag.valorFinal ?? ag.valor ?? 0;
  const novoValor = prompt("Informe o valor TOTAL do atendimento:", valorAtual);
  if (novoValor === null) return;
  const valorFinal = Number(novoValor);
  if (isNaN(valorFinal) || valorFinal < 0) return alert("Valor inválido.");
  const valorBase = Number(ag.valor) || 0;
  await update(agRef, { valorFinal, valorExtra: valorFinal - valorBase });
  alert("Valor atualizado!");
});

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-nao-compareceu')) return;
  const id = e.target.dataset.id;
  const telefone = e.target.dataset.whats;
  if (!confirm("Marcar como NÃO COMPARECEU e bloquear cliente?")) return;
  e.target.classList.add("bloqueado");
  await update(ref(db, `clientesBloqueados/${telefone}`), { nome:"Cliente bloqueado", telefone, motivo:"Não compareceu", bloqueadoEm: Date.now() });
  await update(ref(db, `agendamentos/${id}`), { status:"nao_compareceu" });
  alert("Cliente bloqueado.");
});

// --- CLIENTES BLOQUEADOS ---
function carregarClientesBloqueados() {
  const lista = document.getElementById('listaClientesBloqueados');
  lista.innerHTML = '';
  onValue(ref(db, 'clientesBloqueados'), snap => {
    lista.innerHTML = '';
    snap.forEach(child => {
      const c = child.val();
      const card = document.createElement('div');
      card.className = 'card-bloqueado';
      card.innerHTML = `<strong>${c.nome}</strong><br><small>${child.key}</small><br><small>${c.motivo}</small><button onclick="desbloquearCliente('${child.key}')">Desbloquear</button>`;
      lista.appendChild(card);
    });
  });
}
window.desbloquearCliente = function(telefone) { remove(ref(db, `clientesBloqueados/${telefone}`)); };

// ═══════════════════════════════════════════════════════════
// --- 9️⃣ ASSINATURAS PENDENTES (NOVA ABA) ---
// ═══════════════════════════════════════════════════════════
function carregarAssinaturasPendentes() {
  const lista = document.getElementById('lista-assinaturas-pendentes');
  if (!lista) return;
  lista.innerHTML = '<p style="opacity:.6;text-align:center;padding:20px;">Carregando...</p>';

  onValue(ref(db, 'assinaturas'), (snap) => {
    lista.innerHTML = '';
    const dados = snap.val();
    if (!dados) {
      lista.innerHTML = '<p style="opacity:.6;text-align:center;padding:20px;">Nenhuma assinatura encontrada.</p>';
      return;
    }

    const lista_arr = Object.entries(dados).sort(([,a],[,b]) => (b.criadoEm||0) - (a.criadoEm||0));

    lista_arr.forEach(([tel, ass]) => {
      const card = document.createElement('div');
      const statusColor = ass.status === 'ativo' ? '#2ecc71' : ass.status === 'pendente' ? '#f39c12' : '#e74c3c';
      const statusLabel = ass.status === 'ativo' ? '✅ Ativo' : ass.status === 'pendente' ? '⏳ Pendente' : '❌ Inativo';
      const criado = ass.criadoEm ? new Date(ass.criadoEm).toLocaleDateString('pt-BR') : '—';

      // Contagem de usos no ciclo atual (baseado na data de aprovação)
      const periodoAtual = ass.dataAprovacao
          ? calcularPeriodoAtual(ass.dataAprovacao)
          : new Date().toISOString().slice(0, 7);
      const usos = (ass.usosNoMes && ass.usosNoMes[periodoAtual]) || 0;

      card.style.cssText = `background:rgba(255,255,255,.05);border:1px solid #333;border-left:4px solid ${statusColor};border-radius:8px;padding:16px;margin-bottom:12px;`;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
          <div>
            <strong style="color:#fff;font-size:1rem;">${ass.nome || '—'}</strong>
            <span style="font-size:11px;background:${statusColor};color:#000;padding:2px 8px;border-radius:10px;margin-left:8px;font-weight:bold;">${statusLabel}</span><br>
            <small style="color:#aaa;">📞 ${tel} | Plano: <strong style="color:#d4af37;">${ass.planoNome || '—'}</strong></small><br>
            <small style="color:#888;">Cadastrado: ${criado} | Usos este mês: ${usos}/4</small><br>
            ${ass.adicionais && ass.adicionais.length ? `<small style="color:#aaa;">Adicionais: ${ass.adicionais.join(', ')}</small>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;min-width:130px;">
            ${ass.status === 'pendente' ? `
              <button onclick="aprovarAssinatura('${tel}')" style="background:#2ecc71;border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">✅ Aprovar</button>
              <button onclick="rejeitarAssinatura('${tel}')" style="background:#e74c3c;border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">❌ Rejeitar</button>
            ` : ''}
            ${ass.status === 'ativo' ? `
              <button onclick="inativarAssinatura('${tel}')" style="background:#e67e22;border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">⏸ Inativar</button>
              <button onclick="ativarAssinatura('${tel}')" style="background:#3498db;border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">🔄 Renovar mês</button>
            ` : ''}
            ${ass.status === 'inativo' ? `
              <button onclick="ativarAssinatura('${tel}')" style="background:#2ecc71;border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">▶ Reativar</button>
            ` : ''}
            <button onclick="excluirAssinatura('${tel}')" style="background:transparent;border:1px solid #555;color:#888;padding:6px 10px;border-radius:6px;cursor:pointer;font-size:11px;">🗑 Excluir</button>
          </div>
        </div>`;
      lista.appendChild(card);
    });
  });
}

window.aprovarAssinatura = async function(tel) {
  if (!confirm(`Aprovar assinatura de ${tel}?`)) return;
  await update(ref(db, `assinaturas/${tel}`), {
    status: 'ativo',
    dataAprovacao: Date.now(),
    usosNoMes: {},
    usosFlexNoMes: {},
    cobrancaNoMes: {}
  });
  alert('Assinatura aprovada! O cliente já pode agendar pelo plano.');
};

window.rejeitarAssinatura = async function(tel) {
  if (!confirm(`Rejeitar assinatura de ${tel}? Isso vai remover o registro.`)) return;
  await remove(ref(db, `assinaturas/${tel}`));
  alert('Assinatura rejeitada e removida.');
};

window.inativarAssinatura = async function(tel) {
  if (!confirm(`Inativar plano de ${tel}?`)) return;
  await update(ref(db, `assinaturas/${tel}`), { status: 'inativo' });
};

window.ativarAssinatura = async function(tel) {
  // Ao reativar, apenas seta status como ativo.
  // O ciclo é calculado automaticamente a partir do dataAprovacao existente.
  await update(ref(db, `assinaturas/${tel}`), { status: 'ativo' });
  alert('Plano reativado!');
};

window.excluirAssinatura = async function(tel) {
  if (!confirm(`Excluir completamente a assinatura de ${tel}?`)) return;
  await remove(ref(db, `assinaturas/${tel}`));
};

// ═══════════════════════════════════════════════════════════
// --- 🔟 GERENCIAR PLANOS (NOVA ABA) ---
// ═══════════════════════════════════════════════════════════
let planosDisponiveis = {};
let servicosParaPlanos = {};

// Carrega serviços para o select do formulário de plano
onValue(ref(db, 'servicos'), snap => { servicosParaPlanos = snap.val() || {}; });

function carregarGerenciarPlanos() {
  const lista = document.getElementById('lista-planos-admin');
  if (!lista) return;

  onValue(ref(db, 'planos'), (snap) => {
    planosDisponiveis = snap.val() || {};
    lista.innerHTML = '';

    if (!snap.val()) {
      lista.innerHTML = '<p style="opacity:.6;text-align:center;padding:20px;">Nenhum plano cadastrado ainda.</p>';
      return;
    }

    const ordenados = Object.entries(planosDisponiveis).sort(([,a],[,b]) => (a.ordem||99) - (b.ordem||99));

    ordenados.forEach(([id, plano]) => {
      const card = document.createElement('div');
      card.style.cssText = 'background:rgba(255,255,255,.05);border:1px solid rgba(212,175,55,.3);border-radius:10px;padding:16px;margin-bottom:12px;';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
          <div>
            <strong style="color:#d4af37;font-size:1rem;">${plano.nome}</strong>
            ${plano.destaque ? '<span style="font-size:10px;background:#d4af37;color:#000;padding:2px 8px;border-radius:10px;margin-left:6px;">Destaque</span>' : ''}<br>
            <small style="color:#ccc;">${plano.descricao || ''}</small><br>
            <small style="color:#aaa;">R$ ${Number(plano.preco).toFixed(2)} | Adicionais: ${(plano.adicionais||[]).join(', ') || '—'}</small><br>
            <small style="color:#888;">Benefícios: ${(plano.beneficios||[]).join('; ') || '—'}</small>
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="editarPlano('${id}')" style="background:#3498db;border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;">✏️ Editar</button>
            <button onclick="excluirPlano('${id}')" style="background:#e74c3c;border:none;color:#fff;padding:8px 12px;border-radius:6px;cursor:pointer;font-size:12px;">🗑 Excluir</button>
          </div>
        </div>`;
      lista.appendChild(card);
    });
  });
}

// Abre formulário de novo plano
document.getElementById('btn-novo-plano')?.addEventListener('click', () => {
  limparFormPlano();
  document.getElementById('form-plano-wrapper').style.display = 'block';
  document.getElementById('form-plano-wrapper').scrollIntoView({ behavior: 'smooth' });
});

function limparFormPlano() {
  document.getElementById('plano-edit-id').value = '';
  document.getElementById('plano-nome').value = '';
  document.getElementById('plano-desc').value = '';
  document.getElementById('plano-preco').value = '';
  document.getElementById('plano-ordem').value = '';
  document.getElementById('plano-destaque').checked = false;
  document.getElementById('plano-beneficios').value = '';
  renderizarCheckboxAdicionais([]);
}

function renderizarCheckboxAdicionais(selecionados = []) {
  const ADICIONAIS_FIXOS = ['Barba', 'Bigode', 'Sobrancelha', 'Pezinho', 'Cavanhaque', 'Penteado'];
  const container = document.getElementById('plano-adicionais-checks');
  if (!container) return;
  container.innerHTML = '';
  ADICIONAIS_FIXOS.forEach(ad => {
    const label = document.createElement('label');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:4px 8px 4px 0;color:#ccc;font-size:.85rem;cursor:pointer;';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = ad;
    chk.checked = selecionados.includes(ad);
    label.appendChild(chk);
    label.appendChild(document.createTextNode(ad));
    container.appendChild(label);
  });
}

// Editar plano existente
window.editarPlano = function(id) {
  const plano = planosDisponiveis[id];
  if (!plano) return;
  document.getElementById('plano-edit-id').value = id;
  document.getElementById('plano-nome').value = plano.nome || '';
  document.getElementById('plano-desc').value = plano.descricao || '';
  document.getElementById('plano-preco').value = plano.preco || '';
  document.getElementById('plano-ordem').value = plano.ordem || '';
  document.getElementById('plano-destaque').checked = !!plano.destaque;
  document.getElementById('plano-beneficios').value = (plano.beneficios||[]).join('\n');
  renderizarCheckboxAdicionais(plano.adicionais || []);
  document.getElementById('form-plano-wrapper').style.display = 'block';
  document.getElementById('form-plano-wrapper').scrollIntoView({ behavior: 'smooth' });
};

window.excluirPlano = async function(id) {
  if (!confirm('Excluir este plano?')) return;
  await remove(ref(db, `planos/${id}`));
};

// Salvar plano (criar ou editar)
document.getElementById('btn-salvar-plano')?.addEventListener('click', async () => {
  const editId    = document.getElementById('plano-edit-id').value;
  const nome      = document.getElementById('plano-nome').value.trim();
  const descricao = document.getElementById('plano-desc').value.trim();
  const preco     = Number(document.getElementById('plano-preco').value);
  const ordem     = Number(document.getElementById('plano-ordem').value) || 99;
  const destaque  = document.getElementById('plano-destaque').checked;
  const beneficios= document.getElementById('plano-beneficios').value.split('\n').map(b=>b.trim()).filter(Boolean);
  const adicionais= Array.from(document.querySelectorAll('#plano-adicionais-checks input:checked')).map(c=>c.value);

  if (!nome || !preco) return alert('Preencha pelo menos nome e preço.');

  const dados = { nome, descricao, preco, ordem, destaque, beneficios, adicionais, maxUsosMes: 4 };

  if (editId) {
    await update(ref(db, `planos/${editId}`), dados);
    alert('Plano atualizado!');
  } else {
    await push(ref(db, 'planos'), dados);
    alert('Plano criado!');
  }
  document.getElementById('form-plano-wrapper').style.display = 'none';
  limparFormPlano();
});

document.getElementById('btn-cancelar-plano')?.addEventListener('click', () => {
  document.getElementById('form-plano-wrapper').style.display = 'none';
  limparFormPlano();
});

// Inicializa os checkboxes ao carregar a página
renderizarCheckboxAdicionais([]);

// --- INTERVALO DE ATUALIZAÇÃO ---
setInterval(() => { carregarAgendamentos(); }, 3600000);

window.gerenciarAbas = gerenciarAbas;
window.carregarAgendamentos = carregarAgendamentos;
window.gerarGradeBloqueio = gerarGradeBloqueio;
