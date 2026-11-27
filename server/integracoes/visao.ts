// Conferência da carga por visão computacional [RF-AUD-02].
// SIMULADO na Fase 1: nenhuma imagem é analisada. O resultado é derivado das quantidades declaradas
// na origem e no destino e da avaliação de qualidade feita por quem recebeu. O contrato abaixo é o que
// um modelo de visão deverá preencher quando for integrado.

export type ItemConferido = { alimento: string; pedido_kg: number; origem_kg: number; recebido_kg: number; qualidade: 'conforme' | 'parcial' | 'nao_conforme' };

export function analisarFotos(itens: ItemConferido[], tolerancia: number) {
  const avaliados = itens.map((i) => {
    const margem = Math.max(0.2, i.pedido_kg * tolerancia);
    return {
      ...i,
      compativel: i.recebido_kg >= i.pedido_kg - margem && Math.abs(i.origem_kg - i.recebido_kg) <= margem,
      deterioracao: i.qualidade !== 'conforme',
    };
  });
  return { motor: 'simulado' as const, itens: avaliados, ok: avaliados.every((i) => i.compativel && !i.deterioracao) };
}
