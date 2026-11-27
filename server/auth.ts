import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { um, exec, inserir, ErroNegocio } from './db.ts';
import { pode, type Acao, type Perfil } from '../compartilhado/dominio.ts';
import type { Autor } from './trilha.ts';

// Autenticação por sessão e controle de acesso por perfil e por município [RF-ADM-01].

export const SANDBOX = process.env.CEASA_SANDBOX !== '0';
const COOKIE = 'cv_sessao';
const DURACAO_H = 12;

export function hashSenha(senha: string) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(senha, sal, 32).toString('hex')}`;
}
export function conferirSenha(senha: string, hash: string) {
  const [sal, h] = hash.split(':');
  if (!sal || !h) return false;
  const a = scryptSync(senha, sal, 32);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Contexto = {
  usuario: { id: number; nome: string; email: string; perfil: Perfil; municipio_id: number | null; vinculo_id: number | null };
  perfil: Perfil; municipioId: number; autor: Autor; token: string;
};

export function abrirSessao(res: Response, usuario: { id: number; municipio_id: number | null }) {
  const token = randomBytes(32).toString('hex');
  const municipioId = usuario.municipio_id ?? um<any>('SELECT id FROM municipios ORDER BY id LIMIT 1')?.id ?? null;
  inserir('sessoes', { token, usuario_id: usuario.id, municipio_id: municipioId, expira_em: new Date(Date.now() + DURACAO_H * 3600e3).toISOString() });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACAO_H * 3600}${process.env.NODE_ENV === 'production' && process.env.CEASA_HTTPS === '1' ? '; Secure' : ''}`);
}
export function fecharSessao(req: Request, res: Response) {
  const token = lerCookie(req);
  if (token) exec('DELETE FROM sessoes WHERE token = ?', token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
function lerCookie(req: Request) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`).exec(req.headers.cookie ?? '');
  return m?.[1] ?? null;
}

export function autenticar(req: Request, res: Response, next: NextFunction) {
  const token = lerCookie(req);
  const s = token && um<any>('SELECT s.municipio_id AS ativo, s.expira_em, u.id, u.nome, u.email, u.perfil, u.municipio_id, u.vinculo_id FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ? AND u.ativo = 1', token);
  if (!s || s.expira_em < new Date().toISOString()) return res.status(401).json({ erro: 'Sua sessão terminou. Entre de novo.' });
  // só o operador troca de município; os demais ficam presos ao seu
  const municipioId = s.perfil === 'operador' ? s.ativo : s.municipio_id;
  const { ativo, expira_em, ...usuario } = s;
  res.locals.ctx = { usuario, perfil: s.perfil, municipioId, autor: { id: s.id, nome: s.nome, perfil: s.perfil }, token } satisfies Contexto;
  next();
}

export const ctx = (res: Response) => res.locals.ctx as Contexto;

export function exigir(res: Response, acao: Acao) {
  const c = ctx(res);
  if (!pode(c.perfil, acao)) throw new ErroNegocio('Seu perfil não tem permissão para esta ação.', 403);
  return c;
}
