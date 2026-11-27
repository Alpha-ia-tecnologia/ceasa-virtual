import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Apple, Banknote, LayoutDashboard, Lightbulb, LogOut, Map as IconeMapa, Menu, PackageCheck, Route as IconeRota, ScrollText, Settings, Sprout, Tag, UtensilsCrossed } from 'lucide-react';
import { api, usarSessao, usarDados } from './api';
import { PERFIS } from '../compartilhado/dominio';

// A navegação segue a ordem em que o abastecimento acontece: território, ofertas, planejamento, entregas, acompanhamento.
const ETAPAS = [
  { rotulo: 'Território', itens: [{ para: '/territorio', rotulo: 'Mapa e cadastros', Icone: IconeMapa }] },
  { rotulo: 'Ofertas', itens: [{ para: '/ofertas', rotulo: 'Oferta agrícola', Icone: Sprout }, { para: '/recomendacoes', rotulo: 'Recomendações de plantio', Icone: Lightbulb }] },
  { rotulo: 'Planejamento', itens: [{ para: '/nutricao', rotulo: 'Base nutricional', Icone: Apple }, { para: '/cardapios', rotulo: 'Cardápios', Icone: UtensilsCrossed }, { para: '/precos', rotulo: 'Preços e edital', Icone: Tag }] },
  { rotulo: 'Entregas', itens: [{ para: '/rotas', rotulo: 'Rotas', Icone: IconeRota }, { para: '/entregas', rotulo: 'Entregas e evidências', Icone: PackageCheck, conta: 'divergencias' as const }] },
  { rotulo: 'Acompanhamento', itens: [{ para: '/pagamentos', rotulo: 'Pagamentos', Icone: Banknote, conta: 'a_pagar' as const }, { para: '/trilha', rotulo: 'Trilha de auditoria', Icone: ScrollText }, { para: '/admin', rotulo: 'Administração', Icone: Settings }] },
];

export function Casca({ children }: { children: ReactNode }) {
  const { sessao, recarregar, sair } = usarSessao();
  const [aberta, setAberta] = useState(false);
  const local = useLocation();
  const navegar = useNavigate();
  const { dados: painel } = usarDados<any>('/painel');
  useEffect(() => setAberta(false), [local.pathname]);

  const trocarMunicipio = async (id: number) => {
    await api('/municipio-ativo', { corpo: { municipio_id: id } });
    navegar('/');
    recarregar();
  };

  return (
    <div className="casca">
      <aside className={`lateral ${aberta ? 'aberta' : ''}`}>
        <NavLink to="/" className="logo" aria-label="CEASA VIRTUAL — início">
          <img src="/marca/logo-compacta.png" alt="CEASA VIRTUAL" />
        </NavLink>
        <nav aria-label="Principal">
          <div className="nav-inicio">
            <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'ativo' : ''}`}>
              <LayoutDashboard size={18} aria-hidden /> Painel do gestor
            </NavLink>
          </div>
          <div className="caminho">
            {ETAPAS.map((e) => (
              <div className="etapa" key={e.rotulo}>
                <span>{e.rotulo}</span>
                {e.itens.map(({ para, rotulo, Icone, ...resto }) => {
                  const conta = 'conta' in resto && resto.conta ? painel?.pendencias?.[resto.conta] : 0;
                  return (
                    <NavLink key={para} to={para} className={({ isActive }) => `nav-item ${isActive ? 'ativo' : ''}`}>
                      <Icone size={18} aria-hidden /> {rotulo}
                      {conta > 0 && <span className="conta" title="Pendências">{conta}</span>}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>
        <div className="lateral-pe">O mapa social da Agricultura Familiar</div>
      </aside>
      <div className="principal">
        <div className="topo">
          <button className="botao secundario menu-botao" onClick={() => setAberta((a) => !a)} aria-label="Abrir o menu" aria-expanded={aberta}>
            <Menu size={20} />
          </button>
          {sessao.municipios.length > 1 ? (
            <select value={sessao.municipio.id} onChange={(e) => trocarMunicipio(Number(e.target.value))} aria-label="Município">
              {sessao.municipios.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          ) : (
            <strong>{sessao.municipio.nome}</strong>
          )}
          {sessao.sandbox && <span className="chip-sim" title="Dados sintéticos; nenhum pagamento ou prestador real é acionado">Ambiente de simulação</span>}
          <span className="espaco" />
          <div className="quem">
            <strong>{sessao.usuario.nome}</strong>
            <span>{PERFIS[sessao.usuario.perfil]}</span>
          </div>
          <button className="botao secundario" onClick={sair}>
            <LogOut size={18} aria-hidden /> Sair
          </button>
        </div>
        <main className="conteudo">{children}</main>
      </div>
    </div>
  );
}
