# Catálogo canônico de insumos a partir das descrições das notas (Giulí, xFácil, 08/08–13/10/2026)
# Cada regra: (função que testa a descrição em MAIÚSCULAS + unidade da nota) -> (codigo, conversão)
# conversão = (quantidade na unidade-base por 1 unidade da nota, unidade-base)  |  None = pendente

CATALOGO = {
 # codigo: (nome canônico, categoria, dimensao, observação)
 'BOV-001': ('Contrafilé', 'Bovino', 'massa', ''),
 'BOV-002': ('Contrafilé sem noix', 'Bovino', 'massa', ''),
 'BOV-003': ('Picanha', 'Bovino', 'massa', ''),
 'BOV-004': ('Filé mignon', 'Bovino', 'massa', ''),
 'BOV-005': ('Filé de costela', 'Bovino', 'massa', 'Não é filé mignon (Minerva)'),
 'BOV-006': ('Fraldinha', 'Bovino', 'massa', ''),
 'BOV-007': ('Costela minga (com osso)', 'Bovino', 'massa', ''),
 'BOV-008': ('Cupim', 'Bovino', 'massa', ''),
 'BOV-009': ('Cupim em pedaços', 'Bovino', 'massa', ''),
 'BOV-010': ('Bife do vazio', 'Bovino', 'massa', ''),
 'BOV-011': ('Bife ancho', 'Bovino', 'massa', ''),
 'BOV-012': ('Patinho', 'Bovino', 'massa', ''),
 'BOV-013': ('Carne moída', 'Bovino', 'massa', ''),
 'BOV-014': ('Espetinho de picanha', 'Bovino', 'massa', 'Transferência Manda Picanha'),
 'BOV-015': ('Espetinho de chorizo', 'Bovino', 'massa', 'Transferência Manda Picanha'),
 'BOV-016': ('Espetinho de cupim', 'Bovino', 'massa', 'Transferência Manda Picanha'),
 'PES-001': ('Camarão cinza limpo 31/35', 'Pescados e frutos do mar', 'massa', ''),
 'PES-002': ('Camarão cinza 21/27', 'Pescados e frutos do mar', 'massa', ''),
 'PES-003': ('Camarão rosa GG', 'Pescados e frutos do mar', 'massa', ''),
 'PES-004': ('Camarão rosa G 31/40', 'Pescados e frutos do mar', 'massa', ''),
 'PES-005': ('Lombo de robalo', 'Pescados e frutos do mar', 'massa', ''),
 'PES-006': ('Filé de robalo congelado', 'Pescados e frutos do mar', 'massa', ''),
 'PES-007': ('Bacalhau desfiado', 'Pescados e frutos do mar', 'massa', ''),
 'PES-008': ('Filé de bacalhau', 'Pescados e frutos do mar', 'massa', ''),
 'PES-009': ('Filé de tilápia', 'Pescados e frutos do mar', 'massa', ''),
 'PES-010': ('Atum (lombo fresco)', 'Pescados e frutos do mar', 'massa', ''),
 'LAT-001': ('Queijo parmesão', 'Laticínios', 'massa', ''),
 'LAT-002': ('Mussarela', 'Laticínios', 'massa', ''),
 'LAT-003': ('Queijo provolone', 'Laticínios', 'massa', ''),
 'LAT-004': ('Provolonete', 'Laticínios', 'massa', ''),
 'LAT-005': ('Provolone bolinha (espeto)', 'Laticínios', 'massa', ''),
 'LAT-006': ('Gorgonzola', 'Laticínios', 'massa', ''),
 'LAT-007': ('Queijo minas frescal', 'Laticínios', 'massa', ''),
 'LAT-008': ('Queijo minas meia cura', 'Laticínios', 'massa', ''),
 'LAT-009': ('Queijo curado', 'Laticínios', 'massa', ''),
 'LAT-010': ('Burrata', 'Laticínios', 'massa', ''),
 'LAT-011': ('Creme de leite fresco', 'Laticínios', 'massa', 'Comprado em caixa de 500 g'),
 'LAT-012': ('Leite integral', 'Laticínios', 'volume', ''),
 'LAT-013': ('Requeijão cremoso', 'Laticínios', 'massa', ''),
 'LAT-014': ('Requeijão cheddar', 'Laticínios', 'massa', ''),
 'LAT-015': ('Requeijão culinário', 'Laticínios', 'massa', ''),
 'LAT-016': ('Iogurte natural', 'Laticínios', 'massa', ''),
 'LAT-017': ('Manteiga sem sal', 'Laticínios', 'massa', ''),
 'LAT-018': ('Ricota fresca', 'Laticínios', 'massa', ''),
 'SUI-001': ('Barriga suína', 'Suíno', 'massa', ''),
 'SUI-002': ('Costelinha suína serrada', 'Suíno', 'massa', ''),
 'SUI-003': ('Costela suína com osso', 'Suíno', 'massa', ''),
 'SUI-004': ('Pernil suíno sem osso', 'Suíno', 'massa', ''),
 'EMB-001': ('Bacon', 'Embutidos / curados', 'massa', ''),
 'EMB-002': ('Linguiça toscana', 'Embutidos / curados', 'massa', ''),
 'EMB-003': ('Linguiça calabresa', 'Embutidos / curados', 'massa', ''),
 'EMB-004': ('Linguiça calabresa fina', 'Embutidos / curados', 'massa', ''),
 'EMB-005': ('Linguiça suína', 'Embutidos / curados', 'massa', ''),
 'EMB-006': ('Linguiça de costela Angus', 'Embutidos / curados', 'massa', ''),
 'EMB-007': ('Pepperoni', 'Embutidos / curados', 'massa', ''),
 'EMB-008': ('Presunto cozido', 'Embutidos / curados', 'massa', ''),
 'EMB-009': ('Jamón fatiado', 'Embutidos / curados', 'massa', ''),
 'EMB-010': ('Copa fatiada', 'Embutidos / curados', 'massa', ''),
 'EMB-011': ('Salame italiano', 'Embutidos / curados', 'massa', ''),
 'AVE-001': ('Coração de frango', 'Aves', 'massa', ''),
 'AVE-002': ('Filé de peito de frango', 'Aves', 'massa', ''),
 'AVE-003': ('Sobrecoxa de frango desossada', 'Aves', 'massa', ''),
 'AVE-004': ('Pescoço de frango', 'Aves', 'massa', ''),
 'AVE-005': ('Pé de frango', 'Aves', 'massa', ''),
 'AVE-006': ('Dorso de frango', 'Aves', 'massa', ''),
 'AVE-007': ('Espetinho de frango com bacon', 'Aves', 'massa', 'Transferência Manda Picanha'),
 'OVO-001': ('Ovo branco grande', 'Ovos', 'contagem', ''),
 'OVO-002': ('Gema de ovo pasteurizada', 'Ovos', 'massa', ''),
 'OVO-003': ('Ovo de codorna em conserva', 'Ovos', 'massa', 'Peso bruto do pote'),
 'OVO-004': ('Ovo de codorna', 'Ovos', 'contagem', ''),
 'MEL-001': ('Mel', 'Mel', 'volume', 'Medido em mL; quantidade lançada no recebimento'),
}

KG = (1000, 'g')

def g(n):  return (n, 'g')
def ml(n): return (n, 'ml')

def classificar(desc, un):
    d = desc.upper()
    has = lambda *ws: all(w in d for w in ws)
    # ---------- Bovino
    if has('ESPETINHO', 'PICANHA'):  return 'BOV-014', KG
    if has('ESPETINHO', 'CHORIZO'):  return 'BOV-015', KG
    if has('ESPETINHO', 'CUPIM'):    return 'BOV-016', KG
    if has('ESPETINHO', 'FRANGO'):   return 'AVE-007', KG
    if has('CONTRA FILE', 'NOIX'):   return 'BOV-002', KG
    if 'CONTRA FILE' in d:           return 'BOV-001', KG
    if 'PICANHA' in d:               return 'BOV-003', KG
    if 'FILE MIGNON' in d:           return 'BOV-004', KG
    if has('FILE DE COSTELA'):       return 'BOV-005', KG
    if 'FRALD' in d:                 return 'BOV-006', KG
    if 'MINGA' in d or has('COSTELA DO TRASEIRO'): return 'BOV-007', KG
    if has('CUPIM', 'PEDACO'):       return 'BOV-009', KG
    if 'CUPIM' in d:                 return 'BOV-008', KG
    if 'VAZIO' in d:                 return 'BOV-010', KG
    if 'ANCHO' in d:                 return 'BOV-011', KG
    if 'PATINHO' in d:               return 'BOV-012', KG
    if 'CARNE MOIDA' in d:           return 'BOV-013', KG
    # ---------- Pescados
    if has('CAMARAO CINZA', 'LIMPO'): return 'PES-001', KG
    if has('CAMARAO CINZA', '21/27'): return 'PES-002', KG
    if has('CAMARAO ROSA', 'GG'):     return 'PES-003', KG
    if has('CAMARAO ROSA', '31/40'):  return 'PES-004', KG
    if has('LOMBO DE ROBALO'):        return 'PES-005', KG
    if has('ROBALO'):                 return 'PES-006', KG
    if has('BACALHAU DESFIADO'):      return 'PES-007', KG
    if has('BACALHAU'):               return 'PES-008', KG
    if has('TILAPIA'):                return 'PES-009', KG
    if has('ATUM'):                   return 'PES-010', KG
    # ---------- Laticínios
    if 'PARMESAO' in d:               return 'LAT-001', KG
    if 'MUSSARELA' in d:              return 'LAT-002', KG
    if 'PROVOLONETE' in d:            return 'LAT-004', KG
    if has('PROVOLONE', 'BOLINHA'):   return 'LAT-005', g(350)
    if 'PROVOLONE' in d:              return 'LAT-003', KG
    if 'GORGONZOLA' in d:             return 'LAT-006', KG
    if has('MINAS', 'MEIA CURA'):     return 'LAT-008', KG
    if 'QUEIJO MINAS' in d:           return 'LAT-007', KG
    if 'QUEIJO CURADO' in d:          return 'LAT-009', KG
    if 'BURRATA' in d:
        for peso in (120, 150, 180):
            if f'{peso}G' in d: return 'LAT-010', g(peso)
        return 'LAT-010', None          # unidade sem peso informado
    if 'CREME DE LEITE' in d:         return 'LAT-011', g(500)
    if 'LEITE' in d:
        if 'CX/0012' in d or un == 'CX': return 'LAT-012', ml(12000)
        return 'LAT-012', ml(1000)
    if 'REQUEIJAO' in d:
        if 'CHEDDAR' in d:   return 'LAT-014', g(1500)
        if 'CULINARIO' in d: return 'LAT-015', g(1500)
        return 'LAT-013', g(1500)
    if d.startswith('IOG'):           return 'LAT-016', g(500)
    if 'MANTEIGA' in d:               return 'LAT-017', g(5000)
    if 'RICOTA' in d:                 return 'LAT-018', KG
    # ---------- Suíno
    if 'BARRIG' in d:                 return 'SUI-001', KG
    if 'COSTELINHA' in d:             return 'SUI-002', KG
    if has('SUINO', 'COSTELA'):       return 'SUI-003', None   # vendida por caixa, peso não informado
    if 'PERNIL' in d:                 return 'SUI-004', KG
    # ---------- Embutidos
    if 'BACON' in d:                  return 'EMB-001', (KG if un == 'KG' else None)
    if 'TOSC' in d:                   return 'EMB-002', KG
    if 'CALABRESA FINA' in d:         return 'EMB-004', KG
    if 'CALABRESA' in d:              return 'EMB-003', KG
    if has('LINGUICA DE COSTELA'):    return 'EMB-006', KG
    if 'LINGUICA' in d:               return 'EMB-005', (g(5000) if un == 'PCT' else KG)
    if 'PEPPERONI' in d:
        if '1KG' in d:  return 'EMB-007', g(1000)
        if '400G' in d: return 'EMB-007', g(400)
        return 'EMB-007', None
    if 'JAMON' in d:                  return 'EMB-009', g(80)
    if 'PRESUNTO' in d:               return 'EMB-008', (KG if un == 'KG' else None)
    if 'COPA' in d:                   return 'EMB-010', g(100)
    if 'SALAME' in d:
        if '1KG' in d:  return 'EMB-011', g(1000)
        if '100G' in d: return 'EMB-011', g(100)
        return 'EMB-011', None
    # ---------- Aves
    if 'CORACAO' in d:                return 'AVE-001', KG
    if has('FILE DE PEITO'):          return 'AVE-002', KG
    if 'COXA' in d:                   return 'AVE-003', KG
    if 'PESCOCO' in d:                return 'AVE-004', KG
    if d.startswith('PE CONG'):       return 'AVE-005', KG
    if 'DORSO' in d:                  return 'AVE-006', KG
    # ---------- Ovos e mel
    if 'GEMA' in d:                   return 'OVO-002', g(1000)
    if has('CODORNA', 'CONSERVA'):    return 'OVO-003', g(900)
    if 'CODORNA' in d:                return 'OVO-004', None   # caixa sem quantidade
    if 'OVOS BRANCO' in d:            return 'OVO-001', None   # bandeja: confirmar 30 ou 20 ovos
    if d.strip() == 'MEL':            return 'MEL-001', None   # pote sem peso informado
    raise ValueError(f'Sem regra: {desc} ({un})')

PERGUNTAS = {
 'OVO-001': 'Ovos brancos grandes: quantos ovos tem a bandeja (BD) da Flor de Goiás? 30?',
 'OVO-004': 'Ovos de codorna: quantos ovos vêm na caixa de R$ 160?',
 'MEL-001': 'Mel: qual o peso (ou volume) de cada unidade de R$ 60–65?',
 'LAT-010': 'Burrata de búfala da Flor de Goiás (R$ 28–55/un): qual o peso de cada unidade?',
 'SUI-003': 'Costela suína Aurora: quantos kg tem cada caixa (R$ 254–274)?',
 'EMB-001': 'Bacon em peças Aurora: quantos kg tem a caixa de R$ 317,29?',
 'EMB-007': 'Pepperoni gourmet da Flor de Goiás (R$ 20–25/un): qual o peso?',
 'EMB-008': 'Presunto da Flor de Goiás (R$ 44/un): qual o peso e o tipo?',
 'EMB-011': 'Salame da Flor de Goiás (R$ 16–18/un): qual o peso?',
}
