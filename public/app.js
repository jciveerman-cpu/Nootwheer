let appData = {};
let geselecteerdDashboardType = 'Senioren';
let geselecteerdRanglijstType = 'Senioren';
let geselecteerdHistorieType = 'Senioren';
let geselecteerdSpelerHistorieType = 'Senioren';
let geselecteerdBeheerSpelersType = 'Senioren';
let geselecteerdCompetitieFormType = 'Senioren';
let huidigeSpelerHistorieId = null;
let bewerkWedstrijdId = null;
let IsAdmin = false;
let huidigeRol = 'speler';

async function laadData() {
    const response = await fetch('/api/data');
    appData = await response.json();
    initApp();
}

function initApp() {
    pasRolWeergaveToe();
    const actieveComp = appData.competities.find(c => c.status === 'Actief' && c.type === geselecteerdDashboardType);
    
    document.getElementById('dash-comp').innerText = actieveComp ? actieveComp.naam : 'Geen actieve competitie';
    document.getElementById('dash-week').innerText = appData.huidigeWeekServer || '-';
    document.getElementById('dash-spelers').innerText = appData.spelers.filter(s => s.actief && s.type === geselecteerdDashboardType).length;

    if(!document.getElementById('w-datum').value) {
        document.getElementById('w-datum').value = getLokaleDatumVandaag();
    }

    const overzichtDatum = document.getElementById('overzicht-datum');
    if(overzichtDatum && !overzichtDatum.value) {
        overzichtDatum.value = getLokaleDatumVandaag();
    }

    wisselInvoerType();
    laadRanglijst();
    laadHistorie(geselecteerdHistorieType);
    laadWedstrijdenDashboard(geselecteerdDashboardType);
    laadBeheerTabellen();
    const spelerType = document.getElementById('speler-type');
    if(spelerType) wisselSpelerFormType(spelerType.value || 'Senioren');
    wisselCompetitieFormType(geselecteerdCompetitieFormType || 'Senioren');

    if (huidigeSpelerHistorieId) {
        renderSpelerHistorie();
    }
}

function pasRolWeergaveToe() {
    IsAdmin = huidigeRol === 'admin' || huidigeRol === 'beheerder';

    const rolIndicator = document.getElementById('rol-indicator');
    if (rolIndicator) {
        if (IsAdmin) {
            const naam = document.getElementById('login-username')?.value?.trim() || 'admin';
            rolIndicator.innerHTML = `<i class="fa-solid fa-user-shield"></i> Beheerder Modus (${escapeHtml(naam)})`;
        } else {
            rolIndicator.innerHTML = `<i class="fa-solid fa-user"></i> Speler Modus`;
        }
    }

    document.querySelectorAll('.nav-admin-only').forEach(el => {
        el.style.display = IsAdmin ? 'flex' : 'none';
    });
}

function toggleHelpmenu() {
    const helpModal = document.getElementById('help-modal');
    const wordtGeopend = helpModal.style.display !== 'flex';
    helpModal.style.display = wordtGeopend ? 'flex' : 'none';
    if(wordtGeopend) sluitMobielMenu();
}

function sluitHelpmenuExtern(e) {
    if(e.target.id === 'help-modal') {
        document.getElementById('help-modal').style.display = 'none';
    }
}

function sluitMobielMenu() {
    const menu = document.querySelector('.nav-menu');
    if(menu) menu.classList.remove('mobile-open');
}

function getLokaleDatumVandaag() {
    const vandaag = new Date();
    const tzOffset = vandaag.getTimezoneOffset() * 60000;
    return new Date(vandaag.getTime() - tzOffset).toISOString().split('T')[0];
}

function bepaalISOWeeknummer(datumString) {
    const datum = datumString ? new Date(datumString) : new Date();
    const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function escapeHtml(waarde) {
    return String(waarde ?? '').replace(/[&<>"']/g, teken => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[teken]));
}

function formatDatum(datum) {
    if(!datum) return '-';
    const onderdelen = datum.split('-');
    if(onderdelen.length === 3 && onderdelen[0].length === 4) return `${onderdelen[2]}-${onderdelen[1]}-${onderdelen[0]}`;
    return datum;
}

function formatPunten(mutatie) {
    if(mutatie === undefined || mutatie === null || Number.isNaN(mutatie)) {
        return '<span class="punten-neutraal">Niet opgeslagen</span>';
    }
    if(mutatie > 0) return `<span class="punten-plus">+${mutatie}</span>`;
    if(mutatie < 0) return `<span class="punten-min">${mutatie}</span>`;
    return '<span class="punten-neutraal">0</span>';
}

function formatPuntenKort(mutatie) {
    if(mutatie === undefined || mutatie === null || Number.isNaN(mutatie)) return '';
    if(mutatie > 0) return `<span class="punten-plus">+${mutatie}</span>`;
    if(mutatie < 0) return `<span class="punten-min">${mutatie}</span>`;
    return '<span class="punten-neutraal">0</span>';
}

function formatPuntenTekst(mutatie) {
    if(mutatie === undefined || mutatie === null || Number.isNaN(mutatie)) return '?';
    if(mutatie > 0) return `+${mutatie}`;
    return String(mutatie);
}

function formatPuntenCombinatie(mutatieA, mutatieB) {
    if(mutatieA === undefined || mutatieA === null || mutatieB === undefined || mutatieB === null) return '';
    return `<span class="punten-neutraal">(${formatPuntenTekst(mutatieA)}/${formatPuntenTekst(mutatieB)})</span>`;
}

function naamMetPunten(spelerId, mutatie, winnaarId = null) {
    const naam = getSpelerNaam(spelerId);
    const naamHtml = winnaarId === spelerId ? `<strong>${naam}</strong>` : naam;
    const punten = formatPuntenKort(mutatie);
    return punten ? `${naamHtml} (${punten})` : naamHtml;
}

function naamWedstrijd(spelerId, winnaarId = null) {
    const naam = getSpelerNaam(spelerId);
    return winnaarId === spelerId ? `<strong>${naam}</strong>` : naam;
}

function getPuntenMutatie(w, spelerId) {
    if(w.spelerAId === spelerId) return w.puntenMutatieA;
    if(w.spelerBId === spelerId) return w.puntenMutatieB;
    return null;
}

function getSpelerNaam(spelerId) {
    return appData.spelers.find(s => s.id === spelerId)?.naam || 'Onbekend';
}

function escapeVoorOnclick(tekst) {
    return String(tekst).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function intellectueleSetBerekening(inputElement, zijde) {
    const rij = inputElement.parentElement;
    const inputA = rij.querySelector('.set-a');
    const inputB = rij.querySelector('.set-b');
    const waarde = parseInt(inputElement.value);
    if (isNaN(waarde) || waarde < 0) return;

    if (zijde === 'A') {
        if (waarde < 10) inputB.value = 11;
        else if (waarde === 10) inputB.value = 12;
        else inputB.value = waarde + 2;
    } else if (zijde === 'B') {
        if (waarde < 10) inputA.value = 11;
        else if (waarde === 10) inputA.value = 12;
        else inputA.value = waarde + 2;
    }
    updateLiveUitslag();
}

async function behandelInloggen() {
    const user = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-password').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username: user, password: pass })
    });
    const result = await res.json();

    if (result.success) {
        huidigeRol = (result.role === 'admin' || result.role === 'beheerder') ? 'admin' : 'speler';
        pasRolWeergaveToe();
        document.getElementById('login-screen').style.display = 'none';
        laadData();
    } else {
        alert('Onjuiste inloggegevens.');
    }
}

function uitloggen() {
    huidigeRol = 'speler';
    pasRolWeergaveToe();
    document.getElementById('login-screen').style.display = 'flex';
    switchView('dashboard');
}

function switchView(viewName) {
    pasRolWeergaveToe();
    if((viewName === 'beheer-spelers' || viewName === 'beheer-competities') && !IsAdmin) {
        viewName = 'dashboard';
    }
    document.querySelectorAll('.view-container').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    sluitMobielMenu();
    if(viewName === 'dashboard' || viewName === 'ranglijst' || viewName === 'historie' || viewName === 'beheer-spelers') laadData();
}

function wisselDashboardTab(type) {
    geselecteerdDashboardType = type;
    document.getElementById('tab-dash-senioren').classList.toggle('active', type === 'Senioren');
    document.getElementById('tab-dash-jeugd').classList.toggle('active', type === 'Jeugd');
    laadData();
}

function wisselRanglijstTab(type) {
    geselecteerdRanglijstType = type;
    laadRanglijst();
}

function wisselHistorieTab(type) {
    geselecteerdHistorieType = type;
    document.getElementById('tab-hist-senioren').classList.toggle('active', type === 'Senioren');
    document.getElementById('tab-hist-jeugd').classList.toggle('active', type === 'Jeugd');
    laadHistorie(type);
}

function wisselSpelerHistorieTab(type) {
    geselecteerdSpelerHistorieType = type;
    document.getElementById('tab-spelerhist-senioren').classList.toggle('active', type === 'Senioren');
    document.getElementById('tab-spelerhist-jeugd').classList.toggle('active', type === 'Jeugd');
    renderSpelerHistorie();
}

function wisselBeheerSpelersTab(type) {
    geselecteerdBeheerSpelersType = type;
    document.getElementById('tab-beheer-spelers-senioren').classList.toggle('active', type === 'Senioren');
    document.getElementById('tab-beheer-spelers-jeugd').classList.toggle('active', type === 'Jeugd');
    laadBeheerTabellen();
}

function genereerRanglijstTabelRijen(spelersLijst) {
    let html = '';
    spelersLijst.forEach((s, i) => {
        let posKlasse = '';
        let medaille = `<strong>${i+1}</strong>`;
        if (i === 0) { posKlasse = 'goud'; medaille = `<i class="fa-solid fa-medal trofee"></i> 1`; }
        else if (i === 1) { posKlasse = 'zilver'; medaille = `<i class="fa-solid fa-medal trofee"></i> 2`; }
        else if (i === 2) { posKlasse = 'brons'; medaille = `<i class="fa-solid fa-medal trofee"></i> 3`; }

        html += `<tr class="${posKlasse}">
            <td>${medaille}</td>
            <td><span class="clickable-player" onclick="toonSpelerHistorie('${s.id}')">${s.naam}</span></td>
            <td class="punten-cel">${s.punten}</td>
            <td>${s.elo}</td>
        </tr>`;
    });
    return html;
}

function laadRanglijst() {
    const tbody = document.getElementById('ranglijst-table-body');
    if(!tbody) return;

    const tabSenioren = document.getElementById('tab-rang-senioren');
    const tabJeugd = document.getElementById('tab-rang-jeugd');
    if(tabSenioren) tabSenioren.classList.toggle('active', geselecteerdRanglijstType === 'Senioren');
    if(tabJeugd) tabJeugd.classList.toggle('active', geselecteerdRanglijstType === 'Jeugd');

    const titel = document.getElementById('ranglijst-titel');
    if(titel) titel.innerHTML = `<i class="fa-solid fa-list-ol"></i> ${geselecteerdRanglijstType} Ranglijst`;

    tbody.innerHTML = getGesorteerdeSpelers(geselecteerdRanglijstType)
        .slice(0, 10)
        .map((s, index) => {
            let posKlasse = '';
            let medaille = `<strong>${index+1}</strong>`;
            if (index === 0) { posKlasse = 'goud'; medaille = `<i class="fa-solid fa-medal trofee"></i> 1`; }
            else if (index === 1) { posKlasse = 'zilver'; medaille = `<i class="fa-solid fa-medal trofee"></i> 2`; }
            else if (index === 2) { posKlasse = 'brons'; medaille = `<i class="fa-solid fa-medal trofee"></i> 3`; }
            return `<tr class="${posKlasse}">
                <td>${medaille}</td>
                <td><span class="clickable-player" onclick="toonSpelerHistorie('${s.id}')">${escapeHtml(s.naam)}</span></td>
                <td class="punten-cel">${s.punten}</td>
                <td>${s.elo}</td>
            </tr>`;
        }).join('');
}

function wisselInvoerTab(type) {
    const typeSelect = document.getElementById('w-type');
    if(typeSelect) typeSelect.value = type;
    wisselInvoerType();
    wisGeselecteerdeSpelers();
}

function spelerOptieLabel(speler) {
    return `${speler.naam} (ELO: ${speler.elo})`;
}

function vindSpelerOpZoekwaarde(waarde, type) {
    const zoek = String(waarde || '').trim().toLowerCase();
    if(!zoek) return null;
    const spelers = appData.spelers.filter(s => s.actief && s.type === type);
    return spelers.find(s => spelerOptieLabel(s).toLowerCase() === zoek)
        || spelers.find(s => s.naam.toLowerCase() === zoek)
        || null;
}

function selecteerSpelerUitZoekveld(zijde) {
    const type = document.getElementById('w-type')?.value || 'Senioren';
    const zoekInput = document.getElementById(`w-speler${zijde}-zoek`);
    const verborgenInput = document.getElementById(`w-speler${zijde}`);
    if(!zoekInput || !verborgenInput) return;

    const speler = vindSpelerOpZoekwaarde(zoekInput.value, type);
    verborgenInput.value = speler ? speler.id : '';
    updateSpelerSelectieStatus(zijde);
    updateLiveUitslag();
}

function updateSpelerSelectieStatus(zijde) {
    const zoekInput = document.getElementById(`w-speler${zijde}-zoek`);
    const verborgenInput = document.getElementById(`w-speler${zijde}`);
    const waarschuwing = document.getElementById(`w-speler${zijde}-waarschuwing`);
    if(!zoekInput || !verborgenInput || !waarschuwing) return true;

    const waarde = zoekInput.value.trim();
    const geldig = Boolean(verborgenInput.value);
    const toonWaarschuwing = waarde.length > 0 && !geldig;

    zoekInput.classList.toggle('input-waarschuwing', toonWaarschuwing);
    waarschuwing.style.display = toonWaarschuwing ? 'block' : 'none';
    return geldig;
}

function valideerSpelerSelecties(toonLeeg = false) {
    ['A', 'B'].forEach(zijde => {
        const zoekInput = document.getElementById(`w-speler${zijde}-zoek`);
        const waarschuwing = document.getElementById(`w-speler${zijde}-waarschuwing`);
        const verborgenInput = document.getElementById(`w-speler${zijde}`);
        if(!zoekInput || !waarschuwing || !verborgenInput) return;
        const ongeldig = !verborgenInput.value && (toonLeeg || zoekInput.value.trim().length > 0);
        zoekInput.classList.toggle('input-waarschuwing', ongeldig);
        waarschuwing.style.display = ongeldig ? 'block' : 'none';
    });

    const spelerAId = document.getElementById('w-spelerA')?.value;
    const spelerBId = document.getElementById('w-spelerB')?.value;
    return Boolean(spelerAId && spelerBId && spelerAId !== spelerBId);
}

function vulSpelerZoekvelden(type) {
    const lijstA = document.getElementById('spelersA-list');
    const lijstB = document.getElementById('spelersB-list');
    if(!lijstA || !lijstB) return;

    const opties = appData.spelers
        .filter(s => s.actief && s.type === type)
        .sort((a, b) => a.naam.localeCompare(b.naam))
        .map(s => `<option value="${escapeHtml(spelerOptieLabel(s))}">${escapeHtml(s.naam)}</option>`)
        .join('');

    lijstA.innerHTML = opties;
    lijstB.innerHTML = opties;
}

function wisGeselecteerdeSpelers() {
    ['A', 'B'].forEach(zijde => {
        const zoekInput = document.getElementById(`w-speler${zijde}-zoek`);
        const verborgenInput = document.getElementById(`w-speler${zijde}`);
        if(zoekInput) zoekInput.value = '';
        if(verborgenInput) verborgenInput.value = '';
        updateSpelerSelectieStatus(zijde);
    });
    updateLiveUitslag();
}

function wisselInvoerType() {
    const typeSelect = document.getElementById('w-type');
    const type = typeSelect ? typeSelect.value : 'Senioren';
    const tabSenioren = document.getElementById('tab-invoer-senioren');
    const tabJeugd = document.getElementById('tab-invoer-jeugd');
    if(tabSenioren) tabSenioren.classList.toggle('active', type === 'Senioren');
    if(tabJeugd) tabJeugd.classList.toggle('active', type === 'Jeugd');

    vulSpelerZoekvelden(type);

    const spelerAId = document.getElementById('w-spelerA')?.value;
    const spelerBId = document.getElementById('w-spelerB')?.value;
    const spelerA = appData.spelers.find(s => s.id === spelerAId && s.actief && s.type === type);
    const spelerB = appData.spelers.find(s => s.id === spelerBId && s.actief && s.type === type);

    if(!spelerA) {
        const zoekA = document.getElementById('w-spelerA-zoek');
        const verborgenA = document.getElementById('w-spelerA');
        if(zoekA) zoekA.value = '';
        if(verborgenA) verborgenA.value = '';
    }
    if(!spelerB) {
        const zoekB = document.getElementById('w-spelerB-zoek');
        const verborgenB = document.getElementById('w-spelerB');
        if(zoekB) zoekB.value = '';
        if(verborgenB) verborgenB.value = '';
    }

    updateLiveUitslag();
}

function updateLiveUitslag() {
    const spelerAId = document.getElementById('w-spelerA')?.value || '';
    const spelerBId = document.getElementById('w-spelerB')?.value || '';
    const naamA = appData.spelers.find(s => s.id === spelerAId)?.naam || 'Speler A';
    const naamB = appData.spelers.find(s => s.id === spelerBId)?.naam || 'Speler B';

    let setsA = 0, setsB = 0;
    const rowsA = document.querySelectorAll('.set-a');
    const rowsB = document.querySelectorAll('.set-b');

    for(let i=0; i<5; i++) {
        const valA = parseInt(rowsA[i].value);
        const valB = parseInt(rowsB[i].value);
        if(!isNaN(valA) && !isNaN(valB)) {
            if(valA > valB) setsA++;
            if(valB > valA) setsB++;
        }
    }
    const box = document.getElementById('live-uitslag-box');
    if(box) {
        if (setsA === 0 && setsB === 0) box.innerText = 'Voer setstanden in...';
        else if (setsA === 3 || setsB === 3) box.innerText = `${setsA > setsB ? naamA : naamB} wint met ${setsA} - ${setsB}`;
        else box.innerText = `Tussenstand: ${setsA} - ${setsB}`;
    }
}

async function saveWedstrijd(e) {
    e.preventDefault();
    selecteerSpelerUitZoekveld('A');
    selecteerSpelerUitZoekveld('B');
    const spelerAId = document.getElementById('w-spelerA').value;
    const spelerBId = document.getElementById('w-spelerB').value;

    if(!valideerSpelerSelecties(true)) {
        if(!spelerAId || !spelerBId) return alert('Selecteer voor speler A en speler B een geldige speler uit de lijst.');
        if(spelerAId === spelerBId) return alert('Selecteer twee verschillende spelers.');
    }

    const rowsA = document.querySelectorAll('.set-a');
    const rowsB = document.querySelectorAll('.set-b');
    let sets = [];
    let setsA = 0, setsB = 0;
    let legeSetGezien = false;
    let wedstrijdBeslist = false;

    for(let i=0; i<5; i++) {
        const rawA = rowsA[i].value;
        const rawB = rowsB[i].value;
        const heeftA = rawA !== '';
        const heeftB = rawB !== '';

        if(!heeftA && !heeftB) {
            legeSetGezien = true;
            continue;
        }

        if(heeftA !== heeftB) return alert(`Vul bij set ${i + 1} beide scores in.`);
        if(legeSetGezien) return alert('Laat geen lege set tussen ingevulde setstanden staan.');
        if(wedstrijdBeslist) return alert('Er zijn setstanden ingevuld nadat de wedstrijd al beslist was. Controleer de setstanden.');

        const a = parseInt(rawA);
        const b = parseInt(rawB);
        if(isNaN(a) || isNaN(b) || a < 0 || b < 0) return alert(`Set ${i + 1} bevat geen geldige stand.`);
        if(a === b) return alert(`Set ${i + 1} kan niet gelijk eindigen.`);

        sets.push({a, b});
        if(a > b) setsA++;
        if(b > a) setsB++;

        if(setsA === 3 || setsB === 3) wedstrijdBeslist = true;
    }

    if(sets.length === 0) return alert('Vul de setstanden in.');
    if(setsA !== 3 && setsB !== 3) return alert('Opslaan kan pas wanneer één speler drie sets heeft gewonnen.');
    if(setsA === 3 && setsB === 3) return alert('Controleer de setstanden: beide spelers kunnen niet drie sets winnen.');

    const winnaarId = setsA > setsB ? spelerAId : spelerBId;
    const type = document.getElementById('w-type').value;
    const actieveComp = appData.competities.find(c => c.status === 'Actief' && c.type === type) || { id: 'algemeen' };
    const setStrings = sets.map(s => `${s.a}-${s.b}`).join(', ');

    const payload = {
        competitieId: actieveComp.id,
        spelerAId, spelerBId, sets,
        uitslag: `${setsA} - ${setsB}`,
        setstanden: setStrings,
        winnaarId, type,
        gekozenDatum: document.getElementById('w-datum').value
    };

    const isWijzigen = Boolean(bewerkWedstrijdId);
    const url = isWijzigen ? `/api/wedstrijden/${bewerkWedstrijdId}` : '/api/wedstrijden';
    const methode = isWijzigen ? 'PUT' : 'POST';

    const res = await fetch(url, {
        method: methode,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });

    if(res.ok) {
        alert(isWijzigen ? 'Wedstrijd succesvol aangepast!' : 'Wedstrijd succesvol opgeslagen!');
        resetWedstrijdFormNaOpslaan();
        laadData();
        switchView('dashboard');
    } else {
        const err = await res.json();
        alert('Fout: ' + err.error);
    }
}

function resetWedstrijdFormNaOpslaan() {
    document.getElementById('wedstrijd-form').reset();
    const typeSelect = document.getElementById('w-type');
    if(typeSelect) typeSelect.value = 'Senioren';
    bewerkWedstrijdId = null;
    const editInput = document.getElementById('edit-wedstrijd-id');
    if(editInput) editInput.value = '';
    const status = document.getElementById('wedstrijd-edit-status');
    if(status) {
        status.style.display = 'none';
        status.innerText = '';
    }
    const submitBtn = document.getElementById('wedstrijd-submit-btn');
    if(submitBtn) submitBtn.innerText = 'Wedstrijd opslaan en bevestigen';
    const annuleerBtn = document.getElementById('wedstrijd-annuleer-btn');
    if(annuleerBtn) annuleerBtn.style.display = 'none';
    wisselInvoerTab('Senioren');
    wisGeselecteerdeSpelers();
}

function bouwWedstrijdRij(w) {
    const naamA = naamWedstrijd(w.spelerAId, w.winnaarId);
    const naamB = naamWedstrijd(w.spelerBId, w.winnaarId);

    return `<tr>
        <td class="datum-cel">${formatDatum(w.datum)}</td>
        <td class="wedstrijd-cel"><span class="wedstrijd-speler">${naamA} <span class="mobiel-streep">-</span></span><span class="desktop-separator"> - </span><span class="wedstrijd-speler">${naamB}</span></td>
        <td class="uitslag-cel"><strong>${w.uitslag}</strong> <span class="set-klein">(${w.setstanden || ''})</span></td>
    </tr>`;
}

function bouwHistorieRij(w) {
    const naamA = naamWedstrijd(w.spelerAId, w.winnaarId);
    const naamB = naamWedstrijd(w.spelerBId, w.winnaarId);
    const puntenCombi = formatPuntenCombinatie(w.puntenMutatieA, w.puntenMutatieB);

    return `<tr>
        <td class="datum-cel">${formatDatum(w.datum)}</td>
        <td class="wedstrijd-cel"><span class="wedstrijd-speler">${naamA}</span><span class="desktop-separator"> - </span><span class="wedstrijd-speler">${naamB}</span> ${puntenCombi}</td>
        <td class="uitslag-cel"><strong>${w.uitslag}</strong> <span class="set-klein">(${w.setstanden || ''})</span></td>
        <td>
            <div class="actie-knoppen">
                <button class="btn btn-sm btn-warning" title="Wedstrijd wijzigen" aria-label="Wedstrijd wijzigen" onclick="bewerkWedstrijd('${w.id}')"><i class="fa-solid fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" title="Wedstrijd verwijderen" aria-label="Wedstrijd verwijderen" onclick="verwijderWedstrijd('${w.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </td>
    </tr>`;
}

function laadHistorie(type) {
    const tbody = document.getElementById('historie-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    const gefilterd = appData.wedstrijden.filter(w => w.type === type);
    gefilterd.forEach(w => tbody.innerHTML += bouwHistorieRij(w));
}

function laadWedstrijdenDashboard(type) {
    const top5body = document.getElementById('dash-top5-table-body');
    if(!top5body) return;

    const alleGesorteerdeSpelers = appData.spelers
        .filter(s => s.type === type && s.actief)
        .sort((a, b) => b.punten - a.punten || b.elo - a.elo || a.naam.localeCompare(b.naam));
    top5body.innerHTML = genereerRanglijstTabelRijen(alleGesorteerdeSpelers.slice(0, 10));

    const tbody = document.getElementById('dash-wedstrijden-table').querySelector('tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    const gefilterd = appData.wedstrijden.filter(w => w.type === type).slice(0, 10);
    gefilterd.forEach(w => tbody.innerHTML += bouwWedstrijdRij(w));
}


function zetZoekveldSpeler(zijde, spelerId) {
    const speler = appData.spelers.find(s => s.id === spelerId);
    const zoekInput = document.getElementById(`w-speler${zijde}-zoek`);
    const verborgenInput = document.getElementById(`w-speler${zijde}`);
    if(zoekInput) zoekInput.value = speler ? spelerOptieLabel(speler) : '';
    if(verborgenInput) verborgenInput.value = spelerId || '';
    updateSpelerSelectieStatus(zijde);
}

function bewerkWedstrijd(wedstrijdId) {
    const w = appData.wedstrijden.find(wedstrijd => wedstrijd.id === wedstrijdId);
    if(!w) return alert('Wedstrijd niet gevonden.');

    bewerkWedstrijdId = wedstrijdId;
    document.getElementById('edit-wedstrijd-id').value = wedstrijdId;
    document.getElementById('w-datum').value = w.datum;
    wisselInvoerTab(w.type || 'Senioren');
    zetZoekveldSpeler('A', w.spelerAId);
    zetZoekveldSpeler('B', w.spelerBId);

    const rowsA = document.querySelectorAll('.set-a');
    const rowsB = document.querySelectorAll('.set-b');
    rowsA.forEach(input => input.value = '');
    rowsB.forEach(input => input.value = '');
    (w.sets || []).forEach((set, index) => {
        if(rowsA[index]) rowsA[index].value = set.a;
        if(rowsB[index]) rowsB[index].value = set.b;
    });

    const status = document.getElementById('wedstrijd-edit-status');
    if(status) {
        status.innerText = `Je wijzigt de wedstrijd van ${formatDatum(w.datum)}: ${getSpelerNaam(w.spelerAId)} - ${getSpelerNaam(w.spelerBId)}.`;
        status.style.display = 'block';
    }
    const submitBtn = document.getElementById('wedstrijd-submit-btn');
    if(submitBtn) submitBtn.innerText = 'Wijziging opslaan';
    const annuleerBtn = document.getElementById('wedstrijd-annuleer-btn');
    if(annuleerBtn) annuleerBtn.style.display = 'block';

    updateLiveUitslag();
    switchView('invoeren');
}

function annuleerWedstrijdEdit() {
    bewerkWedstrijdId = null;
    const editInput = document.getElementById('edit-wedstrijd-id');
    if(editInput) editInput.value = '';
    const status = document.getElementById('wedstrijd-edit-status');
    if(status) {
        status.style.display = 'none';
        status.innerText = '';
    }
    const submitBtn = document.getElementById('wedstrijd-submit-btn');
    if(submitBtn) submitBtn.innerText = 'Wedstrijd opslaan en bevestigen';
    const annuleerBtn = document.getElementById('wedstrijd-annuleer-btn');
    if(annuleerBtn) annuleerBtn.style.display = 'none';
    document.getElementById('wedstrijd-form').reset();
    wisselInvoerTab('Senioren');
    wisGeselecteerdeSpelers();
}

async function verwijderWedstrijd(wedstrijdId) {
    const w = appData.wedstrijden.find(wedstrijd => wedstrijd.id === wedstrijdId);
    if(!w) return alert('Wedstrijd niet gevonden.');

    const tekst = `Weet je zeker dat je deze wedstrijd wilt verwijderen?\n\n${formatDatum(w.datum)}: ${getSpelerNaam(w.spelerAId)} - ${getSpelerNaam(w.spelerBId)} (${w.uitslag})`;
    if(!confirm(tekst)) return;

    const res = await fetch(`/api/wedstrijden/${wedstrijdId}`, { method: 'DELETE' });
    if(res.ok) {
        alert('Wedstrijd verwijderd. De opgeslagen puntenmutatie is teruggedraaid.');
        laadData();
    } else {
        const err = await res.json();
        alert('Fout: ' + err.error);
    }
}

function toonSpelerHistorie(spelerId) {
    huidigeSpelerHistorieId = spelerId;
    const speler = appData.spelers.find(s => s.id === spelerId);
    if (speler) geselecteerdSpelerHistorieType = speler.type;
    document.getElementById('speler-historie-modal').style.display = 'flex';
    renderSpelerHistorie();
}

function sluitSpelerHistorie() {
    document.getElementById('speler-historie-modal').style.display = 'none';
    huidigeSpelerHistorieId = null;
}

function sluitSpelerHistorieExtern(e) {
    if(e.target.id === 'speler-historie-modal') sluitSpelerHistorie();
}

function renderSpelerHistorie() {
    if (!huidigeSpelerHistorieId) return;

    document.getElementById('tab-spelerhist-senioren').classList.toggle('active', geselecteerdSpelerHistorieType === 'Senioren');
    document.getElementById('tab-spelerhist-jeugd').classList.toggle('active', geselecteerdSpelerHistorieType === 'Jeugd');

    const speler = appData.spelers.find(s => s.id === huidigeSpelerHistorieId);
    const titel = document.getElementById('speler-historie-titel');
    const info = document.getElementById('speler-historie-info');
    const tbody = document.getElementById('speler-historie-body');

    if (!speler) {
        titel.innerText = 'Wedstrijdhistorie';
        info.innerText = 'Speler niet gevonden.';
        tbody.innerHTML = '';
        return;
    }

    titel.innerText = `Wedstrijdhistorie van ${speler.naam}`;
    info.innerText = `Actuele ranglijst: ${speler.punten} punten | ELO: ${speler.elo} | Gekozen ladder: ${geselecteerdSpelerHistorieType}`;

    const wedstrijden = appData.wedstrijden.filter(w =>
        w.type === geselecteerdSpelerHistorieType &&
        (w.spelerAId === huidigeSpelerHistorieId || w.spelerBId === huidigeSpelerHistorieId)
    );

    if (wedstrijden.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6">Geen wedstrijden gevonden voor deze speler binnen deze ladder.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    wedstrijden.forEach(w => {
        const isA = w.spelerAId === huidigeSpelerHistorieId;
        const tegenstanderId = isA ? w.spelerBId : w.spelerAId;
        const gewonnen = w.winnaarId === huidigeSpelerHistorieId;
        const wv = gewonnen ? 'W' : 'V';
        const uitslagVoorSpeler = isA ? w.uitslag : keerUitslagOm(w.uitslag);
        const mutatie = getPuntenMutatie(w, huidigeSpelerHistorieId);

        tbody.innerHTML += `<tr>
            <td class="datum-cel">${formatDatum(w.datum)}</td>
            <td>${w.week}</td>
            <td>${getSpelerNaam(tegenstanderId)}</td>
            <td class="uitslag-cel"><strong>${uitslagVoorSpeler}</strong> <span class="set-klein">${w.setstanden || ''}</span></td>
            <td class="wv-cel">${wv}</td>
            <td>${formatPunten(mutatie)}</td>
        </tr>`;
    });
}


function maakSpelerHistorieWhatsappTekst() {
    if(!huidigeSpelerHistorieId) return '';
    const speler = appData.spelers.find(s => s.id === huidigeSpelerHistorieId);
    if(!speler) return '';

    const regels = [
        `Wedstrijdhistorie ${speler.naam}`,
        `${geselecteerdSpelerHistorieType}ladder`,
        `Actuele ranglijst: ${speler.punten} punten | ELO: ${speler.elo}`,
        ''
    ];

    const wedstrijden = appData.wedstrijden.filter(w =>
        w.type === geselecteerdSpelerHistorieType &&
        (w.spelerAId === huidigeSpelerHistorieId || w.spelerBId === huidigeSpelerHistorieId)
    );

    if(wedstrijden.length === 0) {
        regels.push('Geen wedstrijden gevonden.');
        return regels.join('\n');
    }

    wedstrijden.forEach(w => {
        const isA = w.spelerAId === huidigeSpelerHistorieId;
        const tegenstanderId = isA ? w.spelerBId : w.spelerAId;
        const gewonnen = w.winnaarId === huidigeSpelerHistorieId;
        const wv = gewonnen ? 'W' : 'V';
        const uitslagVoorSpeler = isA ? w.uitslag : keerUitslagOm(w.uitslag);
        const mutatie = getPuntenMutatie(w, huidigeSpelerHistorieId);
        regels.push(`${formatDatum(w.datum)} | ${getSpelerNaam(tegenstanderId)} | ${uitslagVoorSpeler} | ${wv} | ${formatPuntenTekst(mutatie)} punt(en)`);
    });

    return regels.join('\n');
}

function deelSpelerHistorieViaWhatsapp() {
    const tekst = maakSpelerHistorieWhatsappTekst();
    if(!tekst) return alert('Geen spelerhistorie beschikbaar om te delen.');
    window.open(`https://wa.me/?text=${encodeURIComponent(tekst)}`, '_blank');
}

function keerUitslagOm(uitslag) {
    if(!uitslag) return '';
    const delen = uitslag.split('-').map(d => d.trim());
    if(delen.length !== 2) return uitslag;
    return `${delen[1]} - ${delen[0]}`;
}


function getGesorteerdeSpelers(type) {
    return appData.spelers
        .filter(s => s.type === type && s.actief)
        .sort((a, b) => b.punten - a.punten || b.elo - a.elo || a.naam.localeCompare(b.naam));
}

function getOverzichtDatum() {
    const veld = document.getElementById('overzicht-datum');
    return veld && veld.value ? veld.value : getLokaleDatumVandaag();
}

function maakStandRijenVoorPrint(type) {
    const spelers = getGesorteerdeSpelers(type);
    if(spelers.length === 0) return '<tr><td colspan="4">Geen actieve spelers gevonden.</td></tr>';
    return spelers.map((s, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(s.naam)}</td>
            <td class="num">${s.punten}</td>
            <td class="num">${s.elo}</td>
        </tr>
    `).join('');
}

function maakWedstrijdRijenVoorPrint(type, weeknummer) {
    const wedstrijden = appData.wedstrijden.filter(w => w.type === type && Number(w.week) === Number(weeknummer));
    if(wedstrijden.length === 0) return '<tr><td colspan="4">Geen wedstrijden gevonden voor deze week.</td></tr>';

    return wedstrijden.map(w => {
        const naamA = `${escapeHtml(getSpelerNaam(w.spelerAId))}${w.winnaarId === w.spelerAId ? ' *' : ''}`;
        const naamB = `${escapeHtml(getSpelerNaam(w.spelerBId))}${w.winnaarId === w.spelerBId ? ' *' : ''}`;
        const punten = (w.puntenMutatieA === undefined || w.puntenMutatieB === undefined) ? '' : ` (${formatPuntenTekst(w.puntenMutatieA)}/${formatPuntenTekst(w.puntenMutatieB)})`;
        return `
            <tr>
                <td>${formatDatum(w.datum)}</td>
                <td>${naamA} - ${naamB}${punten}</td>
                <td><strong>${escapeHtml(w.uitslag)}</strong></td>
                <td>${escapeHtml(w.setstanden || '')}</td>
            </tr>
        `;
    }).join('');
}

function printOverzicht(type) {
    const datum = getOverzichtDatum();
    const weeknummer = bepaalISOWeeknummer(datum);
    const titel = `${type}ladder`;
    const printVenster = window.open('', '_blank');
    if(!printVenster) {
        alert('Pop-up geblokkeerd. Sta pop-ups toe om het overzicht te printen.');
        return;
    }

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
    <meta charset="UTF-8">
    <title>${titel} - Week ${weeknummer}</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #222; margin: 28px; }
        h1 { color: #0a3d82; margin-bottom: 4px; }
        h2 { margin-top: 26px; color: #0a3d82; }
        .meta { color: #555; margin-bottom: 22px; line-height: 1.5; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; vertical-align: top; }
        th { background: #f2f4f7; }
        .num { text-align: right; }
        .page-break { page-break-before: always; break-before: page; }
        .klein { font-size: 12px; color: #555; margin-top: 12px; }
        @media print { body { margin: 16mm; } }
    </style>
</head>
<body>
    <h1>TTV Het Nootwheer</h1>
    <div class="meta">
        <strong>${titel}</strong><br>
        Week ${weeknummer}<br>
        Overzichtdatum: ${formatDatum(datum)}<br>
        Gegenereerd op: ${formatDatum(getLokaleDatumVandaag())}
    </div>

    <h2>Huidige stand</h2>
    <table>
        <thead><tr><th style="width:80px;">Positie</th><th>Naam</th><th style="width:90px;">Punten</th><th style="width:90px;">ELO</th></tr></thead>
        <tbody>${maakStandRijenVoorPrint(type)}</tbody>
    </table>

    <div class="page-break"></div>
    <h1>TTV Het Nootwheer</h1>
    <div class="meta"><strong>${titel}</strong><br>Gespeelde wedstrijden week ${weeknummer}</div>

    <table>
        <thead><tr><th style="width:110px;">Datum</th><th>Wedstrijd</th><th style="width:80px;">Uitslag</th><th>Setstanden</th></tr></thead>
        <tbody>${maakWedstrijdRijenVoorPrint(type, weeknummer)}</tbody>
    </table>
    <div class="klein">* = winnaar. Punten tussen haakjes staan in de volgorde speler A / speler B.</div>
    <script>
        window.onload = function() { window.print(); };
    <\/script>
</body>
</html>`;

    printVenster.document.open();
    printVenster.document.write(html);
    printVenster.document.close();
}

function maakWhatsappStandTekst(type) {
    const datum = getOverzichtDatum();
    const weeknummer = bepaalISOWeeknummer(datum);
    const regels = [`Ranglijst ${type}ladder - week ${weeknummer}`, `Overzichtdatum: ${formatDatum(datum)}`, ''];
    getGesorteerdeSpelers(type).forEach((s, index) => {
        regels.push(`${index + 1}. ${s.naam} - ${s.punten} punten`);
    });
    return regels.join('\n');
}

function deelStandViaWhatsapp(type) {
    const tekst = encodeURIComponent(maakWhatsappStandTekst(type));
    window.open(`https://wa.me/?text=${tekst}`, '_blank');
}

function deelZichtbareRanglijstViaWhatsapp() {
    deelStandViaWhatsapp(geselecteerdRanglijstType);
}

function maakWhatsappHistorieTekst(type) {
    const wedstrijden = appData.wedstrijden.filter(w => w.type === type);
    const regels = [`Wedstrijdhistorie ${type}ladder`, ''];

    if(wedstrijden.length === 0) {
        regels.push('Geen wedstrijden gevonden.');
        return regels.join('\n');
    }

    wedstrijden.forEach(w => {
        const spelerA = naamSpeler(w.spelerAId);
        const spelerB = naamSpeler(w.spelerBId);
        const punten = formatPuntenCombinatie(w.puntenMutatieA, w.puntenMutatieB).replace(/<[^>]*>/g, '');
        regels.push(`${formatDatum(w.datum)}: ${spelerA} - ${spelerB} ${punten}`.trim());
        regels.push(`Uitslag: ${w.uitslag} (${w.setstanden || '-'})`);
        regels.push('');
    });

    return regels.join('\n').trim();
}

function deelZichtbareHistorieViaWhatsapp() {
    const tekst = encodeURIComponent(maakWhatsappHistorieTekst(geselecteerdHistorieType));
    window.open(`https://wa.me/?text=${tekst}`, '_blank');
}

function wisselSpelerFormType(type) {
    const spelerType = document.getElementById('speler-type');
    if(spelerType) spelerType.value = type;

    const tabSenioren = document.getElementById('tab-speler-form-senioren');
    const tabJeugd = document.getElementById('tab-speler-form-jeugd');
    if(tabSenioren) tabSenioren.classList.toggle('active', type === 'Senioren');
    if(tabJeugd) tabJeugd.classList.toggle('active', type === 'Jeugd');
}

function laadBeheerTabellen() {
    const spelerTbody = document.getElementById('beheer-spelers-table-body');
    if(!spelerTbody) return;

    const tabSenioren = document.getElementById('tab-beheer-spelers-senioren');
    const tabJeugd = document.getElementById('tab-beheer-spelers-jeugd');
    if(tabSenioren) tabSenioren.classList.toggle('active', geselecteerdBeheerSpelersType === 'Senioren');
    if(tabJeugd) tabJeugd.classList.toggle('active', geselecteerdBeheerSpelersType === 'Jeugd');

    const titel = document.getElementById('beheer-spelers-lijst-titel');
    if(titel) titel.innerText = `Actuele ${geselecteerdBeheerSpelersType} Spelerslijst (Alfabetisch op Naam)`;

    spelerTbody.innerHTML = '';
    
    const alfabetischeSpelers = [...appData.spelers]
        .filter(s => s.actief && s.type === geselecteerdBeheerSpelersType)
        .sort((a, b) => a.naam.localeCompare(b.naam));

    alfabetischeSpelers.forEach(s => {
        spelerTbody.innerHTML += `<tr>
            <td>${s.naam}</td><td class="punten-cel">${s.punten}</td><td>${s.elo}</td>
            <td>
                <button class="btn btn-sm" onclick="startEditSpeler('${s.id}', '${escapeVoorOnclick(s.naam)}', '${s.type}', ${s.elo}, ${s.punten})"><i class="fa-solid fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="verwijderSpeler('${s.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });

    const compTbody = document.getElementById('beheer-comp-table-body');
    if(!compTbody) return;
    compTbody.innerHTML = '';
    appData.competities.forEach(c => {
        compTbody.innerHTML += `<tr>
            <td>${c.naam}</td><td>${c.type}</td>
            <td><span class="badge ${c.status === 'Actief' ? 'badge-active' : 'badge-archived'}">${c.status}</span></td>
            <td>
                <button class="btn btn-sm" title="Competitienaam wijzigen" aria-label="Competitienaam wijzigen" onclick="wijzigCompetitieNaam('${c.id}', '${escapeVoorOnclick(c.naam)}')"><i class="fa-solid fa-edit"></i></button>
                <button class="btn btn-sm" title="Punten resetten" aria-label="Punten resetten" style="background:#666;" onclick="beheerActie('reset-punten', '${c.id}')"><i class="fa-solid fa-undo"></i></button>
                <button class="btn btn-sm btn-danger" title="Competitie verwijderen" aria-label="Competitie verwijderen" onclick="verwijderCompetitie('${c.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
    });

    const adminLijst = document.getElementById('beheerders-lijst');
    if(!adminLijst) return;
    adminLijst.innerHTML = '';
    if(appData.beheerders) {
        appData.beheerders.forEach(b => {
            adminLijst.innerHTML += `<li style="margin-bottom:5px; display:flex; justify-content:space-between; background:#f4f6f9; padding:5px 10px; border-radius:4px;">
                <span><i class="fa-solid fa-user-lock"></i> ${b.username}</span>
                ${b.username !== 'admin' ? `<button class="btn btn-danger btn-sm" style="padding:2px 6px;" onclick="verwijderBeheerder('${b.username}')"><i class="fa-solid fa-times"></i></button>` : ''}
            </li>`;
        });
    }
}

async function saveSpeler() {
    const id = document.getElementById('edit-speler-id').value;
    const naam = document.getElementById('speler-naam').value;
    const type = document.getElementById('speler-type').value;
    const punten = document.getElementById('speler-punten').value;
    const elo = document.getElementById('speler-elo').value;
    if(!naam) return alert('Vul een naam in.');

    await fetch('/api/competities/actie', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ actie: id ? 'speler-wijzig' : 'speler-nieuw', extra: { id, naam, type, elo: parseInt(elo), punten: parseInt(punten) } })
    });
    annuleerSpelerEdit();
    laadData();
}

function startEditSpeler(id, naam, type, elo, punten) {
    document.getElementById('speler-form-titel').innerText = 'Speler & Punten Wijzigen';
    document.getElementById('edit-speler-id').value = id;
    document.getElementById('speler-naam').value = naam;
    document.getElementById('speler-type').value = type;
    wisselSpelerFormType(type);
    document.getElementById('speler-punten').value = punten;
    document.getElementById('speler-elo').value = elo;
    document.getElementById('btn-speler-annuleren').style.display = 'inline-block';
    switchView('beheer-spelers');
}

function annuleerSpelerEdit() {
    document.getElementById('speler-form-titel').innerText = 'Nieuwe Speler Toevoegen';
    document.getElementById('edit-speler-id').value = '';
    document.getElementById('speler-naam').value = '';
    wisselSpelerFormType(geselecteerdBeheerSpelersType || 'Senioren');
    document.getElementById('speler-punten').value = 0;
    document.getElementById('speler-elo').value = 1500;
    document.getElementById('btn-speler-annuleren').style.display = 'none';
}

async function verwijderSpeler(id) {
    if(!confirm('Weet je zeker dat je deze speler wilt verwijderen?')) return;
    await fetch('/api/competities/actie', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ actie: 'speler-verwijder', extra: { id } }) });
    laadData();
}

async function verwijderCompetitie(id) {
    if(!confirm('Weet je zeker dat je deze competitie VOLLEDIG wilt wissen?')) return;
    await fetch('/api/competities/actie', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ actie: 'competitie-verwijder', competitieId: id }) });
    laadData();
}

async function voegBeheerderToe() {
    const user = document.getElementById('new-admin-user').value;
    const pass = document.getElementById('new-admin-pass').value;
    if(!user || !pass) return alert('Vul gebruikersnaam én wachtwoord in.');
    
    await fetch('/api/competities/actie', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ actie: 'beheerder-nieuw', extra: { user, pass } }) });
    document.getElementById('new-admin-user').value = '';
    document.getElementById('new-admin-pass').value = '';
    laadData();
}

async function verwijderBeheerder(username) {
    if(!confirm(`Beheerder account ${username} wissen?`)) return;
    await fetch('/api/competities/actie', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ actie: 'beheerder-verwijder', extra: { user: username } }) });
    laadData();
}

function wisselCompetitieFormType(type) {
    geselecteerdCompetitieFormType = type;
    const compType = document.getElementById('new-comp-type');
    if(compType) compType.value = type;

    const tabSenioren = document.getElementById('tab-comp-form-senioren');
    const tabJeugd = document.getElementById('tab-comp-form-jeugd');
    if(tabSenioren) tabSenioren.classList.toggle('active', type === 'Senioren');
    if(tabJeugd) tabJeugd.classList.toggle('active', type === 'Jeugd');
}

async function wijzigCompetitieNaam(compId, huidigeNaam) {
    const nieuweNaam = prompt('Nieuwe naam / omschrijving van de competitie:', huidigeNaam || '');
    if(nieuweNaam === null) return;
    const naam = nieuweNaam.trim();
    if(!naam) return alert('Voer een naam in.');

    const res = await fetch('/api/competities/actie', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ actie: 'competitie-wijzig-naam', competitieId: compId, extra: { naam } })
    });

    if(!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Onbekende fout.' }));
        return alert('Fout: ' + err.error);
    }

    alert('Competitienaam opgeslagen.');
    await laadData();
}

async function beheerActie(actie, compId = '') {
    let extra = {};
    if(actie === 'nieuw') {
        extra.naam = document.getElementById('new-comp-naam').value;
        extra.type = document.getElementById('new-comp-type')?.value || geselecteerdCompetitieFormType || 'Senioren';
        if(!extra.naam) return alert('Voer een naam in.');
    }
    await fetch('/api/competities/actie', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ actie, competitieId: compId, extra }) });
    alert('Actie succesvol uitgevoerd!');
    laadData();
}

window.onload = () => { document.getElementById('login-screen').style.display = 'flex'; };
