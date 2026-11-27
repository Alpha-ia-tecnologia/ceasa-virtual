import { createHash } from 'node:crypto';

// Arranjo de pagamento [RF-PAG-03]. Na Fase 1 é um mock em sandbox: nenhuma instituição é acionada
// e nenhum recurso é movimentado. A plataforma não custodia recurso público (decisão 5 da especificação).

export type Transferencia = { favorecido: string; documento: string | null; banco: string | null; agencia: string | null; conta: string | null; valor: number; descricao: string };
export type Comprovante = { id: string; favorecido: string; valor: number; descricao: string; ok: boolean; erro?: string; ambiente: 'sandbox' };

export interface ArranjoPagamento {
  transferir(t: Transferencia): Comprovante;
}

export const arranjoSandbox: ArranjoPagamento = {
  transferir(t) {
    const id = 'SBX-' + createHash('sha256').update(JSON.stringify(t) + Date.now() + Math.random()).digest('hex').slice(0, 16).toUpperCase();
    const base = { id, favorecido: t.favorecido, valor: t.valor, descricao: t.descricao, ambiente: 'sandbox' as const };
    if (!t.conta || !t.agencia) return { ...base, ok: false, erro: 'Conta ou agência não informada no cadastro' };
    return { ...base, ok: true };
  },
};
