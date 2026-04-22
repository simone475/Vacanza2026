-- Schema iniziale per il Road Trip Hub 2026

-- Tabella Statistiche Squadra
CREATE TABLE IF NOT EXISTS stats (
    id TEXT PRIMARY KEY, 
    value INTEGER
);

-- Inserimento valori iniziali (vengono ignorati se già presenti)
INSERT OR IGNORE INTO stats (id, value) VALUES ('hype', 100);
INSERT OR IGNORE INTO stats (id, value) VALUES ('patience', 100);
INSERT OR IGNORE INTO stats (id, value) VALUES ('social', 100);

-- Tabella Cassa Automatica
CREATE TABLE IF NOT EXISTS cassa (
    id INTEGER PRIMARY KEY, 
    kia REAL, 
    punto REAL, 
    tolls REAL
);

-- Inserimento riga iniziale per la cassa
INSERT OR IGNORE INTO cassa (id, kia, punto, tolls) VALUES (1, 0, 0, 0);

-- Tabella Checklist
CREATE TABLE IF NOT EXISTS checklist (
    item TEXT PRIMARY KEY, 
    is_checked INTEGER, 
    is_custom INTEGER
);
