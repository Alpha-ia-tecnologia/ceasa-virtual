import { useState } from 'react';
import { api, usarDados } from '../api';
import { Aviso, Campo, usarAcao } from '../componentes/ui';
import { PERFIS, type Perfil } from '../../compartilhado/dominio';

const ORDEM: Perfil[] = ['operador', 'prefeito', 'sec_educacao', 'sec_agricultura', 'nutricionista', 'controle', 'agricultor', 'prestador', 'diretor'];

export function Entrar({ onEntrar }: { onEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const { ocupado, erro, executar } = usarAcao();
  const { dados } = usarDados<{ sandbox: boolean; senha?: string; usuarios: { id: number; nome: string; perfil: Perfil; email: string }[] }>('/sandbox/perfis');

  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    executar(async () => {
      await api('/entrar', { corpo: { email, senha } });
      onEntrar();
    });
  };
  const entrarComo = (id: number) => executar(async () => { await api('/sandbox/entrar', { corpo: { usuario_id: id } }); onEntrar(); });
  // um usuário de cada perfil no acesso rápido; os demais entram por e-mail
  const rapidos = ORDEM.map((p) => dados?.usuarios.find((u) => u.perfil === p)).filter(Boolean) as { id: number; nome: string; perfil: Perfil }[];

  return (
    <div className="entrar">
      <div className="entrar-marca">
        <img src="/marca/logo-reversa.png" alt="CEASA VIRTUAL — O mapa social da Agricultura Familiar" />
        <p>Tecnologia para conectar a agricultura familiar às necessidades de abastecimento.</p>
        <svg className="curvas" viewBox="0 0 800 110" fill="none" aria-hidden>
          {[0, 22, 44].map((d) => (
            <path key={d} d={`M-10 ${50 + d} C 160 ${78 + d}, 330 ${18 + d}, 520 ${14 + d} S 760 ${8 + d}, 820 ${16 + d}`} stroke="#71A541" strokeWidth="3" strokeLinecap="round" />
          ))}
        </svg>
      </div>
      <div className="entrar-form">
        <div>
          <h1>Entrar na plataforma</h1>
          <p className="suave" style={{ marginTop: 6 }}>Use o e-mail e a senha fornecidos pela equipe do seu município.</p>
        </div>
        <form className="pilha" style={{ gap: 14 }} onSubmit={entrar}>
          <Campo rotulo="E-mail">
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Campo>
          <Campo rotulo="Senha">
            <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </Campo>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <button className="botao" disabled={ocupado}>Entrar</button>
        </form>
        {dados?.sandbox && (
          <div className="pilha" style={{ gap: 10 }}>
            <div>
              <h3>Acesso rápido do ambiente de simulação</h3>
              <p className="pequeno suave">Pessoas, município e entregas são sintéticos. Senha de todos os usuários: <strong>{dados.senha}</strong></p>
            </div>
            <div className="perfis">
              {rapidos.map((u) => (
                <button key={u.id} className="perfil-botao" onClick={() => entrarComo(u.id)} disabled={ocupado}>
                  <b>{PERFIS[u.perfil]}</b>
                  <span>{u.nome}</span>
                </button>
              ))}
            </div>
            <details className="pequeno">
              <summary>Todos os usuários do sandbox ({dados.usuarios.length})</summary>
              <div className="perfis" style={{ marginTop: 8 }}>
                {dados.usuarios.map((u) => (
                  <button key={u.id} className="perfil-botao" onClick={() => entrarComo(u.id)} disabled={ocupado}>
                    <b>{u.nome}</b>
                    <span>{PERFIS[u.perfil]} — {u.email}</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
