# Wdrożenie Bestcrow V2 na Devnet

Ta checklista rozdziela kroki bezpieczne od kroków wysyłających transakcje.
Skrypty domyślnie wykonują tylko build, odczyty i symulację. Transakcja jest
wysyłana dopiero po podaniu jawnej flagi `--execute...`.

> Nie używaj portfela z prawdziwymi środkami. Nie commituj keypair ani seed
> phrase. Ostatni krok (`--final`) jest nieodwracalny.

## Adresy i pliki

- **Program ID** identyfikuje kod. Wpis w `Anchor.toml` nie dowodzi wdrożenia.
- **Program keypair** wyznacza Program ID przy pierwszym wdrożeniu. Plik
  `rust/target/deploy/charity_vault-keypair.json` musi odpowiadać wartościom w
  `Anchor.toml`, `declare_id!` oraz IDL.
- **Upgrade authority** wdraża aktualizacje i jednorazowo inicjalizuje config.
- **IDL** powstaje z wdrażanego buildu jako
  `rust/target/idl/charity_vault.json`.
- **ProtocolConfigV2** to PDA z seedem `config-v2`, treasury i `fee_bps = 100`.
- **Evidence JSON** zapisuje publiczne adresy, hashe i podpisy transakcji w
  `docs/deployments/devnet-v2.json`.

## 0. Wymagania i portfel

Repo przypina `anchor-lang = 1.1.2`; użyj Anchor CLI 1.1.2. Sprawdzone wersje
to Solana CLI 3.1.10 oraz Node.js 20.18 lub nowszy.

```bash
rustc --version
solana --version
anchor --version
node --version
cd rust && npm ci && cd ..
solana config set --url https://api.devnet.solana.com
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2
solana address
```

Jeśli plik portfela już istnieje, nie nadpisuj go bez świadomej decyzji.

## 1. Program keypair i Program ID

Zadeklarowany adres
`74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG` jest użyteczny tylko z
odpowiadającym mu program keypair. Jeśli świadomie wybierasz nowy adres:

```bash
mkdir -p rust/target/deploy
solana-keygen new --outfile rust/target/deploy/charity_vault-keypair.json
cd rust
anchor keys sync
anchor keys list
git diff -- Anchor.toml programs/charity-vault/src/lib.rs
cd ..
```

Zatrzymaj się, jeśli zmienił się adres, którego nie planowałeś. Program keypair
jest ignorowany przez Git i wymaga bezpiecznej kopii poza repozytorium.

## 2. Build i preflight — bez transakcji

```bash
scripts/deploy-devnet.sh --wallet ~/.config/solana/id.json
```

Skrypt potwierdza genesis hash Devnetu i wersję Anchor, buduje program, generuje
IDL, porównuje wszystkie Program ID, sprawdza saldo oraz pokazuje hashe programu
i IDL. Bez `--execute-deploy` niczego nie wdraża.

## 3. Deployment

Po sprawdzeniu podsumowania:

```bash
scripts/deploy-devnet.sh \
  --wallet ~/.config/solana/id.json \
  --execute-deploy
```

Skrypt wykonuje `anchor deploy`, potem `solana program show`, zapisuje log i
rozpoczyna `docs/deployments/devnet-v2.json`. Jeśli podpisu nie uda się odczytać
automatycznie, skopiuj go z `docs/deployments/devnet-v2-anchor-deploy.log`.

## 4. Treasury i ProtocolConfigV2

Treasury musi być poprawnym publicznym kluczem innym niż deployer. Najpierw
wykonaj wyłącznie odczyty i symulację:

```bash
export TREASURY="PUBLIC_KEY_TREASURY"
cd rust
npm run devnet:init-config -- \
  --treasury "$TREASURY" \
  --evidence ../docs/deployments/devnet-v2.json
```

Po sprawdzeniu podsumowania wyślij jednorazową transakcję:

```bash
npm run devnet:init-config -- \
  --treasury "$TREASURY" \
  --evidence ../docs/deployments/devnet-v2.json \
  --execute \
  --confirm-treasury "$TREASURY"
cd ..
```

Skrypt sprawdza upgrade authority, IDL z buildu, PDA `config-v2`, symuluje
instrukcję i potwierdza zapisane `version = 2`, treasury oraz `fee_bps = 100`.

## 5. Smoke test V2

Najpierw symulacja:

```bash
cd rust
npm run devnet:smoke -- \
  --evidence ../docs/deployments/devnet-v2.json
```

Test tworzy i uszczelnia kampanię z dwoma tranche po 50% w jednej transakcji.
Nie wpłaca pledge, ale deployer płaci rent i opłatę sieciową. Po weryfikacji:

```bash
PROGRAM_ID="$(node -p "require('./target/idl/charity_vault.json').address")"
npm run devnet:smoke -- \
  --evidence ../docs/deployments/devnet-v2.json \
  --execute \
  --confirm-program-id "$PROGRAM_ID"
cd ..
```

## 6. Obowiązkowa kontrola dowodów

W `docs/deployments/devnet-v2.json` muszą być: Program ID, deployer, treasury,
Config PDA, hashe `.so` i IDL, podpis deploymentu, podpis inicjalizacji configu,
co najmniej jeden podpis smoke testu i wynik `solana program show`.

Link do podpisu ma postać:
`https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet`.
Szablon pól: `docs/deployments/devnet-v2.example.json`.

## 7. Nieodwracalna blokada aktualizacji

Najpierw uruchom tylko weryfikację:

```bash
scripts/finalize-devnet-v2.sh \
  --wallet ~/.config/solana/id.json \
  --evidence docs/deployments/devnet-v2.json
```

Skrypt odmówi działania, gdy brakuje podpisów, Config PDA ma złego ownera albo
portfel nie jest aktualnym upgrade authority. Po ponownym sprawdzeniu:

```bash
PROGRAM_ID="$(node -p "require('./docs/deployments/devnet-v2.json').programId")"
scripts/finalize-devnet-v2.sh \
  --wallet ~/.config/solana/id.json \
  --evidence docs/deployments/devnet-v2.json \
  --execute \
  --confirm-final "$PROGRAM_ID"
```

Po tym kroku program jest nieaktualizowalny. Naprawa błędu wymaga nowego
Program ID i migracji klientów.
