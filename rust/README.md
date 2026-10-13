# Bestcrow: dokumentacja programu Solana

Folder `rust` zawiera program crowdfundingowy `charity_vault` napisany w Rust
z użyciem **Anchor 1.1.2**. Docelowy produkt służy zbiórkom startupowym.
Obecny program obsługuje wpłaty w SOL, zbiórki typu „wszystko albo nic” oraz
zbiórki etapowe z głosowaniem wspierających i wypłatami w czasie.

Opis API i kont poniżej dotyczy **obecnej implementacji** w
`programs/charity-vault/src`, a nie wdrożonych już zasad docelowych.
API programu to instrukcje transakcji Solany, nie endpointy HTTP.
Reguły docelowe są wypisane osobno; wymagają zmian kodu, testów i wdrożenia.
Dodano wstępną implementację finansowania V2 w
[`funding_v2.rs`](programs/charity-vault/src/funding_v2.rs): osobne PDA,
zamknięcie harmonogramu, nadwyżki, anulowanie, prowizję i refund po porażce
celu. Przeszły testy jednostkowe; instrukcje nie zostały jeszcze sprawdzone
w SBF/LiteSVM ani wdrożone. Stan `Completed` i pełna ścieżka zakończenia wymagają P2.
Kanoniczna kolejność prac i otwarte decyzje znajdują się w
[planie implementacji](../docs/IMPLEMENTATION_PLAN.md).

## Od czego zacząć

| Chcę… | Dokument |
| --- | --- |
| Zrozumieć konta, PDA, podpisy i przepływ SOL | [Mechanizmy Solany](docs/SOLANA.md) |
| Wywołać konkretną funkcję programu | [API: wszystkie 18 instrukcji](docs/API.md) |
| Odczytać stan lub wyznaczyć adres konta | [Konta, pola i PDA](docs/ACCOUNTS.md) |
| Złożyć instrukcję i przejść cały proces | [Integracja i przykłady](docs/INTEGRATION.md) |
| Obsłużyć błędy lub zdarzenia | [Błędy i zdarzenia](docs/ERRORS_EVENTS.md) |

## Dwa tryby obecnego programu

**Zwykły:** `create_campaign` → `pledge` → `finalize`.
Po sukcesie twórca wywołuje `claim_success`. Po niepowodzeniu darczyńcy
wywołują `claim_refund` lub dowolny podpisujący uruchamia `refund_all`.
Ten tryb jest **legacy** i nie należy do docelowego MVP startupowego.

**Etapowy:** `create_staged_campaign` → `add_milestone` → `pledge` → `finalize`.
Po sukcesie twórca może wypłacić `release_initial`, przedstawić dowody
(`submit_evidence`) i zebrać głosy (`vote_milestone`). `finalize_vote` zatwierdza
etap, `release_tranche` tworzy prawo do wypłaty, a `withdraw_claim` wypłaca SOL.
`terminate` otwiera proporcjonalne zwroty przez `claim_termination_refund`.

## Najważniejsze wartości

| Parametr | Wartość |
| --- | --- |
| Program ID | `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG` |
| Domyślna sieć w `Anchor.toml` | `localnet`; skonfigurowany jest też `devnet` |
| Jednostka kwot | lamporty: `1 SOL = 1_000_000_000 lamportów` |
| Jednostka terminów / czasu wypłat | sekundy; termin to Unix timestamp |
| Maksymalna liczba darczyńców | 12 różnych adresów na zbiórkę |
| Maksymalna liczba etapów / odbiorców podziału | 5 / 5 |
| Próg akceptacji etapu | 70% całej zebranej kwoty, nie tylko oddanych głosów |
| Limit pojedynczego etapu / pierwszej transzy | 50% `base_budget` |

## Uzgodniony model docelowy: jeszcze niewdrożony

- Zbiórka startupowa trwa od 7 do 183 dni. Przyjmuje wpłaty ponad cel; po
  terminie końcowa suma wpłat jest podstawą rozliczenia i wag głosów.
- Przed pierwszą wpłatą twórca zatwierdza niezmienne warunki kampanii. Od
  uruchomienia zbiórki nie można dodać ani edytować etapów lub opisu warunków.
  Harmonogram obejmuje 2-5 transz, licząc transzę początkową; każda stanowi
  dodatni udział najwyżej 50%, a suma udziałów wynosi dokładnie 100%.
- Po sukcesie pobierana jest raz prowizja platformy 1% **całej zebranej
  kwoty**. Procenty transz odnoszą się do pozostałych 99%. Po porażce celu
  prowizja wynosi zero, a każdemu wspierającemu przysługuje zwrot 100% wpłaty.
- Każda nowa kampania MVP jest etapowa i nie wymaga kaucji twórcy,
  osobnej od wpłat oraz kosztów rent i transakcji. Warunki i czas jej
  zwrotu lub przepadku po nieosiągnięciu celu, sukcesie, dobrowolnym
  zakończeniu i definitywnej porażce wymagają decyzji produktowej przed
  implementacją. Nie wolno jej odbierać tylko dlatego, że zbiórka
  osiągnęła cel.
- Dowód wykonania otwiera 7 dni głosowania. Akceptacja wymaga wagi głosów
  „tak” **większej niż 50% wszystkich wpłat**; równe 50%, głosy „nie” i brak
  głosu nie wystarczają. Po pierwszej odmowie twórca ma 30 dni na poprawę i
  ponowne zgłoszenie dowodu. Po upływie tego sztywnego okna następuje druga
  7-dniowa runda. Druga odmowa lub upływ czasu na poprawę prowadzi do
  zakończenia i zwrotów.
- Każdy etap można rozliczyć tylko raz. Zadeklarowany podział odbiorców jest
  obowiązkowy, a już zatwierdzone roszczenia mają pierwszeństwo przy
  zakończeniu kampanii. Terminy i kolejność etapów są egzekwowane on-chain.
  Dowolny portfel może wywołać przejścia po terminach i uruchomić wypłatę
  zatwierdzonej transzy, bez dalszej współpracy twórcy.
- Zwroty są indywidualnymi transakcjami; program nie ma zbiorczego
  `refund_all` ani limitu 12 wspierających. Podczas trwania zbiórki wspierający
  może anulować własną wpłatę. Solana nie uruchamia transakcji automatycznie:
  klient lub bot musi wysłać dozwoloną instrukcję.

Istniejące instrukcje nie realizują większości tych punktów. Krytyczne luki
obecnego kontraktu zebrano w [API](docs/API.md#istotne-zachowania-implementacji).
Do czasu ich naprawy nie traktuj tego programu jako gotowego do obsługi
rzeczywistych środków. Brak weryfikacji twórców i podpisu platformy jest
świadomą decyzją MVP; zabezpieczenia przed botami pozostają późniejszym tematem.

## Mapa kodu

| Plik | Odpowiedzialność |
| --- | --- |
| [lib.rs](programs/charity-vault/src/lib.rs) | Publiczne instrukcje, Program ID i eksporty |
| [state.rs](programs/charity-vault/src/state.rs) | Dane kont i statusy |
| [constants.rs](programs/charity-vault/src/constants.rs) | Seeds PDA, limity i progi |
| [error.rs](programs/charity-vault/src/error.rs) | Własne błędy programu |
| [instructions/](programs/charity-vault/src/instructions/) | Walidacja kont i logika instrukcji |
| [tests/flow.rs](programs/charity-vault/tests/flow.rs) | Testy przepływów w LiteSVM i przykłady budowania instrukcji |

## Budowanie i testowanie

Uruchom z foldera `rust`:

```bash
# Testy wczytują plik target/deploy/charity_vault.so.
NO_DNA=1 anchor build --no-idl -- --arch v0
NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml

# Opcjonalnie: wygeneruj IDL i typy klienta.
NO_DNA=1 anchor idl build -p charity-vault -o target/idl/charity_vault.json -t target/types/charity_vault.ts
```

Dotychczasowa konfiguracja repozytorium używa `--arch v0` dla zgodności
z lokalnymi platform-tools v1.57. Przy innym toolchainie sprawdź zgodność celu
SBF. Pliki w `target/idl` i `target/types` są generowane, nie stanowią kodu źródłowego.

Przed integracją przeczytaj [istotne zachowania implementacji](docs/API.md#istotne-zachowania-implementacji):
dotyczą m.in. terminów głosowania, kaucji i ponownego utworzenia zamkniętego claimu.
