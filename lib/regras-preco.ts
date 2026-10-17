// Regras de arredondamento do preço sugerido (estabelecimentos.regra_arredondamento)
export const REGRAS = [
  { valor: "centavos", rotulo: "Centavos (R$ 37,23)" },
  { valor: "x90", rotulo: "Final ,90 (R$ 37,90)" },
  { valor: "inteiro", rotulo: "Real inteiro (R$ 38,00)" },
  { valor: "multiplo_050", rotulo: "Múltiplo de R$ 0,50 (R$ 37,50)" },
] as const
