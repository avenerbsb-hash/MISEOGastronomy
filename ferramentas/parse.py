import re, json, sys
lines = open(sys.argv[1]).read().splitlines()
start = next(i for i,l in enumerate(lines) if '4. Detalhe' in l)
cats = ['Bovino','Pescados e frutos do mar','Laticínios','Suíno','Embutidos / curados','Aves','Ovos','Mel']
rows, orphans = [], []
def num(s): return float(s.replace('.','').replace(',','.'))
for i in range(start+1, len(lines)):
    l = lines[i]
    m = re.match(r'^\s*(\d\d)/(\d\d)/(\d\d)\s+(.+?)\s{2,}(\d+)\s+(\d{8})\s+(.*)$', l)
    if not m:
        s = l.strip()
        if s and not s.startswith(('Grupo Gastr','Data ','TOTAL')) and 'TOTAL' not in s and s not in ('Pescados e frutos do','mar'):
            orphans.append((i+1, s))
        continue
    d,mo,y,forn,nf,ncm,rest = m.groups()
    toks = re.split(r'\s{2,}', rest.strip())
    un, qtd, pu, tot = toks[-4:]
    head = toks[:-4]
    cat = None
    if head and head[0] in cats: cat = head.pop(0)
    elif head and head[0] == 'Pescados e frutos do mar': cat = head.pop(0)
    if cat is None: cat = 'Pescados e frutos do mar'  # único caso que quebra linha
    desc = ' '.join(head)
    rows.append(dict(data=f'20{y}-{mo}-{d}', fornecedor=forn.strip(), nf=nf, ncm=ncm, categoria=cat,
                     descricao=desc, un=un, qtd=num(qtd), preco=num(pu), total=num(tot)))
json.dump(rows, open(sys.argv[2],'w'), ensure_ascii=False, indent=0)
print(len(rows), 'linhas; soma', round(sum(r['total'] for r in rows),2))
print('órfãs:', orphans[:40])
import collections
print(collections.Counter(r['un'] for r in rows))
print(collections.Counter(r['categoria'] for r in rows))
