import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Perfil } from '../compartilhado/dominio';

export class ErroApi extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

export async function api<T = any>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api${caminho}`, {
      method: opcoes.metodo ?? (opcoes.corpo !== undefined ? 'POST' : 'GET'),
      headers: opcoes.corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
  }
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && !caminho.startsWith('/entrar')) window.dispatchEvent(new Event('cv:sessao-expirada'));
    throw new ErroApi(dados.erro ?? 'Não foi possível concluir. Tente de novo.', r.status);
  }
  return dados as T;
}

/** Carrega dados de uma rota e permite recarregar depois de uma ação. */
export function usarDados<T = any>(caminho: string | null) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(!!caminho);
  const pedido = useRef(0);
  const recarregar = useCallback(async () => {
    if (!caminho) return;
    const n = ++pedido.current;
    setCarregando(true);
    try {
      const d = await api<T>(caminho);
      if (n === pedido.current) (setDados(d), setErro(null));
    } catch (e) {
      if (n === pedido.current) setErro((e as Error).message);
    } finally {
      if (n === pedido.current) setCarregando(false);
    }
  }, [caminho]);
  useEffect(() => {
    setDados(null);
    recarregar();
  }, [recarregar]);
  return { dados, erro, carregando, recarregar };
}

export type Sessao = {
  usuario: { id: number; nome: string; email: string; perfil: Perfil; vinculo_id: number | null };
  vinculo: { id: number; nome: string; modal?: string } | null;
  prestador_proprio: { id: number; modal: string } | null;
  sandbox: boolean; hoje: string;
  municipio: { id: number; nome: string; uf: string; lat: number; lng: number; raio_km: number; modo_piloto: boolean; exercicio: number };
  municipios: { id: number; nome: string }[];
};
export const ContextoSessao = createContext<{ sessao: Sessao; recarregar: () => void; sair: () => void } | null>(null);
export const usarSessao = () => useContext(ContextoSessao)!;

export const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
export const dataHoraBr = (iso?: string | null) => (iso ? `${dataBr(iso)} às ${iso.slice(11, 16)}` : '—');
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const diaDaSemana = (iso: string) => DIAS[new Date(`${iso.slice(0, 10)}T12:00:00`).getDay()];
export const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export const numero = (v: number | null | undefined, casas = 1) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }));
