// --- CONFIG ---
const ALL_APIS = [
    { id: 'nfl', name: 'NFL', url: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard' },
    { id: 'ncaaf', name: 'NCAA Football', url: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard' },
    { id: 'ncaam', name: 'NCAA Men\'s BB', url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard' },
    { id: 'nba', name: 'NBA', url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard' },
    { id: 'wnba', name: 'WNBA', url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard' },
    { id: 'nhl', name: 'NHL', url: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard' },
    { id: 'mlb', name: 'MLB', url: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard' }
];

// --- STATE ---
let activeLeagues = JSON.parse(localStorage.getItem('activeLeagues')) || ['nfl', 'ncaaf', 'ncaam', 'nba'];
let currentDate = new Date();
let allGames = [];
let showAll = false;
let currentView = 'main';
let selectedGameId = null;

// --- DOM ELEMENTS ---
const mainContainer = document.getElementById('main-container');
const loadingDiv = document.getElementById('loading');
const dateDisplay = document.getElementById('date-display');
const datePicker = document.getElementById('date-picker');
const showAllBtn = document.getElementById('show-all-btn');
const modal = document.getElementById('league-modal');
const leagueList = document.getElementById('league-list');
const gameDetail = document.getElementById('game-detail');
const gameDetailContent = document.getElementById('game-detail-content');

// --- INITIALIZATION ---
updateDateDisplay();
setupLeagueModal();
fetchSportsData();

// --- EVENT LISTENERS ---
document.getElementById('prev-day').onclick = () => changeDate(-1);
document.getElementById('next-day').onclick = () => changeDate(1);

document.getElementById('scores-title').onclick = () => {
    currentDate = new Date();
    updateDateDisplay();
    fetchSportsData();
};

dateDisplay.onclick = () => {
    const dateStr = currentDate.toISOString().split('T')[0];
    datePicker.value = dateStr;
    datePicker.showPicker();
};

datePicker.onchange = (e) => {
    if (!e.target.value) {
        currentDate = new Date();
    } else {
        currentDate = new Date(e.target.value + 'T12:00:00');
    }
    updateDateDisplay();
    fetchSportsData();
};

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

document.getElementById('back-btn').onclick = () => {
    currentView = 'main';
    gameDetail.style.display = 'none';
    document.querySelector('.header').style.display = 'block';
    mainContainer.style.display = 'block';
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

    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`; 

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
            if (['nfl', 'nba', 'wnba', 'nhl', 'mlb'].includes(api.id)) return true;
            return (game.home.rank !== null && game.home.rank <= 25) || (game.away.rank !== null && game.away.rank <= 25);
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
            card.style.cursor = 'pointer';
            card.onclick = () => showGameDetail(game);
            
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

// --- GAME DETAIL VIEW ---
async function showGameDetail(game) {
    currentView = 'detail';
    selectedGameId = game.id;
    document.querySelector('.header').style.display = 'none';
    mainContainer.style.display = 'none';
    gameDetail.style.display = 'block';
    
    gameDetailContent.innerHTML = '<div style="text-align:center;padding:40px;">Loading game details...</div>';
    
    try {
        const year = game.date.getFullYear();
        const month = String(game.date.getMonth() + 1).padStart(2, '0');
        const day = String(game.date.getDate()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;
        
        const apiUrl = ALL_APIS.find(api => api.id === game.leagueId).url;
        const response = await fetch(`${apiUrl}?dates=${dateStr}`);
        const data = await response.json();
        
        const fullEvent = data.events.find(e => e.id === game.id);
        if (fullEvent) {
            // Fetch detailed box score
            const boxScoreUrl = `https://site.api.espn.com/apis/site/v2/sports/${getLeaguePath(game.leagueId)}/summary?event=${game.id}`;
            const boxScoreResponse = await fetch(boxScoreUrl);
            const boxScoreData = await boxScoreResponse.json();
            
            renderGameDetail(fullEvent, game, boxScoreData);
        }
    } catch (error) {
        console.error(error);
        gameDetailContent.innerHTML = '<div style="text-align:center;padding:40px;">Error loading game details.</div>';
    }
}

function getLeaguePath(leagueId) {
    const paths = {
        'nfl': 'football/nfl',
        'ncaaf': 'football/college-football',
        'nba': 'basketball/nba',
        'wnba': 'basketball/wnba',
        'ncaam': 'basketball/mens-college-basketball',
        'nhl': 'hockey/nhl',
        'mlb': 'baseball/mlb'
    };
    return paths[leagueId] || '';
}

function renderGameDetail(event, game, boxScoreData) {
    const comp = event.competitions[0];
    const home = comp.competitors.find(c => c.homeAway === 'home');
    const away = comp.competitors.find(c => c.homeAway === 'away');
    
    const isLive = event.status.type.state === 'in';
    const isFinal = event.status.type.state === 'post';
    
    let html = `
        <div class="game-detail-container">
            <div class="game-detail-main">
                <div class="game-detail-teams">
                    <div class="detail-team-row ${!isFinal && away.score > home.score ? 'leading' : ''}">
                        <div class="detail-team-info">
                            <img src="${away.team.logo}" class="detail-team-logo">
                            <div>
                                <div class="detail-team-name">${away.team.displayName}</div>
                                <div class="detail-team-record">${away.records?.[0]?.summary || ''}</div>
                            </div>
                        </div>
                        <div class="detail-score">${away.score}</div>
                    </div>
                    
                    <div class="detail-team-row ${!isFinal && home.score > away.score ? 'leading' : ''}">
                        <div class="detail-team-info">
                            <img src="${home.team.logo}" class="detail-team-logo">
                            <div>
                                <div class="detail-team-name">${home.team.displayName}</div>
                                <div class="detail-team-record">${home.records?.[0]?.summary || ''}</div>
                            </div>
                        </div>
                        <div class="detail-score">${home.score}</div>
                    </div>
                </div>
                
                <div class="detail-status">
                    ${isLive ? `<span class="live-indicator"><span class="live-dot"></span>${event.status.type.detail}</span>` : ''}
                    ${isFinal ? '<span>Final</span>' : ''}
                    ${!isLive && !isFinal ? `<span>${game.date.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</span>` : ''}
                </div>
    `;
    
    // Box Score
    if (away.linescores && away.linescores.length > 0) {
        html += `
                <div class="box-score">
                    <h3>Scoring Summary</h3>
                    <table class="box-score-table">
                        <thead>
                            <tr>
                                <th>Team</th>
                                ${away.linescores.map((_, i) => `<th>${i + 1}</th>`).join('')}
                                <th>T</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${away.team.abbreviation}</td>
                                ${away.linescores.map(ls => `<td>${ls.displayValue || ls.value}</td>`).join('')}
                                <td><strong>${away.score}</strong></td>
                            </tr>
                            <tr>
                                <td>${home.team.abbreviation}</td>
                                ${home.linescores.map(ls => `<td>${ls.displayValue || ls.value}</td>`).join('')}
                                <td><strong>${home.score}</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
        `;
    }
    
    // Team Statistics
    if (boxScoreData?.boxscore?.teams) {
        html += renderTeamStats(boxScoreData.boxscore.teams, away.team.abbreviation, home.team.abbreviation, game.leagueId);
    }
    
    // Player Statistics
    if (boxScoreData?.boxscore?.players) {
        html += renderPlayerStats(boxScoreData.boxscore.players, game.leagueId);
    }
    
    // Live Game Situation (Football)
    if (isLive && comp.situation && game.leagueId.includes('f')) {
        const sit = comp.situation;
        html += `
                <div class="live-situation">
                    <h3>Current Drive</h3>
                    <div class="situation-info">
                        ${sit.possession ? `<p><strong>Possession:</strong> ${comp.competitors.find(c => c.id === sit.possession)?.team.abbreviation || ''}</p>` : ''}
                        ${sit.downDistanceText ? `<p><strong>Down & Distance:</strong> ${sit.downDistanceText}</p>` : ''}
                        ${sit.possessionText ? `<p><strong>Field Position:</strong> ${sit.possessionText}</p>` : ''}
                        ${sit.lastPlay?.text ? `<p><strong>Last Play:</strong> ${sit.lastPlay.text}</p>` : ''}
                    </div>
                </div>
        `;
    }
    
    // Live Leaders (Basketball)
    if (isLive && comp.leaders && comp.leaders.length > 0) {
        html += '<div class="game-leaders"><h3>Game Leaders</h3>';
        comp.leaders.forEach(leader => {
            if (leader.leaders && leader.leaders.length > 0) {
                const l = leader.leaders[0];
                html += `
                    <div class="leader-stat">
                        <strong>${leader.displayName}:</strong> 
                        ${l.athlete.displayName} (${l.displayValue})
                    </div>
                `;
            }
        });
        html += '</div>';
    }
    
    html += '</div><div class="game-detail-sidebar">';
    
    // Game Info
    html += '<div class="game-info-box">';
    if (comp.venue) {
        html += `<p><strong>Venue:</strong> ${comp.venue.fullName}</p>`;
        if (comp.venue.address) {
            html += `<p>${comp.venue.address.city}, ${comp.venue.address.state}</p>`;
        }
    }
    if (comp.broadcasts && comp.broadcasts.length > 0) {
        html += `<p><strong>TV:</strong> ${comp.broadcasts[0].names.join(', ')}</p>`;
    }
    html += `<p><strong>Time:</strong> ${game.date.toLocaleString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit' 
    })}</p>`;
    html += '</div></div></div>';
    
    gameDetailContent.innerHTML = html;
    
    // Add matchup predictor for scheduled games
    if (event.status.type.name === 'STATUS_SCHEDULED' && boxScoreData?.pickcenter) {
        addMatchupPredictor(boxScoreData.pickcenter, comp.competitors, event.status.type.name);
    }
    
    // Add win probability if available
    if (boxScoreData?.winprobability && boxScoreData.winprobability.length > 0) {
        addWinProbability(boxScoreData.winprobability, comp.competitors);
    }
}

function addWinProbability(winProbData, competitors) {
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    
    // Get the latest win probability
    const latestProb = winProbData[winProbData.length - 1];
    const homeWinPct = (latestProb.homeWinPercentage * 100).toFixed(1);
    const awayWinPct = (100 - latestProb.homeWinPercentage * 100).toFixed(1);
    
    const winProbHtml = `
        <div class="game-info-box win-probability">
            <h4 style="margin-top: 0; margin-bottom: 15px;">Win Probability</h4>
            <div class="win-prob-item">
                <div class="win-prob-team">
                    <img src="${away.team.logo}" style="width: 24px; height: 24px; margin-right: 8px;">
                    <span>${away.team.abbreviation}</span>
                </div>
                <div class="win-prob-bar-container">
                    <div class="win-prob-bar" style="width: ${awayWinPct}%"></div>
                </div>
                <span class="win-prob-pct">${awayWinPct}%</span>
            </div>
            <div class="win-prob-item">
                <div class="win-prob-team">
                    <img src="${home.team.logo}" style="width: 24px; height: 24px; margin-right: 8px;">
                    <span>${home.team.abbreviation}</span>
                </div>
                <div class="win-prob-bar-container">
                    <div class="win-prob-bar" style="width: ${homeWinPct}%"></div>
                </div>
                <span class="win-prob-pct">${homeWinPct}%</span>
            </div>
        </div>
    `;
    
    // Insert after game info box
    const sidebar = document.querySelector('.game-detail-sidebar');
    const gameInfoBox = sidebar.querySelector('.game-info-box');
    gameInfoBox.insertAdjacentHTML('afterend', winProbHtml);
}

// Convert moneyline odds to win percentage
function moneylineToWinPct(moneyline) {
    if (moneyline < 0) {
        return (Math.abs(moneyline) / (Math.abs(moneyline) + 100)) * 100;
    } else {
        return (100 / (moneyline + 100)) * 100;
    }
}

// Calculate win percentage from team record
function calculateRecordWinPct(record) {
    if (!record) return null;
    const parts = record.split('-');
    if (parts.length < 2) return null;
    const wins = parseInt(parts[0]);
    const losses = parseInt(parts[1]);
    const total = wins + losses;
    return total > 0 ? (wins / total) * 100 : null;
}

// Add matchup predictor for scheduled games
function addMatchupPredictor(pickcenter, competitors, gameStatus) {
    // Only show for scheduled games (not started yet)
    if (gameStatus !== 'STATUS_SCHEDULED') return;
    
    const homeTeam = competitors.find(c => c.homeAway === 'home');
    const awayTeam = competitors.find(c => c.homeAway === 'away');
    
    let oddsWinPct = null;
    let recordWinPct = null;
    
    // Method 1: Convert betting odds to win percentage
    if (pickcenter && pickcenter.length > 0) {
        const odds = pickcenter[0];
        if (odds.homeTeamOdds && odds.awayTeamOdds) {
            const homeMoneyline = odds.homeTeamOdds.moneyLine;
            const awayMoneyline = odds.awayTeamOdds.moneyLine;
            
            if (homeMoneyline && awayMoneyline) {
                const homeImplied = moneylineToWinPct(homeMoneyline);
                const awayImplied = moneylineToWinPct(awayMoneyline);
                // Normalize to 100%
                const total = homeImplied + awayImplied;
                oddsWinPct = {
                    home: (homeImplied / total * 100).toFixed(1),
                    away: (awayImplied / total * 100).toFixed(1)
                };
            }
        }
    }
    
    // Method 2: Calculate from team records
    const homeRecord = homeTeam.records?.[0]?.summary;
    const awayRecord = awayTeam.records?.[0]?.summary;
    
    if (homeRecord && awayRecord) {
        const homeRecordPct = calculateRecordWinPct(homeRecord);
        const awayRecordPct = calculateRecordWinPct(awayRecord);
        
        if (homeRecordPct !== null && awayRecordPct !== null) {
            // Normalize to 100%
            const total = homeRecordPct + awayRecordPct;
            recordWinPct = {
                home: (homeRecordPct / total * 100).toFixed(1),
                away: (awayRecordPct / total * 100).toFixed(1)
            };
        }
    }
    
    // If we have at least one prediction method, show the predictor
    if (!oddsWinPct && !recordWinPct) return;
    
    // Use average of both methods if both available, otherwise use what we have
    let finalPct;
    if (oddsWinPct && recordWinPct) {
        finalPct = {
            home: ((parseFloat(oddsWinPct.home) + parseFloat(recordWinPct.home)) / 2).toFixed(1),
            away: ((parseFloat(oddsWinPct.away) + parseFloat(recordWinPct.away)) / 2).toFixed(1)
        };
    } else {
        finalPct = oddsWinPct || recordWinPct;
    }
    
    const predictorHtml = `
        <div class="game-info-box matchup-predictor">
            <h4 style="margin-top: 0; margin-bottom: 5px;">Matchup Predictor</h4>
            <p style="font-size: 12px; color: #999; margin: 0 0 15px 0;">
                Based on ${oddsWinPct && recordWinPct ? 'betting odds & team records' : oddsWinPct ? 'betting odds' : 'team records'}
            </p>
            <div class="predictor-container">
                <div class="predictor-team">
                    <img src="${awayTeam.team.logo}" alt="${awayTeam.team.abbreviation}" class="predictor-logo">
                    <div class="predictor-circle" style="background: conic-gradient(#4CAF50 0% ${finalPct.away}%, #ddd ${finalPct.away}% 100%);">
                        <div class="predictor-inner">
                            <span class="predictor-pct">${finalPct.away}%</span>
                        </div>
                    </div>
                    <div class="predictor-team-name">${awayTeam.team.abbreviation}</div>
                </div>
                <div class="predictor-vs">VS</div>
                <div class="predictor-team">
                    <img src="${homeTeam.team.logo}" alt="${homeTeam.team.abbreviation}" class="predictor-logo">
                    <div class="predictor-circle" style="background: conic-gradient(#4CAF50 0% ${finalPct.home}%, #ddd ${finalPct.home}% 100%);">
                        <div class="predictor-inner">
                            <span class="predictor-pct">${finalPct.home}%</span>
                        </div>
                    </div>
                    <div class="predictor-team-name">${homeTeam.team.abbreviation}</div>
                </div>
            </div>
        </div>
    `;
    
    // Insert after game info box
    const sidebar = document.querySelector('.game-detail-sidebar');
    const gameInfoBox = sidebar.querySelector('.game-info-box');
    gameInfoBox.insertAdjacentHTML('afterend', predictorHtml);
}

function renderTeamStats(teams, awayAbbr, homeAbbr, leagueId) {
    if (!teams || teams.length < 2) return '';
    
    const awayTeam = teams.find(t => t.team.abbreviation === awayAbbr) || teams[0];
    const homeTeam = teams.find(t => t.team.abbreviation === homeAbbr) || teams[1];
    
    if (!awayTeam.statistics || !homeTeam.statistics) return '';
    
    let html = `
        <div class="box-score">
            <h3>Team Statistics</h3>
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>${awayAbbr}</th>
                        <th>Stat</th>
                        <th>${homeAbbr}</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    const statCount = Math.min(awayTeam.statistics.length, homeTeam.statistics.length);
    for (let i = 0; i < statCount; i++) {
        const awayStat = awayTeam.statistics[i];
        const homeStat = homeTeam.statistics[i];
        html += `
                    <tr>
                        <td class="stat-value">${awayStat.displayValue}</td>
                        <td class="stat-label">${awayStat.label}</td>
                        <td class="stat-value">${homeStat.displayValue}</td>
                    </tr>
        `;
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    return html;
}

function renderPlayerStats(players, leagueId) {
    if (!players || players.length === 0) return '';
    
    let html = '';
    
    players.forEach(teamPlayers => {
        const teamName = teamPlayers.team.displayName;
        const teamAbbr = teamPlayers.team.abbreviation;
        
        if (!teamPlayers.statistics || teamPlayers.statistics.length === 0) return;
        
        teamPlayers.statistics.forEach(statGroup => {
            if (!statGroup.athletes || statGroup.athletes.length === 0) return;
            
            html += `
                <div class="box-score">
                    <h3>${teamName} - ${statGroup.name}</h3>
                    <div class="player-stats-scroll">
                        <table class="player-stats-table">
                            <thead>
                                <tr>
                                    <th class="sticky-col">Player</th>
            `;
            
            // Headers
            if (statGroup.athletes[0].stats && statGroup.athletes[0].stats.length > 0) {
                statGroup.athletes[0].stats.forEach(stat => {
                    html += `<th>${stat}</th>`;
                });
            }
            
            html += `
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            // Player rows
            statGroup.athletes.forEach(athlete => {
                html += `
                                <tr>
                                    <td class="sticky-col player-name">${athlete.athlete.displayName}</td>
                `;
                
                if (athlete.stats) {
                    athlete.stats.forEach(stat => {
                        html += `<td>${stat}</td>`;
                    });
                }
                
                html += `
                                </tr>
                `;
            });
            
            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        });
    });
    
    return html;
}
