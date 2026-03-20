document.addEventListener('DOMContentLoaded', () => {
    const supabaseUrl = 'https://gvzkisekbwibvtsdstqe.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2emtpc2VrYndpYnZ0c2RzdHFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2MDMwMjYsImV4cCI6MjA2MTE3OTAyNn0.P425utVoJAVSRasQ8wjhAaklFGoVQvwtWGRB6Q9lj7k';

    window.supabase = supabase.createClient(supabaseUrl, supabaseKey);

    let currentPage = 1;
    const itemsPerPage = 10;
    let sortColumn = 'updatedAt';
    let sortDirection = 'desc';

    let currentFilter = 'all';
    let selectedDateFilter = null;
    let showLowSampleBuckets = false;

    let allData = [];
    let filteredAndSortedData = [];
    let winRateChartInstance = null;
    let evScatterChartInstance = null;
    let evImmersiveExplorer = null;
    let evImmersivePoints = [];
    let detectedSweetSpotRanges = null;

    const tableBody = document.getElementById('table-body');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const showingFrom = document.getElementById('showing-from');
    const showingTo = document.getElementById('showing-to');
    const totalItems = document.getElementById('total-items');
    const filterState = document.getElementById('filter-state');
    const filterDateInput = document.getElementById('filter-date');
    const clearDateBtn = document.getElementById('clear-date-btn');
    const refreshBtn = document.getElementById('refresh-btn');

    const totalMatchesElement = document.getElementById('total-matches');
    const totalWonElement = document.getElementById('total-won');
    const totalLossElement = document.getElementById('total-loss');
    const winRateElement = document.getElementById('win-rate');

    const analysisModal = document.getElementById('analysis-modal');
    const analysisModalContent = document.getElementById('analysis-modal-content');
    const modalContentBody = document.getElementById('modal-content-body');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const modalOkBtn = document.getElementById('modal-ok-btn');

    const totalPendingElement = document.getElementById('total-pending');
    const statAccuracyElement = document.getElementById('stat-accuracy');
    const contextual1X2AccuracyElement = document.getElementById('contextual-1x2-accuracy');
    const avgWinningOddsElement = document.getElementById('avg-winning-odds');
    const oddsLowSampleToggle = document.getElementById('toggle-odds-low-sample');
    const oddsBuckets = [
        { min: 1.01, max: 1.30, label: "1.01 - 1.30" }, { min: 1.31, max: 1.60, label: "1.31 - 1.60" },
        { min: 1.61, max: 1.90, label: "1.61 - 1.90" }, { min: 1.91, max: 2.20, label: "1.91 - 2.20" },
        { min: 2.21, max: 2.50, label: "2.21 - 2.50" }, { min: 2.51, max: 3.00, label: "2.51 - 3.00" },
        { min: 3.01, max: 4.00, label: "3.01 - 4.00" }, { min: 4.01, max: Infinity, label: "4.01+" }
    ];
    const minSamplesPerBucket = 5;

    const homeOddsRangesContainer = document.getElementById('home-odds-ranges-container');
    const awayOddsRangesContainer = document.getElementById('away-odds-ranges-container');
    const homeEvByOddsContainer = document.getElementById('home-ev-by-odds-container');
    const awayEvByOddsContainer = document.getElementById('away-ev-by-odds-container');

    const slipSection = document.getElementById('slip-builder-section');
    const slipBankrollInput = document.getElementById('slip-bankroll');
    const slipStakeInput = document.getElementById('slip-stake');
    const slipBuildBtn = document.getElementById('slip-build-btn');
    const slipResetBtn = document.getElementById('slip-reset-btn');

    function calculateState(statisticalPrediction, contextualPrediction, outcome) {
        if (outcome === null || outcome === "" || outcome === undefined) return "pending";
        const lowerOutcome = String(outcome).toLowerCase();
        const lowerStatistical = statisticalPrediction != null ? String(statisticalPrediction).toLowerCase() : null;
        const lowerContextual = contextualPrediction != null ? String(contextualPrediction).toLowerCase() : null;
        let statisticalWin = (lowerStatistical && lowerStatistical === lowerOutcome);
        let contextualWin = (lowerContextual && lowerContextual === lowerOutcome);
        if (statisticalWin || contextualWin) return "won";
        const valid1X2Outcomes = ['home', 'draw', 'away'];
        if (valid1X2Outcomes.includes(lowerOutcome)) {
            let statWas1X2 = lowerStatistical && valid1X2Outcomes.includes(lowerStatistical);
            let contextWas1X2As1X2 = lowerContextual && valid1X2Outcomes.includes(lowerContextual);
            if ((statWas1X2 && !statisticalWin) || (contextWas1X2As1X2 && !contextualWin)) {
                if (statWas1X2 || contextWas1X2As1X2) return "loss";
            }
        }
        return "unknown";
    }
    // TERMINAL CLOCK FUNCTION (Local Device Time)
    function initTerminalClock() {
        const clockEl = document.getElementById('terminal-clock');
        if (!clockEl) return;

        const updateClock = () => {
            const now = new Date();

            // Extract local time components and pad with leading zeros
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');

            // Format to match standard terminal timestamp: YYYY-MM-DD HH:MM:SS
            clockEl.textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        };

        updateClock();
        setInterval(updateClock, 1000);
    }

    async function fetchData() {
        try {
            const spinnerHTML = `<div style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:32px;"><div style="width:28px;height:28px;border:2px solid var(--cyan);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div><span class="text-muted font-mono text-xs">LOADING...</span></div>`;
            tableBody.innerHTML = `<tr><td colspan="9" style="padding:0;">${spinnerHTML}</td></tr>`;

            const chartContainer = document.getElementById('winRateChartContainer');
            if (winRateChartInstance) { winRateChartInstance.destroy(); winRateChartInstance = null; }
            chartContainer.innerHTML = spinnerHTML;

            const evChartContainer = document.getElementById('evScatterChartContainer');
            if (evScatterChartInstance) { evScatterChartInstance.destroy(); evScatterChartInstance = null; }
            if (evChartContainer) evChartContainer.innerHTML = spinnerHTML;

            const { data, error } = await window.supabase.from('predictions_main_view').select('*');
            if (error) { console.error('Error fetching data:', error); throw error; }

            allData = data.map(item => ({
                ...item,
                state: calculateState(item.statistical, item.contextual, item.outcome),
                date: item.date ? new Date(item.date) : null,
                updatedAt: item.updated_at ? new Date(item.updated_at) : null,
                home: item.home !== undefined && item.home !== null ? parseFloat(item.home) : null,
                draw: item.draw !== undefined && item.draw !== null ? parseFloat(item.draw) : null,
                away: item.away !== undefined && item.away !== null ? parseFloat(item.away) : null,
                statistical_confidence: item.statistical_confidence !== undefined && item.statistical_confidence !== null ? parseFloat(item.statistical_confidence) : null,
                contextual_confidence: item.contextual_confidence !== undefined && item.contextual_confidence !== null ? parseFloat(item.contextual_confidence) : null,
            }));

            // UPDATE TERMINAL RECORD COUNT
            const recordCountEl = document.getElementById('terminal-record-count');
            if (recordCountEl) recordCountEl.textContent = `${allData.length} records`;

            currentPage = 1;
            renderTable();
            updateSummaryStats();

            const chartData = prepareWinRateChartData(allData);
            renderWinRateChart(chartData.labels, chartData.datasets);
            updatePerformanceTrendsSummary(chartData.labels, chartData.datasets);

            renderHistoricalEvAnalysis(allData);
            renderMarketEdgeBreakdown(allData);
            renderEdgeTracker(allData);

        } catch (error) {
            console.error('Failed to load data:', error);
            tableBody.innerHTML = `<tr><td colspan="9" style="padding:24px;text-align:center;"><div style="display:flex;flex-direction:column;align-items:center;gap:8px;"><i class="fas fa-exclamation-triangle text-red" style="font-size:1.5rem;"></i><p class="text-red">Failed to load data. Check console and retry.</p><button onclick="fetchData()" class="terminal-btn" style="margin-top:8px;">Retry</button></div></td></tr>`;['total-matches', 'total-won', 'total-loss', 'win-rate', 'total-pending', 'stat-accuracy', 'contextual-1x2-accuracy', 'avg-winning-odds'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = 'N/A';
            });['win-rate-details', 'stat-accuracy-details', 'contextual-1x2-accuracy-details'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = '(N/A)';
            });
            ['trend-rolling-winrate', 'trend-overall-winrate'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = 'N/A';
            });
            ['trend-rolling-sub', 'trend-overall-sub'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = 'Data unavailable.';
            });
            const noDataMsg = `<p class="text-sm text-muted italic" style="padding:8px 0;">Data unavailable.</p>`;
            if (homeOddsRangesContainer) homeOddsRangesContainer.innerHTML = noDataMsg;
            if (awayOddsRangesContainer) awayOddsRangesContainer.innerHTML = noDataMsg;
            if (homeEvByOddsContainer) homeEvByOddsContainer.innerHTML = noDataMsg;
            if (awayEvByOddsContainer) awayEvByOddsContainer.innerHTML = noDataMsg;

            showingFrom.textContent = 0; showingTo.textContent = 0; totalItems.textContent = 0;
            prevPageBtn.disabled = true; nextPageBtn.disabled = true;

            const chartContainer = document.getElementById('winRateChartContainer');
            if (winRateChartInstance) winRateChartInstance.destroy();
            chartContainer.innerHTML = `<p class="text-center text-red" style="padding:16px;display:flex;align-items:center;justify-content:center;height:100%;"><i class="fas fa-exclamation-triangle" style="margin-right:8px;"></i>Failed to load chart data.</p>`;

            const evChartContainer = document.getElementById('evScatterChartContainer');
            if (evScatterChartInstance) evScatterChartInstance.destroy();
            if (evChartContainer) evChartContainer.innerHTML = `<p class="text-center text-red" style="padding:16px;display:flex;align-items:center;justify-content:center;height:100%;"><i class="fas fa-exclamation-triangle" style="margin-right:8px;"></i>Failed to load EV data.</p>`;
        }
    }

    function getFilteredData() {
        let filtered = [...allData];
        if (currentFilter !== 'all') {
            filtered = filtered.filter(item => String(item.state).toLowerCase() === currentFilter.toLowerCase());
        }
        if (selectedDateFilter instanceof Date) {
            filtered = filtered.filter(item => {
                // Prioritize match date, fallback to updatedAt if match date is missing
                const targetDate = (item.date instanceof Date && !isNaN(item.date)) ? item.date : item.updatedAt;
                if (!(targetDate instanceof Date) || isNaN(targetDate)) return false;
                return isSameUtcDate(targetDate, selectedDateFilter);
            });
        }
        return filtered;
    }

    function isSameUtcDate(a, b) {
        if (!(a instanceof Date) || isNaN(a)) return false;
        if (!(b instanceof Date) || isNaN(b)) return false;
        return a.getUTCFullYear() === b.getUTCFullYear()
            && a.getUTCMonth() === b.getUTCMonth()
            && a.getUTCDate() === b.getUTCDate();
    }

    function getSortedData(data) {
        return [...data].sort((a, b) => {
            const aValue = a[sortColumn], bValue = b[sortColumn];
            const isANullish = (aValue === null || aValue === undefined || aValue === '');
            const isBNullish = (bValue === null || bValue === undefined || bValue === '');
            if (sortColumn === 'updatedAt' || sortColumn === 'date') {
                const aDate = a[sortColumn] instanceof Date && !isNaN(a[sortColumn]) ? a[sortColumn].getTime() : (isANullish ? null : -Infinity);
                const bDate = b[sortColumn] instanceof Date && !isNaN(b[sortColumn]) ? b[sortColumn].getTime() : (isBNullish ? null : -Infinity);
                if (aDate === null && bDate === null) return 0; if (aDate === null) return sortDirection === 'asc' ? 1 : -1;
                if (bDate === null) return sortDirection === 'asc' ? -1 : 1;
                const comparison = aDate - bDate; return sortDirection === 'asc' ? comparison : -comparison;
            }
            if (sortColumn === 'match') {
                const matchComparison = String(a.match || '').localeCompare(String(b.match || ''));
                if (matchComparison !== 0) return sortDirection === 'asc' ? matchComparison : -matchComparison;
                if (a.date instanceof Date && b.date instanceof Date && !isNaN(a.date) && !isNaN(b.date)) {
                    const dateComparison = a.date.getTime() - b.date.getTime();
                    return sortDirection === 'asc' ? dateComparison : -dateComparison;
                } return 0;
            }
            if (sortColumn === 'state') {
                const stateOrder = { 'pending': 4, 'won': 3, 'loss': 2, 'unknown': 1, null: 0, '': 0 };
                const aStateValue = stateOrder[String(aValue).toLowerCase()] || 0;
                const bStateValue = stateOrder[String(bValue).toLowerCase()] || 0;
                const comparison = aStateValue - bStateValue; return sortDirection === 'asc' ? -comparison : comparison;
            }
            if (isANullish && isBNullish) return 0; if (isANullish) return sortDirection === 'asc' ? 1 : -1;
            if (isBNullish) return sortDirection === 'asc' ? -1 : 1;
            if (['outcome', 'statistical', 'contextual'].includes(sortColumn)) {
                const comparison = String(aValue).localeCompare(String(bValue));
                return sortDirection === 'asc' ? comparison : -comparison;
            } else {
                const numA = parseFloat(aValue), numB = parseFloat(bValue);
                if (!isNaN(numA) && !isNaN(numB)) {
                    const comparison = numA - numB; return sortDirection === 'asc' ? comparison : -comparison;
                } else {
                    const comparison = String(aValue).localeCompare(String(bValue));
                    return sortDirection === 'asc' ? comparison : -comparison;
                }
            }
        });
    }

    function getPaginatedData(data) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return data.slice(startIndex, startIndex + itemsPerPage);
    }

    const range = (start, end) => {
        let length = end - start + 1;
        return Array.from({ length }, (_, idx) => idx + start);
    };

    function getPaginationItems(totalPages, currentPage, siblingCount = 1) {
        const DOTS = '...';
        const totalPageNumbersInDisplay = siblingCount + 5;

        if (totalPageNumbersInDisplay >= totalPages) {
            return range(1, totalPages);
        }

        const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
        const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

        const shouldShowLeftDots = leftSiblingIndex > 2;
        const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

        const firstPageIndex = 1;
        const lastPageIndex = totalPages;

        if (!shouldShowLeftDots && shouldShowRightDots) {
            let leftItemCount = 3 + 2 * siblingCount;
            let leftRange = range(1, leftItemCount);
            return [...leftRange, DOTS, lastPageIndex];
        }

        if (shouldShowLeftDots && !shouldShowRightDots) {
            let rightItemCount = 3 + 2 * siblingCount;
            let rightRange = range(totalPages - rightItemCount + 1, totalPages);
            return [firstPageIndex, DOTS, ...rightRange];
        }

        if (shouldShowLeftDots && shouldShowRightDots) {
            let middleRange = range(leftSiblingIndex, rightSiblingIndex);
            return [firstPageIndex, DOTS, ...middleRange, DOTS, lastPageIndex];
        }

        return range(1, totalPages);
    }

    function renderPagination(totalPages, currentP) {
        const pageNumbersContainer = document.getElementById('page-numbers-container');
        if (!pageNumbersContainer) return;

        pageNumbersContainer.innerHTML = '';

        if (totalPages <= 1) return;

        const SIBLING_COUNT = 1;

        const pageButtonBaseClasses = "page-btn";
        const pageButtonDefaultClasses = "";
        const pageButtonActiveClasses = "active";
        const ellipsisClasses = "page-ellipsis";

        const paginationItems = getPaginationItems(totalPages, currentP, SIBLING_COUNT);

        paginationItems.forEach(item => {
            if (item === '...') {
                const ellipsisSpan = document.createElement('span');
                ellipsisSpan.className = ellipsisClasses;
                ellipsisSpan.textContent = '...';
                pageNumbersContainer.appendChild(ellipsisSpan);
            } else {
                const pageButton = document.createElement('button');
                pageButton.dataset.page = item;
                pageButton.textContent = item;
                pageButton.className = `${pageButtonBaseClasses} ${item === currentP ? pageButtonActiveClasses : pageButtonDefaultClasses}`;
                if (item === currentP) {
                    pageButton.disabled = true;
                }
                pageButton.addEventListener('click', (e) => {
                    const page = parseInt(e.currentTarget.dataset.page);
                    if (page && page !== currentPage) {
                        currentPage = page;
                        renderTable();
                        const tableElement = tableBody.closest('div.overflow-x-auto');
                        if (tableElement) {
                            window.scrollTo({ top: tableElement.offsetTop - 20, behavior: 'smooth' });
                        }
                    }
                });
                pageNumbersContainer.appendChild(pageButton);
            }
        });
    }

    function renderTable() {
        filteredAndSortedData = getSortedData(getFilteredData());
        const totalItemsCount = filteredAndSortedData.length;

        let effectiveTotalPages = Math.ceil(totalItemsCount / itemsPerPage);
        const totalPagesForCurrentPageLogic = effectiveTotalPages === 0 ? 1 : effectiveTotalPages;

        if (currentPage > totalPagesForCurrentPageLogic) {
            currentPage = totalPagesForCurrentPageLogic;
        }
        if (currentPage < 1) {
            currentPage = 1;
        }

        const paginatedData = getPaginatedData(filteredAndSortedData);

        showingFrom.textContent = totalItemsCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
        showingTo.textContent = Math.min(currentPage * itemsPerPage, totalItemsCount);
        totalItems.textContent = totalItemsCount;

        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === effectiveTotalPages || effectiveTotalPages === 0;

        tableBody.innerHTML = '';
        const pageNumbersContainer = document.getElementById('page-numbers-container');

        if (totalItemsCount === 0) {
            tableBody.innerHTML = `<tr><td colspan="9" style="padding:24px;text-align:center;"><span class="text-muted font-mono text-sm">No data available for the selected filter or date.</span></td></tr>`;
            if (pageNumbersContainer) pageNumbersContainer.innerHTML = '';
            prevPageBtn.disabled = true;
            nextPageBtn.disabled = true;

            try { renderSlipBuilder(); } catch (e) { console.warn("Slip builder bypassed due to empty data"); }
            return;
        }

        let rowsHTML = '';
        paginatedData.forEach((item, indexOnPage) => {
            const overallIndex = ((currentPage - 1) * itemsPerPage) + indexOnPage;
            const animationClass = 'fade-in', animationDelay = indexOnPage * 0.05;
            const formatPercentage = (v) => v !== null && !isNaN(v) ? (v * 100).toFixed(1) + '%' : 'N/A';
            const formatOdds = (v) => v !== null && !isNaN(v) ? parseFloat(v).toFixed(2) : 'N/A';
            const getImpliedProbWidth = (v) => (v !== null && !isNaN(v) && v > 0) ? Math.min((1 / v) * 100, 100) : 0;

            let outcomeDisplay = 'N/A', outcomeClass = 'outcome-unknown', outcomeIconClass = 'outcome-icon-unknown';
            if (item.outcome !== null && item.outcome !== undefined) {
                const ov = String(item.outcome).toLowerCase();
                outcomeDisplay = String(item.outcome).toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                if (['home', 'draw', 'away'].includes(ov)) { outcomeClass = `outcome-${ov}`; outcomeIconClass = `outcome-icon-${ov}`; }
                else if (ov.includes('over') || ov.includes('under')) { outcomeClass = 'outcome-goals'; outcomeIconClass = `outcome-icon-goals`; }
            }
            const stateValue = item.state ? String(item.state).toLowerCase() : 'unknown';
            const stateClass = `state-${stateValue}`, stateIconClass = `state-icon-${stateValue}`;
            let analysisButtonHTML = `<span class="text-muted font-mono text-xs italic">N/A</span>`;
            if ((stateValue !== 'pending' && stateValue !== 'unknown') || (item.full_bot_response_analyze && String(item.full_bot_response_analyze).trim() !== '')) {
                analysisButtonHTML = `<button class="view-analysis-btn" data-item-index="${overallIndex}" aria-label="View analysis for ${item.match || 'this match'}"><i class="fas fa-search-plus"></i> View</button>`;
            }
            const matchDate = item.date instanceof Date && !isNaN(item.date) ? `<div class="match-date">${item.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</div>` : '';

            rowsHTML += `
                <tr class="highlight-row ${animationClass}" style="animation-delay: ${animationDelay}s">
                    <td data-label="Match">
                        <div class="match-cell">
                            <div class="match-icon"><i class="fas fa-futbol"></i></div>
                            <div><div class="match-name">${item.match || 'N/A'}</div>${matchDate}</div>
                        </div>
                    </td>
                    <td data-label="Home Odds"><div class="odds-value">${formatOdds(item.home)}</div><div class="odds-bar"><div class="odds-bar-fill odds-bar-home" style="width: ${getImpliedProbWidth(item.home)}%"></div></div></td>
                    <td data-label="Draw Odds"><div class="odds-value">${formatOdds(item.draw)}</div><div class="odds-bar"><div class="odds-bar-fill odds-bar-draw" style="width: ${getImpliedProbWidth(item.draw)}%"></div></div></td>
                    <td data-label="Away Odds"><div class="odds-value">${formatOdds(item.away)}</div><div class="odds-bar"><div class="odds-bar-fill odds-bar-away" style="width: ${getImpliedProbWidth(item.away)}%"></div></div></td>
                    <td data-label="Stat. Pred.">${item.statistical ? String(item.statistical).charAt(0).toUpperCase() + String(item.statistical).slice(1) : 'N/A'}${item.statistical_confidence !== null && !isNaN(item.statistical_confidence) ? ` (${formatPercentage(item.statistical_confidence)})` : ''}</td>
                    <td data-label="Context. Pred.">${item.contextual ? String(item.contextual).charAt(0).toUpperCase() + String(item.contextual).slice(1) : 'N/A'}${item.contextual_confidence !== null && !isNaN(item.contextual_confidence) ? ` (${formatPercentage(item.contextual_confidence)})` : ''}</td>
                    <td data-label="Outcome"><span class="badge ${outcomeClass}"><span class="${outcomeIconClass}"></span> ${outcomeDisplay}</span></td>
                    <td data-label="State"><span class="badge ${stateClass}"><span class="${stateIconClass}"></span> ${stateValue.charAt(0).toUpperCase() + stateValue.slice(1)}</span></td>
                    <td data-label="Analysis">${analysisButtonHTML}</td>
                </tr>`;
        });
        tableBody.innerHTML = rowsHTML;
        updateSortIcons();

        try {
            renderPagination(effectiveTotalPages, currentPage);
            renderSlipBuilder();
        } catch (err) {
            console.error("Slip Builder rendering failed:", err);
        }
    }


    // ==========================================
    // PREDICTION-DRIVEN EXPECTED VALUE LOGIC
    // ==========================================

    function normalizeOutcome(outcome) {
        if (!outcome) return null;
        const normalized = String(outcome).trim().toLowerCase();
        if (normalized === '1') return 'home';
        if (normalized === 'x') return 'draw';
        if (normalized === '2') return 'away';
        if (['home', 'draw', 'away'].includes(normalized)) return normalized;
        return null;
    }

    function getItemDateForWalkForward(item) {
        if (item?.date instanceof Date && !isNaN(item.date)) return item.date;
        if (item?.updatedAt instanceof Date && !isNaN(item.updatedAt)) return item.updatedAt;
        return null;
    }


    // 1. Map Model Predictions to Double Chance / DNB Markets
    function getTargetMarkets(stat, ctx) {
        const s = normalizeOutcome(stat);
        const c = normalizeOutcome(ctx);
        const sides = new Set();

        if (s && ['home', 'draw', 'away'].includes(s)) sides.add(s);
        if (c && ['home', 'draw', 'away'].includes(c)) sides.add(c);

        const arr = Array.from(sides);
        if (arr.length === 0) return [];

        // If Model predicts Home & Draw -> 1X & DNB Home
        if (arr.includes('home') && arr.includes('draw')) return ['1X', 'DNB Home'];
        // If Model predicts Away & Draw -> X2 & DNB Away
        if (arr.includes('away') && arr.includes('draw')) return ['X2', 'DNB Away'];
        // If Model predicts Home & Away -> 12
        if (arr.includes('home') && arr.includes('away')) return ['12'];

        // If Model strictly predicts one side
        if (arr.includes('home')) return ['DNB Home', '1X'];
        if (arr.includes('away')) return ['DNB Away', 'X2'];

        return [];
    }

    function evaluateLegForItem(item, oddsPreferenceIndex) {
        const odds1 = parseFloat(item.home);
        const oddsX = parseFloat(item.draw);
        const odds2 = parseFloat(item.away);

        if (!odds1 || !oddsX || !odds2 || odds1 <= 0 || oddsX <= 0 || odds2 <= 0) return null;

        const targetMarkets = getTargetMarkets(item.statistical, item.contextual);
        if (targetMarkets.length === 0) return null;

        // Bookmaker vig-stripped fair probabilities — the market's true assessment
        // after removing the margin.
        const margin = (1 / odds1) + (1 / oddsX) + (1 / odds2);
        const trueP1 = (1 / odds1) / margin;
        const truePX = (1 / oddsX) / margin;
        const trueP2 = (1 / odds2) / margin;

        // Parse the statistical model's W/D/L probability distribution.
        // Stored as JSONB (or a JSON string) with keys W=home, D=draw, L=away.
        // The contextual model is complementary — its role is captured by
        // getTargetMarkets() which determines which markets to evaluate.
        let rawModelP1, rawModelPX, rawModelP2;
        try {
            const raw = item.statistical_probabilities;
            const probs = (typeof raw === 'string') ? JSON.parse(raw) : raw;
            const w = parseFloat(probs.W);
            const d = parseFloat(probs.D);
            const l = parseFloat(probs.L);
            if (!isFinite(w) || !isFinite(d) || !isFinite(l) || (w + d + l) === 0) throw new Error('invalid');
            const pSum = w + d + l;
            rawModelP1 = w / pSum;
            rawModelPX = d / pSum;
            rawModelP2 = l / pSum;
        } catch (_) {
            // No valid distribution — model has no edge signal, treat as fair market.
            rawModelP1 = trueP1;
            rawModelPX = truePX;
            rawModelP2 = trueP2;
        }

        let bestMarket = null;
        let bestEV = -Infinity;
        let bestMarketData = null;

        targetMarkets.forEach(market => {
            let offeredOdds, EV, P_DC_Model, P_Win_Model, P_Draw_Model;
            const bonus = getOddsPreferenceBonus(market, { home: odds1, draw: oddsX, away: odds2 }, oddsPreferenceIndex);

            // EV here is relative edge: (model's combined probability for this market's
            // outcomes) / (bookmaker's vig-stripped fair combined probability) - 1.
            // Positive = model sees more value than the fair market price implies.
            // Negative = model sees less. This is the correct signal for bet selection
            // when the model's raw probabilities are systematically compressed vs the
            // bookmaker's vig-inflated implied probabilities.
            if (market === '1X') {
                offeredOdds = 1 / ((1 / odds1) + (1 / oddsX));
                P_DC_Model  = (rawModelP1 + rawModelPX) * (1 + bonus);
                EV = (P_DC_Model / (trueP1 + truePX)) - 1;
            } else if (market === 'X2') {
                offeredOdds = 1 / ((1 / odds2) + (1 / oddsX));
                P_DC_Model  = (rawModelP2 + rawModelPX) * (1 + bonus);
                EV = (P_DC_Model / (trueP2 + truePX)) - 1;
            } else if (market === '12') {
                offeredOdds = 1 / ((1 / odds1) + (1 / odds2));
                P_DC_Model  = (rawModelP1 + rawModelP2) * (1 + bonus);
                EV = (P_DC_Model / (trueP1 + trueP2)) - 1;
            } else if (market === 'DNB Home') {
                offeredOdds  = (1 - (1 / oddsX)) / (1 / odds1);
                P_Win_Model  = rawModelP1 * (1 + bonus);
                P_Draw_Model = rawModelPX;
                // Edge is on the win leg only — the draw returns stake regardless.
                EV = (P_Win_Model / trueP1) - 1;
                P_DC_Model = P_Win_Model;
            } else if (market === 'DNB Away') {
                offeredOdds  = (1 - (1 / oddsX)) / (1 / odds2);
                P_Win_Model  = rawModelP2 * (1 + bonus);
                P_Draw_Model = rawModelPX;
                EV = (P_Win_Model / trueP2) - 1;
                P_DC_Model = P_Win_Model;
            }

            if (EV > bestEV) {
                bestEV = EV;
                bestMarket = market;
                bestMarketData = { odds: offeredOdds, ev: EV, p_dc: P_DC_Model };
            }
        });

        if (!bestMarket) return null;

        return {
            match: item.match || 'N/A',
            date: item.date instanceof Date && !isNaN(item.date) ? item.date : (item.updatedAt instanceof Date && !isNaN(item.updatedAt) ? item.updatedAt : null),
            updatedAt: item.updatedAt instanceof Date && !isNaN(item.updatedAt) ? item.updatedAt : null,
            market: bestMarket,
            odds: bestMarketData.odds,
            P_DC: bestMarketData.p_dc,
            ev: bestMarketData.ev,
            rawOdds: { home: odds1, draw: oddsX, away: odds2 },
            outcome: item.outcome ?? null,
            state: item.state ?? null
        };
    }

    // 2. Evaluate specific markets against Bookmaker lines
    function buildEvaluatedLegs(data, oddsPreferenceIndex) {
        const legs = [];
        data.forEach(item => {
            const leg = evaluateLegForItem(item, oddsPreferenceIndex);
            if (leg) legs.push(leg);
        });
        return legs;
    }

    function createOddsPreferenceAccumulator() {
        return {
            home: oddsBuckets.map(b => ({ ...b, totalPredictions: 0, successfulPredictions: 0, sumOfOdds: 0 })),
            away: oddsBuckets.map(b => ({ ...b, totalPredictions: 0, successfulPredictions: 0, sumOfOdds: 0 })),
            sumOfWinning1X2Odds: 0,
            countOfWinning1X2Odds: 0
        };
    }

    function updateOddsPreferenceAccumulator(acc, item) {
        if (!acc || !item || (item.state !== 'won' && item.state !== 'loss')) return;

        const statPred = item.statistical ? String(item.statistical).toLowerCase() : null;
        const contextPred = item.contextual ? String(item.contextual).toLowerCase() : null;
        const outcome = item.outcome != null ? String(item.outcome).toLowerCase() : null;
        const isHomeBet = (statPred === 'home' || contextPred === 'home');
        const isAwayBet = (statPred === 'away' || contextPred === 'away');

        if (isHomeBet && item.home != null && !isNaN(item.home)) {
            for (const bucket of acc.home) {
                if (item.home >= bucket.min && item.home <= bucket.max) {
                    bucket.totalPredictions++;
                    bucket.sumOfOdds += item.home;
                    if (outcome === 'home') bucket.successfulPredictions++;
                    break;
                }
            }
        }
        if (isAwayBet && item.away != null && !isNaN(item.away)) {
            for (const bucket of acc.away) {
                if (item.away >= bucket.min && item.away <= bucket.max) {
                    bucket.totalPredictions++;
                    bucket.sumOfOdds += item.away;
                    if (outcome === 'away') bucket.successfulPredictions++;
                    break;
                }
            }
        }

        const valid1X2Types = ['home', 'draw', 'away'];
        if (item.state === 'won' && outcome && valid1X2Types.includes(outcome)) {
            let oddsForThisWin = 0;
            if (statPred === outcome && valid1X2Types.includes(statPred)) {
                if (outcome === 'home' && item.home != null) oddsForThisWin = parseFloat(item.home);
                else if (outcome === 'draw' && item.draw != null) oddsForThisWin = parseFloat(item.draw);
                else if (outcome === 'away' && item.away != null) oddsForThisWin = parseFloat(item.away);
            } else if (contextPred === outcome && valid1X2Types.includes(contextPred)) {
                if (outcome === 'home' && item.home != null) oddsForThisWin = parseFloat(item.home);
                else if (outcome === 'draw' && item.draw != null) oddsForThisWin = parseFloat(item.draw);
                else if (outcome === 'away' && item.away != null) oddsForThisWin = parseFloat(item.away);
            }
            if (oddsForThisWin > 0) {
                acc.sumOfWinning1X2Odds += oddsForThisWin;
                acc.countOfWinning1X2Odds++;
            }
        }
    }

    function finalizeOddsPreferenceIndexFromAccumulator(acc) {
        if (!acc) return null;
        const finalizeBuckets = (analysis) => analysis.map(bucket => {
            const winRate = bucket.totalPredictions > 0 ? bucket.successfulPredictions / bucket.totalPredictions : 0;
            const avgOdds = bucket.totalPredictions > 0 ? bucket.sumOfOdds / bucket.totalPredictions : 0;
            const ev = bucket.totalPredictions > 0 ? (winRate * (avgOdds - 1)) - (1 - winRate) : 0;
            return { ...bucket, winRate, avgOdds, ev };
        });

        const totalPredictions = acc.home.reduce((sum, b) => sum + b.totalPredictions, 0) + acc.away.reduce((sum, b) => sum + b.totalPredictions, 0);
        if (totalPredictions === 0 && acc.countOfWinning1X2Odds === 0) return null;

        return {
            home: finalizeBuckets(acc.home),
            away: finalizeBuckets(acc.away),
            avgWinningOdds: acc.countOfWinning1X2Odds > 0 ? (acc.sumOfWinning1X2Odds / acc.countOfWinning1X2Odds) : null
        };
    }

    function buildEvaluatedLegsWalkForward(data) {
        const legs = [];
        const datedItems = [];
        const undatedItems = [];

        data.forEach(item => {
            const itemDate = getItemDateForWalkForward(item);
            if (!itemDate) {
                undatedItems.push(item);
                return;
            }
            datedItems.push({ item, itemDate });
        });

        datedItems.sort((a, b) => a.itemDate - b.itemDate);

        const acc = createOddsPreferenceAccumulator();
        let idx = 0;

        while (idx < datedItems.length) {
            const currentDate = datedItems[idx].itemDate;
            const dateKey = currentDate.toISOString().split('T')[0];
            const group = [];

            while (idx < datedItems.length && datedItems[idx].itemDate.toISOString().split('T')[0] === dateKey) {
                group.push(datedItems[idx].item);
                idx++;
            }

            const oddsPreferenceIndex = finalizeOddsPreferenceIndexFromAccumulator(acc);
            group.forEach(item => {
                const leg = evaluateLegForItem(item, oddsPreferenceIndex);
                if (leg) legs.push(leg);
            });

            group.forEach(item => {
                if (item.state === 'won' || item.state === 'loss') {
                    updateOddsPreferenceAccumulator(acc, item);
                }
            });
        }

        if (undatedItems.length > 0) {
            const oddsPreferenceIndex = finalizeOddsPreferenceIndexFromAccumulator(acc);
            undatedItems.forEach(item => {
                const leg = evaluateLegForItem(item, oddsPreferenceIndex);
                if (leg) legs.push(leg);
            });
        }

        return legs;
    }

    function getSlipLegResult(market, outcome) {
        const resolvedOutcome = normalizeOutcome(outcome);
        if (!resolvedOutcome) return null;
        if (market === '1X') return (resolvedOutcome === 'home' || resolvedOutcome === 'draw') ? 'win' : 'loss';
        if (market === 'X2') return (resolvedOutcome === 'draw' || resolvedOutcome === 'away') ? 'win' : 'loss';
        if (market === '12') return (resolvedOutcome === 'home' || resolvedOutcome === 'away') ? 'win' : 'loss';
        if (market === 'DNB Home') {
            if (resolvedOutcome === 'home') return 'win';
            if (resolvedOutcome === 'away') return 'loss';
            return 'push';
        }
        if (market === 'DNB Away') {
            if (resolvedOutcome === 'away') return 'win';
            if (resolvedOutcome === 'home') return 'loss';
            return 'push';
        }
        return null;
    }

    function syncEvThresholdToSweetSpot() {
        const select = document.getElementById('slip-ev-threshold');
        if (!select) return;

        // Compute the lowest sweet spot floor from live data
        const liveMin = detectedSweetSpotRanges && detectedSweetSpotRanges.length > 0
            ? Math.min(...detectedSweetSpotRanges.map(r => r.min))
            : null;

        // Update the label on the auto option to reflect current data
        const autoOption = select.querySelector('option[data-auto]');
        if (autoOption && liveMin !== null) {
            autoOption.value = String(liveMin);
            autoOption.textContent = `Sweet spot (${liveMin}%+ · auto)`;
        }

        // If the user hasn't manually overridden, keep the selection on the auto option
        if (select.dataset.userSet !== 'true' && autoOption && liveMin !== null) {
            select.value = String(liveMin);
        }
    }

    // --- EV HISTORICAL ANALYSIS & SWEET SPOTS UI ---
    function renderHistoricalEvAnalysis(data) {
        const chartContainer = document.getElementById('evScatterChartContainer');
        const sweetSpotsContainer = document.getElementById('ev-sweet-spots-container');
        if (!chartContainer || !sweetSpotsContainer) return;

        if (evScatterChartInstance) {
            evScatterChartInstance.destroy();
            evScatterChartInstance = null;
        }

        const isDarkMode = true; // Terminal mode is always dark
        const wonColor = 'rgba(14, 255, 110, 0.7)';
        const wonBorder = '#0eff6e';
        const lossColor = 'rgba(255, 61, 113, 0.7)';
        const lossBorder = '#ff3d71';
        const pushColor = 'rgba(136, 153, 170, 0.7)';
        const pushBorder = '#8899aa';
        const pendingColor = 'rgba(255, 179, 0, 0.75)';
        const pendingBorder = '#ffb300';

        // Walk-forward evaluation: each leg uses only prior resolved results to form the bonus
        const allLegs = buildEvaluatedLegsWalkForward(data);

        const wonData = [];
        const lossData = [];
        const pushData = [];
        const pendingData = [];
        const immersivePoints = [];

        // Finer buckets: 1% resolution below 5% (where most bets cluster).
        // Wilson Score Lower Bound (90% CI) guards against small-sample buckets
        // falsely earning the Sweet Spot badge — no Kelly, no tiers.
        function wilsonScoreLB(wins, n) {
            const z = 1.645;
            if (n === 0) return 0;
            const p = wins / n;
            const denom = 1 + (z * z) / n;
            const center = (p + (z * z) / (2 * n)) / denom;
            const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
            return Math.max(0, center - margin);
        }

        const evBuckets = [
            { label: '< 0% (Negative)', min: -Infinity, max: 0,   w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '0% - 1%',         min: 0,         max: 1,   w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '1% - 2%',         min: 1,         max: 2,   w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '2% - 3%',         min: 2,         max: 3,   w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '3% - 4%',         min: 3,         max: 4,   w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '4% - 5%',         min: 4,         max: 5,   w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '5% - 7.5%',       min: 5,         max: 7.5, w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '7.5% - 10%',      min: 7.5,       max: 10,  w: 0, l: 0, p: 0, sumProfit: 0 },
            { label: '> 10%',           min: 10,        max: Infinity, w: 0, l: 0, p: 0, sumProfit: 0 }
        ];

        allLegs.forEach(leg => {
            const result = getSlipLegResult(leg.market, leg.outcome);
            const isPending = !result && (leg.state === 'pending' || !leg.outcome);
            const effectiveResult = result || (isPending ? 'pending' : null);
            if (!effectiveResult) return;

            let chartDate = leg.date;
            if (!chartDate) return;

            let evPct = leg.ev * 100;
            let chartEv = Math.max(-100, Math.min(100, evPct));
            let jitterX = chartDate.getTime() + (Math.random() - 0.5) * 24 * 60 * 60 * 1000;

            let point = {
                x: jitterX, y: chartEv, match: leg.match || 'Unknown Match',
                odds: leg.odds, market: leg.market, actualEv: evPct,
                dateObj: chartDate, result: effectiveResult
            };

            if (effectiveResult === 'pending') {
                point.profit = 0;
                pendingData.push(point);
            } else {
                const profit = result === 'win' ? (leg.odds - 1) : (result === 'push' ? 0 : -1);
                point.profit = profit;
                for (let b of evBuckets) {
                    if (evPct >= b.min && evPct < b.max) {
                        if (result === 'win') b.w++;
                        else if (result === 'loss') b.l++;
                        else if (result === 'push') b.p++;
                        b.sumProfit += profit;
                        break;
                    }
                }
                if (result === 'win') wonData.push(point);
                else if (result === 'loss') lossData.push(point);
                else if (result === 'push') pushData.push(point);
            }
            immersivePoints.push(point);
        });

        if (wonData.length === 0 && lossData.length === 0 && pushData.length === 0 && pendingData.length === 0) {
            chartContainer.innerHTML = `<p class="text-center text-muted" style="padding:40px;"><i class="fas fa-filter" style="margin-right:8px;"></i>Not enough resolved matches to build EV landscape.</p>`;
            sweetSpotsContainer.innerHTML = `<p class="text-sm text-muted italic">No historical EV data available.</p>`;
            setupEvImmersiveExplorer();
            updateEvImmersiveData([]);
            return;
        }

        // Sweet spot detection: Wilson LB > 0.50 AND positive ROI AND n >= 3.
        // This prevents tiny high-EV samples (3 wins / 0 loss) from hijacking the badge
        // while correctly surfacing real edges in the dense sub-5% zone.
        let validBuckets = evBuckets.filter(b => (b.w + b.l + b.p) >= 3);
        validBuckets.sort((a, b) => {
            const totalA = a.w + a.l + a.p, totalB = b.w + b.l + b.p;
            const roiA = totalA > 0 ? (a.sumProfit / totalA) : -Infinity;
            const roiB = totalB > 0 ? (b.sumProfit / totalB) : -Infinity;
            if (roiA !== roiB) return roiB - roiA;
            const wrA = (a.w + a.l) > 0 ? a.w / (a.w + a.l) : 0;
            const wrB = (b.w + b.l) > 0 ? b.w / (b.w + b.l) : 0;
            return wrB - wrA;
        });

        const positiveRoiBuckets = validBuckets.filter(b => {
            const total = b.w + b.l + b.p;
            const decided = b.w + b.l;
            const roi = total > 0 ? (b.sumProfit / total) : 0;
            const wLB = wilsonScoreLB(b.w, decided);
            // Finer 1% buckets naturally have fewer samples than the old 2.5% buckets.
            // Threshold: roi > 2% AND Wilson LB > 0.45 (instead of 0.50) to avoid
            // being overly conservative with sub-10-sample 1% buckets.
            return roi > 0.02 && wLB >= 0.45;
        });

        const top2Labels = positiveRoiBuckets.slice(0, 3).map(b => b.label);

        const sweetSpots = positiveRoiBuckets.slice(0, 3).filter(b => b.min >= 0);
        detectedSweetSpotRanges = sweetSpots.length > 0
            ? sweetSpots.map(b => ({ min: b.min, max: b.max, label: b.label }))
            : null;

        // Sync the slip builder's Min EV dropdown to the lowest detected sweet spot floor.
        // Only updates if the user hasn't manually changed it from the data-driven default
        // (indicated by the presence of data-auto="true" on the select element).
        syncEvThresholdToSweetSpot();

        // Render Sweet Spots UI — original card structure
        let sweetSpotsHTML = '';
        evBuckets.forEach(b => {
            const totalResolved = b.w + b.l + b.p;
            if (totalResolved === 0) return;
            const decidedResolved = b.w + b.l;
            const winRate = decidedResolved > 0 ? (b.w / decidedResolved) * 100 : 0;
            const pushRate = totalResolved > 0 ? (b.p / totalResolved) * 100 : 0;
            const roi = totalResolved > 0 ? (b.sumProfit / totalResolved) * 100 : 0;
            const isSweetSpot = top2Labels.includes(b.label);

            const borderStyle = isSweetSpot
                ? 'border-color: var(--amber); background: var(--amber-bg);'
                : 'border-color: var(--border-subtle);';

            const badge = isSweetSpot
                ? `<span style="background:var(--amber-bg);color:var(--amber);border:1px solid rgba(255,179,0,0.3);font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:999px;text-transform:uppercase;margin-left:8px;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-star"></i> Sweet Spot</span>`
                : '';

            const barColor = winRate >= 50 ? 'background:var(--green);' : (winRate >= 30 ? 'background:var(--amber);' : 'background:var(--red);');

            sweetSpotsHTML += `
                <div style="border-radius:var(--radius-md);padding:12px;border:1px solid var(--border-subtle);background:var(--bg-surface);transition:transform 0.2s;${borderStyle}">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <div style="display:flex;align-items:center;">
                            <span class="font-mono font-semibold text-heading" style="font-size:0.82rem;">EV: ${b.label}</span>
                            ${badge}
                        </div>
                        <span class="font-mono font-bold" style="font-size:0.82rem;color:${winRate >= 50 ? 'var(--green)' : 'var(--text-secondary)'}">${winRate.toFixed(1)}% WR</span>
                    </div>
                    <div style="width:100%;height:4px;background:var(--bg-elevated);border-radius:2px;margin-bottom:8px;overflow:hidden;">
                        <div style="height:100%;border-radius:2px;width:${winRate}%;${barColor}"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono);">
                        <span><i class="fas fa-check-circle text-green" style="margin-right:4px;"></i>${b.w} Won</span>
                        <span><i class="fas fa-times-circle text-red" style="margin-right:4px;"></i>${b.l} Loss</span>
                        ${b.p > 0 ? `<span><i class="fas fa-minus-circle" style="margin-right:4px;color:var(--text-muted);"></i>${b.p} Push</span>` : ''}
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.68rem;color:var(--text-muted);font-family:var(--font-mono);margin-top:6px;">
                        <span>Push: ${pushRate.toFixed(1)}%</span>
                        <span>ROI: ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        });
        sweetSpotsContainer.innerHTML = sweetSpotsHTML || `<p class="text-sm text-muted italic">No historical data available for EV grouping.</p>`;

        // Render Scatter Plot
        if (!document.getElementById('evScatterChart')) {
            chartContainer.innerHTML = '<canvas id="evScatterChart"></canvas>';
        }

        // The sweet spots panel drives height. We read its offsetHeight (forces a
        // synchronous reflow — intentional, the innerHTML was just written above so
        // the cards are in the DOM) and set the chart container to match.
        //
        // IMPORTANT: the grid uses align-items:start so the sweet spots panel is
        // sized by content only. If we used align-items:stretch, CSS would grow the
        // sweet spots panel to match the chart panel and create an infinite loop.
        const sweetPanel = sweetSpotsContainer.closest('.terminal-panel');

        function applyChartHeight() {
            if (!sweetPanel) return;
            const sweetH = sweetPanel.offsetHeight;
            if (sweetH < 10) return;

            // Overhead = everything in the chart panel-body except the chart container
            let overhead = 0;
            const body = chartContainer.parentElement;
            if (body) {
                Array.from(body.children).forEach(child => {
                    if (child === chartContainer) return;
                    const cs = getComputedStyle(child);
                    overhead += child.offsetHeight
                        + parseFloat(cs.marginTop    || 0)
                        + parseFloat(cs.marginBottom || 0);
                });
                const bcs = getComputedStyle(body);
                overhead += parseFloat(bcs.paddingTop    || 0)
                          + parseFloat(bcs.paddingBottom || 0);
            }

            const targetH = Math.max(260, sweetH - overhead);
            chartContainer.style.height = targetH + 'px';
        }

        // Set height synchronously before new Chart() reads the container size
        applyChartHeight();

        // On resize: disconnect → update → reconnect to avoid observer feedback loop
        if (window._evChartRO) window._evChartRO.disconnect();
        if (window.ResizeObserver && sweetPanel) {
            window._evChartRO = new ResizeObserver(() => {
                window._evChartRO.disconnect();        // stop watching while we write
                applyChartHeight();
                if (evScatterChartInstance) evScatterChartInstance.resize();
                window._evChartRO.observe(sweetPanel); // resume
            });
            window._evChartRO.observe(sweetPanel);
        }

        const ctx = document.getElementById('evScatterChart').getContext('2d');
        const gridColor = 'rgba(0, 229, 255, 0.08)';
        const textColor = '#8899aa';
        const tooltipBgColor = '#0d1017';

        evScatterChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    { label: 'Won Legs', data: wonData, backgroundColor: wonColor, borderColor: wonBorder, pointRadius: 5, pointStyle: 'circle' },
                    { label: 'Lost Legs', data: lossData, backgroundColor: lossColor, borderColor: lossBorder, pointRadius: 5, pointStyle: 'rectRot' },
                    { label: 'Pushed Legs (DNB)', data: pushData, backgroundColor: pushColor, borderColor: pushBorder, pointRadius: 5, pointStyle: 'triangle' },
                    { label: 'Pending Legs', data: pendingData, backgroundColor: pendingColor, borderColor: pendingBorder, pointRadius: 6, pointStyle: 'star', borderWidth: 1.5 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear', position: 'bottom', title: { display: true, text: 'Match Date', color: textColor },
                        ticks: { color: textColor, callback: function (value) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } },
                        grid: { color: gridColor, drawBorder: false }
                    },
                    y: {
                        title: { display: true, text: 'Model Expected Value (%)', color: textColor },
                        ticks: { color: textColor, callback: val => val + '%' },
                        grid: { color: (context) => context.tick.value === 0 ? (isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)') : gridColor, lineWidth: (context) => context.tick.value === 0 ? 2 : 1 }
                    }
                },
                plugins: {
                    tooltip: {
                        backgroundColor: tooltipBgColor, padding: 10,
                        callbacks: {
                            label: function (context) {
                                let p = context.raw; let d = p.dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                return `${p.match} (${d}) | ${p.market} @ ${p.odds.toFixed(2)} | EV: ${p.actualEv.toFixed(1)}%`;
                            }
                        }
                    },
                    legend: { labels: { color: textColor, usePointStyle: true, padding: 20 } }
                }
            }
        });

        setupEvImmersiveExplorer();
        updateEvImmersiveData(immersivePoints);
    }


    // --- MARKET EDGE BREAKDOWN ---
    function renderMarketEdgeBreakdown(data) {
        const container = document.getElementById('market-edge-container');
        if (!container) return;

        const allLegs = buildEvaluatedLegsWalkForward(data);

        // Group by market
        const marketOrder = ['1X', 'X2', '12', 'DNB Home', 'DNB Away'];
        const stats = {};
        marketOrder.forEach(m => { stats[m] = { bets: 0, wins: 0, losses: 0, pushes: 0, sumProfit: 0, avgOdds: 0, sumOdds: 0 }; });

        allLegs.forEach(leg => {
            const result = getSlipLegResult(leg.market, leg.outcome);
            if (!result) return; // skip unresolved
            const m = leg.market;
            if (!stats[m]) stats[m] = { bets: 0, wins: 0, losses: 0, pushes: 0, sumProfit: 0, avgOdds: 0, sumOdds: 0 };
            stats[m].bets++;
            stats[m].sumOdds += leg.odds;
            if (result === 'win') { stats[m].wins++; stats[m].sumProfit += (leg.odds - 1); }
            else if (result === 'loss') { stats[m].losses++; stats[m].sumProfit -= 1; }
            else if (result === 'push') { stats[m].pushes++; }
        });

        // Build sorted array by ROI descending
        const rows = marketOrder
            .filter(m => stats[m].bets > 0)
            .map(m => {
                const s = stats[m];
                const decided = s.wins + s.losses;
                const winRate = decided > 0 ? (s.wins / decided) : 0;
                const roi = s.bets > 0 ? (s.sumProfit / s.bets) * 100 : 0;
                const avgOdds = s.bets > 0 ? s.sumOdds / s.bets : 0;
                return { market: m, ...s, winRate, roi, avgOdds };
            })
            .sort((a, b) => b.roi - a.roi);

        if (rows.length === 0) {
            container.innerHTML = `<p class="text-sm text-muted italic text-center" style="padding:16px;">Not enough data for market edge breakdown.</p>`;
            return;
        }

        // Identify best and worst ROI
        const bestMarket = rows[0].market;
        const worstMarket = rows[rows.length - 1].roi < 0 ? rows[rows.length - 1].market : null;

        const badgeClassMap = {
            '1X': 'market-badge-1x',
            'X2': 'market-badge-x2',
            '12': 'market-badge-12',
            'DNB Home': 'market-badge-dnb-home',
            'DNB Away': 'market-badge-dnb-away'
        };

        const iconMap = {
            '1X': 'fa-house-chimney',
            'X2': 'fa-plane-departure',
            '12': 'fa-arrows-left-right',
            'DNB Home': 'fa-shield-halved',
            'DNB Away': 'fa-shield'
        };

        let html = `<table class="market-edge-table">`;
        html += `<thead><tr>
            <th>#</th>
            <th>Market</th>
            <th>Bets</th>
            <th>W</th>
            <th>L</th>
            <th>Push</th>
            <th>Win Rate</th>
            <th>Avg Odds</th>
            <th>ROI</th>
            <th>P&L (units)</th>
        </tr></thead><tbody>`;

        rows.forEach((row, idx) => {
            const rankClass = idx < 3 ? `market-edge-rank market-edge-rank-${idx + 1}` : '';
            const rowClass = row.market === bestMarket ? 'market-edge-best-row' :
                (row.market === worstMarket ? 'market-edge-worst-row' : '');
            const roiClass = row.roi > 0 ? 'roi-positive' : (row.roi < 0 ? 'roi-negative' : 'roi-neutral');
            const pnlClass = row.sumProfit > 0 ? 'pnl-positive' : (row.sumProfit < 0 ? 'pnl-negative' : '');
            const winRatePct = Math.round(row.winRate * 100);
            const badge = badgeClassMap[row.market] || '';
            const icon = iconMap[row.market] || 'fa-circle';

            html += `<tr class="${rowClass}">`;
            html += `<td data-label="#">${rankClass ? `<span class="${rankClass}">${idx + 1}</span>` : (idx + 1)}</td>`;
            html += `<td data-label="Market"><span class="market-badge ${badge}"><i class="fas ${icon}"></i> ${row.market}</span></td>`;
            html += `<td data-label="Bets">${row.bets}</td>`;
            html += `<td data-label="W">${row.wins}</td>`;
            html += `<td data-label="L">${row.losses}</td>`;
            html += `<td data-label="Push">${row.pushes}</td>`;
            html += `<td data-label="Win Rate">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span>${winRatePct}%</span>
                    <div class="market-edge-winrate-bar" style="flex:1;"><div class="market-edge-winrate-fill" style="width:${winRatePct}%;"></div></div>
                </div>
            </td>`;
            html += `<td data-label="Avg Odds">${row.avgOdds.toFixed(2)}</td>`;
            html += `<td data-label="ROI" class="${roiClass}">${row.roi > 0 ? '+' : ''}${row.roi.toFixed(1)}%</td>`;
            html += `<td data-label="P&L" class="${pnlClass}">${row.sumProfit > 0 ? '+' : ''}${row.sumProfit.toFixed(2)}u</td>`;
            html += `</tr>`;
        });

        html += `</tbody></table>`;

        // Totals row summary
        const totalBets = rows.reduce((s, r) => s + r.bets, 0);
        const totalWins = rows.reduce((s, r) => s + r.wins, 0);
        const totalLosses = rows.reduce((s, r) => s + r.losses, 0);
        const totalPushes = rows.reduce((s, r) => s + r.pushes, 0);
        const totalProfit = rows.reduce((s, r) => s + r.sumProfit, 0);
        const totalDecided = totalWins + totalLosses;
        const overallWinRate = totalDecided > 0 ? Math.round((totalWins / totalDecided) * 100) : 0;
        const overallRoi = totalBets > 0 ? (totalProfit / totalBets) * 100 : 0;
        const profitClass = totalProfit >= 0 ? 'text-green' : 'text-red';

        html += `<div style="margin-top: 16px; display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; font-size: 0.82rem;">`;
        html += `<div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted);">
                    <i class="fas fa-chart-bar"></i>
                    <span><strong style="color: var(--text-heading);">${totalBets}</strong> total bets across <strong style="color: var(--text-heading);">${rows.length}</strong> markets</span>
                 </div>`;
        html += `<div style="display: flex; align-items: center; gap: 6px; color: var(--text-muted);">
                    <i class="fas fa-percentage"></i>
                    <span>Overall WR: <strong style="color: var(--text-heading);">${overallWinRate}%</strong> (${totalWins}W/${totalLosses}L/${totalPushes}P)</span>
                 </div>`;
        html += `<div class="${profitClass}" style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
                    <i class="fas ${totalProfit >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
                    <span>Net: <strong>${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}u</strong> (ROI: ${overallRoi >= 0 ? '+' : ''}${overallRoi.toFixed(1)}%)</span>
                 </div>`;
        html += `</div>`;

        container.innerHTML = html;
    }

    // --- EDGE TRACKER ---
    // Monitors the three identified structural edges:
    //   1. Away odds 2.21–2.50 (strong mispricing signal on away underdogs)
    //   2. EV 2–5% band (confirmed sweet spot with positive Wilson LB)
    //   3. "12" market (triggered when stat & contextual models diverge on direction)
    function renderEdgeTracker(data) {
        // Find or create container — injected right after the market-edge section
        let container = document.getElementById('edge-tracker-container');
        if (!container) {
            const anchor = document.getElementById('market-edge-container');
            if (!anchor) return;
            container = document.createElement('div');
            container.id = 'edge-tracker-container';
            container.style.cssText = 'margin-top:24px;';
            anchor.parentElement.appendChild(container);
        }

        const allLegs = buildEvaluatedLegsWalkForward(data);

        // Helper: rolling last-N results as a sparkline string (W=1, L=0, P=0.5)
        function sparkline(results, n) {
            const recent = results.slice(-n);
            return recent.map(r => r === 'win' ? '▲' : r === 'loss' ? '▼' : '–').join('');
        }

        function calcEdge(legs) {
            const resolved = [];
            legs.forEach(leg => {
                const r = getSlipLegResult(leg.market, leg.outcome);
                if (r) resolved.push({ r, odds: leg.odds });
            });
            const w = resolved.filter(x => x.r === 'win').length;
            const l = resolved.filter(x => x.r === 'loss').length;
            const p = resolved.filter(x => x.r === 'push').length;
            const total = w + l + p;
            const decided = w + l;
            const winRate = decided > 0 ? (w / decided) * 100 : 0;
            const sumProfit = resolved.reduce((s, x) => {
                if (x.r === 'win') return s + (x.odds - 1);
                if (x.r === 'loss') return s - 1;
                return s;
            }, 0);
            const roi = total > 0 ? (sumProfit / total) * 100 : 0;
            const spark = sparkline(resolved.map(x => x.r), 15);
            // Wilson LB (90% CI)
            const z = 1.645;
            const wlb = decided > 0 ? (() => {
                const pp = w / decided;
                const denom = 1 + (z * z) / decided;
                const center = (pp + (z * z) / (2 * decided)) / denom;
                const margin = (z * Math.sqrt((pp * (1 - pp) + (z * z) / (4 * decided)) / decided)) / denom;
                return Math.max(0, center - margin) * 100;
            })() : 0;
            return { w, l, p, total, decided, winRate, roi, sumProfit, spark, wlb };
        }

        // Edge 1: Away odds 2.21–2.50
        const awayEdgeLegs = allLegs.filter(leg =>
            (leg.market === 'X2' || leg.market === 'DNB Away' || leg.market === '12') &&
            leg.rawOdds && leg.rawOdds.away >= 2.21 && leg.rawOdds.away <= 2.50
        );

        // Edge 2: EV 2–5%
        const evSweetLegs = allLegs.filter(leg => {
            const evPct = leg.ev * 100;
            return evPct >= 2 && evPct < 5;
        });

        // Edge 3: "12" market only
        const market12Legs = allLegs.filter(leg => leg.market === '12');

        const edges = [
            {
                id: 'away-odds-edge',
                icon: 'fa-plane-departure',
                label: 'Away 2.21–2.50',
                desc: 'Away underdog mispricing',
                color: 'var(--cyan)',
                bg: 'rgba(0,229,255,0.06)',
                border: 'rgba(0,229,255,0.25)',
                data: calcEdge(awayEdgeLegs),
                hint: 'Away legs where the away odds fall in the 2.21–2.50 band — historically the most over-priced away bucket.'
            },
            {
                id: 'ev-sweet-edge',
                icon: 'fa-star',
                label: 'EV 2–5% Band',
                desc: 'Confirmed sweet spot',
                color: 'var(--amber)',
                bg: 'rgba(255,179,0,0.06)',
                border: 'rgba(255,179,0,0.25)',
                data: calcEdge(evSweetLegs),
                hint: 'All legs with model EV between 2% and 5% — the band with statistically verified positive ROI and Wilson LB > 0.45.'
            },
            {
                id: 'market12-edge',
                icon: 'fa-arrows-left-right',
                label: '"12" Market',
                desc: 'Model divergence signal',
                color: 'var(--green)',
                bg: 'rgba(14,255,110,0.06)',
                border: 'rgba(14,255,110,0.25)',
                data: calcEdge(market12Legs),
                hint: 'Triggered when stat & contextual models predict opposite teams. The divergence itself is the signal — excludes draw from the stake.'
            }
        ];

        // Build rolling 30-day trend for each edge
        function rollingTrend(legs, days) {
            if (!legs.length) return [];
            const resolved = legs
                .filter(l => getSlipLegResult(l.market, l.outcome) && l.date)
                .map(l => ({ date: l.date, result: getSlipLegResult(l.market, l.outcome), odds: l.odds }))
                .sort((a, b) => a.date - b.date);
            if (!resolved.length) return [];
            const maxDate = resolved[resolved.length - 1].date;
            const points = [];
            for (let d = days - 1; d >= 0; d--) {
                const windowEnd = new Date(maxDate.getTime() - d * 86400000);
                const windowStart = new Date(windowEnd.getTime() - 6 * 86400000);
                const inWindow = resolved.filter(r => r.date >= windowStart && r.date <= windowEnd);
                const w = inWindow.filter(r => r.result === 'win').length;
                const l = inWindow.filter(r => r.result === 'loss').length;
                const total = w + l;
                points.push(total > 0 ? (w / total) * 100 : null);
            }
            return points;
        }

        const sparkColorMap = {
            '▲': 'color:var(--green)',
            '▼': 'color:var(--red)',
            '–': 'color:var(--text-muted)'
        };

        let html = `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <h3 style="font-size:0.85rem;font-weight:600;color:var(--text-heading);font-family:var(--font-mono);letter-spacing:0.04em;display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-crosshairs" style="color:var(--cyan);"></i> EDGE TRACKER
                </h3>
                <span style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);">Live · All-time · Last 15 shown in spark</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;">
        `;

        edges.forEach(edge => {
            const d = edge.data;
            const roiColor = d.roi > 0 ? 'var(--green)' : d.roi < 0 ? 'var(--red)' : 'var(--text-muted)';
            const wrColor = d.winRate >= 60 ? 'var(--green)' : d.winRate >= 40 ? 'var(--amber)' : 'var(--red)';
            const wlbBadge = d.wlb >= 50
                ? `<span style="font-size:0.6rem;background:rgba(14,255,110,0.15);color:var(--green);border:1px solid rgba(14,255,110,0.3);padding:1px 7px;border-radius:999px;font-family:var(--font-mono);">LB ${d.wlb.toFixed(0)}%</span>`
                : d.decided >= 5
                    ? `<span style="font-size:0.6rem;background:rgba(255,179,0,0.12);color:var(--amber);border:1px solid rgba(255,179,0,0.25);padding:1px 7px;border-radius:999px;font-family:var(--font-mono);">LB ${d.wlb.toFixed(0)}%</span>`
                    : `<span style="font-size:0.6rem;color:var(--text-muted);font-family:var(--font-mono);">LOW SAMPLE</span>`;

            const sparkHtml = d.spark
                ? d.spark.split('').map(ch => `<span style="${sparkColorMap[ch] || ''};font-size:0.7rem;">${ch}</span>`).join('')
                : '<span style="color:var(--text-muted);font-size:0.7rem;">no data</span>';

            const pendingLegs = allLegs.filter(leg => {
                if (edge.id === 'away-odds-edge') return awayEdgeLegs.includes(leg) && (leg.state === 'pending' || !leg.outcome);
                if (edge.id === 'ev-sweet-edge') return evSweetLegs.includes(leg) && (leg.state === 'pending' || !leg.outcome);
                if (edge.id === 'market12-edge') return market12Legs.includes(leg) && (leg.state === 'pending' || !leg.outcome);
                return false;
            }).length;

            html += `
                <div style="background:${edge.bg};border:1px solid ${edge.border};border-radius:var(--radius-md);padding:14px;position:relative;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
                        <div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <i class="fas ${edge.icon}" style="color:${edge.color};font-size:0.85rem;"></i>
                                <span style="font-size:0.82rem;font-weight:600;color:var(--text-heading);font-family:var(--font-mono);">${edge.label}</span>
                            </div>
                            <div style="font-size:0.65rem;color:var(--text-muted);margin-top:2px;">${edge.desc}</div>
                        </div>
                        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
                            ${wlbBadge}
                            ${pendingLegs > 0 ? `<span style="font-size:0.6rem;color:var(--amber);font-family:var(--font-mono);">${pendingLegs} pending</span>` : ''}
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
                        <div style="text-align:center;background:var(--bg-elevated);border-radius:var(--radius-sm);padding:6px 4px;">
                            <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px;">Win Rate</div>
                            <div style="font-size:1rem;font-weight:600;color:${wrColor};font-family:var(--font-mono);">${d.decided > 0 ? d.winRate.toFixed(1) + '%' : '—'}</div>
                            <div style="font-size:0.6rem;color:var(--text-muted);">${d.w}W / ${d.l}L${d.p > 0 ? ' / ' + d.p + 'P' : ''}</div>
                        </div>
                        <div style="text-align:center;background:var(--bg-elevated);border-radius:var(--radius-sm);padding:6px 4px;">
                            <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px;">ROI</div>
                            <div style="font-size:1rem;font-weight:600;color:${roiColor};font-family:var(--font-mono);">${d.total > 0 ? (d.roi >= 0 ? '+' : '') + d.roi.toFixed(1) + '%' : '—'}</div>
                            <div style="font-size:0.6rem;color:var(--text-muted);">${d.total} bets</div>
                        </div>
                        <div style="text-align:center;background:var(--bg-elevated);border-radius:var(--radius-sm);padding:6px 4px;">
                            <div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px;">P&L</div>
                            <div style="font-size:1rem;font-weight:600;color:${d.sumProfit >= 0 ? 'var(--green)' : 'var(--red)'};font-family:var(--font-mono);">${d.total > 0 ? (d.sumProfit >= 0 ? '+' : '') + d.sumProfit.toFixed(2) : '—'}</div>
                            <div style="font-size:0.6rem;color:var(--text-muted);">units</div>
                        </div>
                    </div>

                    <div style="border-top:1px solid ${edge.border};padding-top:8px;">
                        <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:4px;font-family:var(--font-mono);">LAST 15 RESULTS</div>
                        <div style="display:flex;gap:2px;flex-wrap:wrap;letter-spacing:1px;">${sparkHtml}</div>
                    </div>

                    <div style="margin-top:8px;font-size:0.62rem;color:var(--text-muted);line-height:1.4;border-top:1px solid ${edge.border};padding-top:6px;">
                        ${edge.hint}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
    }

    // --- EV IMMERSIVE EXPLORER ---
    function setupEvImmersiveExplorer() {
        const chartContainer = document.getElementById('evScatterChartContainer');
        if (!chartContainer) return;

        if (!document.getElementById('ev-immersive-toolbar')) {
            const toolbar = document.createElement('div');
            toolbar.id = 'ev-immersive-toolbar';
            toolbar.className = 'ev-immersive-toolbar';
            toolbar.innerHTML = `
                <div class="summary" id="ev-immersive-summary">Immersive explorer ready.</div>
                <div class="toolbar-actions">
                    <button type="button" id="ev-immersive-open">Enter Immersive</button>
                </div>
            `;
            chartContainer.parentElement.insertBefore(toolbar, chartContainer);
        }

        if (!document.getElementById('ev-immersive-overlay')) { 
            const overlay = document.createElement('div');
            overlay.id = 'ev-immersive-overlay';
            overlay.className = 'ev-immersive-overlay';
            overlay.innerHTML = `
                <div class="ev-immersive-shell" role="dialog" aria-modal="true" aria-label="EV Immersive Explorer">
                    <div class="ev-immersive-header">
                        <div>
                            <div class="ev-immersive-title">EV Immersive Explorer</div>
                            <div class="ev-immersive-subtitle">Glide through time-weighted EV results with live filters.</div>
                        </div>
                        <div class="ev-immersive-actions">
                            <button class="ev-immersive-btn primary" id="ev-immersive-focus">Focus Top EV</button>
                            <button class="ev-immersive-btn" id="ev-immersive-reset">Reset View</button>
                            <button class="ev-immersive-btn" id="ev-immersive-close">Close</button>
                        </div>
                    </div>
                    <div class="ev-immersive-body">
                        <div class="ev-immersive-panel">
                            <div class="ev-immersive-stat-block" id="ev-immersive-stats">
                                <div class="ev-immersive-stat"><span>Total legs</span><strong>0</strong></div>
                                <div class="ev-immersive-stat"><span>EV window</span><strong>0%</strong></div>
                                <div class="ev-immersive-stat"><span>Wins</span><strong>0</strong></div>
                                <div class="ev-immersive-stat"><span>Losses</span><strong>0</strong></div>
                            </div>
                            <div>
                                <div class="ev-immersive-filters" id="ev-immersive-filters">
                                    <button class="ev-pill is-active" data-result="win">Won</button>
                                    <button class="ev-pill is-active" data-result="loss">Loss</button>
                                    <button class="ev-pill is-active" data-result="push">Push</button>
                                    <button class="ev-pill is-active" data-result="pending">Pending</button>
                                </div>
                            </div>
                            <div class="ev-immersive-detail-note">
                                Drag to pan. Scroll to zoom. Scroll on an axis to zoom that axis. Double click to reset.
                            </div>
                            <div class="ev-immersive-detail" id="ev-immersive-detail">
                                Hover a point to see match details and EV context.
                            </div>
                        </div>
                        <div class="ev-immersive-canvas-wrap">
                            <canvas id="ev-immersive-canvas"></canvas>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        if (!evImmersiveExplorer) {
            evImmersiveExplorer = createEvImmersiveExplorer();
        }

        const openBtn = document.getElementById('ev-immersive-open');
        const focusCta = document.getElementById('ev-immersive-focus');
        if (openBtn) openBtn.onclick = () => evImmersiveExplorer.open();
        if (focusCta) focusCta.onclick = () => evImmersiveExplorer.focusTopEv();
    }

    function updateEvImmersiveData(points) {
        evImmersivePoints = Array.isArray(points) ? points : [];
        const summaryEl = document.getElementById('ev-immersive-summary');
        if (summaryEl) {
            if (evImmersivePoints.length === 0) {
                summaryEl.textContent = 'Immersive explorer ready. No resolved EV legs yet.';
            } else {
                const wins = evImmersivePoints.filter(p => p.result === 'win').length;
                const losses = evImmersivePoints.filter(p => p.result === 'loss').length;
                const pushes = evImmersivePoints.filter(p => p.result === 'push').length;
                const pendings = evImmersivePoints.filter(p => p.result === 'pending').length;
                const dates = evImmersivePoints.map(p => p.dateObj?.getTime()).filter(t => Number.isFinite(t));
                const minDate = dates.length ? new Date(Math.min(...dates)) : null;
                const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
                const dateLabel = minDate && maxDate
                    ? `${minDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${maxDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : 'Date range unavailable';
                const pendingLabel = pendings > 0 ? ` / ${pendings}Pend` : '';
                summaryEl.textContent = `EV legs: ${evImmersivePoints.length} | ${wins}W / ${losses}L / ${pushes}P${pendingLabel} | ${dateLabel}`;
            }
        }
        if (evImmersiveExplorer && evImmersiveExplorer.updateData) {
            evImmersiveExplorer.updateData(evImmersivePoints);
        }
    }

    function createEvImmersiveExplorer() {
        const overlay = document.getElementById('ev-immersive-overlay');
        const canvas = document.getElementById('ev-immersive-canvas');
        const ctx = canvas.getContext('2d');
        const detailEl = document.getElementById('ev-immersive-detail');
        const statsEl = document.getElementById('ev-immersive-stats');
        const filterContainer = document.getElementById('ev-immersive-filters');
        const focusBtn = document.getElementById('ev-immersive-focus');
        const resetBtn = document.getElementById('ev-immersive-reset');
        const closeBtn = document.getElementById('ev-immersive-close');

        const state = {
            points: [],
            mapped: [],
            visible: [],
            dataMinEv: -20,
            dataMaxEv: 20,
            viewMinEv: -20,
            viewMaxEv: 20,
            dataMinDate: null,
            dataMaxDate: null,
            viewMinDate: null,
            viewMaxDate: null,
            hoverIndex: null,
            show: { win: true, loss: true, push: true, pending: true },
            animationId: null,
            isOpen: false,
            pointer: { x: 0, y: 0, active: false },
            isPanning: false,
            panStart: null,
            panView: null
        };

        const colors = {
            win: { fill: 'rgba(14, 255, 110, 0.85)', glow: 'rgba(14, 255, 110, 0.6)' },
            loss: { fill: 'rgba(255, 61, 113, 0.85)', glow: 'rgba(255, 61, 113, 0.6)' },
            push: { fill: 'rgba(136, 153, 170, 0.85)', glow: 'rgba(136, 153, 170, 0.6)' },
            pending: { fill: 'rgba(255, 179, 0, 0.85)', glow: 'rgba(255, 179, 0, 0.6)' }
        };

        function hashString(input) {
            let hash = 0;
            for (let i = 0; i < input.length; i++) {
                hash = ((hash << 5) - hash) + input.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash);
        }

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            layoutPoints();
        }

        function computeBounds(points) {
            if (!points.length) {
                state.dataMinEv = -20;
                state.dataMaxEv = 20;
                state.viewMinEv = -20;
                state.viewMaxEv = 20;
                state.dataMinDate = null;
                state.dataMaxDate = null;
                state.viewMinDate = null;
                state.viewMaxDate = null;
                return;
            }
            const evValues = points.map(p => p.actualEv).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
            let minEv = -20;
            let maxEv = 20;
            if (evValues.length) {
                minEv = evValues[0];
                maxEv = evValues[evValues.length - 1];
                if (evValues.length > 8) {
                    const q05 = evValues[Math.floor(evValues.length * 0.05)];
                    const q95 = evValues[Math.floor(evValues.length * 0.95)];
                    minEv = Math.min(minEv, q05);
                    maxEv = Math.max(maxEv, q95);
                }
                minEv = Math.floor(minEv - 1);
                maxEv = Math.ceil(maxEv + 1);
                if (minEv === maxEv) { minEv -= 1; maxEv += 1; }
            }
            state.dataMinEv = minEv;
            state.dataMaxEv = maxEv;
            state.viewMinEv = minEv;
            state.viewMaxEv = maxEv;

            const times = points.map(p => p.dateObj?.getTime()).filter(t => Number.isFinite(t));
            let minT = Math.min(...times);
            let maxT = Math.max(...times);
            if (!Number.isFinite(minT) || !Number.isFinite(maxT)) {
                state.dataMinDate = null;
                state.dataMaxDate = null;
                state.viewMinDate = null;
                state.viewMaxDate = null;
                return;
            }
            if (minT === maxT) maxT = minT + 86400000;
            state.dataMinDate = minT;
            state.dataMaxDate = maxT;
            state.viewMinDate = minT;
            state.viewMaxDate = maxT;
        }

        // Plot area padding: left for Y-axis labels, bottom for X-axis labels
        const PAD = { left: 65, right: 30, top: 30, bottom: 50 };

        function getPlotArea() {
            const rect = canvas.getBoundingClientRect();
            const w = rect.width || 1;
            const h = rect.height || 1;
            return { x: PAD.left, y: PAD.top, w: w - PAD.left - PAD.right, h: h - PAD.top - PAD.bottom, fullW: w, fullH: h };
        }

        function layoutPoints() {
            if (!state.points.length) { state.mapped = []; return; }
            const plot = getPlotArea();
            const minDate = state.viewMinDate ?? state.dataMinDate ?? Date.now();
            const maxDate = state.viewMaxDate ?? state.dataMaxDate ?? (Date.now() + 86400000);
            const dateSpan = Math.max(1, maxDate - minDate);
            const evSpan = Math.max(1, state.viewMaxEv - state.viewMinEv);
            const oddsValues = state.points.map(p => p.odds).filter(v => Number.isFinite(v));
            const minOdds = oddsValues.length ? Math.min(...oddsValues) : 1;
            const maxOdds = oddsValues.length ? Math.max(...oddsValues) : 3;
            const oddsSpan = Math.max(0.01, maxOdds - minOdds);

            state.mapped = state.points.map((point, idx) => {
                const time = point.dateObj?.getTime() ?? minDate;
                const evVal = Number.isFinite(point.actualEv) ? point.actualEv : 0;
                const tNorm = (time - minDate) / dateSpan;
                const eNorm = (evVal - state.viewMinEv) / evSpan;
                const oddsNorm = ((point.odds ?? minOdds) - minOdds) / oddsSpan;
                const seed = hashString(`${point.match}-${point.market}-${idx}`);
                const randX = (seed % 1000) / 1000;
                const randY = ((seed >> 2) % 1000) / 1000;
                const x = plot.x + plot.w * tNorm + (randX - 0.5) * 10;
                const y = plot.y + plot.h * (1 - eNorm) + (randY - 0.5) * 10;
                return { ...point, x, y, depth: 0.4 + oddsNorm * 0.6, seed };
            });
        }

        function filterPoints() {
            state.visible = state.mapped.filter(p => {
                if (!state.show[p.result]) return false;
                if (!Number.isFinite(p.actualEv)) return false;
                if (p.actualEv < state.viewMinEv || p.actualEv > state.viewMaxEv) return false;
                if (Number.isFinite(state.viewMinDate) && Number.isFinite(state.viewMaxDate)) {
                    const t = p.dateObj?.getTime();
                    if (!Number.isFinite(t) || t < state.viewMinDate || t > state.viewMaxDate) return false;
                }
                return true;
            });
        }

        function updateStats() {
            if (!statsEl) return;
            const total = state.points.length;
            const wins = state.points.filter(p => p.result === 'win').length;
            const losses = state.points.filter(p => p.result === 'loss').length;
            const pushes = state.points.filter(p => p.result === 'push').length;
            const pendings = state.points.filter(p => p.result === 'pending').length;

            // EV+ (>=0) resolved legs only
            const evPlusPoints = state.points.filter(p => Number.isFinite(p.actualEv) && p.actualEv >= 0);
            const evPlusWins   = evPlusPoints.filter(p => p.result === 'win').length;
            const evPlusLosses = evPlusPoints.filter(p => p.result === 'loss').length;
            const evPlusTotal  = evPlusWins + evPlusLosses;
            const evPlusWR     = evPlusTotal > 0 ? ((evPlusWins / evPlusTotal) * 100).toFixed(1) : null;

            statsEl.innerHTML = `
                <div class="ev-immersive-stat"><span>Total legs</span><strong>${total}</strong></div>
                <div class="ev-immersive-stat"><span>EV window</span><strong>${state.viewMinEv.toFixed(1)}% to ${state.viewMaxEv.toFixed(1)}%</strong></div>
                <div class="ev-immersive-stat"><span>Wins</span><strong>${wins}</strong></div>
                <div class="ev-immersive-stat"><span>Losses</span><strong>${losses}</strong></div>
                ${pendings > 0 ? '<div class="ev-immersive-stat"><span>Pending</span><strong style="color:var(--amber)">' + pendings + '</strong></div>' : ''}
                <div class="ev-immersive-stat" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(0,229,255,0.12);grid-column:1/-1;">
                    <span style="color:var(--cyan);font-weight:600;letter-spacing:0.05em;">EV+ (&gt;=0%)</span>
                    <strong style="color:var(--cyan);">${evPlusWins}W / ${evPlusLosses}L${evPlusWR !== null ? ' <span style="font-size:0.72em;font-weight:400;color:var(--text-muted);">(' + evPlusWR + '% WR)</span>' : ''}</strong>
                </div>
            `;
        }

        function updateDetail(point) {
            if (!detailEl) return;
            if (!point) {
                detailEl.textContent = 'Hover a point to see match details and EV context.';
                return;
            }
            const dateLabel = point.dateObj ? point.dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Unknown date';
            const resultLabel = point.result === 'win' ? 'Won' : (point.result === 'loss' ? 'Loss' : (point.result === 'pending' ? '⏳ Pending' : 'Push'));
            const oddsLabel = Number.isFinite(point.odds) ? point.odds.toFixed(2) : 'N/A';
            const evLabel = Number.isFinite(point.actualEv) ? point.actualEv.toFixed(1) : 'N/A';
            const profitNumber = Number.isFinite(point.profit) ? point.profit : 0;
            const profitLabel = profitNumber.toFixed(2);
            const isPending = point.result === 'pending';
            detailEl.innerHTML = `
                <strong>${point.match}</strong><br>
                ${dateLabel} | ${point.market} @ ${oddsLabel}<br>
                Result: ${resultLabel} | EV: ${evLabel}%<br>
                ${isPending ? 'Awaiting result' : `Profit: ${profitNumber >= 0 ? '+' : ''}${profitLabel} units`}
            `;
        }

        function drawBackground(width, height, time) {
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#0b1222');
            gradient.addColorStop(1, '#05070f');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            const plot = getPlotArea();
            const evSpan = Math.max(1, state.viewMaxEv - state.viewMinEv);
            const axisColor = 'rgba(148, 163, 184, 0.35)';
            const gridColor = 'rgba(148, 163, 184, 0.08)';
            const labelColor = 'rgba(203, 213, 225, 0.8)';
            const tickFont = '11px "Inter", sans-serif';
            const titleFont = '11px "Inter", sans-serif';

            // --- Sweet spot zone highlight ---
            if (detectedSweetSpotRanges && detectedSweetSpotRanges.length > 0) {
                detectedSweetSpotRanges.forEach(r => {
                    const rMin = Math.max(r.min, state.viewMinEv);
                    const rMax = Math.min(r.max === Infinity ? state.viewMaxEv : r.max, state.viewMaxEv);
                    if (rMin >= rMax) return;
                    const yTop = plot.y + plot.h * (1 - (rMax - state.viewMinEv) / evSpan);
                    const yBot = plot.y + plot.h * (1 - (rMin - state.viewMinEv) / evSpan);
                    ctx.fillStyle = 'rgba(52, 211, 153, 0.06)';
                    ctx.fillRect(plot.x, yTop, plot.w, yBot - yTop);
                    ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.beginPath(); ctx.moveTo(plot.x, yTop); ctx.lineTo(plot.x + plot.w, yTop); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(plot.x, yBot); ctx.lineTo(plot.x + plot.w, yBot); ctx.stroke();
                    ctx.setLineDash([]);
                });
            }

            // --- Y-axis grid lines + tick labels (EV%) ---
            const evRange = state.viewMaxEv - state.viewMinEv;
            let evStep = 1;
            if (evRange > 40) evStep = 10;
            else if (evRange > 20) evStep = 5;
            else if (evRange > 8) evStep = 2.5;

            ctx.font = tickFont;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const firstTick = Math.ceil(state.viewMinEv / evStep) * evStep;
            for (let ev = firstTick; ev <= state.viewMaxEv; ev += evStep) {
                const yNorm = (ev - state.viewMinEv) / evSpan;
                const y = plot.y + plot.h * (1 - yNorm);
                // grid line
                const isZero = Math.abs(ev) < 0.001;
                ctx.strokeStyle = isZero ? 'rgba(248, 250, 252, 0.3)' : gridColor;
                ctx.lineWidth = isZero ? 1.5 : 0.5;
                ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke();
                // tick mark
                ctx.strokeStyle = axisColor;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(plot.x - 5, y); ctx.lineTo(plot.x, y); ctx.stroke();
                // label
                ctx.fillStyle = isZero ? 'rgba(248, 250, 252, 0.9)' : labelColor;
                ctx.fillText(ev.toFixed(ev % 1 === 0 ? 0 : 1) + '%', plot.x - 8, y);
            }

            // --- X-axis grid lines + tick labels (dates) ---
            if (state.viewMinDate != null && state.viewMaxDate != null) {
                const dateSpan = state.viewMaxDate - state.viewMinDate;
                let dateTicks = [];
                const msPerDay = 86400000;
                const totalDays = dateSpan / msPerDay;
                let dayStep = 1;
                if (totalDays > 180) dayStep = 30;
                else if (totalDays > 60) dayStep = 14;
                else if (totalDays > 30) dayStep = 7;
                else if (totalDays > 14) dayStep = 3;
                else if (totalDays > 7) dayStep = 2;

                const startDate = new Date(state.viewMinDate);
                startDate.setUTCHours(0, 0, 0, 0);
                let d = new Date(startDate);
                while (d.getTime() <= state.viewMaxDate + msPerDay) {
                    if (d.getTime() >= state.viewMinDate) dateTicks.push(d.getTime());
                    d = new Date(d.getTime() + dayStep * msPerDay);
                }
                // Limit to ~10 ticks max
                while (dateTicks.length > 10) {
                    dateTicks = dateTicks.filter((_, i) => i % 2 === 0);
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                dateTicks.forEach(t => {
                    const tNorm = (t - state.viewMinDate) / Math.max(1, dateSpan);
                    const x = plot.x + plot.w * tNorm;
                    // grid line
                    ctx.strokeStyle = gridColor;
                    ctx.lineWidth = 0.5;
                    ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
                    // tick mark
                    ctx.strokeStyle = axisColor;
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(x, plot.y + plot.h); ctx.lineTo(x, plot.y + plot.h + 5); ctx.stroke();
                    // label
                    ctx.fillStyle = labelColor;
                    const dateObj = new Date(t);
                    ctx.fillText(dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), x, plot.y + plot.h + 8);
                });
            }

            // --- Axis lines ---
            ctx.strokeStyle = axisColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(plot.x, plot.y); ctx.lineTo(plot.x, plot.y + plot.h); // Y axis
            ctx.lineTo(plot.x + plot.w, plot.y + plot.h); // X axis
            ctx.stroke();

            // --- Y-axis title ---
            ctx.save();
            ctx.translate(14, plot.y + plot.h / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.font = titleFont;
            ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Expected Value (%)', 0, 0);
            ctx.restore();

            // --- X-axis title ---
            ctx.font = titleFont;
            ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('Match Date', plot.x + plot.w / 2, plot.y + plot.h + 32);
        }

        function drawPoints(width, height, time) {
            filterPoints();
            state.visible.forEach((point, idx) => {
                const color = colors[point.result] || colors.push;
                const driftX = 0;
                const driftY = 0;
                const isPending = point.result === 'pending';
                const radius = (point.result === 'push' ? 3.2 : (isPending ? 5.0 : 4.2)) * point.depth;
                const x = point.x + driftX;
                const y = point.y + driftY;

                ctx.save();
                ctx.shadowColor = color.glow;
                ctx.shadowBlur = isPending ? 14 * point.depth : 10 * point.depth;
                ctx.fillStyle = color.fill;
                if (isPending) {
                    // Draw star shape for pending points
                    const spikes = 5;
                    const outerR = radius;
                    const innerR = radius * 0.45;
                    ctx.beginPath();
                    for (let i = 0; i < spikes * 2; i++) {
                        const r = i % 2 === 0 ? outerR : innerR;
                        const angle = (Math.PI / spikes) * i - Math.PI / 2;
                        if (i === 0) ctx.moveTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
                        else ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
                    }
                    ctx.closePath();
                    ctx.fill();
                    // Add a subtle pulsing stroke for pending
                    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                point._drawX = x;
                point._drawY = y;
                point._radius = radius;
            });
        }

        function updateHoverFromPointer() {
            if (state.isPanning) return;
            if (!state.pointer.active) {
                if (state.hoverIndex !== null) {
                    state.hoverIndex = null;
                    updateDetail(null);
                }
                return;
            }
            let bestIdx = null;
            let bestDist = 99999;
            state.visible.forEach((point, idx) => {
                const dx = state.pointer.x - point._drawX;
                const dy = state.pointer.y - point._drawY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < bestDist && dist < 18) {
                    bestDist = dist;
                    bestIdx = idx;
                }
            });
            if (bestIdx !== state.hoverIndex) {
                state.hoverIndex = bestIdx;
                updateDetail(bestIdx !== null ? state.visible[bestIdx] : null);
            }
        }

        function drawHover() {
            if (state.hoverIndex === null) return;
            const point = state.visible[state.hoverIndex];
            if (!point) return;
            const plot = getPlotArea();

            // Crosshair lines
            ctx.save();
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
            ctx.lineWidth = 0.8;
            ctx.setLineDash([3, 3]);
            // Vertical
            ctx.beginPath();
            ctx.moveTo(point._drawX, plot.y);
            ctx.lineTo(point._drawX, plot.y + plot.h);
            ctx.stroke();
            // Horizontal
            ctx.beginPath();
            ctx.moveTo(plot.x, point._drawY);
            ctx.lineTo(plot.x + plot.w, point._drawY);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // Hover ring
            ctx.save();
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(point._drawX, point._drawY, point._radius + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();

            // Coordinate label at crosshair
            const evLabel = Number.isFinite(point.actualEv) ? point.actualEv.toFixed(1) + '%' : '';
            if (evLabel) {
                ctx.save();
                ctx.font = '10px "Inter", sans-serif';
                ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(evLabel, point._drawX - 6, point._drawY - 4);
                ctx.restore();
            }
        }

        function renderFrame(time) {
            if (!state.isOpen) return;
            const rect = canvas.getBoundingClientRect();
            const width = rect.width || 1;
            const height = rect.height || 1;
            drawBackground(width, height, time);
            drawPoints(width, height, time);
            updateHoverFromPointer();
            drawHover();
            state.animationId = requestAnimationFrame(renderFrame);
        }

        function resetView() {
            state.viewMinEv = state.dataMinEv;
            state.viewMaxEv = state.dataMaxEv;
            state.viewMinDate = state.dataMinDate;
            state.viewMaxDate = state.dataMaxDate;
            updateStats();
            layoutPoints();
            updateDetail(null);
        }

        function handlePointerDown(event) {
            if (event.button !== 0) return;
            event.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            state.isPanning = true;
            state.panStart = { x, y };
            state.panView = {
                minEv: state.viewMinEv,
                maxEv: state.viewMaxEv,
                minDate: state.viewMinDate,
                maxDate: state.viewMaxDate
            };
            state.pointer.active = false;
            if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
        }

        function handlePointerMove(event) {
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            if (state.isPanning && state.panStart && state.panView) {
                const plot = getPlotArea();
                const safeW = Math.max(1, plot.w);
                const safeH = Math.max(1, plot.h);
                const dx = x - state.panStart.x;
                const dy = y - state.panStart.y;
                const next = {};

                if (Number.isFinite(state.panView.minDate) && Number.isFinite(state.panView.maxDate)) {
                    const dateSpan = Math.max(1, state.panView.maxDate - state.panView.minDate);
                    const deltaTime = (-dx / safeW) * dateSpan;
                    next.dateMin = state.panView.minDate + deltaTime;
                    next.dateMax = state.panView.maxDate + deltaTime;
                }

                if (Number.isFinite(state.panView.minEv) && Number.isFinite(state.panView.maxEv)) {
                    const evSpan = Math.max(1, state.panView.maxEv - state.panView.minEv);
                    const deltaEv = (dy / safeH) * evSpan;
                    next.evMin = state.panView.minEv + deltaEv;
                    next.evMax = state.panView.maxEv + deltaEv;
                }

                applyViewRanges({ ...next, updateStats: true });
                return;
            }
            state.pointer = { x, y, active: true };
        }

        function handlePointerUp(event) {
            if (!state.isPanning) return;
            state.isPanning = false;
            state.panStart = null;
            state.panView = null;
            state.pointer.active = false;
            if (canvas.releasePointerCapture) canvas.releasePointerCapture(event.pointerId);
        }

        function handleWheel(event) {
            if (!state.isOpen) return;
            event.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const plot = getPlotArea();
            const safeW = Math.max(1, plot.w);
            const safeH = Math.max(1, plot.h);
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const zoomFactor = Math.exp(event.deltaY * 0.0015);

            const inXAxis = x >= plot.x && x <= (plot.x + plot.w) && y >= (plot.y + plot.h) && y <= (plot.y + plot.h + PAD.bottom);
            const inYAxis = y >= plot.y && y <= (plot.y + plot.h) && x >= (plot.x - PAD.left) && x <= plot.x;
            const inPlot = x >= plot.x && x <= (plot.x + plot.w) && y >= plot.y && y <= (plot.y + plot.h);

            const shouldZoomX = inXAxis || (!inYAxis && inPlot);
            const shouldZoomY = inYAxis || (!inXAxis && inPlot);

            let next = {};

            if (shouldZoomX) {
                if (!Number.isFinite(state.viewMinDate) || !Number.isFinite(state.viewMaxDate)) return;
                const dateSpan = Math.max(1, state.viewMaxDate - state.viewMinDate);
                const xNorm = Math.max(0, Math.min(1, (x - plot.x) / safeW));
                const timeAtPointer = state.viewMinDate + xNorm * dateSpan;
                const newSpan = dateSpan * zoomFactor;
                const newMin = timeAtPointer - xNorm * newSpan;
                const newMax = newMin + newSpan;
                next.dateMin = newMin;
                next.dateMax = newMax;
            }

            if (shouldZoomY) {
                const evSpan = Math.max(1, state.viewMaxEv - state.viewMinEv);
                const yNorm = Math.max(0, Math.min(1, (y - plot.y) / safeH));
                const evAtPointer = state.viewMaxEv - yNorm * evSpan;
                const newSpan = evSpan * zoomFactor;
                const newMin = evAtPointer - (1 - yNorm) * newSpan;
                const newMax = newMin + newSpan;
                next.evMin = newMin;
                next.evMax = newMax;
            }

            if (Object.keys(next).length) {
                applyViewRanges({ ...next, updateStats: shouldZoomY });
            }
        }

        function clampEvRange(minVal, maxVal) {
            const dataMin = state.dataMinEv;
            const dataMax = state.dataMaxEv;
            const minSpan = 1;
            let min = Math.min(minVal, maxVal);
            let max = Math.max(minVal, maxVal);
            min = Math.max(dataMin, Math.min(min, dataMax));
            max = Math.max(dataMin, Math.min(max, dataMax));
            if (max - min < minSpan) {
                const mid = (min + max) / 2;
                min = mid - minSpan / 2;
                max = mid + minSpan / 2;
            }
            if (min < dataMin) {
                min = dataMin;
                max = Math.min(dataMax, min + minSpan);
            }
            if (max > dataMax) {
                max = dataMax;
                min = Math.max(dataMin, max - minSpan);
            }
            return { min, max };
        }

        function clampDateRange(minVal, maxVal) {
            const dataMin = state.dataMinDate;
            const dataMax = state.dataMaxDate;
            if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
                return { min: null, max: null };
            }
            const minSpan = 86400000;
            let min = Math.min(minVal, maxVal);
            let max = Math.max(minVal, maxVal);
            min = Math.max(dataMin, Math.min(min, dataMax));
            max = Math.max(dataMin, Math.min(max, dataMax));
            if (max - min < minSpan) {
                const mid = (min + max) / 2;
                min = mid - minSpan / 2;
                max = mid + minSpan / 2;
            }
            if (min < dataMin) {
                min = dataMin;
                max = Math.min(dataMax, min + minSpan);
            }
            if (max > dataMax) {
                max = dataMax;
                min = Math.max(dataMin, max - minSpan);
            }
            return { min, max };
        }

        function applyViewRanges({ evMin, evMax, dateMin, dateMax, updateStats: shouldUpdateStats = true }) {
            if (Number.isFinite(evMin) && Number.isFinite(evMax)) {
                const clamped = clampEvRange(evMin, evMax);
                state.viewMinEv = clamped.min;
                state.viewMaxEv = clamped.max;
            }
            if (Number.isFinite(dateMin) && Number.isFinite(dateMax)) {
                const clamped = clampDateRange(dateMin, dateMax);
                state.viewMinDate = clamped.min;
                state.viewMaxDate = clamped.max;
            }
            if (shouldUpdateStats) updateStats();
            layoutPoints();
        }

        function updateData(points) {
            state.points = Array.isArray(points) ? points.slice() : [];
            computeBounds(state.points);
            updateStats();
            layoutPoints();
            filterPoints();
            updateDetail(null);
        }

        function open() {
            if (!overlay) return;
            overlay.classList.add('is-visible');
            state.isOpen = true;
            resizeCanvas();
            updateData(state.points);
            renderFrame(performance.now());
        }

        function close() {
            if (!overlay) return;
            overlay.classList.remove('is-visible');
            state.isOpen = false;
            state.isPanning = false;
            state.panStart = null;
            state.panView = null;
            if (state.animationId) {
                cancelAnimationFrame(state.animationId);
                state.animationId = null;
            }
        }

        function focusTopEv() {
            if (!state.visible.length) return;
            const top = state.visible.reduce((best, current) => current.actualEv > best.actualEv ? current : best, state.visible[0]);
            updateDetail(top);
        }

        if (closeBtn) closeBtn.addEventListener('click', close);
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        if (canvas) {
            canvas.addEventListener('pointerdown', handlePointerDown);
            canvas.addEventListener('pointermove', handlePointerMove);
            canvas.addEventListener('pointerup', handlePointerUp);
            canvas.addEventListener('pointercancel', handlePointerUp);
            canvas.addEventListener('pointerleave', () => {
                if (state.isPanning) return;
                state.pointer.active = false;
                state.hoverIndex = null;
                updateDetail(null);
            });
            canvas.addEventListener('wheel', handleWheel, { passive: false });
            canvas.addEventListener('dblclick', resetView);
        }
        if (filterContainer) {
            filterContainer.addEventListener('click', (event) => {
                const btn = event.target.closest('.ev-pill');
                if (!btn) return;
                const result = btn.getAttribute('data-result');
                if (!result) return;
                state.show[result] = !state.show[result];
                btn.classList.toggle('is-active', state.show[result]);
            });
        }
        if (focusBtn) focusBtn.addEventListener('click', focusTopEv);
        if (resetBtn) resetBtn.addEventListener('click', resetView);
        window.addEventListener('resize', () => {
            if (state.isOpen) resizeCanvas();
        });

        return { open, close, updateData, focusTopEv };
    }

    function getMarketBadgeClasses(market) {
        if (market === 'DNB Home') return 'market-badge market-badge-dnb-home';
        if (market === 'DNB Away') return 'market-badge market-badge-dnb-away';
        if (market === '1X') return 'market-badge market-badge-1x';
        if (market === 'X2') return 'market-badge market-badge-x2';
        return 'market-badge market-badge-12';
    }

    // --- SLIP BUILDER LOGIC ---
    function renderSlipBuilder() {
        const slipCandidatesList = document.getElementById('slip-candidates');
        const slipOutput = document.getElementById('slip-output');
        const slipSummary = document.getElementById('slip-summary');
        const slipStatus = document.getElementById('slip-status');
        const slipLegsCount = document.getElementById('slip-legs-count');
        const slipSlipsCount = document.getElementById('slip-slips-count');
        const slipSection = document.getElementById('slip-builder-section');

        if (!slipCandidatesList || !slipOutput || !slipSummary) return;
        if (!(selectedDateFilter instanceof Date)) {
            if (slipSection) slipSection.classList.add('hidden');
            return;
        }
        if (slipSection) slipSection.classList.remove('hidden');

        const bankrollInput = document.getElementById('slip-bankroll');
        const stakeInput = document.getElementById('slip-stake');

        const rawBankroll = bankrollInput ? bankrollInput.value : '';
        const rawStake = stakeInput ? stakeInput.value : '';
        const bankroll = rawBankroll === '' ? 0 : parseFloat(rawBankroll);
        const stake = rawStake === '' ? 0 : parseFloat(rawStake);

        const minOdds = 1.15; // Minimum odds floor
        const minLegs = 2;
        const maxSlips = 6;   // Cap total number of exclusive doubles shown

        // ── FINE-TUNE CONTROLS ───────────────────────────────────────────────────
        // Two controls only: EV threshold and away-edge priority.
        // Market filter removed — the market badge already communicates this.
        let controlsEl = document.getElementById('slip-fine-tune-controls');
        if (!controlsEl) {
            controlsEl = document.createElement('div');
            controlsEl.id = 'slip-fine-tune-controls';
            controlsEl.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:14px;margin-bottom:14px;padding:10px 14px;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);';
            controlsEl.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <label style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;white-space:nowrap;">Min EV</label>
                    <select id="slip-ev-threshold" style="background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-sm);padding:4px 8px;font-family:var(--font-mono);font-size:0.75rem;">
                        <option value="0">Any +EV</option>
                        <option value="2" data-auto selected>Sweet spot (2%+ · auto)</option>
                        <option value="3">Strong (3%+)</option>
                        <option value="5">Premium (5%+)</option>
                    </select>
                </div>
                <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:0.72rem;color:var(--text-secondary);font-family:var(--font-mono);white-space:nowrap;">
                    <input type="checkbox" id="slip-away-priority" checked style="accent-color:var(--cyan);width:13px;height:13px;cursor:pointer;">
                    Prioritise away 2.21–2.50
                </label>
            `;
            const candidatesEl = document.getElementById('slip-candidates');
            if (candidatesEl && candidatesEl.parentElement) {
                candidatesEl.parentElement.insertBefore(controlsEl, candidatesEl);
            }
            ['slip-ev-threshold', 'slip-away-priority'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.addEventListener('change', () => {
                    // If the user picks anything other than the auto option, lock it
                    if (id === 'slip-ev-threshold') {
                        const isAuto = el.options[el.selectedIndex]?.hasAttribute('data-auto');
                        el.dataset.userSet = isAuto ? 'false' : 'true';
                    }
                    renderSlipBuilder();
                });
            });
        }

        // Read settings
        const evThresholdEl  = document.getElementById('slip-ev-threshold');
        const awayPriorityEl = document.getElementById('slip-away-priority');
        const minEvThreshold = evThresholdEl  ? parseFloat(evThresholdEl.value) : 0;
        const awayPriority   = awayPriorityEl ? awayPriorityEl.checked : false;

        const slipSourceNote = document.getElementById('slip-source-note');
        if (slipSourceNote) {
            const dateLabel = selectedDateFilter.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            slipSourceNote.textContent = `Auto-built from dual predictions on ${dateLabel}. Finding bookmaker inefficiency.`;
        }

        if (isNaN(bankroll) || bankroll <= 0 || isNaN(stake) || stake <= 0) {
            if (slipStatus) {
                slipStatus.textContent = 'Awaiting valid Bankroll and Stake amounts...';
                slipStatus.className = 'mt-4 text-sm text-amber font-mono';
            }
            slipCandidatesList.innerHTML = ''; slipOutput.innerHTML = ''; slipSummary.innerHTML = '';
            if (slipLegsCount) slipLegsCount.textContent = '0';
            if (slipSlipsCount) slipSlipsCount.textContent = '0';
            return;
        }

        // Build the evaluated legs using the same walk-forward EV logic as the EV landscape
        const allEvaluatedLegs = buildEvaluatedLegsWalkForward(allData);
        const evaluatedLegs = allEvaluatedLegs.filter(leg => {
            if (!(selectedDateFilter instanceof Date)) return false;
            if (!isSameUtcDate(leg.updatedAt, selectedDateFilter)) return false;
            if (currentFilter !== 'all') {
                const state = leg.state ? String(leg.state).toLowerCase() : '';
                if (state !== currentFilter.toLowerCase()) return false;
            }
            return true;
        });

        // ── POOL CONSTRUCTION ────────────────────────────────────────────────────
        // Gate: EV > 0 AND odds >= floor. No range hard-gate.
        // Sort: sweet-spot legs first (highest EV), then remaining positive-EV legs.
        // This maximises the candidate pool while still honouring detected edge zones.
        const sweetSpotSet = new Set((detectedSweetSpotRanges || []).map(r => r.label));

        function getEvBucketLabel(evPct) {
            const bucketDefs = [
                { label: '< 0% (Negative)', min: -Infinity, max: 0   },
                { label: '0% - 1%',         min: 0,         max: 1   },
                { label: '1% - 2%',         min: 1,         max: 2   },
                { label: '2% - 3%',         min: 2,         max: 3   },
                { label: '3% - 4%',         min: 3,         max: 4   },
                { label: '4% - 5%',         min: 4,         max: 5   },
                { label: '5% - 7.5%',       min: 5,         max: 7.5 },
                { label: '7.5% - 10%',      min: 7.5,       max: 10  },
                { label: '> 10%',           min: 10,        max: Infinity }
            ];
            const b = bucketDefs.find(b => evPct >= b.min && evPct < b.max);
            return b ? b.label : null;
        }

        const positiveEvLegs = evaluatedLegs.filter(leg => {
            const evPct = leg.ev * 100;
            if (evPct < minEvThreshold) return false;
            if (leg.odds < minOdds) return false;
            return true;
        });

        function getEdgeTier(leg) {
            const evPct = leg.ev * 100;
            const isAwayEdge = awayPriority &&
                leg.rawOdds && leg.rawOdds.away >= 2.21 && leg.rawOdds.away <= 2.50 &&
                (leg.market === 'X2' || leg.market === 'DNB Away' || leg.market === '12');
            const isEvSweet = sweetSpotSet.has(getEvBucketLabel(evPct));
            // Tier 0: away edge + sweet EV — both confirmed edges together
            if (isAwayEdge && isEvSweet) return 0;
            // Tier 1: away edge alone
            if (isAwayEdge) return 1;
            // Tier 2: sweet spot EV only
            if (isEvSweet) return 2;
            // Tier 3: remaining positive EV
            return 3;
        }

        // Sort by tier (0=best) then EV descending within each tier
        const sweetSpotLegs  = positiveEvLegs.filter(leg => sweetSpotSet.has(getEvBucketLabel(leg.ev * 100)));
        const extendedLegs   = positiveEvLegs.filter(leg => !sweetSpotSet.has(getEvBucketLabel(leg.ev * 100)));

        positiveEvLegs.sort((a, b) => {
            const tierDiff = getEdgeTier(a) - getEdgeTier(b);
            if (tierDiff !== 0) return tierDiff;
            return b.ev - a.ev;
        });

        const selectedLegs = positiveEvLegs;

        if (slipLegsCount) slipLegsCount.textContent = `${selectedLegs.length}`;

        if (slipStatus) {
            if (selectedLegs.length >= minLegs) {
                const awayEdgeCount = selectedLegs.filter(leg =>
                    awayPriority && leg.rawOdds && leg.rawOdds.away >= 2.21 && leg.rawOdds.away <= 2.50
                ).length;
                const ssCount = selectedLegs.filter(leg => sweetSpotSet.has(getEvBucketLabel(leg.ev * 100))).length;
                const parts = [];
                if (awayEdgeCount > 0) parts.push(`${awayEdgeCount} away 2.21–2.50`);
                if (ssCount > 0) parts.push(`${ssCount} EV sweet spot`);
                const edgeNote = parts.length ? ` · ${parts.join(', ')}` : '';
                const doublesCount = Math.floor(selectedLegs.length / 2);
                slipStatus.textContent = `Quant Mode [EV≥${minEvThreshold}%]${edgeNote} · Building ${doublesCount} exclusive double${doublesCount !== 1 ? 's' : ''}.`;
                slipStatus.className = 'mt-4 text-sm text-muted font-mono';
            } else {
                slipStatus.textContent = `Quant Mode [EV≥${minEvThreshold}%]: Need at least ${minLegs} legs. Found ${selectedLegs.length}.`;
                slipStatus.className = 'mt-4 text-sm text-amber font-mono';
            }
        }

        if (selectedLegs.length === 0) {
            slipCandidatesList.innerHTML = `
                <div style="text-align: center; padding: 24px 0;">
                    <i class="fas fa-filter text-muted" style="font-size: 1.5rem; margin-bottom: 8px;"></i>
                    <p class="text-sm text-muted italic">Predictions did not yield enough +EV market edge.</p>
                </div>`;
        } else {
            slipCandidatesList.innerHTML = selectedLegs.map(leg => {
                const badgeClass = getMarketBadgeClasses(leg.market);
                const legResult = getSlipLegResult(leg.market, leg.outcome);
                const borderClass = legResult === 'loss'
                    ? 'slip-candidate--loss'
                    : legResult === 'win'
                        ? 'slip-candidate--won'
                        : '';

                const evPct = leg.ev * 100;
                const tier = getEdgeTier(leg);

                const isAwayEdge = awayPriority &&
                    leg.rawOdds && leg.rawOdds.away >= 2.21 && leg.rawOdds.away <= 2.50 &&
                    (leg.market === 'X2' || leg.market === 'DNB Away' || leg.market === '12');
                const isEvSweet = sweetSpotSet.has(getEvBucketLabel(evPct));

                const edgeTags = [];
                if (isAwayEdge) {
                    edgeTags.push(`<span style="font-size:0.58rem;color:var(--cyan);font-family:var(--font-mono);display:flex;align-items:center;gap:2px;"><i class="fas fa-plane-departure" style="font-size:0.5rem;"></i>away edge</span>`);
                }
                if (isEvSweet) {
                    edgeTags.push(`<span style="font-size:0.58rem;color:var(--amber);font-family:var(--font-mono);display:flex;align-items:center;gap:2px;"><i class="fas fa-star" style="font-size:0.5rem;"></i>sweet spot</span>`);
                }

                const tierDot = tier === 0
                    ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--cyan);display:inline-block;flex-shrink:0;box-shadow:0 0 4px var(--cyan);margin-top:4px;"></span>`
                    : tier === 1
                        ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--cyan);display:inline-block;flex-shrink:0;margin-top:4px;"></span>`
                        : tier === 2
                            ? `<span style="width:6px;height:6px;border-radius:50%;background:var(--amber);display:inline-block;flex-shrink:0;margin-top:4px;"></span>`
                            : `<span style="width:6px;height:6px;border-radius:50%;background:var(--border-subtle);display:inline-block;flex-shrink:0;margin-top:4px;"></span>`;

                return `
                    <div class="slip-candidate ${borderClass}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="display:flex;align-items:flex-start;gap:6px;">
                                <div style="margin-top:4px;">${tierDot}</div>
                                <div>
                                    <p class="font-semibold text-heading text-sm">${leg.match}</p>
                                    <p class="text-xs text-muted font-mono" style="margin-top: 2px;">H ${leg.rawOdds.home.toFixed(2)} &bull; D ${leg.rawOdds.draw.toFixed(2)} &bull; A ${leg.rawOdds.away.toFixed(2)}</p>
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap:2px;">
                                <span class="${badgeClass}">${leg.market} @ ${leg.odds.toFixed(2)}</span>
                                <span class="text-green font-mono font-semibold" style="font-size: 0.65rem;">+${evPct.toFixed(1)}% EV</span>
                                ${edgeTags.join('')}
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        slipOutput.innerHTML = '';
        slipSummary.innerHTML = '';

        if (selectedLegs.length < minLegs) {
            slipOutput.innerHTML = `<p class="text-sm text-muted italic text-center py-4">Not enough +EV legs to build an exclusive double (need at least 2).</p>`;
            if (slipSlipsCount) slipSlipsCount.textContent = '0';
            return;
        }

        // ── EXCLUSIVE 2-LEG DOUBLES ──────────────────────────────────────────────
        // Each leg appears in exactly one slip. Slips are fully independent so
        // portfolio-level staking and ROI calculations are statistically valid.
        // If the pool has an odd number of legs, the last leg is held as a spare
        // (it still appears in the candidates panel for visibility).
        const slips = [];
        const pairedLegs = selectedLegs.slice(0, maxSlips * 2); // cap pool
        for (let i = 0; i + 1 < pairedLegs.length; i += 2) {
            slips.push({ size: 2, legs: [pairedLegs[i], pairedLegs[i + 1]] });
            if (slips.length >= maxSlips) break;
        }

        if (slipSlipsCount) slipSlipsCount.textContent = `${slips.length}`;

        let totalStake = 0;
        let totalReturn = 0;
        let hasAnyPendingSlip = false;

        slips.forEach((slip, idx) => {
            const legResults = slip.legs.map(leg => getSlipLegResult(leg.market, leg.outcome));
            const hasLoss = legResults.includes('loss');
            const hasWin = legResults.includes('win');
            const hasPending = legResults.includes(null);
            const allResolved = !hasPending;
            const slipResult = hasLoss ? 'loss' : (allResolved && hasWin ? 'win' : 'pending');

            const slipBorderClass = slipResult === 'win'
                ? 'border-color: rgba(14, 255, 110, 0.4); box-shadow: 0 0 12px rgba(14, 255, 110, 0.1);'
                : slipResult === 'loss'
                    ? 'border-color: rgba(255, 61, 113, 0.4);'
                    : 'border-color: var(--border-default);';

            if (hasPending && !hasLoss) {
                hasAnyPendingSlip = true;
            }

            let combinedOddsExcludingPush = 1;
            let combinedModelProb = 1;

            slip.legs.forEach((leg, legIndex) => {
                if (legResults[legIndex] !== 'push') combinedOddsExcludingPush *= leg.odds;
                combinedModelProb *= leg.P_DC;
            });

            const slipTotalOdds = slip.legs.reduce((acc, leg) => acc * leg.odds, 1);
            const slipEV = (combinedModelProb * slipTotalOdds) - 1;

            let actualStake = Math.min(stake, bankroll);

            const returnAmt = hasLoss ? 0 : actualStake * combinedOddsExcludingPush;
            const profit = returnAmt - actualStake;
            const roi = actualStake > 0 ? (profit / actualStake) * 100 : 0;

            totalStake += actualStake;
            totalReturn += returnAmt;

            const slipLegsHtml = slip.legs.map((leg, legIndex) => {
                const legResult = legResults[legIndex];
                let dotColor = 'var(--amber)';
                if (legResult === 'win') dotColor = 'var(--green)';
                if (legResult === 'loss') dotColor = 'var(--red)';
                if (legResult === 'push') dotColor = 'var(--text-muted)';
                return `
                    <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem; color: var(--text-primary); padding: 3px 0;">
                        <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; flex-shrink: 0; box-shadow: 0 0 6px ${dotColor};"></span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary);">${leg.match}</span>
                        </div>
                        <span class="font-mono font-semibold" style="white-space: nowrap; font-size: 0.75rem;">${leg.market} @ ${leg.odds.toFixed(2)}</span>
                    </div>
                `;
            }).join('');

            slipOutput.innerHTML += `
                <div style="background: var(--bg-surface); ${slipBorderClass} border-width: 1px; border-style: solid; border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-bottom: 8px;">
                        <h4 class="font-semibold text-heading text-sm">Double ${idx + 1}</h4>
                        <div style="text-align: right;">
                            <span class="font-mono font-bold text-xs" style="color: var(--text-heading);">Odds: ${slipTotalOdds.toFixed(2)}</span>
                            ${slipEV > 0 ? `<div class="text-green font-mono font-semibold" style="font-size: 0.65rem;">+${(slipEV * 100).toFixed(1)}% EV</div>` : ''}
                        </div>
                    </div>
                    <div class="space-y-2">
                        ${slipLegsHtml}
                    </div>
                    <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-subtle); display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-family: var(--font-mono);">
                        <div class="text-center">
                            <span style="display: block; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Stake</span>
                            <span class="text-heading font-semibold text-xs">$${actualStake.toFixed(2)}</span>
                        </div>
                        <div class="text-center">
                            <span style="display: block; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Return</span>
                            <span class="text-heading font-semibold text-xs">$${returnAmt.toFixed(2)}</span>
                        </div>
                        <div class="text-center" style="border-left: 1px solid var(--border-subtle);">
                            <span style="display: block; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">Profit</span>
                            <span class="font-semibold text-xs ${profit > 0 ? 'text-green' : 'text-heading'}">${profit > 0 ? '+' : ''}$${profit.toFixed(2)}</span>
                        </div>
                        <div class="text-center">
                            <span style="display: block; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">ROI</span>
                            <span class="font-semibold text-xs ${roi > 0 ? 'text-green' : 'text-heading'}">${roi > 0 ? '+' : ''}${roi.toFixed(1)}%</span>
                        </div>
                    </div>
                </div>
            `;
        });

        const netProfit = totalReturn - totalStake;
        const portfolioROI = totalStake > 0 ? (netProfit / totalStake) * 100 : 0;
        const returnLabel = hasAnyPendingSlip ? 'Projected Return' : 'Total Return';
        const profitLabel = hasAnyPendingSlip ? 'Projected Profit' : 'Net Profit';

        slipSummary.innerHTML = `
            <div class="slip-summary-card">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0, 229, 255, 0.2); padding-bottom: 10px; margin-bottom: 12px;">
                    <h4 class="font-semibold text-heading text-sm">Portfolio Summary</h4>
                    <span class="text-xs font-mono text-cyan">Based on ${slips.length} double${slips.length === 1 ? '' : 's'}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-primary);">
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-muted">Bankroll:</span> <span class="text-heading font-semibold">$${bankroll.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-muted">Total Staked:</span> <span class="text-heading font-semibold">$${totalStake.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-muted">${returnLabel}:</span> <span class="text-heading font-semibold">$${totalReturn.toFixed(2)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span class="text-muted">${profitLabel}:</span> <span class="text-heading font-semibold">$${netProfit.toFixed(2)}</span>
                    </div>
                    <div style="grid-column: span 2; border-top: 1px dashed rgba(0, 229, 255, 0.2); margin-top: 6px; padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <span class="text-xs uppercase text-cyan font-semibold tracking-wider">Portfolio ROI</span>
                        <span class="font-bold text-sm ${portfolioROI > 0 ? 'text-green' : 'text-heading'}">${portfolioROI > 0 ? '+' : ''}${portfolioROI.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        `;
    }

    function buildOddsPreferenceIndex(data) {
        if (!Array.isArray(data) || data.length === 0) return null;
        const decidedMatches = data.filter(item => item.state === 'won' || item.state === 'loss');
        if (decidedMatches.length === 0) return null;

        const homeAnalysis = oddsBuckets.map(b => ({ ...b, totalPredictions: 0, successfulPredictions: 0, sumOfOdds: 0 }));
        const awayAnalysis = oddsBuckets.map(b => ({ ...b, totalPredictions: 0, successfulPredictions: 0, sumOfOdds: 0 }));

        decidedMatches.forEach(item => {
            const statPred = item.statistical ? String(item.statistical).toLowerCase() : null;
            const contextPred = item.contextual ? String(item.contextual).toLowerCase() : null;
            const isHomeBet = (statPred === 'home' || contextPred === 'home');
            const isAwayBet = (statPred === 'away' || contextPred === 'away');

            if (isHomeBet && item.home != null && !isNaN(item.home)) {
                for (const bucket of homeAnalysis) {
                    if (item.home >= bucket.min && item.home <= bucket.max) {
                        bucket.totalPredictions++;
                        bucket.sumOfOdds += item.home;
                        if (String(item.outcome).toLowerCase() === 'home') bucket.successfulPredictions++;
                        break;
                    }
                }
            }
            if (isAwayBet && item.away != null && !isNaN(item.away)) {
                for (const bucket of awayAnalysis) {
                    if (item.away >= bucket.min && item.away <= bucket.max) {
                        bucket.totalPredictions++;
                        bucket.sumOfOdds += item.away;
                        if (String(item.outcome).toLowerCase() === 'away') bucket.successfulPredictions++;
                        break;
                    }
                }
            }
        });

        const finalizeBuckets = (analysis) => analysis.map(bucket => {
            const winRate = bucket.totalPredictions > 0 ? bucket.successfulPredictions / bucket.totalPredictions : 0;
            const avgOdds = bucket.totalPredictions > 0 ? bucket.sumOfOdds / bucket.totalPredictions : 0;
            const ev = bucket.totalPredictions > 0 ? (winRate * (avgOdds - 1)) - (1 - winRate) : 0;
            return { ...bucket, winRate, avgOdds, ev };
        });

        const valid1X2Types = ['home', 'draw', 'away'];
        const wonMatchesFor1X2Odds = data.filter(item => item.state === 'won');
        let sumOfWinning1X2Odds = 0, countOfWinning1X2Odds = 0;
        wonMatchesFor1X2Odds.forEach(item => {
            const outcome = String(item.outcome).toLowerCase();
            const lowStat = item.statistical ? String(item.statistical).toLowerCase() : null;
            const lowContext = item.contextual ? String(item.contextual).toLowerCase() : null;
            let oddsForThisWin = 0;
            if (lowStat === outcome && valid1X2Types.includes(lowStat)) {
                if (outcome === 'home' && item.home != null) oddsForThisWin = parseFloat(item.home);
                else if (outcome === 'draw' && item.draw != null) oddsForThisWin = parseFloat(item.draw);
                else if (outcome === 'away' && item.away != null) oddsForThisWin = parseFloat(item.away);
            } else if (lowContext === outcome && valid1X2Types.includes(lowContext)) {
                if (outcome === 'home' && item.home != null) oddsForThisWin = parseFloat(item.home);
                else if (outcome === 'draw' && item.draw != null) oddsForThisWin = parseFloat(item.draw);
                else if (outcome === 'away' && item.away != null) oddsForThisWin = parseFloat(item.away);
            }
            if (oddsForThisWin > 0) { sumOfWinning1X2Odds += oddsForThisWin; countOfWinning1X2Odds++; }
        });

        return {
            home: finalizeBuckets(homeAnalysis),
            away: finalizeBuckets(awayAnalysis),
            avgWinningOdds: countOfWinning1X2Odds > 0 ? (sumOfWinning1X2Odds / countOfWinning1X2Odds) : null
        };
    }

    function getOddsPreferenceBonus(market, rawOdds, oddsPreferenceIndex) {
        if (!oddsPreferenceIndex || !rawOdds) return 0;

        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        const bonusFromBucket = (odds, buckets) => {
            if (!Number.isFinite(odds)) return 0;
            const bucket = buckets ? buckets.find(b => odds >= b.min && odds <= b.max) : null;
            if (bucket && bucket.totalPredictions >= minSamplesPerBucket) {
                const sampleFactor = Math.min(1, bucket.totalPredictions / (minSamplesPerBucket * 2));
                const cappedEv = clamp(bucket.ev, -0.08, 0.08);
                return cappedEv * sampleFactor;
            }
            if (Number.isFinite(oddsPreferenceIndex.avgWinningOdds) && oddsPreferenceIndex.avgWinningOdds > 0) {
                const delta = Math.abs(odds - oddsPreferenceIndex.avgWinningOdds) / oddsPreferenceIndex.avgWinningOdds;
                return -Math.min(0.03, delta * 0.03);
            }
            return 0;
        };

        if (market === 'DNB Home' || market === '1X') {
            return bonusFromBucket(rawOdds.home, oddsPreferenceIndex.home);
        }
        if (market === 'DNB Away' || market === 'X2') {
            return bonusFromBucket(rawOdds.away, oddsPreferenceIndex.away);
        }
        if (market === '12') {
            const homeBonus = bonusFromBucket(rawOdds.home, oddsPreferenceIndex.home);
            const awayBonus = bonusFromBucket(rawOdds.away, oddsPreferenceIndex.away);
            return Math.max(homeBonus, awayBonus);
        }
        return 0;
    }

    function updateSortIcons() {
        document.querySelectorAll('.sortable').forEach(header => {
            header.classList.remove('sort-asc', 'sort-desc');
            const column = header.getAttribute('data-column'), sortIcon = header.querySelector('.fa-sort'), sortUpIcon = header.querySelector('.fa-sort-up'), sortDownIcon = header.querySelector('.fa-sort-down');
            if (column !== 'updatedAt') {
                if (sortIcon) sortIcon.style.display = 'inline-block'; if (sortUpIcon) sortUpIcon.style.display = 'none'; if (sortDownIcon) sortDownIcon.style.display = 'none';
            } else { header.querySelectorAll('i').forEach(icon => icon.style.display = 'none'); }
            if (column === sortColumn) {
                header.classList.add(`sort-${sortDirection}`);
                if (column !== 'updatedAt') {
                    if (sortIcon) sortIcon.style.display = 'none';
                    if (sortDirection === 'asc' && sortUpIcon) sortUpIcon.style.display = 'inline-block';
                    else if (sortDownIcon) sortDownIcon.style.display = 'inline-block';
                }
            }
        });
    }

    function updateSummaryStats() {
        const totalMatches = allData.length;
        const predictionsWonOverall = allData.filter(item => item.state === 'won').length;
        const predictionsLossOverall = allData.filter(item => item.state === 'loss').length;
        const predictionsPending = allData.filter(item => item.state === 'pending').length;
        const totalDecidedOverall = predictionsWonOverall + predictionsLossOverall;
        const valid1X2Types = ['home', 'draw', 'away'];

        totalMatchesElement.textContent = totalMatches; totalWonElement.textContent = predictionsWonOverall;
        totalLossElement.textContent = predictionsLossOverall; totalPendingElement.textContent = predictionsPending;

        const winRateValue = totalDecidedOverall > 0 ? (predictionsWonOverall / totalDecidedOverall) : 0;
        winRateElement.textContent = `${Math.round(winRateValue * 100)}%`;
        document.getElementById('win-rate-details').textContent = `(${predictionsWonOverall}/${totalDecidedOverall} Decided)`;
        const winRateCircle = document.getElementById('win-rate-circle');
        if (winRateCircle) winRateCircle.style.strokeDasharray = `${Math.round(winRateValue * 100)}, 100`;

        const decidedWithStat1X2 = allData.filter(item => (item.statistical && valid1X2Types.includes(String(item.statistical).toLowerCase())) && (item.state === 'won' || item.state === 'loss'));
        let correctStat = 0;
        decidedWithStat1X2.forEach(item => { if (item.statistical && String(item.statistical).toLowerCase() === String(item.outcome).toLowerCase()) correctStat++; });
        const statAccuracyValue = decidedWithStat1X2.length > 0 ? (correctStat / decidedWithStat1X2.length) : 0;
        statAccuracyElement.textContent = `${Math.round(statAccuracyValue * 100)}%`;
        const statAccBar = document.getElementById('stat-accuracy-bar'); if (statAccBar) statAccBar.style.width = `${Math.round(statAccuracyValue * 100)}%`;
        const statAccDet = document.getElementById('stat-accuracy-details'); if (statAccDet) statAccDet.textContent = `(${correctStat}/${decidedWithStat1X2.length} 1X2 Bets)`;

        const decidedWithContextual1X2 = allData.filter(item => (item.contextual && valid1X2Types.includes(String(item.contextual).toLowerCase())) && (item.state === 'won' || item.state === 'loss'));
        let correctContextual1X2 = 0;
        decidedWithContextual1X2.forEach(item => { if (item.contextual && String(item.contextual).toLowerCase() === String(item.outcome).toLowerCase()) correctContextual1X2++; });
        const contextualAccValue = decidedWithContextual1X2.length > 0 ? (correctContextual1X2 / decidedWithContextual1X2.length) : 0;
        contextual1X2AccuracyElement.textContent = `${Math.round(contextualAccValue * 100)}%`;
        const conAccBar = document.getElementById('contextual-1x2-accuracy-bar'); if (conAccBar) conAccBar.style.width = `${Math.round(contextualAccValue * 100)}%`;
        const conAccDet = document.getElementById('contextual-1x2-accuracy-details'); if (conAccDet) conAccDet.textContent = `(${correctContextual1X2}/${decidedWithContextual1X2.length} 1X2 Bets)`;

        const wonMatchesFor1X2Odds = allData.filter(item => item.state === 'won');
        let sumOfWinning1X2Odds = 0, countOfWinning1X2Odds = 0;
        wonMatchesFor1X2Odds.forEach(item => {
            const outcome = String(item.outcome).toLowerCase(), lowStat = item.statistical ? String(item.statistical).toLowerCase() : null, lowContext = item.contextual ? String(item.contextual).toLowerCase() : null;
            let oddsForThisWin = 0;
            if (lowStat === outcome && valid1X2Types.includes(lowStat)) {
                if (outcome === 'home' && item.home != null) oddsForThisWin = parseFloat(item.home);
                else if (outcome === 'draw' && item.draw != null) oddsForThisWin = parseFloat(item.draw);
                else if (outcome === 'away' && item.away != null) oddsForThisWin = parseFloat(item.away);
            } else if (lowContext === outcome && valid1X2Types.includes(lowContext)) {
                if (outcome === 'home' && item.home != null) oddsForThisWin = parseFloat(item.home);
                else if (outcome === 'draw' && item.draw != null) oddsForThisWin = parseFloat(item.draw);
                else if (outcome === 'away' && item.away != null) oddsForThisWin = parseFloat(item.away);
            }
            if (oddsForThisWin > 0) { sumOfWinning1X2Odds += oddsForThisWin; countOfWinning1X2Odds++; }
        });
        avgWinningOddsElement.textContent = countOfWinning1X2Odds > 0 ? (sumOfWinning1X2Odds / countOfWinning1X2Odds).toFixed(2) : 'N/A';

        const decidedMatchesForOddsAnalysis = allData.filter(item => item.state === 'won' || item.state === 'loss');

        let homeAnalysis = oddsBuckets.map(b => ({ ...b, totalPredictions: 0, successfulPredictions: 0, sumOfOdds: 0 }));
        decidedMatchesForOddsAnalysis.forEach(item => {
            const statPred = item.statistical ? String(item.statistical).toLowerCase() : null;
            const contextPred = item.contextual ? String(item.contextual).toLowerCase() : null;
            const isHomeBet = (statPred === 'home' || contextPred === 'home');

            if (isHomeBet && item.home != null && !isNaN(item.home)) {
                for (const bucket of homeAnalysis) {
                    if (item.home >= bucket.min && item.home <= bucket.max) {
                        bucket.totalPredictions++;
                        bucket.sumOfOdds += item.home;
                        if (String(item.outcome).toLowerCase() === 'home') bucket.successfulPredictions++;
                        break;
                    }
                }
            }
        });

        if (homeOddsRangesContainer) {
            homeOddsRangesContainer.innerHTML = '';
            homeEvByOddsContainer.innerHTML = '';
            let displayedHomeBuckets = 0;
            const totalHomePredictions = homeAnalysis.reduce((sum, bucket) => sum + bucket.totalPredictions, 0);
            homeAnalysis.sort((a, b) => a.min - b.min).forEach(bucket => {
                const isLowSample = bucket.totalPredictions > 0 && bucket.totalPredictions < minSamplesPerBucket;
                const shouldDisplay = bucket.totalPredictions > 0 && (showLowSampleBuckets || !isLowSample);
                if (shouldDisplay) {
                    displayedHomeBuckets++;
                    const winRate = bucket.totalPredictions > 0 ? bucket.successfulPredictions / bucket.totalPredictions : 0;
                    const avgOdds = bucket.totalPredictions > 0 ? bucket.sumOfOdds / bucket.totalPredictions : 0;
                    const ev = (winRate * (avgOdds - 1)) - (1 - winRate);
                    const isPositive = ev >= 0;
                    const evColorClass = isPositive ? 'text-green' : 'text-red';
                    const evSign = isPositive ? '+' : '';
                    const sampleNote = isLowSample ? `<span class="text-amber font-mono" style="font-size:0.6rem;margin-left:8px;">LOW SAMPLE</span>` : '';

                    const winRateHTML = `
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
                                <div><p class="text-sm text-heading">${bucket.label}${sampleNote}</p><p class="text-xs text-muted font-mono" style="margin-top:2px;">${bucket.successfulPredictions} wins / ${bucket.totalPredictions} total</p></div>
                                <p class="font-mono font-semibold text-cyan">${(winRate * 100).toFixed(1)}%</p>
                            </div>`;
                    homeOddsRangesContainer.innerHTML += winRateHTML;

                    const evHTML = `
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
                                <div><p class="text-sm text-heading">${bucket.label}${sampleNote}</p><p class="text-xs text-muted font-mono" style="margin-top:2px;">${(winRate * 100).toFixed(1)}% WR @ ${avgOdds.toFixed(2)}</p></div>
                                <p class="font-mono font-semibold ${evColorClass}">${evSign}${(ev * 100).toFixed(1)}%</p>
                            </div>`;
                    homeEvByOddsContainer.innerHTML += evHTML;
                }
            });
            if (displayedHomeBuckets === 0 || totalHomePredictions === 0) {
                const noDataMsg = `<p class="text-sm text-muted italic" style="padding:8px 0;">Not enough data.</p>`;
                homeOddsRangesContainer.innerHTML = noDataMsg;
                homeEvByOddsContainer.innerHTML = noDataMsg;
            }
        }

        let awayAnalysis = oddsBuckets.map(b => ({ ...b, totalPredictions: 0, successfulPredictions: 0, sumOfOdds: 0 }));
        decidedMatchesForOddsAnalysis.forEach(item => {
            const statPred = item.statistical ? String(item.statistical).toLowerCase() : null;
            const contextPred = item.contextual ? String(item.contextual).toLowerCase() : null;
            const isAwayBet = (statPred === 'away' || contextPred === 'away');

            if (isAwayBet && item.away != null && !isNaN(item.away)) {
                for (const bucket of awayAnalysis) {
                    if (item.away >= bucket.min && item.away <= bucket.max) {
                        bucket.totalPredictions++;
                        bucket.sumOfOdds += item.away;
                        if (String(item.outcome).toLowerCase() === 'away') bucket.successfulPredictions++;
                        break;
                    }
                }
            }
        });

        if (awayOddsRangesContainer) {
            awayOddsRangesContainer.innerHTML = '';
            awayEvByOddsContainer.innerHTML = '';
            let displayedAwayBuckets = 0;
            const totalAwayPredictions = awayAnalysis.reduce((sum, bucket) => sum + bucket.totalPredictions, 0);
            awayAnalysis.sort((a, b) => a.min - b.min).forEach(bucket => {
                const isLowSample = bucket.totalPredictions > 0 && bucket.totalPredictions < minSamplesPerBucket;
                const shouldDisplay = bucket.totalPredictions > 0 && (showLowSampleBuckets || !isLowSample);
                if (shouldDisplay) {
                    displayedAwayBuckets++;
                    const winRate = bucket.totalPredictions > 0 ? bucket.successfulPredictions / bucket.totalPredictions : 0;
                    const avgOdds = bucket.totalPredictions > 0 ? bucket.sumOfOdds / bucket.totalPredictions : 0;
                    const ev = (winRate * (avgOdds - 1)) - (1 - winRate);
                    const isPositive = ev >= 0;
                    const evColorClass = isPositive ? 'text-green' : 'text-red';
                    const evSign = isPositive ? '+' : '';
                    const sampleNote = isLowSample ? `<span class="text-amber font-mono" style="font-size:0.6rem;margin-left:8px;">LOW SAMPLE</span>` : '';

                    const winRateHTML = `
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
                                <div><p class="text-sm text-heading">${bucket.label}${sampleNote}</p><p class="text-xs text-muted font-mono" style="margin-top:2px;">${bucket.successfulPredictions} wins / ${bucket.totalPredictions} total</p></div>
                                <p class="font-mono font-semibold text-red">${(winRate * 100).toFixed(1)}%</p>
                            </div>`;
                    awayOddsRangesContainer.innerHTML += winRateHTML;

                    const evHTML = `
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-subtle);">
                                <div><p class="text-sm text-heading">${bucket.label}${sampleNote}</p><p class="text-xs text-muted font-mono" style="margin-top:2px;">${(winRate * 100).toFixed(1)}% WR @ ${avgOdds.toFixed(2)}</p></div>
                                <p class="font-mono font-semibold ${evColorClass}">${evSign}${(ev * 100).toFixed(1)}%</p>
                            </div>`;
                    awayEvByOddsContainer.innerHTML += evHTML;
                }
            });
            if (displayedAwayBuckets === 0 || totalAwayPredictions === 0) {
                const noDataMsg = `<p class="text-sm text-muted italic" style="padding:8px 0;">Not enough data.</p>`;
                awayOddsRangesContainer.innerHTML = noDataMsg;
                awayEvByOddsContainer.innerHTML = noDataMsg;
            }
        }
    }

    function prepareWinRateChartData(data) {
        const datedItems = data.filter(item => item.updatedAt instanceof Date && !isNaN(item.updatedAt));
        if (datedItems.length === 0) return { labels: [], datasets: {} };

        const eventsByDate = {};
        datedItems.forEach(item => {
            const dateStr = item.updatedAt.toISOString().split('T')[0];
            if (!eventsByDate[dateStr]) {
                eventsByDate[dateStr] = { wins: 0, losses: 0, totalBets: 0, dateObj: new Date(dateStr + "T00:00:00.000Z") };
            }
            eventsByDate[dateStr].totalBets++;
            if (item.state === 'won') eventsByDate[dateStr].wins++;
            else if (item.state === 'loss') eventsByDate[dateStr].losses++;
        });

        const sortedDailyEvents = Object.values(eventsByDate).sort((a, b) => a.dateObj - b.dateObj);
        if (sortedDailyEvents.length === 0) return { labels: [], datasets: {} };

        const labels = [];
        const cumulativeWinRateData = [];
        const dailyBetsData = [];
        const rollingWinRateData = [];
        const dailyWinRateData = [];
        const dailyWinsData = [];
        const dailyLossesData = [];
        const dailyResolvedData = [];

        const rollingWindowDays = 7;
        let cumulativeWins = 0;
        let cumulativeLosses = 0;

        for (let i = 0; i < sortedDailyEvents.length; i++) {
            const dayData = sortedDailyEvents[i];
            const resolvedCount = dayData.wins + dayData.losses;

            labels.push(dayData.dateObj.toISOString().split('T')[0]);
            dailyBetsData.push(dayData.totalBets);
            dailyWinsData.push(dayData.wins);
            dailyLossesData.push(dayData.losses);
            dailyResolvedData.push(resolvedCount);

            cumulativeWins += dayData.wins;
            cumulativeLosses += dayData.losses;
            const currentCumulativeTotal = cumulativeWins + cumulativeLosses;
            cumulativeWinRateData.push(currentCumulativeTotal > 0
                ? parseFloat(((cumulativeWins / currentCumulativeTotal) * 100).toFixed(1))
                : null);

            const dailyWinRate = resolvedCount > 0 ? (dayData.wins / resolvedCount) * 100 : 0;
            dailyWinRateData.push(parseFloat(dailyWinRate.toFixed(1)));

            let rollingWinsInWindow = 0;
            let rollingLossesInWindow = 0;
            let resolvedDaysInWindow = 0;
            for (let j = i; j >= 0 && resolvedDaysInWindow < rollingWindowDays; j--) {
                const wins = sortedDailyEvents[j].wins;
                const losses = sortedDailyEvents[j].losses;
                const resolved = wins + losses;
                if (resolved === 0) continue;
                rollingWinsInWindow += wins;
                rollingLossesInWindow += losses;
                resolvedDaysInWindow++;
            }
            const rollingTotalInWindow = rollingWinsInWindow + rollingLossesInWindow;
            if (rollingTotalInWindow > 0 && resolvedDaysInWindow >= Math.min(rollingWindowDays, 3)) {
                rollingWinRateData.push(parseFloat(((rollingWinsInWindow / rollingTotalInWindow) * 100).toFixed(1)));
            } else {
                rollingWinRateData.push(null);
            }
        }

        return {
            labels: labels,
            datasets: {
                cumulativeWinRate: cumulativeWinRateData,
                dailyBets: dailyBetsData,
                rollingWinRate: rollingWinRateData,
                dailyWinRate: dailyWinRateData,
                dailyWins: dailyWinsData,
                dailyLosses: dailyLossesData,
                dailyResolved: dailyResolvedData
            }
        };
    }

    function renderWinRateChart(chartLabels, datasets) {
        const isDarkMode = true;
        const chartContainer = document.getElementById('winRateChartContainer');
        if (winRateChartInstance) { winRateChartInstance.destroy(); winRateChartInstance = null; }

        if (chartLabels.length === 0 || !datasets || Object.keys(datasets).length === 0 || datasets.cumulativeWinRate.length === 0) {
            chartContainer.innerHTML = `<p class="text-center text-muted" style="padding:16px;display:flex;align-items:center;justify-content:center;height:100%;"><i class="fas fa-chart-line" style="margin-right:8px;"></i>Not enough data for chart.</p>`; return;
        }
        const chartErr = document.getElementById('winRateChart');
        if (!chartErr) chartContainer.innerHTML = '<canvas id="winRateChart"></canvas>';

        const ctx = document.getElementById('winRateChart')?.getContext('2d');
        if (!ctx) { chartContainer.innerHTML = `<p class="text-center text-red" style="padding:16px;display:flex;align-items:center;justify-content:center;height:100%;"><i class="fas fa-exclamation-triangle" style="margin-right:8px;"></i>Chart canvas not found.</p>`; return; }

        let initialSuggestedMaxForBetsAxis = 5;
        const dailyBetValues = Array.isArray(datasets.dailyBets)
            ? datasets.dailyBets.filter(b => b !== null && isFinite(b))
            : [];
        const resolvedValues = Array.isArray(datasets.dailyResolved)
            ? datasets.dailyResolved.filter(b => b !== null && isFinite(b))
            : [];
        if (dailyBetValues.length > 0 || resolvedValues.length > 0) {
            const maxBets = Math.max(
                dailyBetValues.length > 0 ? Math.max(...dailyBetValues) : 0,
                resolvedValues.length > 0 ? Math.max(...resolvedValues) : 0
            );
            if (isFinite(maxBets)) {
                if (maxBets <= 0) initialSuggestedMaxForBetsAxis = 5;
                else if (maxBets <= 5) initialSuggestedMaxForBetsAxis = Math.max(Math.ceil(maxBets * 1.2) + 1, maxBets + 1);
                else if (maxBets <= 10) initialSuggestedMaxForBetsAxis = Math.ceil(maxBets / 2) * 2 + 2;
                else if (maxBets <= 50) initialSuggestedMaxForBetsAxis = Math.ceil(maxBets / 5) * 5 + 5;
                else initialSuggestedMaxForBetsAxis = Math.ceil(maxBets / (maxBets <= 100 ? 10 : 20)) * (maxBets <= 100 ? 10 : 20) + (maxBets <= 100 ? 10 : 20);
                if (initialSuggestedMaxForBetsAxis < 5 && maxBets > 0) initialSuggestedMaxForBetsAxis = 5;
                if (initialSuggestedMaxForBetsAxis <= maxBets && maxBets > 0) initialSuggestedMaxForBetsAxis = Math.ceil(maxBets * 1.1);
            }
        }

        const gridColor = 'rgba(0, 229, 255, 0.08)';
        const textColor = '#8899aa';
        const titleColor = '#e0e6ed';
        const tooltipBgColor = '#0d1017';
        const tooltipTitleColor = '#f0f4f8';
        const tooltipBodyColor = '#c8d6e5';
        const tooltipBorderColor = 'rgba(0,229,255,0.2)';

        winRateChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Won', data: datasets.dailyWins, type: 'bar', stack: 'resolved',
                        backgroundColor: 'rgba(14, 255, 110, 0.45)',
                        borderColor: 'rgba(14, 255, 110, 0.85)',
                        borderWidth: 1, yAxisID: 'yBets', order: 1
                    },
                    {
                        label: 'Loss', data: datasets.dailyLosses, type: 'bar', stack: 'resolved',
                        backgroundColor: 'rgba(255, 61, 113, 0.45)',
                        borderColor: 'rgba(255, 61, 113, 0.85)',
                        borderWidth: 1, yAxisID: 'yBets', order: 1
                    },
                    {
                        label: 'Daily Bets', data: datasets.dailyBets, type: 'line',
                        borderColor: '#8899aa',
                        backgroundColor: 'rgba(136, 153, 170, 0.2)',
                        tension: 0.25, fill: false, pointRadius: 2, pointHoverRadius: 4, yAxisID: 'yBets', order: 2,
                        borderDash: [4, 4]
                    },
                    {
                        label: '7-Day Rolling Win Rate', data: datasets.rollingWinRate, type: 'line',
                        borderColor: '#ffb300',
                        backgroundColor: 'rgba(255, 179, 0, 0.1)',
                        tension: 0.3, fill: false, pointRadius: 2, pointHoverRadius: 5, yAxisID: 'yWinRate', spanGaps: true, order: 3
                    },
                    {
                        label: 'Cumulative Win Rate', data: datasets.cumulativeWinRate, type: 'line',
                        borderColor: '#00e5ff',
                        backgroundColor: 'rgba(0, 229, 255, 0.1)',
                        tension: 0.1, fill: true, pointRadius: 3, pointHoverRadius: 6, yAxisID: 'yWinRate', order: 4
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Date (Updated On)', color: titleColor, font: { weight: 'semibold' } }, ticks: { maxRotation: 45, minRotation: 30, autoSkip: true, maxTicksLimit: 20, color: textColor }, grid: { display: false } },
                    yWinRate: { type: 'linear', display: true, position: 'left', min: 0, max: 100, title: { display: true, text: 'Win Rate (%)', color: titleColor, font: { weight: 'semibold' } }, ticks: { callback: value => value + '%', color: textColor }, grid: { color: gridColor } },
                    yBets: { type: 'linear', stacked: true, display: true, position: 'right', min: 0, suggestedMax: initialSuggestedMaxForBetsAxis, title: { display: true, text: 'Bets (Won/Loss/Total)', color: titleColor, font: { weight: 'semibold' } }, ticks: { color: textColor, precision: 0 }, grid: { drawOnChartArea: false } }
                },
                plugins: {
                    tooltip: {
                        backgroundColor: tooltipBgColor, titleColor: tooltipTitleColor, bodyColor: tooltipBodyColor, borderColor: tooltipBorderColor, borderWidth: 1, padding: 10,
                        callbacks: {
                            label: function (c) {
                                const labelText = c.dataset.label || '';
                                const value = c.parsed.y;
                                if (value === null || value === undefined) return labelText ? `${labelText}: N/A` : 'N/A';
                                if (c.dataset.yAxisID === 'yWinRate') {
                                    return labelText ? `${labelText}: ${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
                                }
                                const addSuffix = labelText && !/bets$/i.test(labelText.trim()) ? ' bets' : '';
                                return labelText ? `${labelText}: ${value}${addSuffix}` : `${value}${addSuffix}`;
                            }
                        }
                    },
                    legend: { display: true, position: 'top', labels: { color: titleColor, usePointStyle: true, padding: 20, font: { size: 13 } } }
                }
            }
        });
    }

    function updatePerformanceTrendsSummary(chartLabels, datasets) {
        const rolling = Array.isArray(datasets?.rollingWinRate) ? datasets.rollingWinRate : [];
        const dailyResolved = Array.isArray(datasets?.dailyResolved) ? datasets.dailyResolved : [];

        const rollingEl = document.getElementById('trend-rolling-winrate');
        const rollingSubEl = document.getElementById('trend-rolling-sub');
        const overallEl = document.getElementById('trend-overall-winrate');
        const overallSubEl = document.getElementById('trend-overall-sub');

        const findLastNumeric = (arr) => {
            for (let i = arr.length - 1; i >= 0; i--) {
                if (Number.isFinite(arr[i])) return { value: arr[i], index: i };
            }
            return { value: null, index: -1 };
        };

        const lastRolling = findLastNumeric(rolling);
        if (rollingEl) rollingEl.textContent = lastRolling.value !== null ? `${lastRolling.value.toFixed(1)}%` : 'N/A';
        if (rollingSubEl) {
            const recentResolved = [];
            for (let i = dailyResolved.length - 1; i >= 0 && recentResolved.length < 7; i--) {
                const value = dailyResolved[i];
                if (Number.isFinite(value) && value > 0) recentResolved.push(value);
            }
            const recentCount = recentResolved.reduce((a, b) => a + b, 0);
            rollingSubEl.textContent = lastRolling.index >= 0
                ? `${recentResolved.length} resolved days | ${recentCount} matches`
                : 'Awaiting resolved data';
        }

        const resolved = allData.filter(item => item.state === 'won' || item.state === 'loss');
        const wins = resolved.filter(item => item.state === 'won').length;
        const decided = resolved.length;
        const total = allData.length;
        const overallWinRate = decided > 0 ? (wins / decided) * 100 : null;
        if (overallEl) overallEl.textContent = overallWinRate !== null ? `${overallWinRate.toFixed(1)}%` : 'N/A';
        if (overallSubEl) overallSubEl.textContent = decided > 0 ? `${wins} / ${decided} decided` : 'No decided matches yet';
    }

    function openModal() {
        const spinnerHTML = `<div style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;padding:48px;"><div style="width:28px;height:28px;border:2px solid var(--cyan);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></div><span class="text-muted font-mono text-xs">LOADING ANALYSIS...</span></div>`;
        modalContentBody.innerHTML = spinnerHTML;
        analysisModal.classList.remove('hidden');
        analysisModal.classList.add('visible');
        requestAnimationFrame(() => {
            analysisModal.classList.add('visible');
        });
        modalOkBtn.focus();
    }

    function hideModal() {
        analysisModal.classList.remove('visible');
        setTimeout(() => { analysisModal.classList.add('hidden'); modalContentBody.innerHTML = ''; }, 300);
    }

    function showAnalysisModalForItem(item) {
        openModal();
        const infoIconColor = 'text-cyan';
        const errorIconColor = 'text-red';
        const defaultTextColor = 'text-heading';
        const defaultSubTextColor = 'text-muted';

        if (item && item.full_bot_response_analyze && String(item.full_bot_response_analyze).trim() !== '') {
            modalContentBody.innerHTML = formatAnalysisContent(item.full_bot_response_analyze);
        } else if (item) {
            modalContentBody.innerHTML = `<div style="text-align: center; padding: 40px 0;"><i class="fas fa-info-circle ${infoIconColor}" style="font-size: 2.5rem; margin-bottom: 12px;"></i><p class="${defaultTextColor} font-semibold">No detailed analysis available for this entry.</p>${item.match ? `<p class="text-sm ${defaultSubTextColor}">Match: ${item.match}</p>` : ''}</div>`;
        } else {
            modalContentBody.innerHTML = `<div style="text-align: center; padding: 40px 0;"><i class="fas fa-exclamation-triangle ${errorIconColor}" style="font-size: 2.5rem; margin-bottom: 12px;"></i><p class="${errorIconColor} font-semibold">Could not load analysis data.</p><p class="text-sm ${defaultSubTextColor}">The requested item data was not found or the reference was invalid.</p></div>`;
        }
    }

    function boldify(str) {
    return str.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }

    function formatAnalysisContent(analysisText) {
        if (!analysisText || typeof analysisText !== 'string' || analysisText.trim() === '') {
            return `<p class="text-muted text-center italic" style="padding: 32px 0;">No analysis content provided or content is empty.</p>`;
        }

        const normText = analysisText.replace(/\r\n/g, '\n').trim();
        const sections = normText.split(/\n(?=\*\*|Prediction Validity Window)/);
        let html = '<div style="display: flex; flex-direction: column; gap: 20px;">';

        const titleColor         = 'text-cyan';
        const titleBorderColor   = 'var(--border-subtle)';
        const iconBoxBg          = 'var(--bg-elevated)';
        const iconBoxTextColor   = 'text-primary';
        const iconColor          = 'text-cyan';
        const defaultPColor      = 'text-primary';
        const subPColor          = 'text-secondary';
        const validityTitleColor = 'text-amber';
        const validityIconColor  = 'text-amber';
        const validityTextColor  = 'text-amber';
        const validityBg         = 'var(--amber-bg)';

        sections.forEach(rawSec => {
            let secText = rawSec.trim();
            if (!secText) return;

            let isPredWindow = false, secTitle = '', secBody = secText;

            if (secText.startsWith('**') && secText.includes('**', 2)) {
                const titleEnd = secText.indexOf('**', 2);
                secTitle = secText.substring(2, titleEnd).trim();
                secBody  = secText.substring(titleEnd + 2).trim();
            } else if (secText.startsWith('Prediction Validity Window')) {
                isPredWindow = true;
                const firstNL = secText.indexOf('\n');
                secTitle = (firstNL !== -1) ? secText.substring(0, firstNL).trim() : secText;
                secBody  = (firstNL !== -1) ? secText.substring(firstNL + 1).trim() : '';
            }

            if (isPredWindow) {
                html += `<div style="padding:16px;background:${validityBg};border:1px solid rgba(255,179,0,0.2);border-radius:var(--radius-md);">
                    <h4 class="${validityTitleColor} font-semibold" style="margin-bottom:8px;display:flex;align-items:center;">
                        <i class="fas fa-stopwatch ${validityIconColor}" style="margin-right:8px;"></i>${boldify(secTitle)}
                    </h4>`;
                secBody.split('\n').map(l => l.trim()).filter(l => l).forEach(l => {
                    html += `<p class="${validityTextColor} text-sm" style="margin-left:4px;margin-bottom:4px;">${boldify(l.startsWith('• ') ? l.substring(2) : l)}</p>`;
                });
                html += `</div>`;

            } else if (secTitle) {
                html += `<div>
                    <h3 class="${titleColor} font-bold" style="font-size:1.1rem;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid ${titleBorderColor};">${boldify(secTitle)}</h3>`;

                secBody.split('\n').map(l => l.trim()).filter(l => l).forEach(l => {
                    if (/^[🏆🔍⚽📊💡⚠️]/.test(l)) {
                        const iconEnd = l.indexOf(' ');
                        const icon    = iconEnd !== -1 ? l.substring(0, iconEnd) : '';
                        const text    = iconEnd !== -1 ? l.substring(iconEnd + 1) : l;
                        html += `<div style="display:flex;align-items:flex-start;margin-bottom:10px;padding:12px;background:${iconBoxBg};border:1px solid var(--border-default);border-radius:var(--radius-sm);">
                            ${icon ? `<span class="${iconColor}" style="font-size:1.2rem;margin-right:12px;margin-top:2px;">${icon}</span>` : ''}
                            <span class="${iconBoxTextColor} text-sm" style="line-height:1.5;">${boldify(text)}</span>
                        </div>`;
                    } else if (l.startsWith('▮')) {
                        html += `<h5 class="${defaultPColor} font-semibold" style="margin-top:16px;margin-bottom:6px;">${boldify(l.replace(/^▮\s*/, '').trim())}</h5>`;
                    } else if (l.startsWith('▸') || l.startsWith('•')) {
                        html += `<p class="${subPColor} text-sm" style="margin-left:20px;margin-bottom:6px;position:relative;">${boldify(l)}</p>`;
                    } else {
                        html += `<p class="${defaultPColor} text-sm" style="margin-bottom:6px;">${boldify(l)}</p>`;
                    }
                });
                html += `</div>`;

            } else if (secBody) {
                html += `<div class="${defaultPColor} text-sm" style="line-height:1.6;">
                    ${secBody.split('\n').map(l => `<p style="margin-bottom:6px;">${boldify(l.trim())}</p>`).join('')}
                </div>`;
            }
        });

        html += '</div>';
        return html;
    }

    document.querySelectorAll('.sortable').forEach(h => {
        h.addEventListener('click', () => {
            const col = h.getAttribute('data-column'); if (col === 'updatedAt' && !h.querySelector('i:not([style*="display: none"])')) return;
            if (sortColumn === col) sortDirection = (sortDirection === 'asc' ? 'desc' : 'asc');
            else { sortColumn = col; sortDirection = (col === 'updatedAt' || col === 'date') ? 'desc' : 'asc'; }
            currentPage = 1; renderTable();
        });
    });

    filterDateInput.addEventListener('change', (e) => {
        const ds = e.target.value;
        if (ds) {
            const [y, m, d] = ds.split('-').map(Number);
            selectedDateFilter = new Date(Date.UTC(y, m - 1, d));
            clearDateBtn.style.display = 'flex';
        } else {
            selectedDateFilter = null;
            clearDateBtn.style.display = 'none';
        }
        currentPage = 1;
        renderTable();
    });


    clearDateBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        filterDateInput.value = '';
        selectedDateFilter = null;
        clearDateBtn.style.display = 'none';
        currentPage = 1;
        renderTable();
    });

    clearDateBtn.addEventListener('click', () => { filterDateInput.value = ''; selectedDateFilter = null; clearDateBtn.style.display = 'none'; currentPage = 1; renderTable(); });

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
            const tableElement = tableBody.closest('div.overflow-x-auto');
            if (tableElement) window.scrollTo({ top: tableElement.offsetTop - 20, behavior: 'smooth' });
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
            const tableElement = tableBody.closest('div.overflow-x-auto');
            if (tableElement) window.scrollTo({ top: tableElement.offsetTop - 20, behavior: 'smooth' });
        }
    });

    filterState.addEventListener('change', (e) => { currentFilter = e.target.value; currentPage = 1; renderTable(); });
    refreshBtn.addEventListener('click', () => { fetchData(); });

    if (oddsLowSampleToggle) {
        showLowSampleBuckets = oddsLowSampleToggle.checked;
        oddsLowSampleToggle.addEventListener('change', () => {
            showLowSampleBuckets = oddsLowSampleToggle.checked;
            updateSummaryStats();
        });
    } [document.getElementById('slip-bankroll'), document.getElementById('slip-stake')].forEach(input => {
        if (input) input.addEventListener('input', renderSlipBuilder);
    });

    if (slipBuildBtn) slipBuildBtn.addEventListener('click', renderSlipBuilder);

    if (slipResetBtn) {
        slipResetBtn.addEventListener('click', () => {
            const bankInput = document.getElementById('slip-bankroll');
            if (bankInput) bankInput.value = '100';
            const stakeInput = document.getElementById('slip-stake');
            if (stakeInput) stakeInput.value = '5';
            renderSlipBuilder();
        });
    }

    tableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-analysis-btn');
        if (btn) {
            const itemIdxStr = btn.getAttribute('data-item-index');
            if (itemIdxStr !== null && itemIdxStr !== '') {
                const itemIdx = parseInt(itemIdxStr, 10);
                if (!isNaN(itemIdx) && itemIdx >= 0 && itemIdx < filteredAndSortedData.length) showAnalysisModalForItem(filteredAndSortedData[itemIdx]);
                else { console.error('Invalid item index:', itemIdxStr); showAnalysisModalForItem(null); }
            } else { console.warn('Missing data-item-index'); showAnalysisModalForItem(null); }
        }
    });

    closeModalBtn.addEventListener('click', hideModal);
    modalOkBtn.addEventListener('click', hideModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !analysisModal.classList.contains('hidden')) hideModal(); });

    window.fetchData = fetchData;

    // --- JSON EXPORT FEATURE ---
    function setupJsonExport() {
        const exportBtn = document.createElement('button');
        exportBtn.innerHTML = '<i class="fas fa-download"></i> JSON';
        exportBtn.id = 'export-json-btn';
        exportBtn.title = 'Download Dashboard Summary for LLM';
        
        exportBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            background: var(--bg-surface, #1e293b);
            color: var(--cyan, #00e5ff);
            border: 1px solid var(--cyan, #00e5ff);
            padding: 8px 12px;
            border-radius: 6px;
            font-family: var(--font-mono, monospace);
            font-size: 12px;
            cursor: pointer;
            opacity: 0.6;
            transition: all 0.2s ease;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 6px;
        `;
        
        exportBtn.onmouseover = () => { 
            exportBtn.style.opacity = '1'; 
            exportBtn.style.boxShadow = '0 0 10px rgba(0, 229, 255, 0.4)'; 
        };
        exportBtn.onmouseout = () => { 
            exportBtn.style.opacity = '0.6'; 
            exportBtn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)'; 
        };

        exportBtn.addEventListener('click', () => {
            if (!allData || allData.length === 0) {
                alert('No data available to export.');
                return;
            }

            const originalBtnText = exportBtn.innerHTML;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';

            setTimeout(() => {
                try {
                    // 1. Core Metrics & Accuracy Signals
                    const totalMatches = allData.length;
                    const won = allData.filter(i => i.state === 'won').length;
                    const loss = allData.filter(i => i.state === 'loss').length;
                    const pending = allData.filter(i => i.state === 'pending').length;
                    const decided = won + loss;
                    const overallWinRate = decided > 0 ? (won / decided) : 0;

                    const valid1X2Types = ['home', 'draw', 'away'];
                    const decidedWithStat1X2 = allData.filter(item => (item.statistical && valid1X2Types.includes(String(item.statistical).toLowerCase())) && (item.state === 'won' || item.state === 'loss'));
                    let correctStat = 0;
                    decidedWithStat1X2.forEach(item => { if (item.statistical && String(item.statistical).toLowerCase() === String(item.outcome).toLowerCase()) correctStat++; });
                    const statAcc = decidedWithStat1X2.length > 0 ? (correctStat / decidedWithStat1X2.length) : 0;

                    const decidedWithContextual1X2 = allData.filter(item => (item.contextual && valid1X2Types.includes(String(item.contextual).toLowerCase())) && (item.state === 'won' || item.state === 'loss'));
                    let correctContext = 0;
                    decidedWithContextual1X2.forEach(item => { if (item.contextual && String(item.contextual).toLowerCase() === String(item.outcome).toLowerCase()) correctContext++; });
                    const contextAcc = decidedWithContextual1X2.length > 0 ? (correctContext / decidedWithContextual1X2.length) : 0;

                    // 2. Odds & Value Insights
                    const oddsIndex = buildOddsPreferenceIndex(allData);
                    
                    // 3. Market Edge Breakdown (Edge Analysis)
                    const allLegs = buildEvaluatedLegsWalkForward(allData);
                    const marketOrder = ['1X', 'X2', '12', 'DNB Home', 'DNB Away'];
                    const marketStats = {};
                    marketOrder.forEach(m => { marketStats[m] = { bets: 0, wins: 0, losses: 0, pushes: 0, sumProfit: 0, avgOdds: 0, sumOdds: 0 }; });

                    allLegs.forEach(leg => {
                        const result = getSlipLegResult(leg.market, leg.outcome);
                        if (!result) return;
                        const m = leg.market;
                        if (!marketStats[m]) return;
                        marketStats[m].bets++;
                        marketStats[m].sumOdds += leg.odds;
                        if (result === 'win') { marketStats[m].wins++; marketStats[m].sumProfit += (leg.odds - 1); }
                        else if (result === 'loss') { marketStats[m].losses++; marketStats[m].sumProfit -= 1; }
                        else if (result === 'push') { marketStats[m].pushes++; }
                    });

                    const marketEdgeBreakdown = marketOrder.filter(m => marketStats[m].bets > 0).map(m => {
                        const s = marketStats[m];
                        const decidedBets = s.wins + s.losses;
                        return {
                            market: m,
                            totalBets: s.bets,
                            wins: s.wins,
                            losses: s.losses,
                            pushes: s.pushes,
                            winRate: decidedBets > 0 ? parseFloat((s.wins / decidedBets).toFixed(3)) : 0,
                            roiPercentage: s.bets > 0 ? parseFloat(((s.sumProfit / s.bets) * 100).toFixed(2)) : 0,
                            averageOdds: s.bets > 0 ? parseFloat((s.sumOdds / s.bets).toFixed(2)) : 0,
                            netProfitUnits: parseFloat(s.sumProfit.toFixed(2))
                        };
                    }).sort((a, b) => b.roiPercentage - a.roiPercentage);

                    // 4. EV Sweet Spots Breakdown
                    const evBuckets = [
                        { label: '< 0% (Negative)', min: -Infinity, max: 0,   w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '0% - 1%',         min: 0,         max: 1,   w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '1% - 2%',         min: 1,         max: 2,   w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '2% - 3%',         min: 2,         max: 3,   w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '3% - 4%',         min: 3,         max: 4,   w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '4% - 5%',         min: 4,         max: 5,   w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '5% - 7.5%',       min: 5,         max: 7.5, w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '7.5% - 10%',      min: 7.5,       max: 10,  w: 0, l: 0, p: 0, sumProfit: 0 },
                        { label: '> 10%',           min: 10, max: Infinity,   w: 0, l: 0, p: 0, sumProfit: 0 }
                    ];

                    function exportWilsonLB(wins, n) {
                        const z = 1.645;
                        if (n === 0) return 0;
                        const p = wins / n;
                        const denom = 1 + (z * z) / n;
                        const center = (p + (z * z) / (2 * n)) / denom;
                        const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
                        return Math.max(0, center - margin);
                    }

                    allLegs.forEach(leg => {
                        const result = getSlipLegResult(leg.market, leg.outcome);
                        if (result === 'win' || result === 'loss' || result === 'push') {
                            const evPct = leg.ev * 100;
                            const profit = result === 'win' ? (leg.odds - 1) : (result === 'push' ? 0 : -1);
                            for (let b of evBuckets) {
                                if (evPct >= b.min && evPct < b.max) {
                                    if (result === 'win') b.w++;
                                    else if (result === 'loss') b.l++;
                                    else if (result === 'push') b.p++;
                                    b.sumProfit += profit;
                                    break;
                                }
                            }
                        }
                    });

                    const evSweetSpotsAnalysis = evBuckets.map(b => {
                        const total = b.w + b.l + b.p;
                        const decided = b.w + b.l;
                        const winRate = decided > 0 ? parseFloat((b.w / decided).toFixed(3)) : 0;
                        const roi = total > 0 ? parseFloat(((b.sumProfit / total) * 100).toFixed(2)) : 0;
                        const wLB = parseFloat(exportWilsonLB(b.w, decided).toFixed(3));
                        const isSweetSpot = total >= 3 && roi > 2 && wLB >= 0.45;
                        return {
                            evRange: b.label,
                            totalResolvedBets: total,
                            wins: b.w,
                            losses: b.l,
                            pushes: b.p,
                            winRate,
                            roiPercentage: roi,
                            netProfitUnits: parseFloat(b.sumProfit.toFixed(2)),
                            isSweetSpot
                        };
                    }).filter(b => b.totalResolvedBets > 0);

                    // 5. Performance Trends (Extracting from Chart data)
                    const chartData = prepareWinRateChartData(allData);
                    let recent7DayWinRate = null;
                    if (chartData && chartData.datasets && chartData.datasets.rollingWinRate) {
                        const rollingArr = chartData.datasets.rollingWinRate;
                        for (let i = rollingArr.length - 1; i >= 0; i--) {
                            if (Number.isFinite(rollingArr[i])) {
                                recent7DayWinRate = rollingArr[i];
                                break;
                            }
                        }
                    }

                    // Assemble the heavily formatted LLM payload
                    const payload = {
                        metadata: {
                            exportDate: new Date().toISOString(),
                            description: "High-level summary of prediction metrics, market edge, value insights, and EV sweet spots."
                        },
                        coreDashboardMetrics: {
                            totalMatches: totalMatches,
                            totalDecided: decided,
                            totalWon: won,
                            totalLost: loss,
                            totalPending: pending,
                            overallWinRate: parseFloat(overallWinRate.toFixed(3))
                        },
                        accuracySignals: {
                            statisticalModelAccuracy: parseFloat(statAcc.toFixed(3)),
                            contextualModelAccuracy: parseFloat(contextAcc.toFixed(3))
                        },
                        performanceTrends: {
                            recent7DayRollingWinRatePercentage: recent7DayWinRate,
                            allTimeWinRatePercentage: parseFloat((overallWinRate * 100).toFixed(1))
                        },
                        valueAndOddsInsights: {
                            averageWinningOddsFor1X2: oddsIndex ? parseFloat(oddsIndex.avgWinningOdds.toFixed(2)) : null,
                            homeOddsPerformanceBuckets: oddsIndex ? oddsIndex.home.map(b => ({
                                oddsRange: b.label,
                                predictions: b.totalPredictions,
                                winRate: parseFloat(b.winRate.toFixed(3)),
                                expectedValuePercentage: parseFloat((b.ev * 100).toFixed(2))
                            })).filter(b => b.predictions > 0) : [],
                            awayOddsPerformanceBuckets: oddsIndex ? oddsIndex.away.map(b => ({
                                oddsRange: b.label,
                                predictions: b.totalPredictions,
                                winRate: parseFloat(b.winRate.toFixed(3)),
                                expectedValuePercentage: parseFloat((b.ev * 100).toFixed(2))
                            })).filter(b => b.predictions > 0) : []
                        },
                        marketEdgeBreakdown: marketEdgeBreakdown,
                        evSweetSpotsAnalysis: evSweetSpotsAnalysis
                    };

                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Prediction_Dashboard_Summary_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                } catch (err) {
                    console.error("Export failed:", err);
                    alert("Failed to generate summary export. Check console for details.");
                } finally {
                    exportBtn.innerHTML = originalBtnText;
                }
            }, 50);
        });

        document.body.appendChild(exportBtn);
    }

    // Initialize Export Button
    setupJsonExport();

    // Initialize
    initTerminalClock();
    fetchData();
});     