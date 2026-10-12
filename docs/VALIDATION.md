# Validare: Make It Accessible

Scop: în 2–3 zile de lucru efectiv aflăm dacă uneltele generice (Unealta A și Unealta B; numele sunt în notele private) fac față cataloagelor cu design. În paralel, o săptămână de discuții cu potențiali cumpărători. La final, decizie GO / NO-GO pe matricea din pasul 6.

Reguli:
- Doar documente publice.
- Nu publica rezultate comparative cu nume de firme.
- Notează tot în foaia de scor. „Mi s-a părut ok” nu e un rezultat.
- Nu costă nimic: conturile gratuite ajung.

---

## Pasul 0 — Pregătire (1 oră)

Unelte:
- cont gratuit la Unealta A (3 documente pe lună);
- cont gratuit la Unealta B (10 credite la înregistrare);
- VoiceOver (inclus în macOS, pornire cu Cmd+F5);
- extensia axe DevTools pentru Chrome (gratuită);
- veraPDF (gratuit, opțional, pentru verificarea PDF/UA);
- un spreadsheet pentru foaia de scor.

Documente (5, toate publice, descărcate de pe site-urile firmelor):
1. Pliant săptămânal de supermarket: grilă densă de produse cu prețuri, mai multe coloane, 8–16 pagini.
2. Al doilea pliant, alt retailer (bricolaj, electronice), cu altă grafică.
3. Catalog de produse (mobilă, unelte, echipamente), 20–40 de pagini, cu tabele de specificații.
4. Broșură cu text peste imagini (turism, hotel, eveniment), 4–12 pagini.
5. Broșură simplă, stil Canva, 2–4 pagini.

Verifică limita de pagini a planului Free la fiecare unealtă. Dacă e sub lungimea documentului, taie documentul din Preview (șterge pagini) la o secțiune reprezentativă, dar păstrează cel puțin o pagină cu grilă de produse.

Alocare propusă: Unealta A primește documentele 1, 3, 4. Unealta B primește 2 și 5, plus 1 dacă ajung creditele. Ideal, pliantul 1 trece prin ambele.

---

## Pasul 1 — Cheia de răspuns (2–3 ore)

Pentru fiecare document alege 3 pagini:
- pagina cea mai densă cu produse;
- o pagină mixtă (text + imagini + tabel);
- coperta sau pagina de introducere.

Pentru fiecare pagină aleasă notează manual, înainte să vezi vreun rezultat:
- ordinea corectă de citire: numerotează blocurile pe un screenshot (1, 2, 3…);
- lista produselor: nume, preț, unitate sau variantă, exact cum apar în original;
- titlurile și nivelul lor;
- imaginile: cu sens (produs, grafic) sau decorative; textul din interiorul imaginilor;
- tabelele: care rând sau coloană e antet.

Asta e referința față de care punctezi. Fără ea, evaluarea rămâne impresie.

---

## Pasul 2 — Rulează documentele (1 oră)

Pentru fiecare document notează:
- timpul de procesare;
- ce ai primit: HTML, PDF etichetat („keep original layout” sau „rebuild”), raport;
- ce poți corecta în editorul lor: text transcris, alt text, ordine de citire, gruparea produselor, tabele;
- ce te-a blocat sau a eșuat.

---

## Pasul 3 — Punctează fiecare pagină (3–4 ore)

Criterii, pe fiecare pagină aleasă:

| Cod | Criteriu | Cum măsori |
|---|---|---|
| C1 | Ordine de citire | blocuri în ordinea corectă / total blocuri |
| C2 | Fidelitate produs–preț | pentru fiecare produs: nume corect, preț corect și atașat produsului corect, unitate corectă; numeri erorile. Orice preț greșit sau atașat altui produs e eroare materială |
| C3 | Text lipsă sau inventat | blocuri omise, text modificat, text care nu există în original |
| C4 | Alt text | pe fiecare imagine cu sens: acceptabil (spune ce e produsul și informația esențială) / generic („o imagine”) / greșit / lipsă. Textul din imagini a fost transcris? |
| C5 | Structură | titluri la nivel corect, produse ca listă sau structură, tabele cu antet |
| C6 | Test cu VoiceOver | navighezi pagina HTML cu ecranul acoperit. Înțelegi ce e la ofertă și la ce preț? Da / Parțial / Nu |
| C7 | Efort de corectare | minute până pagina e publicabilă în editorul lor; ce n-ai putut corecta deloc |
| C8 | axe DevTools pe HTML-ul lor | număr de violări critical și serious |
| C9 | PDF etichetat (opțional) | a funcționat „keep original layout”? veraPDF cu profil PDF/UA: trece / nu trece |

Foaia de scor (un rând per pagină per unealtă):

| Document | Pagină | Unealtă | C1 % | C2 erori | C3 | C4 ok/total | C5 | C6 | C7 min | C8 | C9 | Observații |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

---

## Pasul 4 — Interpretare

O unealtă **trece o pagină** dacă: C1 ≥ 95%, C2 = 0 erori materiale, C3 ≤ 1 bloc, C4 ≥ 80% acceptabil, C6 = Da, C7 ≤ 5 minute.
Un **document trece** dacă trec toate cele 3 pagini.

- Trec cel puțin 3 din 5 documente, inclusiv un pliant → **nișa e închisă.** Genericul e suficient de bun și nu avem unghi. Stop.
- Pică paginile cu grile de produse în majoritatea documentelor (C2 > 0 sau C1 < 80%) → **unghiul „cataloage cu fidelitate pe produse” e real.** Mergi la pasul 5 cu asta ca mesaj.
- Zona gri: trec, dar cu C7 > 10 minute pe pagină → unghiul e doar „mai puțin efort de corectare”. E slab și devine viabil doar dacă pasul 5 arată că cineva plătește pentru timp.

---

## Pasul 5 — Cererea (1 săptămână, în paralel cu pașii 0–4)

5 discuții de câte 20 de minute:
- 2 agenții care fac pliante sau cataloage pentru retail;
- 2 marketeri din retail sau e-commerce din UE, ideal Germania;
- 1 tipografie sau studio de prepress.

Îi găsești pe LinkedIn. Mesaj scurt: „Fac o cercetare despre accesibilitatea cataloagelor PDF după EAA. 20 de minute, fără vânzare.”

Întrebări (întreabă, nu prezenta produsul):
1. Publicați cataloage sau pliante ca PDF pe site? Câte pe lună?
2. V-a cerut cineva (client, departament juridic, un cititor, un audit) să fie accesibile? Ce ați făcut?
3. Dacă ar exista o versiune HTML accesibilă, ați înlocui PDF-ul cu ea, sau PDF-ul trebuie să rămână descărcabil?
4. Cine ar verifica și aproba rezultatul la voi?
5. Ce ați plătit sau ați plăti per catalog? Ce folosiți acum?
6. Ce v-ar face să nu folosiți o unealtă de genul ăsta?

Notează răspunsurile cuvânt cu cuvânt, nu interpretări.

Semnale:
- „ne-a cerut cineva” sau „avem termen” la cel puțin 2 din 5 → cerere reală;
- la întrebarea 3, dacă toți spun „PDF-ul trebuie să rămână” → PDF-ul etichetat e obligatoriu în v1 (vezi B1 din review).

---

## Pasul 6 — Decizia

| | Cerere reală (≥ 2 din 5) | Fără cerere |
|---|---|---|
| **Genericul eșuează pe grile** | **GO** pe nișa îngustă. Rescriem SPEC.md în jurul ei, cu corecțiile din review | NO-GO: problemă tehnică interesantă, fără cumpărători |
| **Genericul trece** | NO-GO pentru noi: cumpărătorii au deja soluție la $29 | NO-GO |

Buget total: aproximativ 2 zile pentru pașii 0–4, plus 5 discuții într-o săptămână.
