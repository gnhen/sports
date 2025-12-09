// --- CONFIG ---
const ALL_APIS = [
    { id: 'nfl', name: 'NFL', url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard' },
    { id: 'ncaaf', name: 'NCAA Football', url: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard' },
    { id: 'ncaam', name: 'NCAA Men\'s BB', url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard' },
    { id: 'nba', name: 'NBA', url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' },
    { id: 'nhl', name: 'NHL', url: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard' },
    { id: 'mlb', name: 'MLB', url: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard' }
];

// --- STATE ---
let activeLeagues = JSON.parse(localStorage.getItem('activeLeagues')) || ['nfl', 'ncaaf', 'ncaam', 'nba'];
let currentDate = new Date();
let allGames = [];
let showAll = false;

// --- DOM ELEMENTS ---
const mainContainer = document.getElementById('main-container');
const loadingDiv = document.getElementById('loading');
const dateDisplay = document.getElementById('date-display');
const showAllBtn = document.getElementById('show-all-btn');
const modal = document.getElementById('league-modal');
const leagueList = document.getElementById('league-list');

// --- INITIALIZATION ---
updateDateDisplay();
setupLeagueModal();
fetchSportsData();

// --- EVENT LISTENERS ---
document.getElementById('prev-day').onclick = () => changeDate(-1);
document.getElementById('next-day').onclick = () => changeDate(1);

showAllBtn.onclick = () => {
    showAll = !showAll;
    showAllBtn.classList.toggle('active', showAll);
    renderByLeague();
};

document.getElementById('leagues-btn').onclick = () => modal.style.display = 'flex';
document.getElementById('close-modal').onclick = () => {
    modal.style.display = 'none';
    fetchSportsData();
};

// --- LOGIC FUNCTIONS ---

function changeDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    updateDateDisplay();
    fetchSportsData();
}

function updateDateDisplay() {
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const dString = currentDate.toDateString();

    if (dString === today.toDateString()) dateDisplay.innerText = "Today";
    else if (dString === tomorrow.toDateString()) dateDisplay.innerText = "Tomorrow";
    else if (dString === yesterday.toDateString()) dateDisplay.innerText = "Yesterday";
    else dateDisplay.innerText = currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function setupLeagueModal() {
    leagueList.innerHTML = '';
    ALL_APIS.forEach(api => {
        const isChecked = activeLeagues.includes(api.id) ? 'checked' : '';
        const item = document.createElement('label');
        item.className = 'checkbox-item';
        item.innerHTML = `<input type="checkbox" value="${api.id}" ${isChecked}><span>${api.name}</span>`;
        item.querySelector('input').addEventListener('change', (e) => {
            if(e.target.checked) { if(!activeLeagues.includes(api.id)) activeLeagues.push(api.id); } 
            else { activeLeagues = activeLeagues.filter(id => id !== api.id); }
            localStorage.setItem('activeLeagues', JSON.stringify(activeLeagues));
        });
        leagueList.appendChild(item);
    });
}

async function fetchSportsData() {
    mainContainer.innerHTML = '';
    loadingDiv.style.display = 'block';
    allGames = [];

    // --- FIX: Use Local Time instead of ISO (UTC) ---
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`; 
    // -----------------------------------------------

    const activeAPIs = ALL_APIS.filter(api => activeLeagues.includes(api.id));

    if (activeAPIs.length === 0) { loadingDiv.innerText = "No leagues selected."; return; }

    try {
        const promises = activeAPIs.map(api => 
            fetch(`${api.url}?dates=${dateStr}`)
                .then(res => res.json())
                .then(data => ({...data, leagueId: api.id, leagueName: api.name}))
                .catch(() => null)
        );
        
        const results = await Promise.all(promises);

        results.forEach(leagueData => {
            if(leagueData && leagueData.events) {
                leagueData.events.forEach(event => {
                    const game = processGameData(event, leagueData.leagueId, leagueData.leagueName);
                    // Only push if dates match (filters out bad API returns)
                    if (isSameDate(game.date, currentDate)) {
                        allGames.push(game);
                    }
                });
            }
        });
        renderByLeague();
    } catch (error) {
        console.error(error);
        mainContainer.innerHTML = '<div style="text-align:center">Error loading data.</div>';
    } finally {
        loadingDiv.style.display = 'none';
    }
}

function processGameData(event, leagueId, leagueName) {
    const comp = event.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    
    // Safety check for rankings
    const homeRank = (home.curatedRank && home.curatedRank.current < 99) ? home.curatedRank.current : null;
    const awayRank = (away.curatedRank && away.curatedRank.current < 99) ? away.curatedRank.current : null;

    return {
        id: event.id,
        leagueId: leagueId,
        leagueName: leagueName,
        date: new Date(event.date),
        statusState: event.status.type.state,
        statusDetail: event.status.type.detail,
        network: comp.broadcasts?.[0]?.names?.[0] || "",
        home: { 
            name: home.team.abbreviation, 
            logo: home.team.logo, 
            score: home.score, 
            rank: homeRank 
        },
        away: { 
            name: away.team.abbreviation, 
            logo: away.team.logo, 
            score: away.score, 
            rank: awayRank 
        }
    };
}

function isSameDate(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() && 
           d1.getMonth() === d2.getMonth() && 
           d1.getDate() === d2.getDate();
}

// --- RENDER LOGIC (GROUPED BY SPORT) ---
function renderByLeague() {
    mainContainer.innerHTML = '';
    
    if (allGames.length === 0) {
        mainContainer.innerHTML = '<div style="text-align:center;color:#666;margin-top:20px">No games scheduled today.<br>Try "Show Unranked" or check "Leagues".</div>';
        return;
    }

    ALL_APIS.forEach(api => {
        if (!activeLeagues.includes(api.id)) return;

        let leagueGames = allGames.filter(g => g.leagueId === api.id);

        const visibleGames = leagueGames.filter(game => {
            if (showAll) return true;
            if (['nfl', 'nba', 'nhl', 'mlb'].includes(api.id)) return true;
            return (game.home.rank <= 25 || game.away.rank <= 25);
        });

        if (visibleGames.length === 0) return;

        visibleGames.sort((a, b) => {
            if (a.statusState === 'in' && b.statusState !== 'in') return -1;
            if (b.statusState === 'in' && a.statusState !== 'in') return 1;
            return a.date - b.date;
        });

        const section = document.createElement('div');
        section.className = 'league-section';
        
        const header = document.createElement('div');
        header.className = `league-header header-${api.id}`;
        header.innerHTML = `<span>${api.name}</span>`;
        
        const grid = document.createElement('div');
        grid.className = 'league-grid';

        visibleGames.forEach(game => {
            const card = document.createElement('div');
            card.className = 'game-card';
            
            const timeStr = game.date.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'});
            const isLive = game.statusState === 'in';
            const isFinal = game.statusState === 'post';

            let statusHtml = `<span>${game.statusDetail}</span>`;
            if(isLive) statusHtml = `<span class="status-text live"><span class="live-dot"></span>${game.statusDetail}</span>`;
            else if (!isFinal) statusHtml = `<span>${timeStr}</span>`;

            card.innerHTML = `
                ${game.network ? `<span class="channel-badge">${game.network}</span>` : '<span style="height:20px"></span>'}
                
                <div>
                    <div class="team-row">
                        <div class="team-info">
                            <span class="rank">${game.away.rank || ''}</span>
                            <img src="${game.away.logo}" class="team-logo">
                            <span class="team-name">${game.away.name}</span>
                        </div>
                        <span class="score">${game.away.score}</span>
                    </div>
                    <div class="team-row">
                        <div class="team-info">
                            <span class="rank">${game.home.rank || ''}</span>
                            <img src="${game.home.logo}" class="team-logo">
                            <span class="team-name">${game.home.name}</span>
                        </div>
                        <span class="score">${game.home.score}</span>
                    </div>
                </div>

                <div class="game-status">
                    ${statusHtml}
                    ${isFinal ? '<span>Final</span>' : ''}
                </div>
            `;
            grid.appendChild(card);
        });

        section.appendChild(header);
        section.appendChild(grid);
        mainContainer.appendChild(section);
    });
}
