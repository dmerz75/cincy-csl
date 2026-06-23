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
    const [allMatches, setAllMatches] = useState([])
    const [leagues,    setLeagues]    = useState([])
    const [facilities, setFacilities] = useState([])
    const [facilityFilter, setFacilityFilter] = useState('all')
    const [leagueFilter,   setLeagueFilter]   = useState('all')
    const [loading, setLoading] = useState(false)
    const [err,     setErr]     = useState(null)

    const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    function isoMonday(iso) {
      const dt = new Date(iso), day = dt.getUTCDay()
      const m = new Date(dt); m.setUTCDate(dt.getUTCDate() + (day===0?-6:1-day))
      return m.toISOString().slice(0,10)
    }
    function weekLabel(w) {
      const d = new Date(w)
      return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`
    }
    function fmtTime(iso) {
      const d = new Date(iso), h = d.getUTCHours(), m = d.getUTCMinutes()
      return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
    }

    useEffect(() => {
      setLoading(true)
      Promise.all([
        fetch(`${apiBase}/all_matches`).then(r=>r.json()),
        fetch(`${apiBase}/leagues`).then(r=>r.json()),
        fetch(`${apiBase}/facilities`).then(r=>r.json()),
      ]).then(([ms, ls, fs]) => { setAllMatches(ms); setLeagues(ls); setFacilities(fs) })
        .catch(e => setErr(String(e)))
        .finally(() => setLoading(false))
    }, [])

    const activeFacility = facilities.find(f => String(f.id) === facilityFilter)
    const facilityCourts = activeFacility ? new Set(activeFacility.default_courts) : null

    const filtered = allMatches.filter(m => {
      if (!m.datetime) return false
      if (facilityCourts && !facilityCourts.has(m.court)) return false
      if (leagueFilter !== 'all' && String(m.league_id) !== leagueFilter) return false
      return true
    })

    const weeks = [...new Set(filtered.map(m=>isoMonday(m.datetime)))].sort()
    const activeLeagues = leagues.filter(l => filtered.some(m => m.league_id === l.id))

    return (
      <div>
        {/* ── Toolbar ── */}
        <div className="cal-toolbar" style={{flexWrap:'wrap',gap:8}}>
          {facilities.length > 0 && (
            <label>Facility
              <select value={facilityFilter} onChange={e=>setFacilityFilter(e.target.value)}>
                <option value="all">All facilities</option>
                {facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          )}
          <label>League
            <select value={leagueFilter} onChange={e=>setLeagueFilter(e.target.value)}>
              <option value="all">All leagues</option>
              {leagues.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>

        {/* ── Legend ── */}
        {activeLeagues.length > 1 && (
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
            {activeLeagues.map(l => {
              const col = leagueColor(l.id)
              return <span key={l.id} style={{background:col.bg,color:col.fg,padding:'2px 10px',borderRadius:10,fontSize:'0.78rem',fontWeight:600}}>{l.name}</span>
            })}
          </div>
        )}

        {err     && <div className="error">{err}</div>}
        {loading && <div className="cal-empty">Loading…</div>}
        {!loading && filtered.length === 0 && <div className="cal-empty">No matches found.</div>}

        {/* ── Compact week rows ── */}
        {!loading && weeks.length > 0 && (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {weeks.map(w => {
                const ms = filtered
                  .filter(m => isoMonday(m.datetime) === w)
                  .sort((a,b) => a.datetime.localeCompare(b.datetime))
                return (
                  <tr key={w} style={{borderBottom:'1px solid #1e293b'}}>
                    <td style={{padding:'8px 12px',whiteSpace:'nowrap',color:'#94a3b8',
                                fontSize:'0.82rem',fontWeight:600,verticalAlign:'top',minWidth:90}}>
                      {weekLabel(w)}<br/>
                      <span style={{color:'#475569',fontSize:'0.72rem'}}>{ms.length} match{ms.length!==1?'es':''}</span>
                    </td>
                    <td style={{padding:'6px 4px'}}>
                      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                        {ms.map(m => {
                          const col = leagueColor(m.league_id)
                          return (
                            <div key={m.id} title={`${m.league_name||''}\n${m.home} vs ${m.away}`}
                              style={{background:col.bg,color:col.fg,borderRadius:6,
                                      padding:'4px 8px',fontSize:'0.78rem',lineHeight:1.35,
                                      minWidth:110,maxWidth:170}}>
                              <div style={{fontWeight:700,opacity:0.85,fontSize:'0.7rem',marginBottom:1}}>
                                {fmtTime(m.datetime)}{m.court ? ` · ${m.court}` : ''}
                              </div>
                              <div style={{fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {m.home}
                              </div>
                              <div style={{opacity:0.8,fontSize:'0.7rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                vs {m.away}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    )
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Schedule Builder ─────────────────────────────────────────────────────────
  function ScheduleBuilder({ apiBase }) {
    const DAYS    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    const LEVELS  = ['D','C3','C2','C1','B','BB','A','Open']
    const GENDERS = ['Coed','Men','Women']
    const DAY_NUM = {Monday:0,Tuesday:1,Wednesday:2,Thursday:3,Friday:4,Saturday:5,Sunday:6}

    // default start = next Monday
    function nextMonday() {
      const d = new Date(); const day = d.getDay()
      d.setDate(d.getDate() + (day === 1 ? 7 : (8 - day) % 7))
      return d.toISOString().slice(0,10)
    }

    const [leagues, setLeagues] = useState([])
    const [league, setLeague] = useState('')
    const [teamCount, setTeamCount] = useState(8)
    const [startDate, setStartDate] = useState(nextMonday)
    const [weeks, setWeeks] = useState(9)
    const [dayOfWeek, setDayOfWeek] = useState(0) // 0=Mon
    const [courts, setCourts] = useState(['Court 1','Court 2'])
    const [slots, setSlots] = useState(['18:00','19:00','20:00'])
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [err, setErr] = useState(null)

    // Facility state
    const [facilities, setFacilities] = useState([])
    const [facilityId, setFacilityId] = useState('')
    const [showFacilityForm, setShowFacilityForm] = useState(false)
    const [facilityMode, setFacilityMode] = useState('create') // 'create' | 'edit'
    const [fName, setFName] = useState('')
    const [fAddress, setFAddress] = useState('')
    const [fCourts, setFCourts] = useState(['Court 1','Court 2'])
    const [fSlots, setFSlots] = useState(['18:00','19:00','20:00'])
    const [fSaving, setFSaving] = useState(false)
    const [fErr, setFErr] = useState(null)

    async function loadFacilities() {
      try {
        const resp = await fetch(`${apiBase}/facilities`)
        if (resp.ok) setFacilities(await resp.json())
      } catch(_) {}
    }

    function applyFacility(fid) {
      const f = facilities.find(x => String(x.id) === String(fid))
      if (!f) return
      if (f.default_courts.length) setCourts(f.default_courts)
      if (f.default_time_slots.length) setSlots(f.default_time_slots)
    }

    function openEditFacility() {
      const f = facilities.find(x => String(x.id) === String(facilityId))
      if (!f) return
      setFName(f.name); setFAddress(f.address||'')
      setFCourts(f.default_courts.length ? [...f.default_courts] : ['Court 1'])
      setFSlots(f.default_time_slots.length ? [...f.default_time_slots] : ['18:00'])
      setFacilityMode('edit'); setShowFacilityForm(true)
    }

    function openNewFacility() {
      setFName(''); setFAddress(''); setFCourts(['Court 1','Court 2']); setFSlots(['18:00','19:00','20:00'])
      setFacilityMode('create'); setShowFacilityForm(true)
    }

    async function saveFacility() {
      setFSaving(true); setFErr(null)
      const body = { name: fName, address: fAddress||null, default_courts: fCourts.filter(Boolean), default_time_slots: fSlots.filter(Boolean) }
      try {
        const url = facilityMode === 'edit' ? `${apiBase}/facilities/${facilityId}` : `${apiBase}/facilities`
        const method = facilityMode === 'edit' ? 'PUT' : 'POST'
        const resp = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
        if (!resp.ok) throw new Error(await resp.text())
        const saved = await resp.json()
        await loadFacilities()
        setFacilityId(String(saved.id))
        setCourts(saved.default_courts); setSlots(saved.default_time_slots)
        setShowFacilityForm(false)
      } catch(e) { setFErr(String(e)) }
      setFSaving(false)
    }

    // Create-league form state
    const [showCreate, setShowCreate] = useState(false)
    const [newDay,    setNewDay]    = useState('Monday')
    const [newLevel,  setNewLevel]  = useState('C1')
    const [newGender, setNewGender] = useState('Coed')
    const [creating,  setCreating]  = useState(false)
    const [createErr, setCreateErr] = useState(null)

    // Auto-compose league name from parts
    const composedName = `${newDay}-${newLevel}-${newGender}`

    const [deleting, setDeleting] = useState(false)

    async function loadLeagues() {
      const resp = await fetch(`${apiBase}/leagues`)
      const ls = await resp.json()
      setLeagues(ls)
      if (ls.length && !league) setLeague(String(ls[0].id))
    }

    async function deleteLeague() {
      if (!league) return
      const name = leagues.find(l=>String(l.id)===String(league))?.name || `League ${league}`
      if (!window.confirm(`Delete "${name}" and all its teams and matches? This cannot be undone.`)) return
      setDeleting(true)
      try {
        const resp = await fetch(`${apiBase}/leagues/${league}`, { method: 'DELETE' })
        if (!resp.ok) throw new Error(await resp.text())
        const ls = await fetch(`${apiBase}/leagues`).then(r=>r.json())
        setLeagues(ls)
        setLeague(ls.length ? String(ls[0].id) : '')
        setResult(null)
      } catch(e) { setErr(String(e)) }
      setDeleting(false)
    }

    useEffect(() => { loadLeagues(); loadFacilities() }, [])

    async function createLeague() {
      setCreating(true); setCreateErr(null)
      try {
        const resp = await fetch(`${apiBase}/leagues`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            name: composedName,
            day_of_week: DAY_NUM[newDay],
            division: newLevel,
            gender: newGender,
          })
        })
        if (!resp.ok) throw new Error(await resp.text())
        const created = await resp.json()
        await loadLeagues()
        setLeague(String(created.id))
        setDayOfWeek(DAY_NUM[newDay])
        setShowCreate(false)
      } catch(e) { setCreateErr(String(e)) }
      setCreating(false)
    }

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
          team_count: Number(teamCount) >= 2 ? Number(teamCount) : undefined,
          start_date: new Date(startDate).toISOString(),
          day_of_week: Number(dayOfWeek),
          courts: courts.filter(Boolean),
          time_slots: slots.filter(Boolean),
          ...(facilityId ? { facility_id: Number(facilityId) } : {}),
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
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <select value={league} onChange={e=>setLeague(e.target.value)} style={{flex:1}}>
                    {leagues.length === 0 && <option value="">— no leagues —</option>}
                    {leagues.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button className="chip" style={{whiteSpace:'nowrap'}} onClick={()=>setShowCreate(v=>!v)}>
                    {showCreate ? '✕ Cancel' : '+ New'}
                  </button>
                  {league && !showCreate && (
                    <button className="btn-remove" title="Delete league" onClick={deleteLeague} disabled={deleting}
                      style={{padding:'4px 8px',fontSize:'1rem'}}>
                      {deleting ? '…' : '🗑'}
                    </button>
                  )}
                </div>
              </label>

              {showCreate && (
                <div className="create-league-box">
                  <div className="clb-title">New League</div>
                  <div className="clb-row">
                    <label>Day
                      <select value={newDay} onChange={e=>setNewDay(e.target.value)}>
                        {DAYS.map(d=><option key={d}>{d}</option>)}
                      </select>
                    </label>
                    <label>Level
                      <select value={newLevel} onChange={e=>setNewLevel(e.target.value)}>
                        {LEVELS.map(l=><option key={l}>{l}</option>)}
                      </select>
                    </label>
                    <label>Gender
                      <select value={newGender} onChange={e=>setNewGender(e.target.value)}>
                        {GENDERS.map(g=><option key={g}>{g}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="clb-preview">📋 <strong>{composedName}</strong></div>
                  {createErr && <div className="error" style={{fontSize:'0.82rem'}}>{createErr}</div>}
                  <button onClick={createLeague} disabled={creating} style={{marginTop:6,width:'100%'}}>
                    {creating ? 'Creating…' : `✅ Create "${composedName}"`}
                  </button>
                </div>
              )}
              <label>Teams in league
                <input type="number" min="2" max="32" value={teamCount} onChange={e=>setTeamCount(e.target.value)} />
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
              <h3>Facility</h3>
              <label>Select facility
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <select value={facilityId} onChange={e=>{ setFacilityId(e.target.value); applyFacility(e.target.value) }} style={{flex:1}}>
                    <option value="">— none —</option>
                    {facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <button className="chip" style={{whiteSpace:'nowrap'}} onClick={openNewFacility}>+ New</button>
                  {facilityId && <button className="chip" style={{whiteSpace:'nowrap'}} onClick={openEditFacility}>✏️ Edit</button>}
                </div>
              </label>
              {facilityId && !showFacilityForm && (() => {
                const f = facilities.find(x=>String(x.id)===String(facilityId))
                return f ? <div style={{fontSize:'0.82rem',color:'#94a3b8',marginTop:4}}>{f.address && <span>📍 {f.address} · </span>}{f.default_courts.length} courts · {f.default_time_slots.length} slots</div> : null
              })()}
              {showFacilityForm && (
                <div className="create-league-box" style={{marginTop:10}}>
                  <div className="clb-title">{facilityMode==='edit' ? '✏️ Edit Facility' : '🏟 New Facility'}</div>
                  <label style={{marginBottom:4}}>Name
                    <input value={fName} onChange={e=>setFName(e.target.value)} placeholder="e.g. Sportsman's" />
                  </label>
                  <label style={{marginBottom:8}}>Address
                    <input value={fAddress} onChange={e=>setFAddress(e.target.value)} placeholder="e.g. 123 Main St" />
                  </label>
                  <div className="clb-row" style={{alignItems:'flex-start',gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,marginBottom:4}}>Courts</div>
                      {fCourts.map((c,i)=>(
                        <div key={i} className="builder-row">
                          <input value={c} onChange={e=>{ const a=[...fCourts]; a[i]=e.target.value; setFCourts(a) }} placeholder="Court name" />
                          <button className="btn-remove" onClick={()=>setFCourts(fCourts.filter((_,j)=>j!==i))} disabled={fCourts.length===1}>✕</button>
                        </div>
                      ))}
                      <button className="chip" onClick={()=>setFCourts([...fCourts,`Court ${fCourts.length+1}`])}>+ Add</button>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,marginBottom:4}}>Time Slots</div>
                      {fSlots.map((s,i)=>(
                        <div key={i} className="builder-row">
                          <input type="time" value={s} onChange={e=>{ const a=[...fSlots]; a[i]=e.target.value; setFSlots(a) }} />
                          <button className="btn-remove" onClick={()=>setFSlots(fSlots.filter((_,j)=>j!==i))} disabled={fSlots.length===1}>✕</button>
                        </div>
                      ))}
                      <button className="chip" onClick={()=>setFSlots([...fSlots,'18:00'])}>+ Add</button>
                    </div>
                  </div>
                  {fErr && <div className="error" style={{fontSize:'0.82rem',marginTop:6}}>{fErr}</div>}
                  <div style={{display:'flex',gap:8,marginTop:8}}>
                    <button onClick={saveFacility} disabled={fSaving||!fName.trim()} style={{flex:1}}>
                      {fSaving ? 'Saving…' : `💾 Save`}
                    </button>
                    <button className="chip" onClick={()=>setShowFacilityForm(false)}>✕ Cancel</button>
                  </div>
                </div>
              )}
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
                  <span className="summary-chip">{result.total_matches} total matches · {result.capacity_per_week} slots/week · {weeks} weeks</span>
                  {result.slots_blocked > 0 && (
                    <span className="summary-chip" style={{background:'#7c3aed'}}>🔒 {result.slots_blocked} slots blocked by other leagues</span>
                  )}
                  {result.min_weeks_needed > Number(weeks) && (
                    <span className="summary-chip unassigned">📅 Need at least {result.min_weeks_needed} weeks to fit all matches</span>
                  )}
                  {result.min_weeks_needed <= Number(weeks) && result.capacity_per_week > 0 && (
                    <span className="summary-chip" style={{background:'#166534'}}>✓ Facility fits schedule</span>
                  )}
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

  // ── Court Grid View ──────────────────────────────────────────────────────────
  const LEAGUE_COLORS = [
    {bg:'#ea580c',fg:'#fff'},  // orange
    {bg:'#2563eb',fg:'#fff'},  // blue
    {bg:'#16a34a',fg:'#fff'},  // green
    {bg:'#db2777',fg:'#fff'},  // pink
    {bg:'#7c3aed',fg:'#fff'},  // purple
    {bg:'#0891b2',fg:'#fff'},  // teal
    {bg:'#dc2626',fg:'#fff'},  // red
    {bg:'#ca8a04',fg:'#fff'},  // yellow
    {bg:'#0e7490',fg:'#fff'},  // cyan
    {bg:'#4338ca',fg:'#fff'},  // indigo
  ]
  function leagueColor(lid) { return LEAGUE_COLORS[(Number(lid)-1) % LEAGUE_COLORS.length] }

  function CourtView({ apiBase }) {
    const [allMatches, setAllMatches] = useState([])
    const [leagues, setLeagues] = useState([])
    const [facilities, setFacilities] = useState([])
    const [facilityFilter, setFacilityFilter] = useState('all')
    const [leagueFilter, setLeagueFilter] = useState('all')
    const [weekFilter, setWeekFilter] = useState('all')
    const [loadingC, setLoadingC] = useState(false)
    const [errC, setErrC] = useState(null)

    const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    function isoMonday(iso) {
      const dt = new Date(iso), day = dt.getUTCDay()
      const m = new Date(dt); m.setUTCDate(dt.getUTCDate() + (day===0?-6:1-day))
      return m.toISOString().slice(0,10)
    }
    function weekLabel(w) { const d=new Date(w); return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}` }
    function fmtTime(iso) {
      const d=new Date(iso), h=d.getUTCHours(), m=d.getUTCMinutes()
      return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`
    }

    useEffect(() => {
      setLoadingC(true); setErrC(null)
      Promise.all([
        fetch(`${apiBase}/all_matches`).then(r=>r.json()),
        fetch(`${apiBase}/leagues`).then(r=>r.json()),
        fetch(`${apiBase}/facilities`).then(r=>r.json()),
      ]).then(([ms, ls, fs]) => { setAllMatches(ms); setLeagues(ls); setFacilities(fs) })
        .catch(e => setErrC(String(e)))
        .finally(() => setLoadingC(false))
    }, [])

    const activeFacility = facilities.find(f => String(f.id) === facilityFilter)
    const facilityCourts = activeFacility ? new Set(activeFacility.default_courts) : null

    const allWeeks = [...new Set(allMatches.filter(m=>m.datetime).map(m=>isoMonday(m.datetime)))].sort()

    const filtered = allMatches.filter(m => {
      if (!m.datetime) return false
      if (facilityCourts && !facilityCourts.has(m.court)) return false
      if (leagueFilter !== 'all' && String(m.league_id) !== leagueFilter) return false
      if (weekFilter !== 'all' && isoMonday(m.datetime) !== weekFilter) return false
      return true
    })

    const courts = [...new Set(filtered.map(m=>m.court).filter(Boolean))].sort()
    const times  = [...new Set(filtered.map(m=>fmtTime(m.datetime)))].sort()

    function matchAt(court, time) {
      return filtered.find(m => m.court === court && fmtTime(m.datetime) === time)
    }

    return (
      <div>
        <div className="cal-toolbar" style={{flexWrap:'wrap',gap:8}}>
          {facilities.length > 0 && (
            <label>Facility
              <select value={facilityFilter} onChange={e=>{ setFacilityFilter(e.target.value); setWeekFilter('all') }}>
                <option value="all">All facilities</option>
                {facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
          )}
          <label>League
            <select value={leagueFilter} onChange={e=>setLeagueFilter(e.target.value)}>
              <option value="all">All leagues</option>
              {leagues.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>

        {allWeeks.length > 1 && (
          <div className="filter-row">
            <span className="filter-label">Week:</span>
            <button className={`chip${weekFilter==='all'?' chip-active':''}`} onClick={()=>setWeekFilter('all')}>All weeks</button>
            {allWeeks.map(w=>(
              <button key={w} className={`chip${weekFilter===w?' chip-active':''}`} onClick={()=>setWeekFilter(w)}>
                {weekLabel(w)}
              </button>
            ))}
          </div>
        )}

        {errC && <div className="error">{errC}</div>}
        {loadingC && <div className="cal-empty">Loading…</div>}
        {!loadingC && courts.length === 0 && <div className="cal-empty">No matches with court assignments found.</div>}

        {courts.length > 0 && (
          <div style={{overflowX:'auto',marginTop:12}}>
            <table style={{borderCollapse:'collapse',minWidth:'100%'}}>
              <thead>
                <tr>
                  <th style={{padding:'6px 10px',background:'#1e293b',color:'#94a3b8',textAlign:'left',minWidth:70}}>Time</th>
                  {courts.map(c=>(
                    <th key={c} style={{padding:'6px 10px',background:'#1e293b',color:'#e2e8f0',textAlign:'center',minWidth:150}}>🏐 {c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {times.map(t=>(
                  <tr key={t} style={{borderBottom:'1px solid #334155'}}>
                    <td style={{padding:'6px 10px',color:'#94a3b8',fontWeight:600,whiteSpace:'nowrap'}}>{t}</td>
                    {courts.map(c=>{
                      const m = matchAt(c, t)
                      if (!m) return <td key={c} style={{padding:6}} />
                      const col = leagueColor(m.league_id)
                      return (
                        <td key={c} style={{padding:4}}>
                          <div style={{background:col.bg,color:col.fg,borderRadius:6,padding:'6px 8px',fontSize:'0.82rem',lineHeight:1.4}}>
                            <div style={{fontWeight:700,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.league_name||`League ${m.league_id}`}</div>
                            <div style={{opacity:0.9}}>{m.home}</div>
                            <div style={{opacity:0.7,fontSize:'0.75rem'}}>vs {m.away}</div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:12}}>
              {leagues.filter(l=>filtered.some(m=>m.league_id===l.id)).map(l=>{
                const col = leagueColor(l.id)
                return <span key={l.id} style={{background:col.bg,color:col.fg,padding:'3px 10px',borderRadius:12,fontSize:'0.8rem',fontWeight:600}}>{l.name}</span>
              })}
            </div>
          </div>
        )}
      </div>
    )
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Facility Profile View ──────────────────────────────────────────────────
  function FacilityView({ apiBase }) {
    const [facilities, setFacilities] = useState([])
    const [loading, setLoading] = useState(false)
    const [editingId, setEditingId] = useState(null) // null = none, 0 = new
    const [fName, setFName] = useState('')
    const [fAddress, setFAddress] = useState('')
    const [fCourts, setFCourts] = useState(['Court 1','Court 2'])
    const [fSlots, setFSlots] = useState(['18:00','19:00','20:00'])
    const [saving, setSaving] = useState(false)
    const [err, setErr] = useState(null)

    async function load() {
      setLoading(true)
      try { setFacilities(await fetch(`${apiBase}/facilities`).then(r=>r.json())) } catch(_) {}
      setLoading(false)
    }
    useEffect(() => { load() }, [])

    function openNew() {
      setFName(''); setFAddress(''); setFCourts(['Court 1','Court 2']); setFSlots(['18:00','19:00','20:00'])
      setErr(null); setEditingId(0)
    }
    function openEdit(f) {
      setFName(f.name); setFAddress(f.address||'')
      setFCourts(f.default_courts.length ? [...f.default_courts] : ['Court 1'])
      setFSlots(f.default_time_slots.length ? [...f.default_time_slots] : ['18:00'])
      setErr(null); setEditingId(f.id)
    }
    function cancel() { setEditingId(null) }

    async function save() {
      setSaving(true); setErr(null)
      const body = { name: fName, address: fAddress||null, default_courts: fCourts.filter(Boolean), default_time_slots: fSlots.filter(Boolean) }
      try {
        const url = editingId ? `${apiBase}/facilities/${editingId}` : `${apiBase}/facilities`
        const resp = await fetch(url, { method: editingId ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
        if (!resp.ok) throw new Error(await resp.text())
        await load(); setEditingId(null)
      } catch(e) { setErr(String(e)) }
      setSaving(false)
    }

    const form = (
      <div className="create-league-box" style={{marginBottom:16}}>
        <div className="clb-title">{editingId ? '✏️ Edit Facility' : '🏟 New Facility'}</div>
        <label>Name
          <input value={fName} onChange={e=>setFName(e.target.value)} placeholder="e.g. Sportsman's" />
        </label>
        <label style={{marginBottom:8}}>Address
          <input value={fAddress} onChange={e=>setFAddress(e.target.value)} placeholder="e.g. 123 Main St, Cincinnati OH" />
        </label>
        <div className="clb-row" style={{alignItems:'flex-start',gap:16}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,marginBottom:4}}>Default Courts</div>
            {fCourts.map((c,i)=>(
              <div key={i} className="builder-row">
                <input value={c} onChange={e=>{const a=[...fCourts];a[i]=e.target.value;setFCourts(a)}} placeholder="Court name" />
                <button className="btn-remove" onClick={()=>setFCourts(fCourts.filter((_,j)=>j!==i))} disabled={fCourts.length===1}>✕</button>
              </div>
            ))}
            <button className="chip" onClick={()=>setFCourts([...fCourts,`Court ${fCourts.length+1}`])}>+ Add</button>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,marginBottom:4}}>Default Time Slots</div>
            {fSlots.map((s,i)=>(
              <div key={i} className="builder-row">
                <input type="time" value={s} onChange={e=>{const a=[...fSlots];a[i]=e.target.value;setFSlots(a)}} />
                <button className="btn-remove" onClick={()=>setFSlots(fSlots.filter((_,j)=>j!==i))} disabled={fSlots.length===1}>✕</button>
              </div>
            ))}
            <button className="chip" onClick={()=>setFSlots([...fSlots,'18:00'])}>+ Add</button>
          </div>
        </div>
        {err && <div className="error" style={{marginTop:6}}>{err}</div>}
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <button onClick={save} disabled={saving||!fName.trim()} style={{flex:1}}>{saving?'Saving…':'💾 Save Facility'}</button>
          <button className="chip" onClick={cancel}>✕ Cancel</button>
        </div>
      </div>
    )

    return (
      <div style={{maxWidth:720}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <h2 style={{margin:0}}>Facilities</h2>
          {editingId === null && <button onClick={openNew}>+ New Facility</button>}
        </div>

        {editingId === 0 && form}

        {loading && <div className="cal-empty">Loading…</div>}
        {!loading && facilities.length === 0 && editingId === null && (
          <div className="cal-empty">No facilities yet — click "+ New Facility" to add one.</div>
        )}

        {facilities.map(f => (
          <div key={f.id} style={{background:'#1e293b',borderRadius:10,padding:'14px 18px',marginBottom:12,border:'1px solid #334155'}}>
            {editingId === f.id ? form : (
              <>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:'1.05rem',marginBottom:2}}>🏟 {f.name}</div>
                    {f.address && <div style={{color:'#94a3b8',fontSize:'0.85rem',marginBottom:6}}>📍 {f.address}</div>}
                  </div>
                  <button className="chip" onClick={()=>openEdit(f)}>✏️ Edit</button>
                </div>
                <div style={{display:'flex',gap:24,marginTop:4}}>
                  <div>
                    <div style={{color:'#64748b',fontSize:'0.75rem',fontWeight:600,textTransform:'uppercase',marginBottom:4}}>Courts</div>
                    {f.default_courts.length
                      ? f.default_courts.map(c=><span key={c} className="chip" style={{marginRight:4,marginBottom:4,display:'inline-block'}}>🏐 {c}</span>)
                      : <span style={{color:'#475569',fontSize:'0.85rem'}}>none</span>}
                  </div>
                  <div>
                    <div style={{color:'#64748b',fontSize:'0.75rem',fontWeight:600,textTransform:'uppercase',marginBottom:4}}>Time Slots</div>
                    {f.default_time_slots.length
                      ? f.default_time_slots.map(s=><span key={s} className="chip" style={{marginRight:4,marginBottom:4,display:'inline-block'}}>🕐 {s}</span>)
                      : <span style={{color:'#475569',fontSize:'0.85rem'}}>none</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
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
                <button onClick={()=>setView('facilities')} className={view==='facilities'?'active':''}>🏟 Facilities</button>
                <button onClick={()=>setView('courts')} className={view==='courts'?'active':''}>🗺 Court View</button>
                <button onClick={()=>setView('calendar')} className={view==='calendar'?'active':''}>📅 Calendar</button>
                <button onClick={()=>setView('preview')} className={view==='preview'?'active':''}>🗓 Schedule Builder</button>
                <button onClick={()=>setView('schedules')} className={view==='schedules'?'active':''}>Current Schedules</button>
              </div>

              <div className="container">
                {view === 'facilities' && (
        <FacilityView apiBase={API_BASE} />
        )}
                {view === 'courts' && (
        <CourtView apiBase={API_BASE} />
        )}
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
