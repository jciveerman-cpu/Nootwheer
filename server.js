const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;

app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function maakLegeDB() {
    return {
        competities: [],
        beheerders: [{ username: 'admin', password: 'admin' }],
        spelerLogin: { username: 'speler', password: 'speler' },
        spelers: [],
        wedstrijden: [],
        snapshots: {},
        aanwezigheid: {}
    };
}

function normaliseerDB(data) {
    const db = data && typeof data === 'object' ? data : maakLegeDB();
    db.competities = Array.isArray(db.competities) ? db.competities : [];
    db.beheerders = Array.isArray(db.beheerders) ? db.beheerders : [{ username: 'admin', password: 'admin' }];
    db.spelerLogin = db.spelerLogin || { username: 'speler', password: 'speler' };
    db.spelers = Array.isArray(db.spelers) ? db.spelers : [];
    db.wedstrijden = Array.isArray(db.wedstrijden) ? db.wedstrijden : [];
    db.snapshots = db.snapshots || {};
    db.aanwezigheid = db.aanwezigheid || {};
    return db;
}

function leesLokaleDB() {
    if (!fs.existsSync(DB_FILE)) return maakLegeDB();
    return normaliseerDB(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
}

function schrijfLokaleDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(normaliseerDB(data), null, 2), 'utf8');
}

function getSslConfig(connectionString) {
    if (!connectionString) return false;
    if (connectionString.includes('localhost') || connectionString.includes('127.0.0.1')) return false;
    return { rejectUnauthorized: false };
}

async function initOpslag() {
    if (!DATABASE_URL) {
        console.log('Geen DATABASE_URL gevonden. De app gebruikt lokaal db.json.');
        return;
    }

    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: getSslConfig(DATABASE_URL)
    });

    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_state (
            id INTEGER PRIMARY KEY,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    const bestaandeData = await pool.query('SELECT id FROM app_state WHERE id = 1');
    if (bestaandeData.rowCount === 0) {
        const startData = leesLokaleDB();
        await pool.query(
            'INSERT INTO app_state (id, data, updated_at) VALUES (1, $1::jsonb, NOW())',
            [JSON.stringify(startData)]
        );
        console.log('PostgreSQL is gevuld met de startdata uit db.json.');
    } else {
        console.log('PostgreSQL opslag actief.');
    }
}

async function leesDB() {
    if (!pool) return leesLokaleDB();

    const result = await pool.query('SELECT data FROM app_state WHERE id = 1');
    if (result.rowCount === 0) return maakLegeDB();
    return normaliseerDB(result.rows[0].data);
}

async function schrijfDB(data) {
    const db = normaliseerDB(data);
    if (!pool) {
        schrijfLokaleDB(db);
        return;
    }

    await pool.query(
        'UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(db)]
    );
}

async function wijzigDB(callback) {
    if (!pool) {
        const db = leesLokaleDB();
        const resultaat = await callback(db);
        schrijfLokaleDB(db);
        return resultaat;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('SELECT data FROM app_state WHERE id = 1 FOR UPDATE');
        const db = normaliseerDB(result.rows[0]?.data || maakLegeDB());
        const resultaat = await callback(db);
        await client.query(
            'UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 1',
            [JSON.stringify(db)]
        );
        await client.query('COMMIT');
        return resultaat;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

function getISOWeeknummer(datum) {
    const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}



function isWedstrijdActief(w) {
    return !w.status || w.status !== 'verwijderd';
}

function getActieveCompetitieId(db, type) {
    const comp = db.competities.find(c => c.status === 'Actief' && c.type === type);
    return comp ? comp.id : null;
}

function hoortBijActieveCompetitie(db, w) {
    if (!isWedstrijdActief(w)) return false;
    const actieveId = getActieveCompetitieId(db, w.type);
    if (!actieveId) return true;
    return !w.competitieId || w.competitieId === actieveId;
}

function getWedstrijdTijdwaarde(w) {
    const datumTijd = Date.parse(w.datum || '1970-01-01');
    const idMatch = String(w.id || '').match(/(\d+)/);
    const idTijd = idMatch ? Number(idMatch[1]) : 0;
    return { datumTijd: Number.isNaN(datumTijd) ? 0 : datumTijd, idTijd };
}

function sorteerWedstrijdenChronologisch(wedstrijden) {
    return [...wedstrijden].sort((a, b) => {
        const ta = getWedstrijdTijdwaarde(a);
        const tb = getWedstrijdTijdwaarde(b);
        return ta.datumTijd - tb.datumTijd || ta.idTijd - tb.idTijd;
    });
}

function berekenWedstrijdSaldiServer(sets) {
    const setControle = controleerWedstrijdSets(sets);
    let puntenA = 0;
    let puntenB = 0;

    sets.forEach(set => {
        const a = Number(set.a);
        const b = Number(set.b);
        puntenA += a;
        puntenB += b;
    });

    return {
        setsA: setControle.setsA,
        setsB: setControle.setsB,
        setsSaldoA: setControle.setsA - setControle.setsB,
        setsSaldoB: setControle.setsB - setControle.setsA,
        puntenA,
        puntenB,
        puntenSaldoA: puntenA - puntenB,
        puntenSaldoB: puntenB - puntenA
    };
}

function maakLegeSaldiVoorType(db, type) {
    const saldi = {};
    db.spelers
        .filter(s => s.type === type)
        .forEach(s => {
            saldi[s.id] = { sets: 0, punten: 0 };
        });
    return saldi;
}

function voegWedstrijdToeAanSaldi(saldi, w) {
    if (!Array.isArray(w.sets)) return;
    if(!saldi[w.spelerAId]) saldi[w.spelerAId] = { sets: 0, punten: 0 };
    if(!saldi[w.spelerBId]) saldi[w.spelerBId] = { sets: 0, punten: 0 };

    w.sets.forEach(set => {
        const a = Number(set.a);
        const b = Number(set.b);
        if(Number.isNaN(a) || Number.isNaN(b)) return;
        if(a > b) {
            saldi[w.spelerAId].sets += 1;
            saldi[w.spelerBId].sets -= 1;
        } else if(b > a) {
            saldi[w.spelerBId].sets += 1;
            saldi[w.spelerAId].sets -= 1;
        }
        saldi[w.spelerAId].punten += (a - b);
        saldi[w.spelerBId].punten += (b - a);
    });
}

function berekenSpelerSaldiServer(db, type) {
    const saldi = maakLegeSaldiVoorType(db, type);

    db.wedstrijden
        .filter(w => w.type === type && hoortBijActieveCompetitie(db, w) && Array.isArray(w.sets))
        .forEach(w => voegWedstrijdToeAanSaldi(saldi, w));

    return saldi;
}

function bepaalActueleRanglijst(db, type, saldiOverride = null, opties = {}) {
    const saldi = saldiOverride || berekenSpelerSaldiServer(db, type);
    const gebruikElo = opties.gebruikElo === true;
    return db.spelers
        .filter(s => s.type === type && s.actief)
        .map(s => ({
            ...s,
            setsSaldo: saldi[s.id]?.sets || 0,
            puntenSaldo: saldi[s.id]?.punten || 0
        }))
        .sort((a, b) => {
            const basisSortering =
                b.punten - a.punten ||
                b.setsSaldo - a.setsSaldo ||
                b.puntenSaldo - a.puntenSaldo;
            if (basisSortering !== 0) return basisSortering;
            if (gebruikElo) return b.elo - a.elo || a.naam.localeCompare(b.naam);
            return a.naam.localeCompare(b.naam);
        });
}

function bepaalPositie(ranglijst, spelerId) {
    const index = ranglijst.findIndex(s => s.id === spelerId);
    return index === -1 ? 999 : index + 1;
}

function controleerWedstrijdSets(sets) {
    if (!Array.isArray(sets) || sets.length === 0) {
        throw new Error('Vul de setstanden in.');
    }

    let setsA = 0;
    let setsB = 0;
    let wedstrijdBeslist = false;

    sets.forEach((set, index) => {
        if (wedstrijdBeslist) {
            throw new Error('Er zijn setstanden ingevuld nadat de wedstrijd al beslist was. Controleer de setstanden.');
        }

        const a = Number(set.a);
        const b = Number(set.b);

        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
            throw new Error(`Set ${index + 1} bevat geen geldige stand.`);
        }
        if (a === b) {
            throw new Error(`Set ${index + 1} kan niet gelijk eindigen.`);
        }

        if (a > b) setsA++;
        else setsB++;

        if (setsA === 3 || setsB === 3) wedstrijdBeslist = true;
    });

    if (setsA !== 3 && setsB !== 3) {
        throw new Error('Opslaan kan pas wanneer één speler drie sets heeft gewonnen.');
    }
    if (setsA === 3 && setsB === 3) {
        throw new Error('Controleer de setstanden: beide spelers kunnen niet drie sets winnen.');
    }

    return { setsA, setsB };
}

function migreerBasisPuntenVoorActieveCompetities(db) {
    // Eenmalige reparatie voor eerdere versies waarin basisPunten konden worden afgeleid
    // uit een tijdelijke, foutieve stand. Voor actieve competities is het startpunt 0.
    if (db.puntenHerberekeningVersie === 'basis-v2') return;
    const actieveTypes = new Set(
        db.competities
            .filter(c => c.status === 'Actief' && c.type)
            .map(c => c.type)
    );
    db.spelers.forEach(speler => {
        if (actieveTypes.has(speler.type)) {
            speler.basisPunten = 0;
        }
    });
    db.puntenHerberekeningVersie = 'basis-v2';
}

function normaliseerBasisPunten(db) {
    db.spelers.forEach(speler => {
        speler.basisPunten = Number(speler.basisPunten || 0);
        if (!Number.isFinite(speler.basisPunten)) speler.basisPunten = 0;
    });
}

function herberekenAllePunten(db) {
    migreerBasisPuntenVoorActieveCompetities(db);
    normaliseerBasisPunten(db);

    db.spelers.forEach(speler => {
        speler.punten = Number(speler.basisPunten || 0);
    });

    const types = [...new Set(db.spelers.map(s => s.type).filter(Boolean))];

    types.forEach(type => {
        const saldi = maakLegeSaldiVoorType(db, type);
        const wedstrijden = sorteerWedstrijdenChronologisch(
            db.wedstrijden.filter(w => w.type === type && hoortBijActieveCompetitie(db, w) && Array.isArray(w.sets))
        );

        let heeftEerdereWedstrijden = false;

        wedstrijden.forEach(w => {
            const spelerA = db.spelers.find(s => s.id === w.spelerAId);
            const spelerB = db.spelers.find(s => s.id === w.spelerBId);
            if (!spelerA || !spelerB) return;

            const setControle = controleerWedstrijdSets(w.sets);
            const wedstrijdSaldi = berekenWedstrijdSaldiServer(w.sets);
            const ranglijstVoorWedstrijd = bepaalActueleRanglijst(db, type, saldi, { gebruikElo: !heeftEerdereWedstrijden });
            const positieVoorA = bepaalPositie(ranglijstVoorWedstrijd, w.spelerAId);
            const positieVoorB = bepaalPositie(ranglijstVoorWedstrijd, w.spelerBId);

            const puntenVoorA = spelerA.punten;
            const puntenVoorB = spelerB.punten;
            let puntenMutatieA = 0;
            let puntenMutatieB = 0;
            const winnaarId = setControle.setsA > setControle.setsB ? w.spelerAId : w.spelerBId;

            if (winnaarId === w.spelerAId) {
                puntenMutatieA = 1;
                if (positieVoorA > positieVoorB) {
                    puntenMutatieA += 1;
                    puntenMutatieB -= 1;
                }
            } else {
                puntenMutatieB = 1;
                if (positieVoorB > positieVoorA) {
                    puntenMutatieB += 1;
                    puntenMutatieA -= 1;
                }
            }

            spelerA.punten += puntenMutatieA;
            spelerB.punten += puntenMutatieB;

            w.uitslag = `${setControle.setsA} - ${setControle.setsB}`;
            w.setstanden = w.sets.map(s => `${s.a}-${s.b}`).join(', ');
            w.winnaarId = winnaarId;
            w.positieVoorA = positieVoorA;
            w.positieVoorB = positieVoorB;
            w.puntenVoorA = puntenVoorA;
            w.puntenVoorB = puntenVoorB;
            w.puntenMutatieA = puntenMutatieA;
            w.puntenMutatieB = puntenMutatieB;
            w.puntenNaA = spelerA.punten;
            w.puntenNaB = spelerB.punten;
            w.setsSaldoA = wedstrijdSaldi.setsSaldoA;
            w.setsSaldoB = wedstrijdSaldi.setsSaldoB;
            w.puntenSaldoA = wedstrijdSaldi.puntenSaldoA;
            w.puntenSaldoB = wedstrijdSaldi.puntenSaldoB;

            voegWedstrijdToeAanSaldi(saldi, w);
            heeftEerdereWedstrijden = true;
        });
    });
}

function bouwWedstrijdZonderPunten(db, payload, bestaandId = null) {
    const { competitieId, spelerAId, spelerBId, sets, type, gekozenDatum } = payload;
    const setControle = controleerWedstrijdSets(sets);

    const wedstrijdDatum = gekozenDatum ? new Date(gekozenDatum) : new Date();
    const weekVanWedstrijd = getISOWeeknummer(wedstrijdDatum);
    const geformatteerdeDatum = wedstrijdDatum.toISOString().split('T')[0];

    const spelerA = db.spelers.find(s => s.id === spelerAId);
    const spelerB = db.spelers.find(s => s.id === spelerBId);

    if (!spelerA || !spelerB) {
        throw new Error('Een van de spelers kon niet worden gevonden.');
    }
    if (spelerAId === spelerBId) {
        throw new Error('Selecteer twee verschillende spelers.');
    }

    return {
        id: bestaandId || ('w_' + Date.now()),
        competitieId,
        week: weekVanWedstrijd,
        datum: geformatteerdeDatum,
        spelerAId,
        spelerBId,
        sets,
        uitslag: `${setControle.setsA} - ${setControle.setsB}`,
        setstanden: sets.map(s => `${s.a}-${s.b}`).join(', '),
        winnaarId: setControle.setsA > setControle.setsB ? spelerAId : spelerBId,
        type
    };
}

app.post('/api/login', async (req, res) => {
    const db = await leesDB();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    const beheerders = Array.isArray(db.beheerders) ? db.beheerders : [];
    const adminAccount = beheerders.find(b =>
        String(b.username || '').trim() === username && String(b.password || '') === password
    );

    if (adminAccount) {
        return res.json({ success: true, role: 'admin', displayName: username });
    }

    const spelerAccount = db.spelerLogin || {};
    const spelerUsername = String(spelerAccount.username || 'speler').trim();
    const spelerPassword = String(spelerAccount.password || 'speler');

    const standaardSpelerLogin = username === 'speler' && password === 'speler';
    const ingesteldeSpelerLogin = username === spelerUsername && password === spelerPassword;

    if (standaardSpelerLogin || ingesteldeSpelerLogin) {
        return res.json({ success: true, role: 'speler', displayName: username });
    }

    res.json({ success: false });
});

app.get('/api/data', async (req, res) => {
    try {
        const db = await wijzigDB(async (db) => {
            herberekenAllePunten(db);
            db.huidigeWeekServer = getISOWeeknummer(new Date());
            return db;
        });
        res.json(db);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/wedstrijden', async (req, res) => {
    try {
        const nieuweWedstrijd = await wijzigDB(async (db) => {
            const wedstrijd = bouwWedstrijdZonderPunten(db, req.body);
            db.wedstrijden.unshift(wedstrijd);
            herberekenAllePunten(db);
            return db.wedstrijden.find(w => w.id === wedstrijd.id) || wedstrijd;
        });
        res.json({ success: true, wedstrijd: nieuweWedstrijd });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/wedstrijden/:id', async (req, res) => {
    try {
        const aangepasteWedstrijd = await wijzigDB(async (db) => {
            const index = db.wedstrijden.findIndex(w => w.id === req.params.id);
            if (index === -1) throw new Error('Wedstrijd niet gevonden.');

            const oudeWedstrijd = db.wedstrijden[index];
            const wedstrijd = bouwWedstrijdZonderPunten(db, req.body, oudeWedstrijd.id);
            db.wedstrijden[index] = wedstrijd;
            herberekenAllePunten(db);
            return db.wedstrijden.find(w => w.id === oudeWedstrijd.id) || wedstrijd;
        });
        res.json({ success: true, wedstrijd: aangepasteWedstrijd });
    } catch (err) {
        const status = err.message === 'Wedstrijd niet gevonden.' ? 404 : 400;
        res.status(status).json({ error: err.message });
    }
});

app.delete('/api/wedstrijden/:id', async (req, res) => {
    try {
        await wijzigDB(async (db) => {
            const index = db.wedstrijden.findIndex(w => w.id === req.params.id);
            if (index === -1) throw new Error('Wedstrijd niet gevonden.');

            db.wedstrijden.splice(index, 1);
            herberekenAllePunten(db);
        });
        res.json({ success: true });
    } catch (err) {
        const status = err.message === 'Wedstrijd niet gevonden.' ? 404 : 400;
        res.status(status).json({ error: err.message });
    }
});

app.post('/api/competities/actie', async (req, res) => {
    try {
        await wijzigDB(async (db) => {
            const { actie, competitieId, extra } = req.body;

            if (actie === 'nieuw') {
                const id = extra.naam.toLowerCase().replace(/ /g, '-');
                db.competities.filter(c => c.type === extra.type).forEach(c => c.status = 'Gearchiveerd');
                db.competities.push({
                    id,
                    naam: extra.naam,
                    type: extra.type,
                    status: 'Actief',
                    huidigeWeek: getISOWeeknummer(new Date())
                });
                db.spelers.forEach(s => { if(s.type === extra.type) { s.basisPunten = 0; s.punten = 0; } });
            } else if (actie === 'reset-punten') {
                const comp = db.competities.find(c => c.id === competitieId);
                if(comp) {
                    db.spelers.forEach(s => { if(s.type === comp.type) { s.basisPunten = 0; s.punten = 0; } });
                }
            } else if (actie === 'competitie-verwijder') {
                db.competities = db.competities.filter(c => c.id !== competitieId);
            } else if (actie === 'competitie-wijzig-naam') {
                const comp = db.competities.find(c => c.id === competitieId);
                if (!comp) throw new Error('Competitie niet gevonden.');
                if (!extra || !extra.naam || !String(extra.naam).trim()) throw new Error('Voer een naam in.');
                comp.naam = String(extra.naam).trim();
            } else if (actie === 'speler-nieuw') {
                db.spelers.push({ id: 's_' + Date.now(), naam: extra.naam, type: extra.type, punten: extra.punten, basisPunten: extra.punten, elo: extra.elo, actief: true });
            } else if (actie === 'speler-wijzig') {
                const speler = db.spelers.find(s => s.id === extra.id);
                if(speler) { speler.naam = extra.naam; speler.type = extra.type; speler.elo = extra.elo; speler.basisPunten = extra.punten; speler.punten = extra.punten; }
            } else if (actie === 'speler-verwijder') {
                const speler = db.spelers.find(s => s.id === extra.id);
                if(speler) speler.actief = false;
            } else if (actie === 'beheerder-nieuw') {
                if(!db.beheerders.find(b => b.username === extra.user)) db.beheerders.push({ username: extra.user, password: extra.pass });
            } else if (actie === 'beheerder-verwijder') {
                db.beheerders = db.beheerders.filter(b => b.username !== extra.user);
            }
            herberekenAllePunten(db);
        });

        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initOpslag()
    .then(() => {
        app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));
    })
    .catch((err) => {
        console.error('Fout bij starten van de opslag:', err);
        process.exit(1);
    });
