import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/600.css';
import '@fontsource/open-sans/700.css';
import './estilo.css';
import { api, ContextoSessao, type Sessao } from './api';
import { PERFIS_CAMPO } from '../compartilhado/dominio';
import { Entrar } from './paginas/Entrar';
import { Casca } from './Casca';
import { Campo } from './paginas/Campo';
import { PainelGestor } from './paginas/Painel';
import { Territorio } from './paginas/Territorio';
import { Nutricao } from './paginas/Nutricao';
import { Ofertas } from './paginas/Ofertas';
import { Cardapios, CardapioDetalhe } from './paginas/Cardapios';
import { Recomendacoes } from './paginas/Recomendacoes';
import { Precos } from './paginas/Precos';
import { Rotas } from './paginas/Rotas';
import { Entregas, EntregaDetalhe } from './paginas/Entregas';
import { Pagamentos } from './paginas/Pagamentos';
import { Trilha } from './paginas/Trilha';
import { Administracao } from './paginas/Administracao';

function App() {
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined);
  const carregar = useCallback(() => {
    api<Sessao>('/eu').then(setSessao).catch(() => setSessao(null));
  }, []);
  useEffect(() => {
    carregar();
    const expirou = () => setSessao(null);
    window.addEventListener('cv:sessao-expirada', expirou);
    return () => window.removeEventListener('cv:sessao-expirada', expirou);
  }, [carregar]);
  const sair = useCallback(() => {
    api('/sair', { metodo: 'POST' }).finally(() => setSessao(null));
  }, []);

  if (sessao === undefined) return <div className="carregando">Carregando…</div>;
  if (!sessao) return <Entrar onEntrar={carregar} />;
  return (
    <ContextoSessao.Provider value={{ sessao, recarregar: carregar, sair }}>
      {PERFIS_CAMPO.includes(sessao.usuario.perfil) ? (
        <Campo />
      ) : (
        // a chave recria as telas quando o operador troca de município
        <Casca key={sessao.municipio.id}>
          <Routes>
            <Route path="/" element={<PainelGestor />} />
            <Route path="/territorio" element={<Territorio />} />
            <Route path="/ofertas" element={<Ofertas />} />
            <Route path="/recomendacoes" element={<Recomendacoes />} />
            <Route path="/nutricao" element={<Nutricao />} />
            <Route path="/cardapios" element={<Cardapios />} />
            <Route path="/cardapios/:id" element={<CardapioDetalhe />} />
            <Route path="/precos" element={<Precos />} />
            <Route path="/rotas" element={<Rotas />} />
            <Route path="/entregas" element={<Entregas />} />
            <Route path="/entregas/:id" element={<EntregaDetalhe />} />
            <Route path="/pagamentos" element={<Pagamentos />} />
            <Route path="/trilha" element={<Trilha />} />
            <Route path="/admin" element={<Administracao />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Casca>
      )}
    </ContextoSessao.Provider>
  );
}

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
