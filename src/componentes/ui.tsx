import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { PERCURSO, STATUS_PEDIDO, type StatusPedido } from '../../compartilhado/dominio';
import { ErroApi } from '../api';

export function Cabecalho({ titulo, children, acoes }: { titulo: string; children?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="cabecalho">
      <div>
        <h1>{titulo}</h1>
        {children && <p>{children}</p>}
      </div>
      {acoes && <div className="acoes nao-imprimir">{acoes}</div>}
    </header>
  );
}

export function Painel({ titulo, acoes, children, className = '' }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`painel ${className}`}>
      {(titulo || acoes) && (
        <div className="titulo">
          <h2>{titulo}</h2>
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Indicador({ valor, rotulo, nota }: { valor: ReactNode; rotulo: string; nota?: ReactNode }) {
  return (
    <div className="indicador">
      <b>{valor}</b>
      <span>{rotulo}</span>
      {nota && <small>{nota}</small>}
    </div>
  );
}

export function Aviso({ tipo = 'atencao', children }: { tipo?: 'atencao' | 'erro' | 'ok' | 'neutro'; children: ReactNode }) {
  const Icone = tipo === 'erro' ? XCircle : tipo === 'ok' ? CheckCircle2 : tipo === 'neutro' ? Info : AlertTriangle;
  return (
    <div className={`aviso ${tipo === 'atencao' ? '' : tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      <Icone size={18} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Estado({ carregando, erro, children }: { carregando: boolean; erro: string | null; children: ReactNode }) {
  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (carregando && !children) return <div className="carregando">Carregando…</div>;
  return <>{children}</>;
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vazio">
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

export function Modal({ titulo, onFechar, children, largo }: { titulo: string; onFechar: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`modal ${largo ? 'largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="titulo">
          <h2>{titulo}</h2>
          <button className="botao texto" onClick={onFechar} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Campo({ rotulo, ajuda, children, largo }: { rotulo: string; ajuda?: string; children: ReactNode; largo?: boolean }) {
  return (
    <label className={`campo ${largo ? 'largo' : ''}`}>
      <span>{rotulo}</span>
      {children}
      {ajuda && <small>{ajuda}</small>}
    </label>
  );
}

export function Abas<T extends string>({ abas, ativa, onMudar }: { abas: { id: T; rotulo: string; conta?: number }[]; ativa: T; onMudar: (a: T) => void }) {
  return (
    <div className="abas" role="tablist">
      {abas.map((a) => (
        <button key={a.id} role="tab" aria-selected={a.id === ativa} className={`aba ${a.id === ativa ? 'ativa' : ''}`} onClick={() => onMudar(a.id)}>
          {a.rotulo}
          {a.conta ? ` (${a.conta})` : ''}
        </button>
      ))}
    </div>
  );
}

const TOM_STATUS: Record<StatusPedido, string> = { gerado: '', roteirizado: '', coletado: 'atencao', validado: 'ok', divergencia: 'erro', pago: 'cheio', recusado: 'erro' };
export function SeloPedido({ status }: { status: StatusPedido }) {
  return <span className={`selo ${TOM_STATUS[status] ?? ''}`}>{STATUS_PEDIDO[status] ?? status}</span>;
}

/** Percurso de uma entrega, do pedido ao pagamento. */
export function Percurso({ status, contagem }: { status?: StatusPedido; contagem?: Record<string, number> }) {
  const ordem = PERCURSO.map((p) => p.status);
  const atual = status === 'divergencia' || status === 'recusado' ? ordem.indexOf('validado') : status ? ordem.indexOf(status) : -1;
  return (
    <ol className="percurso">
      {PERCURSO.map((p, i) => {
        const classe = contagem ? 'feito' : i < atual || status === 'pago' ? 'feito' : i === atual ? (status === 'divergencia' || status === 'recusado' ? 'problema' : 'agora') : '';
        return (
          <li key={p.status} className={classe}>
            {contagem && <b>{contagem[p.status] ?? 0}</b>}
            {contagem ? STATUS_PEDIDO[p.status] : p.rotulo}
          </li>
        );
      })}
    </ol>
  );
}

/** Executa uma ação assíncrona mostrando erro em linguagem simples. */
export function usarAcao() {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const executar = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setOcupado(true);
    setErro(null);
    try {
      return await fn();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível concluir. Tente de novo.');
      return undefined;
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, erro, executar, limparErro: () => setErro(null) };
}

export function Opcoes<T extends string | number>({ opcoes, valor, onMudar }: { opcoes: { id: T; rotulo: string }[]; valor: T[]; onMudar: (v: T[]) => void }) {
  return (
    <div className="opcoes">
      {opcoes.map((o) => {
        const ligada = valor.includes(o.id);
        return (
          <button type="button" key={o.id} aria-pressed={ligada} className={`opcao ${ligada ? 'ligada' : ''}`} onClick={() => onMudar(ligada ? valor.filter((v) => v !== o.id) : [...valor, o.id])}>
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
