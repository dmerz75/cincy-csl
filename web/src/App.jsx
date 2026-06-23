import React, {useState, useEffect} from 'react'

export default function App(){
  const [leagueId, setLeagueId] = useState(1)
  const [weeks, setWeeks] = useState(8)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api/admin'
  const [view, setView] = useState('calendar') // 'home' | 'preview' | 'schedules' | 'calendar'

  // ── Weekly Calendar ──────────────────────────────────────────────────────────
  function WeeklyCalendar({ apiBase }) {
    const [league, setLeague] = useState(leagueId)
    const [leagues, setLeagues] = useState([])
    const [loadingC, setLoadingC] = useState(false)
    const [matches, setMatches] = useState(null)
    const [errC, setErrC] = useState(null)
    const [courtFilter, setCourtFilter] = useState('all')
    const [weekFilter, setWeekFilter] = useState('all')

    useEffect(() => {
      fetch(`${apiBase}/leagues`).then(r=>r.json()).then(setLeagues).catch(()=>{})
    }, [])
    useEffect(() => { load(league) }, [league])

    async function load(lid) {
      setLoadingC(true); setErrC(null); setMatches(null)
      setCourtFilter('all'); setWeekFilter('all')
      try {
        const resp = await fetch(`${apiBase}/schedules?league_id=${lid}`)
        if (!resp.ok) throw new Error(await resp.text())
        setMatches(await resp.json())
      } catch(e) { setErrC(String(e)) }
      setLoadingC(false)
    }

    const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    function fmtDate(iso) {
      const d = new Date(iso)
      return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
    }
    function fmtTime(iso) {
      const d = new Date(iso)
      const h = d.getUTCHours(), m = d.getUTCMinutes()
      const ampm = h >= 12 ? 'PM' : 'AM'
      return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`
    }
    function isoMonday(iso) {
      const dt = new Date(iso)
      const day = dt.getUTCDay()
      const diff = day === 0 ? -6 : 1 - day
      const mon = new Date(dt)
      mon.setUTCDate(dt.getUTCDate() + diff)
      return mon.toISOString().slice(0, 10)
    }
    function weekLabel(isoMon) {
      const d = new Date(isoMon)
      return `Week of ${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
    }

    // Derive unique courts and weeks from loaded matches
    const allMatches = (matches || []).filter(m => m.datetime)
    const courts = ['all', ...Array.from(new Set(allMatches.map(m=>m.court).filter(Boolean))).sort()]
    const allWeeks = [...new Set(allMatches.map(m=>isoMonday(m.datetime)))].sort()
    const weekOptions = ['all', ...allWeeks]

    // Apply filters
    const filtered = allMatches
      .filter(m => courtFilter === 'all' || m.court === courtFilter)
      .filter(m => weekFilter === 'all' || isoMonday(m.datetime) === weekFilter)

    // Group into weeks
    function groupByWeek(ms) {
      const map = {}
      for (const m of ms) {
        const key = isoMonday(m.datetime)
        if (!map[key]) map[key] = []
        map[key].push(m)
      }
      return Object.entries(map).sort(([a],[b]) => a.localeCompare(b))
    }
    const grouped = groupByWeek(filtered)

    return (
      <div>
        {/* ── Toolbar ── */}
        <div className="cal-toolbar">
          <label>League
            <select value={league} onChange={e=>setLeague(e.target.value)}>
              {leagues.length === 0
                ? <option value={league}>League {league}</option>
                : leagues.map(l=><option key={l.id} value={l.id}>{l.name}</option>)
              }
            </select>
          </label>
          <button onClick={()=>load(league)} disabled={loadingC}>{loadingC ? 'Loading…' : 'Refresh'}</button>
          <button onClick={()=>{ window.open(`${apiBase}/export_csv?league_id=${league}`,'_blank') }}>Export CSV</button>
        </div>

        {/* ── Court filter chips ── */}
        {courts.length > 1 && (
          <div className="filter-row">
            <span className="filter-label">Court:</span>
            {courts.map(c => (
              <button key={c}
                className={`chip${courtFilter===c?' chip-active':''}`}
                onClick={()=>setCourtFilter(c)}>
                {c === 'all' ? 'All courts' : `🏐 ${c}`}
              </button>
            ))}
          </div>
        )}

        {/* ── Week filter chips ── */}
        {allWeeks.length > 1 && (
          <div className="filter-row">
            <span className="filter-label">Week:</span>
            <button className={`chip${weekFilter==='all'?' chip-active':''}`} onClick={()=>setWeekFilter('all')}>All weeks</button>
            {allWeeks.map(w => (
              <button key={w}
                className={`chip${weekFilter===w?' chip-active':''}`}
                onClick={()=>setWeekFilter(w)}>
                {weekLabel(w)}
              </button>
            ))}
          </div>
        )}

        {errC && <div className="error">{errC}</div>}
        {loadingC && <div className="cal-empty">Loading schedule…</div>}
        {!loadingC && matches && allMatches.length === 0 && (
          <div className="cal-empty">No matches found. Run <code>schedule_with_courts.py</code> to generate a schedule.</div>
        )}
        {!loadingC && matches && allMatches.length > 0 && filtered.length === 0 && (
          <div className="cal-empty">No matches match the selected filters.</div>
        )}

        {grouped.map(([monday, ms]) => (
          <div key={monday} className="week-card">
            <div className="week-header">{weekLabel(monday)} <span className="week-count">{ms.length} match{ms.length!==1?'es':''}</span></div>
            <div className="match-grid">
              {ms.sort((a,b)=>a.datetime.localeCompare(b.datetime)).map(m => (
                <div key={m.id} className="match-pill">
                  <div className="match-date">{fmtDate(m.datetime)}</div>
                  <div className="match-time">{fmtTime(m.datetime)}</div>
                  <div className="match-teams">
                    <span className="team home">{m.home}</span>
                    <span className="vs">vs</span>
                    <span className="team away">{m.away}</span>
                  </div>
                  {m.court && <div className="court-badge">🏐 {m.court}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Schedule Builder ─────────────────────────────────────────────────────────
  function ScheduleBuilder({ apiBase }) {
    const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    // default start = next Monday
    function nextMonday() {
      const d = new Date(); const day = d.getDay()
      d.setDate(d.getDate() + (day === 1 ? 7 : (8 - day) % 7))
      return d.toISOString().slice(0,10)
    }

    const [leagues, setLeagues] = useState([])
    const [league, setLeague] = useState('')
    const [startDate, setStartDate] = useState(nextMonday)
    const [weeks, setWeeks] = useState(9)
    const [dayOfWeek, setDayOfWeek] = useState(0) // 0=Mon
    const [courts, setCourts] = useState(['Court 1','Court 2'])
    const [slots, setSlots] = useState(['18:00','19:00','20:00'])
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [err, setErr] = useState(null)

    useEffect(()=>{
      fetch(`${apiBase}/leagues`).then(r=>r.json()).then(ls=>{
        setLeagues(ls); if(ls.length) setLeague(String(ls[0].id))
      }).catch(()=>{})
    },[])

    function addCourt()  { setCourts(c=>[...c, `Court ${c.length+1}`]) }
    function removeCourt(i){ setCourts(c=>c.filter((_,j)=>j!==i)) }
    function editCourt(i,v){ setCourts(c=>c.map((x,j)=>j===i?v:x)) }

    function addSlot()   { setSlots(s=>[...s,'18:00']) }
    function removeSlot(i){ setSlots(s=>s.filter((_,j)=>j!==i)) }
    function editSlot(i,v){ setSlots(s=>s.map((x,j)=>j===i?v:x)) }

    async function generate() {
      setLoading(true); setErr(null); setResult(null)
      try {
        const body = {
          league_id: Number(league),
          weeks: Number(weeks),
          start_date: new Date(startDate).toISOString(),
          day_of_week: Number(dayOfWeek),
          courts: courts.filter(Boolean),
          time_slots: slots.filter(Boolean),
        }
        const resp = await fetch(`${apiBase}/preview_schedule`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(body)
        })
        if(!resp.ok) throw new Error(await resp.text())
        setResult(await resp.json())
      } catch(e){ setErr(String(e)) }
      setLoading(false)
    }

    const DAY=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    function fmtDt(iso){ const d=new Date(iso); const h=d.getUTCHours(),m=d.getUTCMinutes(),ap=h>=12?'PM':'AM'; return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} · ${h%12||12}:${String(m).padStart(2,'0')} ${ap}` }

    // Group result by week
    function isoMon(iso){ const dt=new Date(iso),day=dt.getUTCDay(),diff=day===0?-6:1-day,m=new Date(dt); m.setUTCDate(dt.getUTCDate()+diff); return m.toISOString().slice(0,10) }
    function weekLbl(w){ const d=new Date(w); return `Week of ${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}` }
    const grouped = result ? Object.entries(
      result.assigned.reduce((acc,m)=>{ const k=isoMon(m.datetime); (acc[k]=acc[k]||[]).push(m); return acc },{})
    ).sort(([a],[b])=>a.localeCompare(b)) : []

    return (
      <div>
        <div className="builder-grid">
          {/* Left column: config */}
          <div className="builder-col">
            <section className="builder-section">
              <h3>League &amp; Date Range</h3>
              <label>League
                <select value={league} onChange={e=>setLeague(e.target.value)}>
                  {leagues.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label>Start date
                <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} />
              </label>
              <label>Weeks
                <input type="number" min="1" max="52" value={weeks} onChange={e=>setWeeks(e.target.value)} />
              </label>
              <label>Play day
                <select value={dayOfWeek} onChange={e=>setDayOfWeek(e.target.value)}>
                  {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
                </select>
              </label>
            </section>

            <section className="builder-section">
              <h3>Courts <button className="chip" onClick={addCourt}>+ Add</button></h3>
              {courts.map((c,i)=>(
                <div key={i} className="builder-row">
                  <input value={c} onChange={e=>editCourt(i,e.target.value)} placeholder="Court name" />
                  <button className="btn-remove" onClick={()=>removeCourt(i)} disabled={courts.length===1}>✕</button>
                </div>
              ))}
            </section>

            <section className="builder-section">
              <h3>Time Slots <button className="chip" onClick={addSlot}>+ Add</button></h3>
              {slots.map((s,i)=>(
                <div key={i} className="builder-row">
                  <input type="time" value={s} onChange={e=>editSlot(i,e.target.value)} />
                  <button className="btn-remove" onClick={()=>removeSlot(i)} disabled={slots.length===1}>✕</button>
                </div>
              ))}
            </section>

            <button onClick={generate} disabled={loading} style={{width:'100%',marginTop:8,padding:'10px 0',fontSize:'1rem'}}>
              {loading ? 'Generating…' : '⚡ Generate Schedule'}
            </button>
            {err && <div className="error" style={{marginTop:8}}>{err}</div>}
          </div>

          {/* Right column: results */}
          <div className="builder-results">
            {!result && !loading && <div className="cal-empty">Configure options and click Generate.</div>}
            {result && (
              <>
                <div className="builder-summary">
                  <span className="summary-chip assigned">✅ {result.assigned.length} assigned</span>
                  {result.unassigned.length > 0 && <span className="summary-chip unassigned">⚠️ {result.unassigned.length} unassigned</span>}
                  <span className="summary-chip">{weeks} weeks · {courts.length} courts · {slots.length} slots/court/week</span>
                </div>
                {grouped.map(([monday, ms])=>(
                  <div key={monday} className="week-card">
                    <div className="week-header">{weekLbl(monday)} <span className="week-count">{ms.length} match{ms.length!==1?'es':''}</span></div>
                    <div className="match-grid">
                      {ms.sort((a,b)=>a.datetime.localeCompare(b.datetime)).map(m=>(
                        <div key={m.id} className="match-pill">
                          <div className="match-date">{fmtDt(m.datetime)}</div>
                          <div className="match-teams">
                            <span className="team home">{m.home}</span>
                            <span className="vs">vs</span>
                            <span className="team away">{m.away}</span>
                          </div>
                          {m.court && <div className="court-badge">🏐 {m.court}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {result.unassigned.length > 0 && (
                  <div className="week-card" style={{borderColor:'#fbbf24'}}>
                    <div className="week-header" style={{background:'#d97706'}}>⚠️ Unassigned ({result.unassigned.length})</div>
                    <table style={{margin:'12px'}}><thead><tr><th>Home</th><th>Away</th></tr></thead>
                    <tbody>{result.unassigned.map(u=><tr key={u.id}><td>{u.home}</td><td>{u.away}</td></tr>)}</tbody></table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }
  // ─────────────────────────────────────────────────────────────────────────────

  function SchedulesView({apiBase}){
    const [league, setLeague] = useState(leagueId)
    const [weeksLocal, setWeeksLocal] = useState(8)
    const [dayFilter, setDayFilter] = useState('all')
    const [loadingS, setLoadingS] = useState(false)
    const [sdata, setSdata] = useState(null)
    const [errS, setErrS] = useState(null)

    async function load(){
      setLoadingS(true); setErrS(null); setSdata(null)
      try{
        const resp = await fetch(`${apiBase}/preview_schedule`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({league_id: Number(league), weeks: Number(weeksLocal)})
        })
        if(!resp.ok) throw new Error(await resp.text())
        const j = await resp.json()
        setSdata(j)
      }catch(e){ setErrS(String(e)) }
      setLoadingS(false)
    }

    function exportCsv(){
      const params = new URLSearchParams()
      params.append('league_id', league)
      if(dayFilter !== 'all') params.append('day', dayFilter)
      const url = `${apiBase}/export_csv?` + params.toString()
      window.open(url, '_blank')
    }

    function matchesForDay(){
      if(!sdata) return []
      if(dayFilter==='all') return sdata.assigned
      const d = Number(dayFilter)
      return sdata.assigned.filter(a=>{
        const dt = new Date(a.datetime)
        return dt.getUTCDay() === d
      })
    }

    return (
      <div>
          <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:12}}>
          <label>League ID <input type="number" value={league} onChange={e=>setLeague(e.target.value)} /></label>
          <label>Weeks <input type="number" value={weeksLocal} onChange={e=>setWeeksLocal(e.target.value)} /></label>
          <label>Day <select value={dayFilter} onChange={e=>setDayFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
          </select></label>
          <button onClick={load} disabled={loadingS}>{loadingS? 'Loading...':'Load Schedules'}</button>
          <button onClick={exportCsv} disabled={loadingS}>{'Export CSV'}</button>
        </div>
        {errS && <div className="error">{errS}</div>}
        {!sdata && !errS && <div style={{color:'#6b7280'}}>No schedules loaded — click "Load Schedules".</div>}
        {sdata && (
          <div>
            <h3>Assigned Matches ({matchesForDay().length})</h3>
            <table>
              <thead><tr><th>Date</th><th>Home</th><th>Away</th><th>Time (UTC)</th><th>Court</th></tr></thead>
              <tbody>
                {matchesForDay().map(a=>{
                  const dt = new Date(a.datetime)
                  return (<tr key={a.id}><td>{dt.toISOString().slice(0,10)}</td><td>{a.home}</td><td>{a.away}</td><td>{dt.toISOString().slice(11,19)}</td><td>{a.court_id}</td></tr>)
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  function Home({apiBase}){
    const [leagues, setLeagues] = useState(null)
    const [teams, setTeams] = useState(null)
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState(null)

    useEffect(()=>{ loadLeagues() }, [])

    async function loadLeagues(){
      setLoading(true); setErr(null)
      try{
        const resp = await fetch(`${apiBase}/leagues`)
        if(!resp.ok) throw new Error(await resp.text())
        setLeagues(await resp.json())
      }catch(e){ setErr(String(e)) }
      setLoading(false)
    }

    async function loadTeamsFor(league_id){
      setTeams(null); setErr(null)
      try{
        const resp = await fetch(`${apiBase}/teams?league_id=${league_id}`)
        if(!resp.ok) throw new Error(await resp.text())
        setTeams(await resp.json())
      }catch(e){ setErr(String(e)) }
    }

    return (
      <div>
        <h2>Dashboard</h2>
        <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
          <div style={{flex:1}}>
            <h3>Leagues</h3>
            {loading && <div>Loading leagues...</div>}
            {err && <div className="error">{err}</div>}
            {!loading && leagues && (
              <ul>
                {leagues.map(l=> (
                  <li key={l.id} style={{marginBottom:6}}>
                    <strong>{l.name}</strong> (day: {l.day_of_week})
                                <div style={{marginTop:6}}>
                                  <button onClick={()=>{ setLeagueId(l.id); setView('preview') }}>Preview Schedule</button>
                                  <button style={{marginLeft:8}} onClick={()=>loadTeamsFor(l.id)}>Load Teams</button>
                                  <a style={{marginLeft:8}} href={`${apiBase}/export_csv?league_id=${l.id}`} target="_blank" rel="noreferrer">Export CSV</a>
                                </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{flex:1}}>
            <h3>Teams</h3>
            {!teams && <div style={{color:'#6b7280'}}>No teams loaded. Click "Load Teams" on a league.</div>}
            {teams && (
              <ul>
                {teams.map(t=> (<li key={t.id}>{t.name} — {t.contact_email || t.captain_phone || 'no contact'}</li>))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )
  }

      return (
        <>
          <header className="app-header">
            <div className="container-header">
              <h1>Cincy CSL</h1>
              <p>Admin — Schedule Preview</p>
            </div>
          </header>
              <div className="nav">
                <button onClick={()=>setView('calendar')} className={view==='calendar'?'active':''}>📅 Calendar</button>
                <button onClick={()=>setView('preview')} className={view==='preview'?'active':''}>🗓 Schedule Builder</button>
                <button onClick={()=>setView('schedules')} className={view==='schedules'?'active':''}>Current Schedules</button>
              </div>

              <div className="container">
                {view === 'calendar' && (
        <WeeklyCalendar apiBase={API_BASE} />
        )}
                {view === 'preview' && (
        <ScheduleBuilder apiBase={API_BASE} />
        )}
      {error && <div className="error">Error: {error}</div>}
      
      {view === 'schedules' && (
        <SchedulesView apiBase={API_BASE} />
      )}
      {data && (
        <div>
          <h2>Assigned Matches</h2>
          <table>
            <thead><tr><th>ID</th><th>Home</th><th>Away</th><th>Date/Time</th><th>Court</th></tr></thead>
            <tbody>
              {data.assigned.map(a=> (
                <tr key={a.id}><td>{a.id}</td><td>{a.home}</td><td>{a.away}</td><td>{a.datetime}</td><td>{a.court_id}</td></tr>
              ))}
            </tbody>
          </table>
          {data.unassigned && data.unassigned.length>0 && (
            <>
              <h2>Unassigned Matches</h2>
              <table>
                <thead><tr><th>ID</th><th>Home</th><th>Away</th></tr></thead>
                <tbody>
                  {data.unassigned.map(u=> (<tr key={u.id}><td>{u.id}</td><td>{u.home}</td><td>{u.away}</td></tr>))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
          <footer style={{marginTop:20}}>
            <small>Note: runs against local FastAPI at <code>http://127.0.0.1:8000</code>. Ensure the server is running.</small>
          </footer>
        </div>
      </>
    )
}
