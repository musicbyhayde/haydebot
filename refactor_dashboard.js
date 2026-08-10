const fs = require('fs');
const path = '/Users/ilanziv/Code/HaydeBot/frontend/components/LeadsDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Insert COMMISSION_STATUS_ORDER and applyLocalSort after STATUS_ORDER (around line 47)
const applyLocalSortCode = `
const COMMISSION_STATUS_ORDER: Record<string, number> = {
    'ממתין לאישור': 0, 'ממתין': 0, 'ממתין לגבייה': 1, 'נגבה': 2, 'בוטל': 3,
};

const applyLocalSort = (items: Lead[], sort?: { column: string; order: 'asc' | 'desc' }) => {
    if (!sort) return items;
    return [...items].sort((a, b) => {
        const { column, order } = sort;
        let cmp = 0;
        if (column === 'date') {
            const dateA = parseDateToSortable(a.fields.Event_Date) || '';
            const dateB = parseDateToSortable(b.fields.Event_Date) || '';
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            cmp = dateA.localeCompare(dateB);
        } else if (column === 'status') {
            const orderA = STATUS_ORDER[a.fields.Status] ?? 99;
            const orderB = STATUS_ORDER[b.fields.Status] ?? 99;
            cmp = orderA - orderB;
        } else if (column === 'service') {
            const svcA = (a.fields.Service || '').toLowerCase();
            const svcB = (b.fields.Service || '').toLowerCase();
            if (!svcA && !svcB) return 0;
            if (!svcA) return 1;
            if (!svcB) return -1;
            cmp = svcA.localeCompare(svcB);
        } else if (column === 'location') {
            const locA = (a.fields.Location || '').trim();
            const locB = (b.fields.Location || '').trim();
            if (!locA && !locB) return 0;
            if (!locA) return 1;
            if (!locB) return -1;
            cmp = locA.localeCompare(locB, 'he');
        } else if (column === 'budget') {
            const budgA = a.fields.Closing_Amount || 0;
            const budgB = b.fields.Closing_Amount || 0;
            cmp = budgA - budgB;
        } else if (column === 'commission_status') {
            const sA = (!a.fields.Commission_Status || (a.fields.Commission_Status as string) === 'ממתין') ? 'ממתין לאישור' : a.fields.Commission_Status as string;
            const sB = (!b.fields.Commission_Status || (b.fields.Commission_Status as string) === 'ממתין') ? 'ממתין לאישור' : b.fields.Commission_Status as string;
            const orderA = COMMISSION_STATUS_ORDER[sA] ?? 99;
            const orderB = COMMISSION_STATUS_ORDER[sB] ?? 99;
            cmp = orderA - orderB;
        }
        return order === 'asc' ? cmp : -cmp;
    });
};
`;
content = content.replace(
    /const STATUS_ORDER: Record<string, number> = \{[\s\S]*?\};\n/,
    match => match + "\n" + applyLocalSortCode
);


// 2. Replace Search & Filter State
const oldStateRegex = /\/\/ ─── Search & Filter State ──────────────────────────[\s\S]*?(?=useEffect\(\(\) => \{)/;
const newStateCode = `// ─── Search & Filter State ──────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [filterService, setFilterService] = useState<string>('');
    const [filterOwner, setFilterOwner] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    
    // New Advanced Filters
    const [filterDateFrom, setFilterDateFrom] = useState<string>('');
    const [filterDateTo, setFilterDateTo] = useState<string>('');
    const [filterMinBudget, setFilterMinBudget] = useState<string>('');
    const [filterMaxBudget, setFilterMaxBudget] = useState<string>('');
    const [filterLocation, setFilterLocation] = useState<string>('');
    const [filterOpenTasks, setFilterOpenTasks] = useState<boolean>(false);

    const [showFilters, setShowFilters] = useState(false);
    
    // Global Sorting
    const [globalSort, setGlobalSort] = useState<{ field: 'interaction' | 'created' | 'event_date' | 'budget'; order: 'asc' | 'desc' }>({ field: 'interaction', order: 'desc' });

    // Local Table Sorts (tableKey -> { column, order })
    const [localSorts, setLocalSorts] = useState<Record<string, { column: string; order: 'asc' | 'desc' }>>({});

    const toggleLocalSort = (tableKey: string, column: string) => {
        setLocalSorts(prev => {
            const current = prev[tableKey];
            if (current?.column === column) {
                if (current.order === 'asc') return { ...prev, [tableKey]: { column, order: 'desc' } };
                const newSorts = { ...prev };
                delete newSorts[tableKey];
                return newSorts;
            }
            return { ...prev, [tableKey]: { column, order: 'asc' } };
        });
    };

    `;
content = content.replace(oldStateRegex, newStateCode);

// 3. Replace filteredLeads + add globallySortedLeads, hasActiveFilters, clearAllFilters, activeLeads, etc.
// from // ─── Filtering Logic ─────────────────────────────── to renderArchiveTable
const oldFilteringRegex = /\/\/ ─── Filtering Logic ───────────────────────────────[\s\S]*?(?=const renderArchiveTable =)/;

const newFilteringCode = `// ─── Filtering Logic ───────────────────────────────
    const filteredLeads = useMemo(() => {
        return leads.filter(l => {
            // Text search (name or phone)
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const name = (l.fields.Name || '').toLowerCase();
                const phone = (l.fields.Phone || '').toLowerCase();
                if (!name.includes(q) && !phone.includes(q)) return false;
            }
            if (filterService && l.fields.Service !== filterService) return false;
            if (filterOwner && l.fields.Owner !== filterOwner) return false;
            if (filterStatus && l.fields.Status !== filterStatus) return false;
            
            // Advanced Filters
            if (filterLocation) {
                const q = filterLocation.toLowerCase();
                const loc = (l.fields.Location || '').toLowerCase();
                if (!loc.includes(q)) return false;
            }
            if (filterDateFrom || filterDateTo) {
                const leadDate = parseDateToSortable(l.fields.Event_Date);
                if (filterDateFrom && leadDate < filterDateFrom) return false;
                if (filterDateTo && leadDate && leadDate > filterDateTo) return false;
                if ((filterDateFrom || filterDateTo) && !leadDate) return false;
            }
            if (filterMinBudget || filterMaxBudget) {
                const amount = l.fields.Closing_Amount || 0;
                if (filterMinBudget && amount < parseInt(filterMinBudget)) return false;
                if (filterMaxBudget && amount > parseInt(filterMaxBudget)) return false;
            }
            if (filterOpenTasks) {
                const hasOpen = tasks.some(t => t.fields.Lead_ID === l.id && !t.fields.Is_Completed);
                if (!hasOpen) return false;
            }
            
            return true;
        });
    }, [leads, searchQuery, filterService, filterOwner, filterStatus, filterLocation, filterDateFrom, filterDateTo, filterMinBudget, filterMaxBudget, filterOpenTasks, tasks, currentUser]);

    const globallySortedLeads = useMemo(() => {
        return [...filteredLeads].sort((a, b) => {
            if (globalSort.field === 'interaction') {
                const tA = new Date(a.fields.Last_Interaction || 0).getTime();
                const tB = new Date(b.fields.Last_Interaction || 0).getTime();
                return globalSort.order === 'asc' ? tA - tB : tB - tA;
            }
            if (globalSort.field === 'created') {
                const tA = new Date(a.createdTime || 0).getTime();
                const tB = new Date(b.createdTime || 0).getTime();
                return globalSort.order === 'asc' ? tA - tB : tB - tA;
            }
            if (globalSort.field === 'event_date') {
                const dateA = parseDateToSortable(a.fields.Event_Date) || '';
                const dateB = parseDateToSortable(b.fields.Event_Date) || '';
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                const cmp = dateA.localeCompare(dateB);
                return globalSort.order === 'asc' ? cmp : -cmp;
            }
            if (globalSort.field === 'budget') {
                const budgA = a.fields.Closing_Amount || 0;
                const budgB = b.fields.Closing_Amount || 0;
                return globalSort.order === 'asc' ? budgA - budgB : budgB - budgA;
            }
            return 0;
        });
    }, [filteredLeads, globalSort]);

    const hasActiveFilters = searchQuery || filterService || filterOwner || filterStatus || filterLocation || filterDateFrom || filterDateTo || filterMinBudget || filterMaxBudget || filterOpenTasks;

    const clearAllFilters = () => {
        setSearchQuery('');
        setFilterService('');
        setFilterOwner('');
        setFilterStatus('');
        setFilterLocation('');
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterMinBudget('');
        setFilterMaxBudget('');
        setFilterOpenTasks(false);
        setGlobalSort({ field: 'interaction', order: 'desc' });
        setLocalSorts({});
    };

    const stats = {
        total: leads.length,
        new: leads.filter(l => l.fields.Status === 'New').length,
        processing: leads.filter(l => ['Processing', 'Manual', 'Talking', 'Quote_Sent'].includes(l.fields.Status)).length,
        assigned: leads.filter(l => ['Assigned', 'Closed', 'Waiting_Payment'].includes(l.fields.Status)).length,
    };

    const activeLeads = useMemo(() => applyLocalSort(globallySortedLeads.filter(l => !['Closed', 'Lost', 'Waiting_Payment', 'Completed', 'Referred', 'Cold'].includes(l.fields.Status)), localSorts['active']), [globallySortedLeads, localSorts]);
    const closedLeads = useMemo(() => applyLocalSort(globallySortedLeads.filter(l => l.fields.Status === 'Closed'), localSorts['closed']), [globallySortedLeads, localSorts]);
    const lostLeads = useMemo(() => applyLocalSort(globallySortedLeads.filter(l => l.fields.Status === 'Lost'), localSorts['lost']), [globallySortedLeads, localSorts]);
    const waitingPaymentLeads = useMemo(() => applyLocalSort(globallySortedLeads.filter(l => l.fields.Status === 'Waiting_Payment'), localSorts['waiting_payment']), [globallySortedLeads, localSorts]);
    const completedLeads = useMemo(() => applyLocalSort(globallySortedLeads.filter(l => l.fields.Status === 'Completed'), localSorts['completed']), [globallySortedLeads, localSorts]);
    const coldLeads = useMemo(() => applyLocalSort(globallySortedLeads.filter(l => l.fields.Status === 'Cold'), localSorts['cold']), [globallySortedLeads, localSorts]);
    const referredLeads = useMemo(() => applyLocalSort(globallySortedLeads.filter(l => l.fields.Status === 'Referred'), localSorts['referred']), [globallySortedLeads, localSorts]);

    `;
content = content.replace(oldFilteringRegex, newFilteringCode);


// 4. Update renderArchiveTable signature and headers
content = content.replace(
    /const renderArchiveTable = \(items: Lead\[\], isOpen: boolean, toggle: \(\) => void, title: string, emoji: string, badgeColor: string\) => \{/,
    `const renderArchiveTable = (items: Lead[], isOpen: boolean, toggle: () => void, title: string, emoji: string, badgeColor: string, tableKey: string) => {`
);

const oldArchiveHeaderRegex = /<div className="flex items-center px-4 py-2 text-\[10px\] font-bold text-slate-400 border-b border-slate-100 uppercase bg-slate-50">[\s\S]*?<\/div>/;
const newArchiveHeaderCode = `<div className="flex items-center px-4 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 uppercase bg-slate-50">
                                    <div className="flex-1 min-w-[120px]">לקוח</div>
                                <div className="w-24 hidden md:flex items-center">
                                    <button onClick={() => toggleLocalSort(tableKey, 'service')} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                        שירות {localSorts[tableKey]?.column === 'service' ? (localSorts[tableKey]?.order === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : <ChevronsUpDown size={12} className="text-slate-300"/>}
                                    </button>
                                </div>
                                <div className="w-24 hidden md:flex items-center">
                                    <button onClick={() => toggleLocalSort(tableKey, 'date')} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                        תאריך {localSorts[tableKey]?.column === 'date' ? (localSorts[tableKey]?.order === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : <ChevronsUpDown size={12} className="text-slate-300"/>}
                                    </button>
                                </div>
                                <div className="w-24 hidden md:flex items-center">
                                    <button onClick={() => toggleLocalSort(tableKey, 'location')} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                        מיקום {localSorts[tableKey]?.column === 'location' ? (localSorts[tableKey]?.order === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : <ChevronsUpDown size={12} className="text-slate-300"/>}
                                    </button>
                                </div>
                                <div className="w-32 hidden md:flex items-center">
                                    <button onClick={() => toggleLocalSort(tableKey, 'budget')} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                                        תקציב / סיבה {localSorts[tableKey]?.column === 'budget' ? (localSorts[tableKey]?.order === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : <ChevronsUpDown size={12} className="text-slate-300"/>}
                                    </button>
                                </div>
                                <div className="w-12 text-center flex-shrink-0">פרטים</div>
                            </div>`;
content = content.replace(oldArchiveHeaderRegex, newArchiveHeaderCode);

// 5. Update renderReferredTable
content = content.replace(/toggleReferredSort/g, "toggleLocalSort('referred', ");
content = content.replace(/referredDateSort === 'asc'/g, "localSorts['referred']?.column === 'date' && localSorts['referred']?.order === 'asc'");
content = content.replace(/referredDateSort === 'desc'/g, "localSorts['referred']?.column === 'date' && localSorts['referred']?.order === 'desc'");
content = content.replace(/referredLocationSort === 'asc'/g, "localSorts['referred']?.column === 'location' && localSorts['referred']?.order === 'asc'");
content = content.replace(/referredLocationSort === 'desc'/g, "localSorts['referred']?.column === 'location' && localSorts['referred']?.order === 'desc'");
content = content.replace(/referredStatusSort === 'asc'/g, "localSorts['referred']?.column === 'status' && localSorts['referred']?.order === 'asc'");
content = content.replace(/referredStatusSort === 'desc'/g, "localSorts['referred']?.column === 'status' && localSorts['referred']?.order === 'desc'");

// For some reason referred table has status toggling column 'status', but it uses 'commission_status' logic in our applyLocalSort.
// So we must change referredStatusSort to 'commission_status' in the toggle:
content = content.replace(/toggleLocalSort\('referred', 'status'\)/g, "toggleLocalSort('referred', 'commission_status')");
content = content.replace(/localSorts\['referred'\]\?\.column === 'status'/g, "localSorts['referred']?.column === 'commission_status'");

// 6. Update global filter menu UI
const oldFiltersUI = /\{\/\* Filter Dropdowns \*\/\}([\s\S]*?)\{\/\* Active filter summary \*\/\}/;
const newFiltersUI = `{\/\* Filter Dropdowns \*\/}
                    {showFilters && (
                        <div className="p-4 md:p-5 bg-white rounded-2xl border border-slate-200 shadow-lg animate-in slide-in-from-top-2 duration-200 mt-2 z-10 relative space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2"><Filter size={16} className="text-blue-500" /> סינון ומיון מתקדם</h3>
                                <button onClick={clearAllFilters} className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors">נקה הכל</button>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Basic Filters */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">מיון לפי</label>
                                    <select
                                        value={\`\${globalSort.field}-\${globalSort.order}\`}
                                        onChange={e => {
                                            const [field, order] = e.target.value.split('-');
                                            setGlobalSort({ field: field as any, order: order as any });
                                        }}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    >
                                        <option value="interaction-desc">אינטראקציה אחרונה (מהחדש לישן)</option>
                                        <option value="interaction-asc">אינטראקציה אחרונה (מהישן לחדש)</option>
                                        <option value="event_date-asc">תאריך אירוע (קרוב לרחוק)</option>
                                        <option value="event_date-desc">תאריך אירוע (רחוק לקרוב)</option>
                                        <option value="budget-desc">תקציב/סכום (הכי גבוה)</option>
                                        <option value="budget-asc">תקציב/סכום (הכי נמוך)</option>
                                        <option value="created-desc">תאריך יצירת ליד (הכי חדש)</option>
                                        <option value="created-asc">תאריך יצירת ליד (הכי ישן)</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">שירות</label>
                                    <select value={filterService} onChange={e => setFilterService(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                                        <option value="">כל השירותים</option>
                                        {uniqueServices.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">מוביל</label>
                                    <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                                        <option value="">כל המובילים</option>
                                        {uniqueOwners.map(o => <option key={o} value={o}>{o}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">סטטוס</label>
                                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                                        <option value="">כל הסטטוסים</option>
                                        {Object.entries(STATUS_MAP).map(([key, val]) => (
                                            <option key={key} value={key}>{val.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Advanced Filters */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">טווח תאריכי אירוע</label>
                                    <div className="flex gap-2">
                                        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-400" title="מתאריך" />
                                        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="w-1/2 px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-400" title="עד תאריך" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">טווח תקציב/עמלה</label>
                                    <div className="flex gap-2">
                                        <input type="number" placeholder="מינימום ₪" value={filterMinBudget} onChange={e => setFilterMinBudget(e.target.value)} className="w-1/2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-400" />
                                        <input type="number" placeholder="מקסימום ₪" value={filterMaxBudget} onChange={e => setFilterMaxBudget(e.target.value)} className="w-1/2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 outline-none focus:ring-1 focus:ring-blue-400" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">חיפוש מיקום</label>
                                    <input type="text" placeholder="הקלד עיר או אולם..." value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-blue-400" />
                                </div>
                                <div className="space-y-1.5 flex flex-col justify-end">
                                    <label className="flex items-center gap-2 cursor-pointer p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors mt-auto">
                                        <input type="checkbox" checked={filterOpenTasks} onChange={e => setFilterOpenTasks(e.target.checked)} className="w-4 h-4 text-blue-600 rounded border-slate-300" />
                                        <span className="text-xs font-bold text-slate-700">רק עם משימות פתוחות</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active filter summary */}
`;
content = content.replace(oldFiltersUI, newFiltersUI);

// 7. Update active leads table column sorts
content = content.replace(/toggleColumnSort\('status'\)/g, "toggleLocalSort('active', 'status')");
content = content.replace(/statusSortOrder === 'asc'/g, "localSorts['active']?.column === 'status' && localSorts['active']?.order === 'asc'");
content = content.replace(/statusSortOrder === 'desc'/g, "localSorts['active']?.column === 'status' && localSorts['active']?.order === 'desc'");

content = content.replace(/toggleColumnSort\('service'\)/g, "toggleLocalSort('active', 'service')");
content = content.replace(/serviceSortOrder === 'asc'/g, "localSorts['active']?.column === 'service' && localSorts['active']?.order === 'asc'");
content = content.replace(/serviceSortOrder === 'desc'/g, "localSorts['active']?.column === 'service' && localSorts['active']?.order === 'desc'");

content = content.replace(/toggleColumnSort\('date'\)/g, "toggleLocalSort('active', 'date')");
content = content.replace(/dateSortOrder === 'asc'/g, "localSorts['active']?.column === 'date' && localSorts['active']?.order === 'asc'");
content = content.replace(/dateSortOrder === 'desc'/g, "localSorts['active']?.column === 'date' && localSorts['active']?.order === 'desc'");


// 8. Add tableKey params to the calls of renderArchiveTable
content = content.replace(/renderArchiveTable\([\s\S]*?coldLeads, showCold, \(\) => setShowCold\(!showCold\),[\s\S]*?'לידים קרים', '🥶', 'bg-sky-100 text-sky-700'[\s\S]*?\)/,
`renderArchiveTable(
                    coldLeads, showCold, () => setShowCold(!showCold),
                    'לידים קרים', '🥶', 'bg-sky-100 text-sky-700', 'cold'
                )`);

content = content.replace(/renderArchiveTable\([\s\S]*?waitingPaymentLeads, showWaitingPayment, \(\) => setShowWaitingPayment\(!showWaitingPayment\),[\s\S]*?'מחכים לתשלום', '⏳', 'bg-orange-100 text-orange-700'[\s\S]*?\)/,
`renderArchiveTable(
                    waitingPaymentLeads, showWaitingPayment, () => setShowWaitingPayment(!showWaitingPayment),
                    'מחכים לתשלום', '⏳', 'bg-orange-100 text-orange-700', 'waiting_payment'
                )`);
                
content = content.replace(/renderArchiveTable\([\s\S]*?closedLeads, showClosed, \(\) => setShowClosed\(!showClosed\),[\s\S]*?'לידים סגורים', '✅', 'bg-green-100 text-green-700'[\s\S]*?\)/,
`renderArchiveTable(
                    closedLeads, showClosed, () => setShowClosed(!showClosed),
                    'לידים סגורים', '✅', 'bg-green-100 text-green-700', 'closed'
                )`);

content = content.replace(/renderArchiveTable\([\s\S]*?lostLeads, showLost, \(\) => setShowLost\(!showLost\),[\s\S]*?'לידים אבודים', '❌', 'bg-red-100 text-red-700'[\s\S]*?\)/,
`renderArchiveTable(
                    lostLeads, showLost, () => setShowLost(!showLost),
                    'לידים אבודים', '❌', 'bg-red-100 text-red-700', 'lost'
                )`);

content = content.replace(/renderArchiveTable\([\s\S]*?completedLeads, showCompleted, \(\) => setShowCompleted\(!showCompleted\),[\s\S]*?'הושלמו \(ארכיון\)', '🏆', 'bg-slate-200 text-slate-600'[\s\S]*?\)/,
`renderArchiveTable(
                    completedLeads, showCompleted, () => setShowCompleted(!showCompleted),
                    'הושלמו (ארכיון)', '🏆', 'bg-slate-200 text-slate-600', 'completed'
                )`);

fs.writeFileSync(path, content, 'utf8');
console.log('Done refactoring!');
