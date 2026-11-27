import { useState } from 'react';
import { api } from '../api';
import { Aviso, Campo, Opcoes, usarAcao } from './ui';
import { AGUA } from '../../compartilhado/dominio';

// Escuta do agricultor [RF-REC-05]: o que quer, sabe e gostaria de plantar, e o que considera mais lucrativo.
export function FormEscuta({ agricultorId, escuta, alimentos, onSalvar }: { agricultorId: number; escuta: any; alimentos: any[]; onSalvar: () => void }) {
  const [f, setF] = useState<any>({ quer: [], sabe: [], gostaria: [], lucrativo: [], area_ha: '', agua: 'sazonal', mao_de_obra: '', observacao: '', ...(escuta ?? {}) });
  const [salvo, setSalvo] = useState(false);
  const { ocupado, erro, executar } = usarAcao();
  const opcoes = alimentos.filter((a) => a.agricola && a.produtividade_kg_ha).map((a) => ({ id: a.id as number, rotulo: a.nome }));
  const lista = (k: string, rotulo: string) => (
    <div className="campo largo">
      <span>{rotulo}</span>
      <Opcoes opcoes={opcoes} valor={f[k] ?? []} onMudar={(v) => (setSalvo(false), setF({ ...f, [k]: v }))} />
    </div>
  );
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    executar(async () => {
      await api(`/agricultores/${agricultorId}/escuta`, { metodo: 'PUT', corpo: f });
      setSalvo(true);
      onSalvar();
    });
  };
  return (
    <form onSubmit={salvar}>
      <div className="form">
        {lista('quer', 'O que quer plantar')}
        {lista('sabe', 'O que já sabe plantar')}
        {lista('gostaria', 'O que gostaria de aprender a plantar')}
        {lista('lucrativo', 'O que dá mais lucro')}
        <Campo rotulo="Área livre para plantar (hectares)"><input type="number" min="0" step="any" value={f.area_ha ?? ''} onChange={(e) => setF({ ...f, area_ha: e.target.value })} /></Campo>
        <Campo rotulo="Pessoas que trabalham na roça"><input type="number" min="0" value={f.mao_de_obra ?? ''} onChange={(e) => setF({ ...f, mao_de_obra: e.target.value })} /></Campo>
        <Campo rotulo="Água para irrigar" largo>
          <select value={f.agua} onChange={(e) => setF({ ...f, agua: e.target.value })}>{Object.entries(AGUA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Campo>
        <Campo rotulo="Quer contar mais alguma coisa?" largo><textarea value={f.observacao ?? ''} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></Campo>
      </div>
      {erro && <div style={{ marginTop: 14 }}><Aviso tipo="erro">{erro}</Aviso></div>}
      {salvo && <div style={{ marginTop: 14 }}><Aviso tipo="ok">Escuta registrada. Ela entra nas próximas recomendações de plantio.</Aviso></div>}
      <div className="modal-pe"><button className="botao" disabled={ocupado}>Salvar escuta</button></div>
    </form>
  );
}
