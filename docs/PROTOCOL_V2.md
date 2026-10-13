# Bestcrow Protocol V2

Ten dokument zamyka P0.1-P0.3. Opisuje projektowany protokol dla nowych
kampanii startupowych. Obecny program Rust pozostaje legacy i nie implementuje
jeszcze tego formatu.

Aktualizacja P1: moduł `funding_v2.rs` implementuje część finansowania
opisanej wersji; to nie jest pełna implementacja protokołu V2.
Layout kont w kodzie jest aktualnym źródłem dla następnego etapu P2;
poniższa tabela pozostaje projektem pełnej wersji (w tym dodatkowych kont
głosowania i roszczeń). API finansowania ma suffix `_v2`, aby nie kolidować
z legacy. Konfigurację może inicjalizować tylko upgrade authority programu.

## P0.1: zamkniete decyzje protokolu

### Parametry stale

| Parametr | Wartosc | Regula |
| --- | ---: | --- |
| Prowizja | 100 bps | `floor(gross_raised * 100 / 10000)`, pobierana raz tylko po sukcesie |
| Kaucja twórcy | 0 | Brak kaucji w MVP; ochrona przed botami jest poza zakresem |
| Minimalna zbiorka | 604,800 s | 7 dni, wlacznie z granica |
| Maksymalna zbiorka | 15,811,200 s | Dokladnie 183 dni, czyli roboczo zdefiniowane pol roku |
| Pierwszy dowod | 2,592,000 s | 30 dni od finalizacji udanej zbiorki |
| Pierwsze glosowanie | 604,800 s | 7 dni od zlozenia dowodu |
| Okno poprawy | 2,592,000 s | Pelne 30 dni po pierwszej porazce |
| Drugie glosowanie | 604,800 s | 7 dni, zaczyna sie po koncu okna poprawy |
| Maksymalna transza | 5,000 bps | 50% netto dostepnego budzetu |
| Liczba transz | 2-5 | Pierwsza transza jest liczona w limicie |

### Prowizja i nadwyzka

`gross_raised` jest koncowa suma pozostala po anulowaniach i zamrozona przy
finalizacji finansowania. Jesli `gross_raised < goal`, prowizja wynosi zero i
kazdy backer moze odebrac 100% swojego ledgeru. Jesli `gross_raised >= goal`,
program najpierw przenosi 1% do adresu treasury, a pozostale 99% zapisuje jako
`net_budget`.

Nie ma osobnego, uznaniowego funduszu overflow. Cala nadwyzka ponad cel wchodzi
do `gross_raised`, a wiec jest objeta prowizja i procentowym harmonogramem
transz. Dla kazdej transzy poza ostatnia program liczy `floor(net_budget *
share_bps / 10000)`. Ostatnia transza dostaje `net_budget` pomniejszony o
wczesniej przydzielone transze, co usuwa lamportowy kurz bez tworzenia nowej
kwoty do wydania.

Rent kont jest oddzielnym kosztem. Po prawidlowym zamknieciu konta wraca do
platnika wskazanego przez zasady konta. Nie wolno mieszac rent, prowizji,
zarezerwowanych roszczen ani puli refundow w jednym liczniku.

### Glosowanie i brak aktywnosci

Waga glosu to koncowa kwota backera z zamrozonego ledgeru. Zatwierdzenie
wymaga `yes_weight * 2 > final_raised`; dokladnie 50% przegrywa. Mianownik
obejmuje wszystkich uprawnionych backerow, takze nieglosujacych. Brak glosow
jest porazka. Glosowanie nie rozstrzyga sie samo: po terminie dowolny caller
moze wyslac instrukcje finalizacji. Do tego czasu srodki pozostaja zablokowane.

Creator musi zlozyc pierwszy dowod do 30 dni od udanej finalizacji. Brak dowodu
otwiera permissionless termination. Po pierwszej porazce dowod
moze byc zlozony w pelnym 30-dniowym oknie poprawy, lecz drugie glosowanie
zaczyna sie dopiero po jego koncu. Brak poprawy lub druga porazka konczy
kampanie i kieruje pozostale, niezarezerwowane srodki do puli
refundow.

### Brak kaucji w MVP

MVP nie pobiera kaucji od twórcy. Ochrona przed botami, rate limiting i
pozostałe mechanizmy antyspamowe są tematami późniejszej prezentacji i fazy
P6. Żadne środki twórcy nie są mieszane z budżetem backerów ani pulą refundów.

### Adres treasury: problem operacyjny

Adres treasury nie istnieje jeszcze w repozytorium. Protokol wymaga konta
`ProtocolConfig`, inicjalizowanego jednokrotnie przed pierwsza kampania, z
niezmiennymi polami `treasury` i `fee_bps = 100`. Tworca kampanii nie moze
wybrac odbiorcy prowizji, a po inicjalizacji nie istnieje instrukcja aktualizacji
konfiguracji.

**Status P0.1:** decyzje protokolowe sa zamkniete. Do wdrozenia pozostaje
podanie i opublikowanie konkretnego klucza publicznego treasury; bez niego nie
mozna bezpiecznie uruchomic prowizji na devnecie ani oznaczyc P0.1 jako
operacyjnie gotowego.

## P0.2: wersja kont, PDA i migracja

### Zasada wersjonowania

V2 uzywa nowych nazw kont i nowych seedow. Stare PDA nie sa deserializowane
wedlug nowego layoutu i nie sa migrowane przez ciche nadpisanie. Istniejace
kampanie legacy koncza sie wedlug starego kodu; nowe kampanie tworzy tylko V2.
Przed migracja trzeba zatrzymac tworzenie nowych legacy kampanii w klientach.

### Konta V2

| Konto | Seeds | Najwazniejsze pola |
| --- | --- | --- |
| `ProtocolConfigV2` | `[b"config-v2"]` | `version`, `treasury`, `fee_bps`, stale okresy, `bump` |
| `CampaignV2` | `[b"campaign-v2", creator, campaign_id]` | creator, goal, funding deadline, `terms_hash`, `terms_uri`, status, gross/final raised, fee, net budget, tranche cursor, reserved/refund pool |
| `TrancheV2` | `[b"tranche-v2", campaign, index]` | share bps, amount net, proof hash/URI, proof deadline, vote windows, yes/no weights, round, status, settled flag |
| `BackerLedgerV2` | `[b"backer-v2", campaign, backer]` | backer, amount, cancelled/claimed flags, final weight, bump |
| `VoteRecordV2` | `[b"vote-v2", tranche, round, backer]` | backer, round, approve, weight, bump |
| `SplitV2` | `[b"split-v2", campaign, tranche]` | fixed recipients and bps, sum 10000 |
| `ClaimV2` | `[b"claim-v2", campaign, tranche]` | gross/net total, claimed, recipients, settled, bump |
| `VaultV2` | `[b"vault-v2", campaign]` | program-owned SOL vault |

`CampaignV2` przechowuje liczby i statusy potrzebne do rozliczenia, ale nie
powiela listy wszystkich backerow. Pojedynczy ledger jest jedynym zrodlem
wagi i prawa do refundu. `TrancheV2.settled` pozostaje zapisane po zamknieciu
`ClaimV2`, aby nie mozna bylo odtworzyc claimu dla tej samej transzy.

### Instrukcje V2 do IDL

Projektowany IDL powinien zawierac co najmniej:

1. `initialize_protocol_config` - jednokrotne ustawienie treasury i stalych.
2. `create_campaign_draft`, `add_tranche`, `set_split` i `seal_terms` -
   kompletna definicja przed wplatami.
3. `pledge`, `cancel_pledge` i `finalize_funding` - overfunding, snapshot,
   fee albo pelny refund.
4. `submit_evidence`, `finalize_proof_timeout`, `vote_milestone` i
   `finalize_vote` - okna 7/30/7 dni oraz permissionless timeouty.
5. `release_tranche`, `withdraw_claim`, `terminate`, `claim_refund` oraz
   jednorazowe roszczenia i rezerwy bez kaucji.
6. `close_backer_ledger` i `close_campaign` - zwrot rent po zachowaniu
   snapshotow potrzebnych do rozliczenia.

### Migracja

Migracja ma trzy bezpieczne etapy:

1. Zamrozic tworzenie nowych kampanii legacy i oznaczyc ich dane jako
   `legacy_v1` w indeksie. Nie zmieniac ich bajtow ani nie przenosic sald bez
   jawnej instrukcji i testu.
2. Wdrozyc V2 pod nowymi PDA, wygenerowac IDL i zaktualizowac dekodery. Konto
   V2 nie moze byc dekodowane przez stary klient, a konto V1 nie moze byc
   dekodowane jako V2.
3. Po potwierdzeniu V2 na devnecie wlaczyc nowe kampanie. Migracja starej
   kampanii jest opcjonalna i wymaga osobnej transakcji transferu, zgody
   wszystkich stron oraz testu zachowania refundow; domyslnie stare kampanie
   pozostaja w V1 do zakonczenia.

## P0.3: kanoniczne warunki i dowody

### Kanonizacja

Warunki i manifesty dowodow sa zapisywane jako UTF-8 w formacie RFC 8785
JCS. Obiekty maja uporzadkowane klucze, tablice zachowuja kolejnosc, nie ma
liczb zmiennoprzecinkowych ani dodatkowych pol, a kwoty SOL sa decimalnymi
stringami lamportow. Hash to `sha256(canonical_utf8_bytes)`.

### Manifest warunkow

Minimalny obiekt `bestcrow/campaign-terms/v2` zawiera:

```json
{"schema":"bestcrow/campaign-terms/v2","asset":"SOL","campaign_id":"42","creator":"<address>","goal_lamports":"10000000000","funding_duration_seconds":604800,"fee_bps":100,"vote_duration_seconds":604800,"revision_duration_seconds":2592000,"second_vote_duration_seconds":604800,"first_proof_deadline_seconds":2592000,"tranches":[{"index":0,"share_bps":3000,"proof_period_seconds":2592000,"recipients":[{"address":"<address>","share_bps":10000}]},{"index":1,"share_bps":3000,"proof_period_seconds":2592000,"recipients":[{"address":"<address>","share_bps":10000}]},{"index":2,"share_bps":4000,"proof_period_seconds":2592000,"recipients":[{"address":"<address>","share_bps":10000}]}],"refund_policy":"remaining_unreserved_pro_rata_v2","content_uri":"ar://<terms-document-txid>"}
```

Program przechowuje `terms_hash` i `terms_uri` w `CampaignV2`. URI wskazuje
na publiczny, niezmienny obiekt Arweave (`ar://`) z mozliwym mirror IPFS;
frontend i alternatywny klient pobieraja bajty, kanonizuja je i porownuja hash.
Niedostepny URI oznacza brak dostepu do opisu, nie zmiane zasad finansowych.

### Manifest dowodu

Dowod etapu ma osobny manifest `bestcrow/milestone-proof/v2` z polami:
`campaign`, `tranche_index`, `round`, `submitted_at`, `title`, `summary_uri`,
`summary_sha256` oraz `attachments[]`. Kazdy zalacznik ma niezmienne URI,
typ MIME i hash. Program zapisuje hash manifestu; prawdziwosc produktu,
zalacznika ani dostawy nie jest przez niego oceniana.

### Status i zadanie P0

**P0.2 i P0.3 sa zamkniete projektowo** w tym dokumencie. Implementacja
kont, IDL, dekoderow i storage nalezy do P1/P3. P0.1 jest zamkniete na poziomie
regul, ale wymaga konkretnego adresu treasury przed deploymentem.
