# GemiHub Connection (Google Drive Sync)

Sincronizza il tuo vault Obsidian con Google Drive, completamente compatibile con [GemiHub](https://gemihub.com). Modifica le note in Obsidian e accedi da interfaccia web di GemiHub, o viceversa.

## Panoramica

- **Sincronizzazione bidirezionale** - Push delle modifiche locali su Drive, pull delle modifiche remote su Obsidian
- **Compatibile con GemiHub** - Utilizza lo stesso formato `_sync-meta.json` e l'autenticazione crittografata di GemiHub
- **Risoluzione dei conflitti** - Rileva e risolve i conflitti quando entrambi i lati modificano lo stesso file
- **Sincronizzazione selettiva** - Escludi file/cartelle con corrispondenza di pattern
- **Supporto file binari** - Sincronizza immagini, PDF e altri file binari

## Prerequisiti

È necessario un account [GemiHub](https://gemihub.com) con la sincronizzazione Google Drive configurata. Il plugin utilizza il token di autenticazione crittografato di GemiHub per connettersi al tuo Google Drive.

1. Accedi a GemiHub
2. Vai su **Settings** → sezione **Obsidian Sync**
3. Copia il **Backup token**

## Configurazione

1. Apri Obsidian **Impostazioni** → **Gemini Helper** → scorri fino a **Google Drive sync**
2. Attiva **Enable drive sync**
3. Incolla il **Backup token** da GemiHub
4. Clicca **Setup** per recuperare l'autenticazione crittografata da Google Drive
5. Inserisci la tua **password** per sbloccare la sincronizzazione per la sessione corrente

> Ad ogni riavvio di Obsidian, ti verrà chiesto di inserire la password per sbloccare la sessione di sincronizzazione.

## Come Funziona la Sincronizzazione

### Archiviazione dei File su Drive

Tutti i file del vault sono archiviati in modo **flat** nella cartella root su Drive. Il nome del file su Drive include il percorso completo del vault:

| Percorso nel vault | Nome file su Drive |
|---|---|
| `notes.md` | `notes.md` |
| `daily/2024-01-15.md` | `daily/2024-01-15.md` |
| `attachments/image.png` | `attachments/image.png` |

Questo significa che non ci sono sottocartelle su Drive (eccetto le cartelle di sistema come `trash/`, `sync_conflicts/`, `__TEMP__/`). GemiHub utilizza la stessa struttura flat.

### Metadati di Sincronizzazione

Due file di metadati tracciano lo stato della sincronizzazione:

- **`_sync-meta.json`** (su Drive) - Condiviso con GemiHub. Contiene gli ID dei file, i checksum e i timestamp per tutti i file sincronizzati.
- **`{workspaceFolder}/drive-sync-meta.json`** (locale) - Mappa i percorsi del vault agli ID dei file su Drive e memorizza i checksum dell'ultima sincronizzazione.

### Push

Carica le modifiche locali su Google Drive.

1. Calcola i checksum MD5 per tutti i file del vault
2. Confronta con i metadati di sincronizzazione locali per trovare i file modificati
3. Se il remoto ha modifiche in sospeso, il push viene rifiutato (esegui prima il pull)
4. Carica i file nuovi/modificati su Drive
5. Sposta i file eliminati localmente nella cartella `trash/` su Drive (eliminazione soft)
6. Aggiorna `_sync-meta.json` su Drive

### Pull

Scarica le modifiche remote nel vault.

1. Recupera il `_sync-meta.json` remoto
2. Calcola i checksum locali per rilevare le modifiche locali
3. Se ci sono conflitti, mostra il modale di risoluzione dei conflitti
4. Elimina i file presenti solo localmente (spostati nel cestino di Obsidian)
5. Scarica i file remoti nuovi/modificati nel vault
6. Aggiorna i metadati di sincronizzazione locali

### Full Pull

Sostituisce tutti i file locali con le versioni remote. Usalo per ripristinare il tuo vault in modo che corrisponda a Drive.

> **Attenzione:** Questo elimina i file locali non presenti su Drive (spostati nel cestino di Obsidian).

### Risoluzione dei Conflitti

Quando lo stesso file viene modificato sia localmente che remotamente:

- Un modale mostra tutti i file in conflitto
- Per ogni file, scegli **Mantieni locale** o **Mantieni remoto**
- La versione scartata viene salvata come backup in `sync_conflicts/` su Drive
- **Conflitti modifica-eliminazione** (modificato localmente, eliminato remotamente) offrono **Ripristina (push su Drive)** o **Accetta eliminazione**
- Azioni in blocco: **Mantieni tutti locali** / **Mantieni tutti remoti**

## Gestione dei Dati

### Cestino

I file eliminati durante la sincronizzazione vengono spostati nella cartella `trash/` su Drive invece di essere eliminati permanentemente. Dalle impostazioni, puoi:

- **Ripristina** - Sposta i file dal cestino alla cartella root
- **Elimina permanentemente** - Rimuove definitivamente i file da Drive

### Backup dei Conflitti

Quando i conflitti vengono risolti, la versione scartata viene salvata in `sync_conflicts/` su Drive. Puoi:

- **Ripristina** - Ripristina un backup nella cartella root (sovrascrive la versione corrente)
- **Elimina** - Rimuove permanentemente i backup

### File Temporanei

I file salvati temporaneamente da GemiHub sono archiviati in `__TEMP__/` su Drive. Puoi:

- **Applica** - Applica il contenuto del file temporaneo al file corrispondente su Drive
- **Elimina** - Rimuove i file temporanei

Tutti e tre i modali di gestione supportano l'anteprima dei file e le operazioni in blocco.

## Impostazioni

| Impostazione | Descrizione | Predefinito |
|---|---|---|
| **Enable drive sync** | Attiva/disattiva la funzionalità di sincronizzazione | Off |
| **Backup token** | Incolla dalle impostazioni di GemiHub (sezione Obsidian Sync) | - |
| **Auto sync check** | Controlla periodicamente le modifiche remote e aggiorna i conteggi | Off |
| **Sync check interval** | Frequenza del controllo (minuti) | 5 |
| **Exclude patterns** | Percorsi da escludere (uno per riga, supporta i caratteri jolly `*`) | `node_modules/` |

## Comandi

Quattro comandi sono disponibili dalla palette comandi:

| Comando | Descrizione |
|---|---|
| **Drive sync: push to drive** | Push delle modifiche locali su Drive |
| **Drive sync: pull to local** | Pull delle modifiche remote nel vault |
| **Drive sync: full push to drive** | Push di tutti i file locali su Drive |
| **Drive sync: full pull to local** | Sostituisci tutti i file locali con le versioni remote |

## File Esclusi

I seguenti file sono sempre esclusi dalla sincronizzazione:

- `_sync-meta.json`, `settings.json`
- `history/`, `trash/`, `sync_conflicts/`, `__TEMP__/`, `plugins/`, `.trash/`, `node_modules/`
- Directory di configurazione di Obsidian (`.obsidian/` o personalizzata)
- Pattern di esclusione definiti dall'utente nelle impostazioni

### Sintassi dei Pattern di Esclusione

- `folder/` - Esclude una cartella e il suo contenuto
- `*.tmp` - Pattern glob (corrisponde a qualsiasi file `.tmp`)
- `*.log` - Pattern glob (corrisponde a qualsiasi file `.log`)
- `drafts/` - Esclude la cartella `drafts`

## Risoluzione dei Problemi

### "Remote has pending changes. Please pull first."

Il Drive remoto ha modifiche che non sono ancora state scaricate. Esegui **Pull to local** prima di eseguire il push.

### "Drive sync: no remote data found. Push first."

Non esiste nessun `_sync-meta.json` su Drive. Esegui **Push to drive** per inizializzare la sincronizzazione.

### Lo sblocco con password fallisce

- Verifica di utilizzare la stessa password di GemiHub
- Se hai cambiato la password in GemiHub, usa **Reset auth** nelle impostazioni e riconfigura con un nuovo backup token

### Il modale dei conflitti continua ad apparire

Entrambi i lati hanno modifiche. Risolvi tutti i conflitti scegliendo locale o remoto per ogni file. Dopo aver risolto tutti i conflitti, il pull continua automaticamente.
