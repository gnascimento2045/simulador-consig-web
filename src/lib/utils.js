import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// VP: Valor Presente de uma série de pagamentos
// taxa: taxa mensal (ex: 0.015 para 1.5%)
// n: número de parcelas
// parcela: valor da parcela (negativo para saída de dinheiro)
export function vp(taxa, n, parcela) {
  if (!isFinite(taxa) || !isFinite(n) || !isFinite(parcela) || taxa === null || n === null || parcela === null) return 0;
  if (taxa === 0) return parcela * n;
  return parcela * (1 - Math.pow(1 + taxa, -n)) / taxa;
}
